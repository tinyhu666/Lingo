use std::{env, fs, time::Instant};

use lingo_lib::incoming::{
    game_profiles::chat_region_for, game_window::GameId, ocr::default_ocr_engine, LineTracker,
    OcrFrame, OcrOptions, PixelFormat, Rect,
};
use serde_json::json;

fn parse_dimension(value: &str, name: &str) -> Result<u32, String> {
    value
        .parse::<u32>()
        .ok()
        .filter(|value| *value > 0)
        .ok_or_else(|| format!("{name} must be a positive integer"))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = env::args().collect::<Vec<_>>();
    if args.get(1).map(String::as_str) == Some("profile") {
        if args.len() != 5 {
            return Err("usage: ocr_fixture profile <dota2|lol> <width> <height>".into());
        }
        let game = match args[2].as_str() {
            "dota2" => GameId::Dota2,
            "lol" => GameId::LeagueOfLegends,
            _ => return Err("profile game must be dota2 or lol".into()),
        };
        let width = parse_dimension(&args[3], "width")?;
        let height = parse_dimension(&args[4], "height")?;
        let rect = chat_region_for(
            game,
            Rect {
                x: 0,
                y: 0,
                w: width,
                h: height,
            },
        );
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({
                "game": args[2],
                "height": height,
                "rect": {
                    "x": rect.x,
                    "y": rect.y,
                    "w": rect.w,
                    "h": rect.h,
                },
                "width": width,
            }))?
        );
        return Ok(());
    }

    if !(4..=5).contains(&args.len()) {
        return Err(
            "usage: ocr_fixture <frame.bgra> <width> <height> [single|multilingual|ru]\n       ocr_fixture profile <dota2|lol> <width> <height>".into(),
        );
    }

    let width = parse_dimension(&args[2], "width")?;
    let height = parse_dimension(&args[3], "height")?;
    let mode = args.get(4).map(String::as_str).unwrap_or("multilingual");
    if !matches!(mode, "single" | "multilingual" | "ru") {
        return Err("mode must be single, multilingual, or ru".into());
    }

    let stride = width.checked_mul(4).ok_or("frame stride overflowed u32")?;
    let expected_len = (stride as usize)
        .checked_mul(height as usize)
        .ok_or("frame size overflowed usize")?;
    let data = fs::read(&args[1])?;
    if data.len() != expected_len {
        return Err(format!(
            "raw frame has {} bytes; expected {expected_len}",
            data.len()
        )
        .into());
    }

    let frame = OcrFrame {
        width,
        height,
        stride,
        format: PixelFormat::Bgra8,
        data,
    };
    let engine = default_ocr_engine()?;
    let mut options = OcrOptions::default();
    if mode == "ru" {
        options.auto_detect_language = false;
        options.languages = vec!["ru-RU".to_string()];
    }
    let started = Instant::now();
    let lines = match mode {
        "multilingual" => engine.recognize_multilingual(&frame, &options)?,
        _ => engine.recognize(&frame, &options)?,
    };

    let mut tracker = LineTracker::default();
    let messages = tracker
        .ingest(&lines)
        .into_iter()
        .map(|message| {
            json!({
                "scope": message.scope.map(|scope| format!("{scope:?}")),
                "sender": message.sender,
                "text": message.text,
            })
        })
        .collect::<Vec<_>>();

    let lines = lines
        .into_iter()
        .map(|line| {
            json!({
                "text": line.text,
                "confidence": line.confidence,
                "bbox": {
                    "x": line.bbox.x,
                    "y": line.bbox.y,
                    "w": line.bbox.w,
                    "h": line.bbox.h,
                },
            })
        })
        .collect::<Vec<_>>();

    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "elapsed_ms": started.elapsed().as_millis(),
            "height": height,
            "lines": lines,
            "messages": messages,
            "mode": mode,
            "width": width,
        }))?
    );
    Ok(())
}
