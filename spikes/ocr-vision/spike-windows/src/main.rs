//! Spike B — Windows.Media.Ocr baseline for the v0.7.0 incoming-translation
//! feature. Mirrors `spikes/ocr-vision/spike.swift` so the macOS Spike-A
//! accuracy/latency table can be A/B-compared directly.
//!
//! Usage:
//!   spike-windows-ocr <png>                # auto (user-profile languages)
//!   spike-windows-ocr <png> --lang zh-Hans
//!   spike-windows-ocr <png> --lang en-US
//!   spike-windows-ocr <png> --lang ru-RU
//!   spike-windows-ocr <png> --crop X,Y,W,H # crop in source-pixel coords
//!   spike-windows-ocr <png> --bench        # 1 warmup + 5 timed iterations
//!   spike-windows-ocr <png> --json         # one JSON line on stdout
//!
//! Output is line-based on stdout. Stderr carries diagnostics only.

use std::fs;
use std::io::Cursor;
use std::time::Instant;

use image::{DynamicImage, GenericImageView, ImageFormat, Luma};
use image::imageops::FilterType;
use windows::core::HSTRING;
use windows::Globalization::Language;
use windows::Graphics::Imaging::{
    BitmapAlphaMode, BitmapDecoder, BitmapPixelFormat, SoftwareBitmap,
};
use windows::Media::Ocr::OcrEngine;
use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};

#[derive(Debug, Default)]
struct Args {
    path: String,
    lang: Option<String>,
    crop: Option<(u32, u32, u32, u32)>,
    bench: bool,
    json: bool,
    list_langs: bool,
    dump_crop: Option<String>,
    /// Optional preprocessing pipeline. Comma-separated tokens, applied
    /// in order. Supported: `gray`, `threshold:<u8>`, `upscale:<int>`,
    /// `invert`.
    preprocess: Vec<String>,
}

fn parse_args() -> Result<Args, String> {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let mut out = Args::default();
    let mut i = 0;
    while i < raw.len() {
        let a = &raw[i];
        match a.as_str() {
            "--lang" => {
                i += 1;
                out.lang = Some(raw.get(i).ok_or("--lang needs a value")?.clone());
            }
            "--crop" => {
                i += 1;
                let v = raw.get(i).ok_or("--crop needs X,Y,W,H")?;
                let parts: Vec<u32> = v
                    .split(',')
                    .map(|s| s.trim().parse::<u32>())
                    .collect::<Result<_, _>>()
                    .map_err(|e| format!("--crop parse: {e}"))?;
                if parts.len() != 4 {
                    return Err("--crop needs exactly 4 comma-separated u32".into());
                }
                out.crop = Some((parts[0], parts[1], parts[2], parts[3]));
            }
            "--bench" => out.bench = true,
            "--json" => out.json = true,
            "--list-langs" => out.list_langs = true,
            "--dump-crop" => {
                i += 1;
                out.dump_crop = Some(raw.get(i).ok_or("--dump-crop needs a path")?.clone());
            }
            "--preprocess" => {
                i += 1;
                let v = raw.get(i).ok_or("--preprocess needs a value")?;
                out.preprocess = v.split(',').map(|s| s.trim().to_string()).collect();
            }
            other if !other.starts_with("--") && out.path.is_empty() => {
                out.path = other.to_string();
            }
            other => return Err(format!("unknown arg: {other}")),
        }
        i += 1;
    }
    if !out.list_langs && out.path.is_empty() {
        return Err("missing <png> path".into());
    }
    Ok(out)
}

