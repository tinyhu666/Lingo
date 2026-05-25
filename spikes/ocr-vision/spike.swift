// Lingo OCR Spike — Apple Vision baseline
//
// Goal: measure Apple Vision text-recognition accuracy + latency on real
// in-game chat screenshots, before committing to it as the macOS OCR
// engine for the incoming-translation feature.
//
// Build:
//   swiftc spike.swift -O -o spike-ocr -framework Vision -framework AppKit
//
// Run:
//   ./spike-ocr path/to/screenshot.png
//   ./spike-ocr --json path/to/screenshot.png
//   ./spike-ocr --region 100,800,900,260 path/to/full-screen.png
//
// Output (default): one line per detected text block, formatted as:
//   <confidence> | <x>,<y>,<w>,<h> | <text>
//
// --json emits a single JSON array for easy piping into eval scripts.

import Foundation
import Vision
import AppKit

// MARK: - CLI parsing

struct Options {
    var imagePath: String
    var json: Bool = false
    var region: CGRect? = nil  // image-coordinate space (top-left origin)
    var languages: [String] = ["zh-Hans", "en-US", "ru-RU"]
    var level: VNRequestTextRecognitionLevel = .accurate
    var autoLang: Bool = false
    var correction: Bool = false
    var warmup: Int = 0
    var scale: CGFloat = 1.0
}

func parseArgs() -> Options? {
    var args = Array(CommandLine.arguments.dropFirst())
    var opts: Options? = nil
    var json = false
    var region: CGRect? = nil
    var languages: [String]? = nil
    var imagePath: String? = nil
    var autoLang = false
    var correction = false
    var warmup = 0
    var scale: CGFloat = 1.0
    var fast = false

    while let arg = args.first {
        args.removeFirst()
        switch arg {
        case "--json":
            json = true
        case "--region":
            guard let value = args.first else { return nil }
            args.removeFirst()
            let parts = value.split(separator: ",").compactMap { Int($0) }
            guard parts.count == 4 else { return nil }
            region = CGRect(x: parts[0], y: parts[1], width: parts[2], height: parts[3])
        case "--lang":
            guard let value = args.first else { return nil }
            args.removeFirst()
            languages = value.split(separator: ",").map { String($0) }
        case "--auto-lang":
            autoLang = true
        case "--correct":
            correction = true
        case "--fast":
            fast = true
        case "--warmup":
            guard let value = args.first, let n = Int(value) else { return nil }
            args.removeFirst()
            warmup = n
        case "--scale":
            guard let value = args.first, let f = Double(value) else { return nil }
            args.removeFirst()
            scale = CGFloat(f)
        default:
            if imagePath == nil { imagePath = arg }
        }
    }

    guard let path = imagePath else { return nil }
    var o = Options(imagePath: path)
    o.json = json
    o.region = region
    if let l = languages { o.languages = l }
    o.autoLang = autoLang
    o.correction = correction
    o.warmup = warmup
    o.scale = scale
    if fast { o.level = .fast }
    return o
}

func usage() {
    FileHandle.standardError.write("""
    Usage: spike-ocr [--json] [--region x,y,w,h] [--lang zh-Hans,en-US,...] <image.png>

    Measures Apple Vision OCR output + latency on the given image.
    --region crops to a sub-rectangle (image pixel coords, origin top-left).
    --lang sets recognition languages (default: zh-Hans, en-US, ru-RU).

    """.data(using: .utf8)!)
}

// MARK: - Image loading

func loadCGImage(path: String) -> CGImage? {
    let url = URL(fileURLWithPath: path)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

func crop(_ image: CGImage, to rect: CGRect) -> CGImage? {
    let clamped = CGRect(
        x: max(0, rect.origin.x),
        y: max(0, rect.origin.y),
        width: min(rect.width, CGFloat(image.width) - rect.origin.x),
        height: min(rect.height, CGFloat(image.height) - rect.origin.y)
    )
    return image.cropping(to: clamped)
}

// MARK: - OCR run

struct LineResult {
    let text: String
    let confidence: Float
    let bbox: CGRect  // normalized 0-1, origin bottom-left (Vision convention)
}

func buildRequest(opts: Options, sink: @escaping ([LineResult]) -> Void) -> VNRecognizeTextRequest {
    let request = VNRecognizeTextRequest { req, _ in
        guard let observations = req.results as? [VNRecognizedTextObservation] else {
            sink([])
            return
        }
        let lines: [LineResult] = observations.compactMap { obs in
            guard let top = obs.topCandidates(1).first else { return nil }
            return LineResult(text: top.string, confidence: top.confidence, bbox: obs.boundingBox)
        }
        sink(lines)
    }
    request.recognitionLevel = opts.level
    request.recognitionLanguages = opts.languages
    request.usesLanguageCorrection = opts.correction
    if #available(macOS 13.0, *) {
        request.automaticallyDetectsLanguage = opts.autoLang
    }
    return request
}

