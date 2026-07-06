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
COMMAND_RE = re.compile(r"^#([A-Z]+)(?:\s+(.+))?$", re.I)


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


def safe_float(value: Any, default: float) -> float:
    try:
        number = float(str(value).strip().split()[0])
    except (IndexError, TypeError, ValueError):
        return default
    return number if number == number and abs(number) != float("inf") else default


def round4(value: float) -> float:
    return round(float(value), 4)


def parse_meter(value: str, current: tuple[float, float]) -> tuple[float, float]:
    text = str(value or "").strip()
    if "/" not in text:
        return current
    left, right = text.split("/", 1)
    numerator = safe_float(left, current[0])
    denominator = safe_float(right, current[1])
    if numerator <= 0 or denominator <= 0:
        return current
    return numerator, denominator


def command_parts(line: str) -> tuple[str, str] | None:
    match = COMMAND_RE.match(line.strip())
    if not match:
        return None
    return match.group(1).upper(), (match.group(2) or "").strip()


def extract_preview_data(block: list[str], initial_bpm: float) -> dict[str, Any]:
    measures: list[str] = []
    timings: list[list[float | int]] = []
    segment_timings: dict[str, list[list[float | int]]] = {}
    note_buffer: list[str] = []
    parts: list[dict[str, Any]] = []

    bpm = initial_bpm if initial_bpm > 0 else 120.0
    scroll = 1.0
    meter_num = 4.0
    meter_den = 4.0
    barline = True
    time_pos = 0.0
    visual_pos = 0.0
    stats = {
        "bpm_change_count": 0,
        "scroll_change_count": 0,
        "delay_count": 0,
        "measure_change_count": 0,
        "barline_off_count": 0,
        "min_bpm": bpm,
        "max_bpm": bpm,
        "min_scroll": scroll,
        "max_scroll": scroll,
        "total_delay": 0.0,
    }

    def snapshot() -> tuple[float, float, float, float, bool]:
        return bpm, scroll, meter_num, meter_den, barline

    def flush_notes() -> None:
        nonlocal note_buffer
        if note_buffer:
            parts.append({"notes": "".join(note_buffer), "state": snapshot(), "delay": 0.0})
            note_buffer = []

    def add_delay(seconds: float) -> None:
        if seconds <= 0:
            return
        flush_notes()
        parts.append({"notes": "", "state": snapshot(), "delay": seconds})
        stats["delay_count"] += 1
        stats["total_delay"] += seconds

    def finalize_measure() -> None:
        nonlocal parts, time_pos, visual_pos
        flush_notes()
        if not parts:
            parts = [{"notes": "0", "state": snapshot(), "delay": 0.0}]

        measure_text = "".join(str(part["notes"]) for part in parts if part.get("notes")) or "0"
        total_notes = sum(len(str(part["notes"])) for part in parts if part.get("notes")) or 1
        measure_index = len(measures)
        measure_start_time = time_pos
        measure_start_visual = visual_pos
        measure_segments: list[list[float | int]] = []
        note_index = 0

        for part in parts:
            part_notes = str(part.get("notes") or "")
            part_len = len(part_notes)
            part_bpm, part_scroll, part_num, part_den, _part_barline = part["state"]
            part_delay = float(part.get("delay") or 0.0)
            if part_delay > 0:
                measure_segments.append(
                    [
                        note_index,
                        note_index,
                        round4(time_pos),
                        round4(visual_pos),
                        round4(part_delay),
                        0,
                        round4(part_bpm),
                        round4(part_scroll),
                    ]
                )
                time_pos += part_delay
            if part_len <= 0:
                continue
            beats = 4.0 * (part_num / part_den) * (part_len / total_notes)
            duration = (60.0 / max(part_bpm, 1e-6)) * beats
            visual_duration = beats * part_scroll
            measure_segments.append(
                [
                    note_index,
                    note_index + part_len,
                    round4(time_pos),
                    round4(visual_pos),
                    round4(duration),
                    round4(visual_duration),
                    round4(part_bpm),
                    round4(part_scroll),
                ]
            )
            time_pos += duration
            visual_pos += visual_duration
            note_index += part_len

        first_state = next((part["state"] for part in parts if part.get("notes")), parts[0]["state"])
        measures.append(measure_text)
        timings.append(
            [
                round4(measure_start_time),
                round4(measure_start_visual),
                round4(time_pos - measure_start_time),
                round4(visual_pos - measure_start_visual),
                round4(first_state[0]),
                round4(first_state[1]),
                1 if first_state[4] else 0,
            ]
        )
        if len(measure_segments) > 1:
            segment_timings[str(measure_index)] = measure_segments
        parts = []

    for line in block:
        if not line:
            continue
        command = command_parts(line)
        if command:
            key, value = command
            if key in {"BPMCHANGE", "BPM"}:
                flush_notes()
                bpm = max(1e-6, safe_float(value, bpm))
                stats["bpm_change_count"] += 1
                stats["min_bpm"] = min(float(stats["min_bpm"]), bpm)
                stats["max_bpm"] = max(float(stats["max_bpm"]), bpm)
            elif key == "SCROLL":
                flush_notes()
                scroll = safe_float(value, scroll)
                stats["scroll_change_count"] += 1
                stats["min_scroll"] = min(float(stats["min_scroll"]), scroll)
                stats["max_scroll"] = max(float(stats["max_scroll"]), scroll)
            elif key == "DELAY":
                add_delay(safe_float(value, 0.0))
            elif key == "MEASURE":
                flush_notes()
                meter_num, meter_den = parse_meter(value, (meter_num, meter_den))
                stats["measure_change_count"] += 1
            elif key == "BARLINEOFF":
                flush_notes()
                barline = False
                stats["barline_off_count"] += 1
            elif key == "BARLINEON":
                flush_notes()
                barline = True
            continue

        rest = line
        while "," in rest:
            before, rest = rest.split(",", 1)
            note_buffer.extend(NOTE_RE.findall(before))
            finalize_measure()
        note_buffer.extend(NOTE_RE.findall(rest))

    if note_buffer or parts:
        finalize_measure()

    note_count = sum(1 for measure in measures for note in measure if note not in {"0", "8"})
    return {
        "measures": measures,
        "measure_timings": timings,
        "segment_timings": segment_timings,
        "note_count": note_count,
        "max_measure_resolution": max((len(measure) for measure in measures), default=0),
        "timing_summary": {
            **{key: int(value) for key, value in stats.items() if key.endswith("_count")},
            "barline_off_count": int(stats["barline_off_count"]),
            "min_bpm": round4(float(stats["min_bpm"])),
            "max_bpm": round4(float(stats["max_bpm"])),
            "min_scroll": round4(float(stats["min_scroll"])),
            "max_scroll": round4(float(stats["max_scroll"])),
            "total_delay": round4(float(stats["total_delay"])),
            "duration": round4(time_pos),
            "visual_duration": round4(visual_pos),
            "segment_measure_count": len(segment_timings),
        },
    }


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

    initial_bpm = safe_float(chart.get("bpm"), 120.0)
    preview_data = extract_preview_data(block, initial_bpm)
    measures = preview_data["measures"]
    if not measures:
        return None, "no measures"

    full_measure_count = len(measures)
    clipped = max_measures > 0 and full_measure_count > max_measures
    if clipped:
        measures = measures[:max_measures]
        preview_data["measures"] = measures
        preview_data["measure_timings"] = preview_data["measure_timings"][:max_measures]
        preview_data["segment_timings"] = {
            key: value for key, value in preview_data["segment_timings"].items() if int(key) < max_measures
        }
        preview_data["note_count"] = sum(1 for measure in measures for note in measure if note not in {"0", "8"})
        preview_data["max_measure_resolution"] = max(len(measure) for measure in measures)

    timing_summary = preview_data.get("timing_summary", {})
    needs_explicit_timing = any(
        int(timing_summary.get(key, 0) or 0) > 0
        for key in (
            "bpm_change_count",
            "scroll_change_count",
            "delay_count",
            "measure_change_count",
            "barline_off_count",
            "segment_measure_count",
        )
    )
    if not needs_explicit_timing:
        preview_data.pop("measure_timings", None)
        preview_data.pop("segment_timings", None)

    return {
        "source": "local_tja",
        "course": course,
        "measure_count": full_measure_count,
        "shown_measure_count": len(measures),
        "is_clipped": clipped,
        "timing_version": 2,
        **preview_data,
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
        "version": "local_tja_preview_v2",
        "summary": summary,
        "previews": previews,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