fn main() {
    if let Err(e) = run() {
        eprintln!("error: {e}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args = parse_args()?;

    if args.list_langs {
        let langs = OcrEngine::AvailableRecognizerLanguages()?;
        for lang in langs {
            let tag = lang.LanguageTag()?.to_string();
            let name = lang.DisplayName()?.to_string();
            println!("{tag}\t{name}");
        }
        return Ok(());
    }

    // ----- Load + optional crop ------------------------------------------
    let raw = fs::read(&args.path)?;
    let img = image::load_from_memory_with_format(&raw, ImageFormat::Png)?;
    let (full_w, full_h) = img.dimensions();
    let mut working_img = match args.crop {
        Some((x, y, w, h)) => crop_to_subimage(&img, x, y, w, h)?,
        None => img.clone(),
    };
    for step in &args.preprocess {
        working_img = apply_preprocess(working_img, step)?;
    }
    let (w, h) = working_img.dimensions();
    if let Some(p) = &args.dump_crop {
        working_img.save(p)?;
        eprintln!("dumped crop -> {p}");
    }
    let bitmap = bytes_to_software_bitmap(&working_img)?;

    // ----- Pick OCR engine -----------------------------------------------
    let engine = match args.lang.as_deref() {
        Some(tag) => {
            let lang = Language::CreateLanguage(&HSTRING::from(tag))?;
            if !OcrEngine::IsLanguageSupported(&lang)? {
                eprintln!("language not supported on this host: {tag}");
                let langs = OcrEngine::AvailableRecognizerLanguages()?;
                eprintln!("available:");
                for l in langs {
                    eprintln!("  {}", l.LanguageTag()?);
                }
                std::process::exit(2);
            }
            OcrEngine::TryCreateFromLanguage(&lang)?
        }
        None => OcrEngine::TryCreateFromUserProfileLanguages()?,
    };
    let max_dim = OcrEngine::MaxImageDimension()?;
    if max_dim < std::cmp::max(w, h) {
        eprintln!(
            "warning: image {w}x{h} exceeds OCR engine MaxImageDimension={max_dim}; results may be clipped"
        );
    }
    let engine_lang = engine.RecognizerLanguage()?.LanguageTag()?.to_string();

    // ----- Recognize (with optional benchmark) ---------------------------
    let mut latencies_ms: Vec<f64> = Vec::new();
    let result_text;
    let lines_text;

    if args.bench {
        // 1 warmup (drops the JIT / first-call setup cost), then 5 timed.
        let _ = engine.RecognizeAsync(&bitmap)?.get()?;
        for _ in 0..5 {
            let t = Instant::now();
            let _ = engine.RecognizeAsync(&bitmap)?.get()?;
            latencies_ms.push(t.elapsed().as_secs_f64() * 1000.0);
        }
        let r = engine.RecognizeAsync(&bitmap)?.get()?;
        result_text = r.Text()?.to_string();
        lines_text = collect_lines(&r)?;
    } else {
        let t = Instant::now();
        let r = engine.RecognizeAsync(&bitmap)?.get()?;
        latencies_ms.push(t.elapsed().as_secs_f64() * 1000.0);
        result_text = r.Text()?.to_string();
        lines_text = collect_lines(&r)?;
    }

    // ----- Emit ----------------------------------------------------------
    if args.json {
        let lat_str = latencies_ms
            .iter()
            .map(|v| format!("{v:.2}"))
            .collect::<Vec<_>>()
            .join(",");
        let escaped = json_escape(&result_text);
        let lines_json = lines_text
            .iter()
            .map(|l| format!("\"{}\"", json_escape(l)))
            .collect::<Vec<_>>()
            .join(",");
        println!(
            "{{\"path\":\"{path}\",\"engine_lang\":\"{lang}\",\"full_w\":{fw},\"full_h\":{fh},\"crop\":{crop},\"w\":{w},\"h\":{h},\"latencies_ms\":[{lat}],\"text\":\"{text}\",\"lines\":[{lines}]}}",
            path = json_escape(&args.path),
            lang = engine_lang,
            fw = full_w,
            fh = full_h,
            crop = match args.crop {
                Some((x, y, w, h)) => format!("[{x},{y},{w},{h}]"),
                None => "null".into(),
            },
            w = w,
            h = h,
            lat = lat_str,
            text = escaped,
            lines = lines_json,
        );
    } else {
        println!("# path:        {}", args.path);
        println!("# image:       {full_w}x{full_h}");
        if let Some(c) = args.crop {
            println!("# crop:        {},{},{},{} -> {}x{}", c.0, c.1, c.2, c.3, w, h);
        }
        println!("# engine_lang: {engine_lang}");
        if args.bench {
            let med = median(&latencies_ms);
            let mn = latencies_ms.iter().cloned().fold(f64::INFINITY, f64::min);
            let mx = latencies_ms.iter().cloned().fold(0.0_f64, f64::max);
            println!(
                "# latency_ms:  median={:.1} min={:.1} max={:.1} samples={}",
                med,
                mn,
                mx,
                latencies_ms.len()
            );
        } else {
            println!("# latency_ms:  {:.1}", latencies_ms[0]);
        }
        println!("--- text ---");
        for line in &lines_text {
            println!("{line}");
        }
    }
    Ok(())
}

fn apply_preprocess(img: DynamicImage, step: &str) -> Result<DynamicImage, String> {
    match step {
        "gray" => Ok(DynamicImage::ImageLuma8(img.to_luma8())),
        "invert" => {
            let mut out = img;
            image::imageops::invert(&mut out);
            Ok(out)
        }
        s if s.starts_with("threshold:") => {
            let v: u8 = s["threshold:".len()..]
                .parse()
                .map_err(|e| format!("threshold parse: {e}"))?;
            let gray = img.to_luma8();
            let (w, h) = gray.dimensions();
            let mut out = image::ImageBuffer::<Luma<u8>, Vec<u8>>::new(w, h);
            for (x, y, p) in gray.enumerate_pixels() {
                out.put_pixel(x, y, Luma([if p.0[0] >= v { 255 } else { 0 }]));
            }
            Ok(DynamicImage::ImageLuma8(out))
        }
        s if s.starts_with("upscale:") => {
            let n: u32 = s["upscale:".len()..]
                .parse()
                .map_err(|e| format!("upscale parse: {e}"))?;
            if n == 0 {
                return Err("upscale factor must be >= 1".into());
            }
            let (w, h) = img.dimensions();
            Ok(img.resize_exact(w * n, h * n, FilterType::Lanczos3))
        }
        other => Err(format!("unknown preprocess step: {other}")),
    }
}

fn crop_to_subimage(
    img: &DynamicImage,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
) -> Result<DynamicImage, String> {
    let (iw, ih) = img.dimensions();
    if x.saturating_add(w) > iw || y.saturating_add(h) > ih {
        return Err(format!(
            "crop {x},{y},{w},{h} out of bounds {iw}x{ih}"
        ));
    }
    Ok(img.crop_imm(x, y, w, h))
}

/// Convert a DynamicImage to a WinRT SoftwareBitmap (Bgra8 / premultiplied).
/// We re-encode to PNG in memory and let `BitmapDecoder` do the heavy lifting
/// -- this happens *before* timing in benchmark mode, so it doesn't pollute
/// the OCR latency measurement.
fn bytes_to_software_bitmap(
    img: &DynamicImage,
) -> Result<SoftwareBitmap, Box<dyn std::error::Error>> {
    let mut png_bytes: Vec<u8> = Vec::new();
    img.write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)?;

    let stream = InMemoryRandomAccessStream::new()?;
    let writer = DataWriter::CreateDataWriter(&stream.GetOutputStreamAt(0)?)?;
    writer.WriteBytes(&png_bytes)?;
    writer.StoreAsync()?.get()?;
    writer.DetachStream()?;
    stream.Seek(0)?;

    let decoder = BitmapDecoder::CreateAsync(&stream)?.get()?;
    let native = decoder.GetSoftwareBitmapAsync()?.get()?;
    let bitmap = SoftwareBitmap::ConvertWithAlpha(
        &native,
        BitmapPixelFormat::Bgra8,
        BitmapAlphaMode::Premultiplied,
    )?;
    Ok(bitmap)
}

fn collect_lines(
    result: &windows::Media::Ocr::OcrResult,
) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let mut out = Vec::new();
    let lines = result.Lines()?;
    for line in lines {
        out.push(line.Text()?.to_string());
    }
    Ok(out)
}

fn median(v: &[f64]) -> f64 {
    let mut s = v.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let n = s.len();
    if n == 0 {
        return 0.0;
    }
    if n % 2 == 1 {
        s[n / 2]
    } else {
        (s[n / 2 - 1] + s[n / 2]) / 2.0
    }
}

fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 8);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}
