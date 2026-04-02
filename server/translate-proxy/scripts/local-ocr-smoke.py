import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run local OCR on screenshots, then call backend /translate with usage=inbound_read.",
    )
    parser.add_argument("--dir", dest="image_dir", help="Directory containing screenshots.")
    parser.add_argument("--image", action="append", default=[], help="Individual image path.")
    parser.add_argument("--url", default="https://buffpp.com", help="Backend base URL.")
    parser.add_argument("--token", default="", help="Backend public key.")
    parser.add_argument("--game-scene", default="dota2")
    parser.add_argument("--ui-locale", default="zh-CN")
    parser.add_argument("--target-language", default="zh")
    parser.add_argument("--expected", default="", help="Path to golden expected JSON.")
    parser.add_argument("--output-json", default="")
    parser.add_argument("--output-md", default="")
    return parser.parse_args()


def resolve_image_paths(args):
    paths = [Path(item).resolve() for item in args.image if item]
    if args.image_dir:
        image_dir = Path(args.image_dir).resolve()
        paths.extend(sorted(
            path for path in image_dir.iterdir()
            if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
        ))
    deduped = []
    seen = set()
    for path in paths:
        if path not in seen:
            seen.add(path)
            deduped.append(path)
    if not deduped:
        raise SystemExit("No image files found.")
    return deduped


def load_expected(path_value):
    if not path_value:
        return None
    path = Path(path_value).resolve()
    payload = json.loads(path.read_text(encoding="utf-8"))
    items = payload.get("items") or []
    return {
        "path": str(path),
        "metadata": payload.get("metadata") or {},
        "items": items,
    }


def request_json(url, payload, token=""):
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("apikey", token)
        request.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body_text = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"{url} failed: HTTP {error.code} {body_text}")


