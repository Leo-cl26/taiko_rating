from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TAIKO_ROOT = PROJECT_ROOT.parent

COURSE_ALIASES = {
    "0": "Easy",
    "1": "Normal",
    "2": "Hard",
    "3": "Oni",
    "4": "Edit",
    "easy": "Easy",
    "normal": "Normal",
    "hard": "Hard",
    "oni": "Oni",
    "edit": "Edit",
    "ura": "Edit",
}

NOTE_RE = re.compile(r"[0-9]")


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def read_tja(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "cp932", "shift_jis"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def clean_course(value: Any) -> str:
    key = str(value or "").strip().casefold()
    return COURSE_ALIASES.get(key, str(value or "").strip())


def strip_comment(line: str) -> str:
    return line.split("//", 1)[0].strip()


def course_blocks(text: str) -> dict[str, list[list[str]]]:
    blocks: dict[str, list[list[str]]] = {}
    current_course = ""
    in_score = False
    current_lines: list[str] = []

    for raw_line in text.splitlines():
        line = strip_comment(raw_line)
        if not line:
            continue

        course_match = re.match(r"^COURSE\s*:\s*(.+)$", line, re.I)
        if course_match and not in_score:
            current_course = clean_course(course_match.group(1))
            continue

        if line.upper().startswith("#START"):
            in_score = True
            current_lines = []
            continue

        if line.upper().startswith("#END"):
            if in_score and current_course:
                blocks.setdefault(current_course, []).append(current_lines)
            in_score = False
            current_lines = []
            continue

        if in_score:
            current_lines.append(line)

    return blocks


def extract_measures(block: list[str]) -> list[str]:
    measures: list[str] = []
    buffer: list[str] = []

    for line in block:
        if not line or line.startswith("#"):
            continue
        rest = line
        while "," in rest:
            before, rest = rest.split(",", 1)
            buffer.extend(NOTE_RE.findall(before))
            measures.append("".join(buffer) or "0")
            buffer = []
        buffer.extend(NOTE_RE.findall(rest))

    if buffer:
        measures.append("".join(buffer))

    return measures


def best_block_for_course(blocks: dict[str, list[list[str]]], course: str) -> list[str] | None:
    candidates = blocks.get(course)
    if not candidates:
        return None
    return max(candidates, key=lambda block: sum(len(NOTE_RE.findall(line)) for line in block if not line.startswith("#")))


def build_preview(chart: dict[str, Any], max_measures: int) -> tuple[dict[str, Any] | None, str | None]:
    ese = chart.get("ese") if isinstance(chart.get("ese"), dict) else {}
    path_text = str(ese.get("path") or "")
    if not path_text:
        return None, "missing ese.path"

    tja_path = TAIKO_ROOT / path_text
    if not tja_path.exists():
        return None, f"missing file: {path_text}"

    try:
        blocks = course_blocks(read_tja(tja_path))
    except OSError as exc:
        return None, f"{type(exc).__name__}: {exc}"

    course = clean_course(chart.get("course"))
    block = best_block_for_course(blocks, course)
    if block is None:
        return None, f"missing course: {course}"

    measures = extract_measures(block)
    if not measures:
        return None, "no measures"

    full_measure_count = len(measures)
    clipped = max_measures > 0 and full_measure_count > max_measures
    if clipped:
        measures = measures[:max_measures]

    note_count = sum(1 for measure in measures for note in measure if note not in {"0", "8"})
    return {
        "source": "local_tja",
        "course": course,
        "measure_count": full_measure_count,
        "shown_measure_count": len(measures),
        "is_clipped": clipped,
        "note_count": note_count,
        "max_measure_resolution": max(len(measure) for measure in measures),
        "measures": measures,
    }, None


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Generate compact local TJA chart previews for the frontend.")
    parser.add_argument("--chart-data", type=Path, default=PROJECT_ROOT / "data" / "chart_data.json")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "data" / "local_chart_previews.json")
    parser.add_argument("--max-measures", type=int, default=0, help="0 keeps the full chart.")
    args = parser.parse_args()

    charts = read_json(args.chart_data, [])
    previews: dict[str, Any] = {}
    errors: dict[str, str] = {}

    for chart in charts:
        record_id = str(chart.get("id") or "")
        if not record_id:
            continue
        preview, error = build_preview(chart, max(0, args.max_measures))
        if preview:
            previews[record_id] = preview
        elif error:
            errors[record_id] = error

    summary = {
        "chart_rows": len(charts),
        "with_preview": len(previews),
        "without_preview": len(errors),
        "generated_at": int(time.time()),
        "max_measures": max(0, args.max_measures),
        "sample_errors": dict(list(errors.items())[:20]),
    }
    payload = {
        "version": "local_tja_preview_v1",
        "summary": summary,
        "previews": previews,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