func recognize(image: CGImage, opts: Options) throws -> ([LineResult], TimeInterval) {
    // Each invocation uses a fresh handler + request to avoid any internal
    // caching that would make subsequent calls look artificially fast.
    var lastResults: [LineResult] = []

    for _ in 0..<opts.warmup {
        let req = buildRequest(opts: opts) { _ in }
        let h = VNImageRequestHandler(cgImage: image, options: [:])
        try h.perform([req])
    }

    let req = buildRequest(opts: opts) { lines in lastResults = lines }
    let handler = VNImageRequestHandler(cgImage: image, options: [:])

    let start = Date()
    try handler.perform([req])
    let elapsed = Date().timeIntervalSince(start)

    return (lastResults, elapsed)
}

func upscale(_ image: CGImage, factor: CGFloat) -> CGImage? {
    if factor == 1.0 { return image }
    let newWidth = Int(CGFloat(image.width) * factor)
    let newHeight = Int(CGFloat(image.height) * factor)
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue
    guard let ctx = CGContext(
        data: nil,
        width: newWidth,
        height: newHeight,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: bitmapInfo
    ) else { return nil }
    ctx.interpolationQuality = .high
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: newWidth, height: newHeight))
    return ctx.makeImage()
}

// MARK: - Output

func emit(results: [LineResult], elapsed: TimeInterval, imageSize: CGSize, asJSON: Bool, image: CGImage) {
    if asJSON {
        let arr: [[String: Any]] = results.map { r in
            let px = bboxToPixels(r.bbox, imageSize: imageSize)
            return [
                "text": r.text,
                "confidence": r.confidence,
                "bbox_pixels": [
                    "x": Int(px.origin.x),
                    "y": Int(px.origin.y),
                    "w": Int(px.width),
                    "h": Int(px.height),
                ]
            ]
        }
        let payload: [String: Any] = [
            "image_w": Int(imageSize.width),
            "image_h": Int(imageSize.height),
            "elapsed_ms": Int(elapsed * 1000),
            "lines": arr,
        ]
        if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted]),
           let str = String(data: data, encoding: .utf8) {
            print(str)
        }
        return
    }

    print("# image: \(Int(imageSize.width))x\(Int(imageSize.height)), elapsed: \(Int(elapsed * 1000))ms, lines: \(results.count)")
    for r in results {
        let px = bboxToPixels(r.bbox, imageSize: imageSize)
        let escaped = r.text.replacingOccurrences(of: "\n", with: "\\n")
        print(String(format: "%.2f | %4d,%4d,%4d,%4d | %@",
                     r.confidence,
                     Int(px.origin.x), Int(px.origin.y), Int(px.width), Int(px.height),
                     escaped))
    }
}

func bboxToPixels(_ normalized: CGRect, imageSize: CGSize) -> CGRect {
    // Vision returns origin bottom-left, normalized [0,1]. Convert to
    // top-left pixel coords for easier mental mapping with image viewers.
    let x = normalized.origin.x * imageSize.width
    let w = normalized.size.width * imageSize.width
    let h = normalized.size.height * imageSize.height
    let y = (1.0 - normalized.origin.y - normalized.size.height) * imageSize.height
    return CGRect(x: x, y: y, width: w, height: h)
}

// MARK: - main

guard let opts = parseArgs() else {
    usage()
    exit(2)
}

guard var image = loadCGImage(path: opts.imagePath) else {
    FileHandle.standardError.write("error: failed to load image: \(opts.imagePath)\n".data(using: .utf8)!)
    exit(1)
}

if let r = opts.region {
    guard let cropped = crop(image, to: r) else {
        FileHandle.standardError.write("error: crop failed\n".data(using: .utf8)!)
        exit(1)
    }
    image = cropped
}

if opts.scale != 1.0 {
    guard let scaled = upscale(image, factor: opts.scale) else {
        FileHandle.standardError.write("error: upscale failed\n".data(using: .utf8)!)
        exit(1)
    }
    image = scaled
}

do {
    let imageSize = CGSize(width: image.width, height: image.height)
    let (results, elapsed) = try recognize(image: image, opts: opts)
    emit(results: results, elapsed: elapsed, imageSize: imageSize, asJSON: opts.json, image: image)
} catch {
    FileHandle.standardError.write("error: vision request failed: \(error)\n".data(using: .utf8)!)
    exit(1)
}