def normalize_ocr_text(text):
    value = str(text or "").strip()
    replacements = {
        "Ісся": "队友",
        "似友": "队友",
        "友]": "队友]",
        "队友」": "[队友]",
        "『队友]": "[队友]",
        "【队友]": "[队友]",
        "NotAditDayclE": "Not AditDayol",
        "Not AditDaol": "Not AditDayol",
        "BabyPapart": "Baby Papart",
        "Try MeIf": "Try Me If",
        "BUHATNABUHATSF": "BUHAT NA BUHAT SF",
        "from cancerto hero": "from cancer to hero",
        "etagege": "eta gege",
        "lettri?": "let tri?",
        "smoke kayo sa bot": "smoke kayo sa bot",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def box_bounds(box):
    xs = [point[0] for point in box]
    ys = [point[1] for point in box]
    return min(xs), min(ys), max(xs), max(ys)


def merge_ocr_rows(raw_result):
    entries = []
    for item in raw_result or []:
        box, text, confidence = item
        x1, y1, x2, y2 = box_bounds(box)
        entries.append({
            "x1": float(x1),
            "y1": float(y1),
            "x2": float(x2),
            "y2": float(y2),
            "center_y": (float(y1) + float(y2)) / 2.0,
            "height": max(float(y2) - float(y1), 1.0),
            "text": normalize_ocr_text(text),
            "confidence": float(confidence),
        })

    entries = [entry for entry in entries if entry["text"]]
    entries.sort(key=lambda entry: (entry["center_y"], entry["x1"]))

    groups = []
    for entry in entries:
        if not groups:
            groups.append([entry])
            continue
        last_group = groups[-1]
        avg_center_y = sum(item["center_y"] for item in last_group) / len(last_group)
        avg_height = sum(item["height"] for item in last_group) / len(last_group)
        threshold = max(10.0, avg_height * 0.8)
        if abs(entry["center_y"] - avg_center_y) <= threshold:
            last_group.append(entry)
        else:
            groups.append([entry])

    merged = []
    for group in groups:
        group.sort(key=lambda entry: entry["x1"])
        text = " ".join(item["text"] for item in group).strip()
        confidence = sum(item["confidence"] for item in group) / len(group)
        merged.append({
            "text": text,
            "confidence": round(confidence, 4),
        })
    return merged


def parse_chat_line(text):
    cleaned = normalize_ocr_text(text)
    if not cleaned:
        return None
    if "掷骰子" in cleaned:
        return {
            "speaker": "",
            "channel": "",
            "text": cleaned,
            "is_system": True,
        }
    if re.fullmatch(r"[<>\-_=~\s]+", cleaned):
        return None

    channel = ""
    speaker = ""
    message = cleaned

    channel_match = re.match(r"^\[?(队友)\]?\s*(.+)$", cleaned)
    if channel_match:
        channel = channel_match.group(1)
        message = channel_match.group(2).strip()

    if ":" in message:
        left, right = message.split(":", 1)
        speaker = left.strip()
        message = right.strip()
    else:
        speaker = ""

    return {
        "speaker": speaker,
        "channel": channel,
        "text": message,
        "is_system": False,
    }


def normalize_loose_text(value):
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def normalize_channel(value):
    return normalize_loose_text(value).strip("[]")


def compare_expected(parsed_lines, expected_item):
    if not expected_item:
        return None

    expected_lines = [line for line in expected_item.get("expected_lines", []) if not line.get("is_system")]
    actual_lines = [line for line in parsed_lines if not line.get("is_system")]
    expected_translated = [line for line in expected_lines if not line.get("skip_translate")]
    actual_translations = [line for line in actual_lines if not line.get("is_system")]

    text_matches = 0
    speaker_matches = 0
    channel_matches = 0
    translation_matches = 0

    for index, expected_line in enumerate(expected_lines):
        if index >= len(actual_lines):
            break
        actual_line = actual_lines[index]
        if normalize_loose_text(actual_line.get("text")) == normalize_loose_text(expected_line.get("text")):
            text_matches += 1
        if normalize_loose_text(actual_line.get("speaker")) == normalize_loose_text(expected_line.get("speaker")):
            speaker_matches += 1
        if normalize_channel(actual_line.get("channel")) == normalize_channel(expected_line.get("channel")):
            channel_matches += 1

    for index, expected_line in enumerate(expected_translated):
        if index >= len(actual_translations):
            break
        actual_translation = normalize_loose_text(actual_translations[index].get("translated_text"))
        candidates = [expected_line.get("expected_translation_zh", "")]
        candidates.extend(expected_line.get("expected_translation_zh_alternatives", []) or [])
        if any(normalize_loose_text(candidate) == actual_translation for candidate in candidates):
            translation_matches += 1

    def rate(matched, total):
        if total <= 0:
            return None
        return round(matched / total, 4)

    return {
        "expected_id": expected_item.get("id"),
        "text_matches": text_matches,
        "speaker_matches": speaker_matches,
        "channel_matches": channel_matches,
        "translation_matches": translation_matches,
        "expected_non_system_lines": len(expected_lines),
        "expected_translated_lines": len(expected_translated),
        "text_match_rate": rate(text_matches, len(expected_lines)),
        "speaker_match_rate": rate(speaker_matches, len(expected_lines)),
        "channel_match_rate": rate(channel_matches, len(expected_lines)),
        "translation_match_rate": rate(translation_matches, len(expected_translated)),
    }


def render_markdown(report):
    lines = [
        "# Local OCR Smoke Report",
        "",
        f"- Base URL: `{report['metadata']['base_url']}`",
        f"- Game Scene: `{report['metadata']['game_scene']}`",
        f"- Target Language: `{report['metadata']['target_language']}`",
        f"- Images: `{len(report['results'])}`",
        "",
    ]

    for result in report["results"]:
        lines.extend([
            f"## {result['image_name']}",
            "",
        ])
        if result.get("expected"):
            lines.extend([
                f"- Text Match: `{result['expected']['text_matches']}/{result['expected']['expected_non_system_lines']}`",
                f"- Translation Match: `{result['expected']['translation_matches']}/{result['expected']['expected_translated_lines']}`",
                f"- Speaker Match: `{result['expected']['speaker_matches']}/{result['expected']['expected_non_system_lines']}`",
                "",
            ])

        lines.extend([
            "| Speaker | Channel | OCR Text | Translation | Confidence |",
            "| --- | --- | --- | --- | ---: |",
        ])
        for line in result["parsed_lines"]:
            translation = line.get("translated_text", "")
            lines.append(
                f"| {line.get('speaker','').replace('|','\\\\|')} | {line.get('channel','').replace('|','\\\\|')} | {line.get('text','').replace('|','\\\\|')} | {translation.replace('|','\\\\|')} | {line.get('confidence','')} |"
            )
        lines.append("")

    return "\n".join(lines) + "\n"


def main():
    args = parse_args()
    image_paths = resolve_image_paths(args)
    expected_set = load_expected(args.expected)

    try:
        from rapidocr_onnxruntime import RapidOCR
    except Exception as error:
        raise SystemExit(
            f"rapidocr_onnxruntime is required. Install with `python -m pip install rapidocr_onnxruntime pillow`. ({error})"
        )

    ocr = RapidOCR()
    results = []
    expected_items = expected_set["items"] if expected_set else []

    for index, image_path in enumerate(image_paths):
        raw_result, _ = ocr(str(image_path))
        merged_rows = merge_ocr_rows(raw_result)
        parsed_lines = []
        for row in merged_rows:
            parsed = parse_chat_line(row["text"])
            if not parsed:
                continue
            parsed["confidence"] = row["confidence"]
            parsed["translated_text"] = ""
            parsed["translation_meta"] = None
            parsed_lines.append(parsed)
            if parsed["is_system"] or not parsed["text"]:
                continue
            translated = request_json(
                f"{args.url.rstrip('/')}/translate",
                {
                    "text": parsed["text"],
                    "translation_from": "auto",
                    "translation_to": args.target_language,
                    "translation_mode": "auto",
                    "game_scene": args.game_scene,
                    "daily_mode": False,
                    "usage": "inbound_read",
                },
                token=args.token,
            )
            parsed["translated_text"] = translated.get("translated_text", "")
            parsed["translation_meta"] = {
                "source_text": parsed["text"],
                "translated_text": translated.get("translated_text", ""),
                "trace_id": translated.get("trace_id"),
                "model": translated.get("model"),
                "model_route": translated.get("model_route"),
                "prompt_variant": translated.get("prompt_variant"),
            }

        expected_item = None
        if expected_items:
            expected_item = expected_items[index] if index < len(expected_items) else None
        results.append({
            "image_path": str(image_path),
            "image_name": image_path.name,
            "parsed_lines": parsed_lines,
            "expected": compare_expected(parsed_lines, expected_item),
        })

    report = {
        "metadata": {
            "base_url": args.url.rstrip("/"),
            "game_scene": args.game_scene,
            "target_language": args.target_language,
            "expected_path": expected_set["path"] if expected_set else None,
        },
        "results": results,
    }

    if args.output_json:
        output_json = Path(args.output_json).resolve()
        output_json.parent.mkdir(parents=True, exist_ok=True)
        output_json.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    markdown = render_markdown(report)
    if args.output_md:
        output_md = Path(args.output_md).resolve()
        output_md.parent.mkdir(parents=True, exist_ok=True)
        output_md.write_text(markdown, encoding="utf-8")

    sys.stdout.write(markdown)


if __name__ == "__main__":
    main()
