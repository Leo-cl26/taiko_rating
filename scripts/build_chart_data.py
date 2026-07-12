from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

try:
    import openpyxl
except ImportError:  # pragma: no cover - optional helper for local rebuilds
    openpyxl = None


COURSE_LEVEL = {
    "easy": 1,
    "normal": 2,
    "hard": 3,
    "oni": 4,
    "edit": 5,
}

COURSE_LABEL = {
    "Easy": "梅",
    "Normal": "竹",
    "Hard": "困难",
    "Oni": "魔王",
    "Edit": "里魔王",
}

DEFAULT_INCLUDED_COURSES = {"easy", "normal", "hard", "oni", "edit"}

FORCE_NORMAL_TITLES = [
    "ダーク・エクス・マキナ",
    "Dark Ex Machina",
    "幽玄ノ乱",
    "Yuugen no Ran",
]

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TAIKO_ROOT = PROJECT_ROOT.parent


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def as_float(value: Any, default: float | None = None) -> float | None:
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def as_int(value: Any, default: int | None = None) -> int | None:
    if value is None or value == "":
        return default
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def clean_course(course: str) -> str:
    name = str(course or "").strip()
    return name[:1].upper() + name[1:].lower()


def normalize_title(title: str) -> str:
    value = unicodedata.normalize("NFKC", str(title or "")).casefold()
    value = value.replace("♡", "")
    value = value.replace("～", "~")
    value = value.replace("・", "")
    value = value.replace("ノ", "の")
    value = re.sub(r"\(裏\)|（裏）|\bura\b|\bedit\b", "", value)
    value = re.sub(r"[^0-9a-z\u3040-\u30ff\u3400-\u9fff]+", "", value)
    return value


def clean_alias_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        text = str(int(value))
    else:
        text = str(value)
    text = unicodedata.normalize("NFKC", text).strip()
    text = re.sub(r"\s+", " ", text)
    if text.startswith("&&"):
        text = text[2:].strip()
    if not text or re.fullmatch(r"id\d+", text, re.I):
        return ""
    return text


def add_unique_alias(aliases: list[str], value: Any, primary: str = "") -> None:
    alias = clean_alias_value(value)
    if not alias or alias == primary:
        return
    normalized = normalize_title(alias)
    if not normalized or normalized == normalize_title(primary):
        return
    if alias not in aliases:
        aliases.append(alias)


def build_song_alias_index(path: Path | None) -> dict[str, list[str]]:
    if not path or not path.exists() or openpyxl is None:
        return {}

    workbook = openpyxl.load_workbook(path, read_only=True, data_only=True)
    groups: list[list[str]] = []
    for sheet in workbook.worksheets:
        if sheet.title.lower().startswith("sheet"):
            continue
        for row in sheet.iter_rows(min_row=3, values_only=True):
            title = clean_alias_value(row[1] if len(row) > 1 else "")
            if not title:
                continue
            aliases: list[str] = []
            for value in row[2:26]:
                add_unique_alias(aliases, value, title)
            if aliases:
                groups.append([title, *aliases])

    index: dict[str, list[str]] = {}
    for group in groups:
        merged: list[str] = []
        for value in group:
            add_unique_alias(merged, value)
        for value in group:
            key = normalize_title(value)
            if not key:
                continue
            bucket = index.setdefault(key, [])
            for alias in merged:
                if normalize_title(alias) != key and alias not in bucket:
                    bucket.append(alias)
    return index


def title_blob(row: dict[str, str]) -> str:
    return " ".join(
        str(row.get(key, ""))
        for key in ["title", "title_ja", "title_zh", "ese_title", "ese_title_ja", "ese_title_zh"]
    )


def is_forced_normal(row: dict[str, str]) -> bool:
    if clean_course(row.get("course", "")).casefold() != "normal":
        return False
    blob = title_blob(row)
    normalized_blob = normalize_title(blob)
    return any(normalize_title(title) in normalized_blob for title in FORCE_NORMAL_TITLES)


def is_target_course(row: dict[str, str]) -> bool:
    course = clean_course(row.get("course", "")).casefold()
    return course in DEFAULT_INCLUDED_COURSES or is_forced_normal(row)


