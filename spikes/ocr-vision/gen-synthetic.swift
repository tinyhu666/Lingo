// Render a synthetic chat screenshot for the OCR spike.
// Mimics a DotA-2-style chat panel: dark semi-transparent background,
// white text, mixed languages, similar font weight and spacing.
//
// Build & run:
//   swiftc gen-synthetic.swift -O -o gen-synthetic -framework AppKit
//   ./gen-synthetic out.png

import AppKit
import CoreGraphics

let outPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "synthetic-chat.png"

let lines: [(sender: String, text: String, allChat: Bool)] = [
    ("Pudge",      "gg wp",                                        true),
    ("AntiMage",   "mid miss, beware",                             true),
    ("Crystal",    "我们去打肉山",                                 false),
    ("Sven",       "smoke and gank bot",                           false),
    ("Lion",       "Иди в лес, я фармлю",                          true),
    ("Templar",    "no buyback on enemy carry",                    false),
    ("Juggernaut", "wait my ult then push",                        false),
    ("Phantom",    "ping mid please",                              true),
    ("Slardar",    "支援下路 def t2 now",                          false),
    ("Witch",      "стрим",                                        true),
]

let width = 720
let lineHeight = 26
let padding = 16
let height = padding * 2 + lineHeight * lines.count

guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: width,
    pixelsHigh: height,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
) else {
    FileHandle.standardError.write("bitmap alloc failed\n".data(using: .utf8)!)
    exit(1)
}

NSGraphicsContext.saveGraphicsState()
defer { NSGraphicsContext.restoreGraphicsState() }
guard let gctx = NSGraphicsContext(bitmapImageRep: bitmap) else {
    FileHandle.standardError.write("no graphics context\n".data(using: .utf8)!)
    exit(1)
}
NSGraphicsContext.current = gctx
let ctx = gctx.cgContext
_ = ctx  // silence unused warning

// Background: dark semi-transparent panel mimicking in-game chat overlay
NSColor(calibratedRed: 0.06, green: 0.08, blue: 0.10, alpha: 0.94).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()

// Subtle vignette to make OCR job a bit harder
let gradient = NSGradient(starting: NSColor(white: 0, alpha: 0.0),
                          ending: NSColor(white: 0, alpha: 0.18))!
gradient.draw(in: NSRect(x: 0, y: 0, width: width, height: height), angle: 270)

let nameColors: [NSColor] = [
    NSColor(calibratedRed: 0.40, green: 0.78, blue: 1.00, alpha: 1.0),  // ally blue-ish
    NSColor(calibratedRed: 1.00, green: 0.45, blue: 0.45, alpha: 1.0),  // enemy red-ish
    NSColor(calibratedRed: 0.98, green: 0.85, blue: 0.30, alpha: 1.0),  // all-chat yellow
]

let bodyAttrs: [NSAttributedString.Key: Any] = [
    .font: NSFont(name: "HelveticaNeue", size: 17) ?? NSFont.systemFont(ofSize: 17),
    .foregroundColor: NSColor.white,
]

for (idx, row) in lines.enumerated() {
    let yTop = padding + lineHeight * idx
    let y = height - yTop - lineHeight + 4  // Cocoa origin bottom-left

    // [All] / [Team] prefix
    let scope = row.allChat ? "[全部]" : "[队伍]"
    let scopeAttrs: [NSAttributedString.Key: Any] = [
        .font: NSFont(name: "HelveticaNeue-Bold", size: 14) ?? NSFont.boldSystemFont(ofSize: 14),
        .foregroundColor: row.allChat ? nameColors[2] : NSColor(white: 0.65, alpha: 1.0),
    ]
    let scopeStr = NSAttributedString(string: scope, attributes: scopeAttrs)
    scopeStr.draw(at: NSPoint(x: CGFloat(padding), y: CGFloat(y)))

    // Sender name
    let senderAttrs: [NSAttributedString.Key: Any] = [
        .font: NSFont(name: "HelveticaNeue-Bold", size: 17) ?? NSFont.boldSystemFont(ofSize: 17),
        .foregroundColor: nameColors[idx % 2],
    ]
    let senderStr = NSAttributedString(string: " \(row.sender):", attributes: senderAttrs)
    let scopeWidth = scopeStr.size().width
    senderStr.draw(at: NSPoint(x: CGFloat(padding) + scopeWidth, y: CGFloat(y)))

    // Message body
    let messageStr = NSAttributedString(string: " \(row.text)", attributes: bodyAttrs)
    let senderWidth = senderStr.size().width
    messageStr.draw(at: NSPoint(x: CGFloat(padding) + scopeWidth + senderWidth, y: CGFloat(y)))
}

// Export as PNG
guard let png = bitmap.representation(using: .png, properties: [:]) else {
    FileHandle.standardError.write("png export failed\n".data(using: .utf8)!)
    exit(1)
}

do {
    try png.write(to: URL(fileURLWithPath: outPath))
    print("wrote \(outPath) (\(width)x\(height), \(lines.count) lines)")
} catch {
    FileHandle.standardError.write("write failed: \(error)\n".data(using: .utf8)!)
    exit(1)
}