def excel_stats(row: dict[str, str]) -> dict[str, Any]:
    return {
        "const": as_float(row.get("const")),
        "combo": as_int(row.get("combo")),
        "features": {
            "complex": as_float(row.get("complex")),
            "avg_density": as_float(row.get("avg_density")),
            "peak_density": as_float(row.get("peak_density")),
            "note_type": as_float(row.get("note_type")),
            "bpm_change": as_float(row.get("bpm_change")),
            "hs_change": as_float(row.get("hs_change")),
            "rhythm": as_float(row.get("rhythm")),
        },
        "roll_time": row.get("roll_time") or None,
        "balloon_num": as_int(row.get("balloon_num"), 0),
    }


def numeric_stats(stats: dict[str, Any]) -> dict[str, Any]:
    features = stats.get("features") or {}
    result = {
        "const": as_float(stats.get("const")),
        "combo": as_int(stats.get("combo")),
        "features": {
            "complex": as_float(features.get("complex")),
            "avg_density": as_float(features.get("avg_density")),
            "peak_density": as_float(features.get("peak_density")),
            "note_type": as_float(features.get("note_type")),
            "bpm_change": as_float(features.get("bpm_change")),
            "hs_change": as_float(features.get("hs_change")),
            "rhythm": as_float(features.get("rhythm")),
        },
        "roll_time": stats.get("roll_time") or None,
        "roll_time_seconds": as_float(stats.get("roll_time_seconds")),
        "balloon_num": as_int(stats.get("balloon_num"), 0),
    }
    if isinstance(stats.get("feature_notes"), dict):
        result["feature_notes"] = stats["feature_notes"]
    return result


def build_excel_by_course(strict_rows: list[dict[str, str]]) -> dict[tuple[str, str], dict[str, Any]]:
    out: dict[tuple[str, str], dict[str, Any]] = {}
    for row in strict_rows:
        path = str(row.get("ese_path", ""))
        course = clean_course(row.get("ese_course", ""))
        if not path or not course:
            continue
        out[(path, course.casefold())] = row
    return out


def read_tja_bpm(path_text: str) -> float | None:
    if not path_text:
        return None
    path = TAIKO_ROOT / path_text
    if not path.exists():
        return None
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    for encoding in ("utf-8-sig", "utf-8", "cp932", "shift_jis"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("utf-8", "replace")
    for line in text.splitlines():
        clean = line.split("//", 1)[0].strip()
        match = re.match(r"^BPM\s*:\s*(-?\d+(?:\.\d+)?)", clean, re.I)
        if match:
            return as_float(match.group(1))
    return None


def build_bpm_by_path(ese_rows: list[dict[str, str]]) -> dict[str, float | None]:
    bpm_by_path: dict[str, float | None] = {}
    for row in ese_rows:
        path = str(row.get("path", ""))
        if path and path not in bpm_by_path:
            bpm_by_path[path] = read_tja_bpm(path)
    return bpm_by_path


def maybe_anomaly_dark(row: dict[str, str]) -> bool:
    blob = title_blob(row)
    return "anomalous" in blob.casefold() or "anomaly" in str(row.get("path", "")).casefold()


def should_keep_forced_duplicate(row: dict[str, str]) -> bool:
    # The ESE tree contains both the normal Dark Ex Machina and an Anomalous Audio
    # variant with the same Japanese title. The special case means the normal
    # song's竹 chart, not the Anomalous Audio variant.
    if "darkexmachina" in normalize_title(title_blob(row)):
        return not maybe_anomaly_dark(row)
    return True


def fumen_stats(stats_by_id: dict[str, Any], record_id: str) -> dict[str, Any] | None:
    stats = stats_by_id.get(record_id)
    if not isinstance(stats, dict):
        return None
    if stats.get("const") is None:
        return None
    fumen = stats.get("fumen") if isinstance(stats.get("fumen"), dict) else {}
    if fumen and fumen.get("status") not in {None, "ok"}:
        return None
    return {
        **numeric_stats(stats),
        "fumen": fumen,
    }


def encoder_stats(stats_by_id: dict[str, Any], record_id: str) -> dict[str, Any] | None:
    stats = stats_by_id.get(record_id)
    if not isinstance(stats, dict):
        return None
    if stats.get("const") is None:
        return None
    encoder = stats.get("encoder") if isinstance(stats.get("encoder"), dict) else {}
    if encoder and encoder.get("status") not in {None, "ok"}:
        return None
    return {
        **numeric_stats(stats),
        "encoder": stats.get("encoder"),
    }


def make_record(
    row: dict[str, str],
    excel_row: dict[str, str] | None,
    fumen_stats_by_id: dict[str, Any],
    encoder_stats_by_id: dict[str, Any],
    bpm_by_path: dict[str, float | None],
    alias_index: dict[str, list[str]],
) -> dict[str, Any]:
    course = clean_course(row.get("course", ""))
    course_level = COURSE_LEVEL.get(course.casefold())
    record_id = f"ese:{row.get('path')}::{course}"
    generated_stats = None
    fumen_row_stats = None if excel_row is not None else fumen_stats(fumen_stats_by_id, record_id)
    if excel_row is not None:
        source = "excel"
        stats = excel_stats(excel_row)
    elif fumen_row_stats is not None:
        source = "fumen"
        stats = fumen_row_stats
    else:
        generated_stats = encoder_stats(encoder_stats_by_id, record_id)
        source = "encoder" if generated_stats is not None else "encoder_pending"
        stats = generated_stats or {
            "const": None,
            "combo": as_int(row.get("note_count")),
            "features": {
                "complex": None,
                "avg_density": None,
                "peak_density": None,
                "note_type": None,
                "bpm_change": None,
                "hs_change": None,
                "rhythm": None,
            },
            "roll_time": None,
            "balloon_num": None,
        }
    title = row.get("title_zh") or row.get("title_ja") or row.get("title") or ""
    aliases = [
        value
        for value in [row.get("title"), row.get("title_ja"), row.get("title_zh")]
        if value and value != title
    ]
    for name in [title, *aliases]:
        for alias in alias_index.get(normalize_title(name), []):
            add_unique_alias(aliases, alias, title)
    forced_normal = is_forced_normal(row)
    rating_excluded = course.casefold() == "normal" and not forced_normal
    return {
        "id": record_id,
        "title": title,
        "aliases": aliases,
        "title_normalized": normalize_title(title),
        "course": course,
        "course_label": COURSE_LABEL.get(course, course),
        "level": as_int(row.get("level")),
        "bpm": bpm_by_path.get(str(row.get("path", ""))),
        "score_level": course_level,
        "is_ura": str(row.get("is_ura", "")).lower() == "true",
        "has_branch": str(row.get("has_branch", "")).lower() == "true",
        "ese": {
            "path": row.get("path"),
            "category": row.get("category"),
            "note_count": as_int(row.get("note_count")),
            "roll_start_count": as_int(row.get("roll_start_count")),
            "balloon_declared": row.get("balloon_declared") or None,
        },
        **stats,
        "source": source,
        "needs_encoder": excel_row is None and fumen_row_stats is None and generated_stats is None,
        "rating_excluded": rating_excluded,
        "rating_exclusion_reason": "竹难度为更松判定，仅作理论难度参考，不参与表 Rating B20 / 里 Rating B30" if rating_excluded else None,
        "force_included": forced_normal,
        "review": {
            "matched_combo_delta": as_int(excel_row.get("combo_delta")) if excel_row else (
                as_int((stats.get("fumen") or {}).get("match", {}).get("combo_delta")) if source == "fumen" else None
            ),
            "matched_combo_delta_threshold": as_int(excel_row.get("combo_delta_threshold")) if excel_row else (
                as_int((stats.get("fumen") or {}).get("match", {}).get("combo_delta_threshold")) if source == "fumen" else None
            ),
        },
    }


def variant_label(row: dict[str, Any]) -> str:
    title_key = row.get("title_normalized") or normalize_title(row.get("title", ""))
    path_text = str(row.get("ese", {}).get("path") or "")
    path = Path(path_text)
    candidates = [
        path.stem,
        path.parent.name,
        str(row.get("ese", {}).get("category") or ""),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        if re.fullmatch(r"\d{2}\s+.+", str(candidate).strip()):
            continue
        if normalize_title(candidate) != title_key:
            return candidate
    return ""


def numeric_signature(row: dict[str, Any]) -> str:
    features = row.get("features") if isinstance(row.get("features"), dict) else {}
    def rounded(value: Any) -> Any:
        number = as_float(value)
        if number is None:
            return value
        return round(number, 6)

    def roll_time_value() -> Any:
        seconds = as_float(row.get("roll_time_seconds"))
        if seconds is not None:
            return round(seconds, 6)
        match = re.search(r"-?\d+(?:\.\d+)?", str(row.get("roll_time") or ""))
        return round(float(match.group(0)), 6) if match else row.get("roll_time")

    payload = {
        "course": row.get("course"),
        "score_level": row.get("score_level"),
        "const": rounded(row.get("const")),
        "combo": as_int(row.get("combo")),
        "features": {
            key: rounded(features.get(key))
            for key in ["complex", "avg_density", "peak_density", "note_type", "bpm_change", "hs_change", "rhythm"]
        },
        "roll_time": roll_time_value(),
        "balloon_num": as_int(row.get("balloon_num")),
        "rating_excluded": row.get("rating_excluded"),
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def dedupe_keep_key(row: dict[str, Any]) -> tuple[int, int, int, int, str]:
    path = str(row.get("ese", {}).get("path") or "")
    title = str(row.get("title") or "")
    text = f"{path} {title}".casefold()
    variant_penalty = int(any(token in text for token in ["anomaly", "anomalous", "cover", "old audio", "new audio", "nijisanji"]))
    source_rank = {"excel": 0, "fumen": 1, "encoder": 2, "encoder_pending": 3}.get(str(row.get("source")), 4)
    return (variant_penalty, source_rank, 0, len(path), path)


def merge_aliases(target: dict[str, Any], duplicate: dict[str, Any]) -> None:
    aliases = list(target.get("aliases") or [])
    for value in [
        duplicate.get("title"),
        duplicate.get("display_title"),
        duplicate.get("variant_label"),
        *(duplicate.get("aliases") or []),
    ]:
        if value and value != target.get("title") and value not in aliases:
            aliases.append(value)
    target["aliases"] = aliases


def drop_exact_numeric_duplicates(records: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for row in records:
        groups.setdefault(numeric_signature(row), []).append(row)

    kept: list[dict[str, Any]] = []
    removed: list[dict[str, Any]] = []
    for group in groups.values():
        if len(group) == 1:
            kept.append(group[0])
            continue
        group.sort(key=dedupe_keep_key)
        primary = group[0]
        merged_titles: list[str] = []
        merged_paths: list[str] = []
        for duplicate in group[1:]:
            merge_aliases(primary, duplicate)
            removed.append(duplicate)
            title = duplicate.get("display_title") or duplicate.get("title")
            path = duplicate.get("ese", {}).get("path")
            if title and title not in merged_titles:
                merged_titles.append(title)
            if path and path not in merged_paths:
                merged_paths.append(path)
        primary["dedupe"] = {
            "merged_count": len(group),
            "removed_count": len(group) - 1,
            "reason": "数值签名完全相同，仅曲名或谱面路径不同；保留一个代表谱面并把其它曲名合并为别名。",
            "merged_titles": merged_titles,
            "merged_paths": merged_paths,
        }
        kept.append(primary)

    summary = {
        "duplicate_groups_removed": sum(1 for group in groups.values() if len(group) > 1),
        "duplicate_rows_removed": len(removed),
        "samples": [
            {
                "kept": group[0].get("display_title") or group[0].get("title"),
                "course": group[0].get("course"),
                "removed": [item.get("display_title") or item.get("title") for item in group[1:]],
            }
            for group in (
                sorted(values, key=dedupe_keep_key)
                for values in groups.values()
                if len(values) > 1
            )
        ][:20],
    }
    return kept, summary


def add_duplicate_metadata(records: list[dict[str, Any]]) -> None:
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for row in records:
        key = (str(row.get("title_normalized") or normalize_title(row.get("title", ""))), str(row.get("course") or ""))
        groups.setdefault(key, []).append(row)

    for group in groups.values():
        group.sort(key=lambda item: str(item.get("ese", {}).get("path") or ""))
        for index, row in enumerate(group, start=1):
            row["duplicate_group_size"] = len(group)
            row["duplicate_index"] = index
            if len(group) == 1:
                row["display_title"] = row["title"]
                row["variant_label"] = None
                continue
            label = variant_label(row)
            row["variant_label"] = label
            row["display_title"] = f"{row['title']} · {label}" if label else row["title"]


def build_chart_data(
    ese_rows: list[dict[str, str]],
    excel_by_course: dict[tuple[str, str], dict[str, str]],
    fumen_stats_by_id: dict[str, Any],
    encoder_stats_by_id: dict[str, Any],
    bpm_by_path: dict[str, float | None],
    alias_index: dict[str, list[str]],
    v3_abilities_by_id: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for row in ese_rows:
        course = clean_course(row.get("course", ""))
        row = {**row, "course": course}
        if not is_target_course(row):
            continue
        if is_forced_normal(row) and not should_keep_forced_duplicate(row):
            continue
        key = (str(row.get("path", "")), course.casefold())
        if key in seen:
            continue
        seen.add(key)
        excel_row = excel_by_course.get(key)
        record = make_record(row, excel_row, fumen_stats_by_id, encoder_stats_by_id, bpm_by_path, alias_index)
        ability = (v3_abilities_by_id or {}).get(str(record.get("id")))
        if isinstance(ability, dict):
            record["v3"] = {
                key: round(float(ability[key]), 4)
                for key in ("main", "stamina", "handspeed", "burst", "complex", "rhythm")
                if ability.get(key) is not None
            }
        records.append(record)

    records, dedupe_summary = drop_exact_numeric_duplicates(records)
    records.sort(key=lambda item: (item["course"] != "Edit", item["course"] != "Oni", item["course"] != "Hard", item["title"]))
    add_duplicate_metadata(records)
    for row in records:
        row["_dedupe_summary"] = dedupe_summary
    return records


def summarize(records: list[dict[str, Any]]) -> dict[str, Any]:
    by_course = Counter(row["course"] for row in records)
    by_source = Counter(row["source"] for row in records)
    forced = [row for row in records if row["force_included"]]
    duplicate_groups = Counter((row["title_normalized"], row["course"]) for row in records)
    dedupe_summary = records[0].pop("_dedupe_summary", {}) if records and "_dedupe_summary" in records[0] else {}
    for row in records:
        row.pop("_dedupe_summary", None)
    return {
        "total": len(records),
        "by_course": dict(sorted(by_course.items())),
        "by_source": dict(sorted(by_source.items())),
        "needs_encoder": sum(1 for row in records if row["needs_encoder"]),
        "v3_abilities": {
            "covered": sum(1 for row in records if isinstance(row.get("v3"), dict)),
            "by_course": dict(sorted(Counter(
                row["course"] for row in records if isinstance(row.get("v3"), dict)
            ).items())),
        },
        "duplicate_title_groups": sum(1 for count in duplicate_groups.values() if count > 1),
        "duplicate_chart_rows": sum(count for count in duplicate_groups.values() if count > 1),
        "exact_numeric_dedupe": dedupe_summary,
        "force_included": [
            {
                "title": row["title"],
                "display_title": row["display_title"],
                "course": row["course"],
                "level": row["level"],
                "source": row["source"],
                "path": row["ese"]["path"],
            }
            for row in forced
        ],
    }


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Build static Taiko chart data for the rating frontend.")
    parser.add_argument("--ese-courses", type=Path, default=Path("../taiko_encoder_out/ese_courses.csv"))
    parser.add_argument("--strict-matched", type=Path, default=Path("../taiko_encoder_out/strict_matched_dataset.csv"))
    parser.add_argument("--fumen-stats", type=Path, default=Path("data/fumen_chart_stats.json"))
    parser.add_argument(
        "--encoder-stats",
        type=Path,
        default=Path("data/encoder_chart_stats_ordinal.json"),
        help="Generated fallback stats; defaults to the retained pre-tuning ordinal const model.",
    )
    parser.add_argument("--v3-abilities", type=Path, default=Path("data/v3_abilities.json"))
    parser.add_argument("--alias-workbook", type=Path, default=Path("太鼓之达人歌曲别名收集表.xlsx"))
    parser.add_argument("--output", type=Path, default=Path("data/chart_data.json"))
    parser.add_argument("--summary", type=Path, default=Path("data/chart_data_summary.json"))
    args = parser.parse_args()

    ese_rows = read_csv(args.ese_courses)
    strict_rows = read_csv(args.strict_matched)
    fumen_stats_by_id: dict[str, Any] = {}
    if args.fumen_stats.exists():
        fumen_stats_by_id = json.loads(args.fumen_stats.read_text(encoding="utf-8"))
    encoder_stats_by_id: dict[str, Any] = {}
    if args.encoder_stats.exists():
        encoder_stats_by_id = json.loads(args.encoder_stats.read_text(encoding="utf-8"))
    v3_abilities_by_id: dict[str, Any] = {}
    if args.v3_abilities.exists():
        v3_abilities_by_id = json.loads(args.v3_abilities.read_text(encoding="utf-8"))
    alias_index = build_song_alias_index(args.alias_workbook)
    excel_by_course = build_excel_by_course(strict_rows)
    bpm_by_path = build_bpm_by_path(ese_rows)
    records = build_chart_data(
        ese_rows,
        excel_by_course,
        fumen_stats_by_id,
        encoder_stats_by_id,
        bpm_by_path,
        alias_index,
        v3_abilities_by_id,
    )
    summary = summarize(records)
    summary["alias_workbook"] = {
        "path": str(args.alias_workbook),
        "keys": len(alias_index),
        "loaded": bool(alias_index),
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    args.summary.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
