from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = PROJECT_ROOT.parent
DIFFUSION_ROOT = WORKSPACE_ROOT / "taiko-diffusion"

if str(DIFFUSION_ROOT) not in sys.path:
    sys.path.insert(0, str(DIFFUSION_ROOT))
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import torch  # noqa: E402

from generate_encoder_chart_stats import parse_chart, read_json, write_json  # noqa: E402
from taiko_diffusion.data.build_v5_cache import event_tracks, pattern_tracks  # noqa: E402
from taiko_diffusion.data.build_v8_cache import (  # noqa: E402
    alternating_hand_tracks,
    collapse_big_notes,
    half_alternating_hand_tracks,
    hand_timing_tracks,
)
from taiko_diffusion.data.grid import CHANNELS as BASE_CHANNELS  # noqa: E402
from taiko_diffusion.data.grid import chart_to_grid  # noqa: E402
from taiko_diffusion.train_const_ordinal import ConstOrdinalModel, physical_features  # noqa: E402


MODEL_NAME = "const_ordinal_lowaux_v1"
BPM_RHYTHM_BIN_VALUES = {
    0: 0.0,
    1: 12.5,
    2: 50.0,
}
BPM_RHYTHM_BIN_LABELS = {
    0: "无BPM变化",
    1: "轻量BPM变化",
    2: "明显BPM变化",
}
BPM_RHYTHM_BIN_REASON = (
    "const_ordinal_lowaux_v1 只预测 bpm_rhythm_bin 离散分类；"
    "为兼容前端排序与六维计算，将 0/1/2 档映射为 0/12.5/50 的代表数值。"
)


def is_encoder_row(row: dict[str, Any]) -> bool:
    return bool(row.get("needs_encoder")) or row.get("source") in {"encoder", "encoder_pending"}


def round_const(value: float) -> float:
    return round(max(1.0, min(float(value), 11.8)), 1)


def final_grid(parsed: Any, frame_ms: float, max_frames: int) -> Any:
    grid = chart_to_grid(parsed, frame_ms=frame_ms, max_frames=max_frames, channels=list(BASE_CHANNELS))
    x = grid.x.astype(np.float32)
    channels = [str(name) for name in grid.channels]
    x, channels = collapse_big_notes(x, channels)
    x, channels = event_tracks(x, channels)
    x, channels = pattern_tracks(x, channels)
    x, channels = alternating_hand_tracks(x, channels)
    x, channels = half_alternating_hand_tracks(x, channels, frame_ms)
    x, channels = hand_timing_tracks(x, channels)
    grid.x = x.astype(np.float32)
    grid.channels = channels
    return grid


def load_model(checkpoint_path: Path, device: torch.device) -> tuple[ConstOrdinalModel, np.ndarray, np.ndarray]:
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
    phys_mean = np.asarray(checkpoint["phys_mean"], dtype=np.float32)
    phys_std = np.asarray(checkpoint["phys_std"], dtype=np.float32)
    model = ConstOrdinalModel(input_channels=51, phys_dim=len(phys_mean)).to(device)
    model.load_state_dict(checkpoint["model"])
    model.eval()
    return model, phys_mean, phys_std


def infer_batch(
    batch: list[dict[str, Any]],
    model: ConstOrdinalModel,
    phys_mean: np.ndarray,
    phys_std: np.ndarray,
    device: torch.device,
    frame_ms: float,
) -> list[dict[str, Any]]:
    if not batch:
        return []
    x = np.stack([item["grid"].x.transpose(1, 0) for item in batch]).astype(np.float32)
    phys_values = []
    courses = []
    for item in batch:
        parsed = item["parsed"]
        grid = item["grid"]
        combo = int(getattr(parsed, "playable_note_count", 0) or 0)
        fake_data = {
            "x": grid.x,
            "channels": np.asarray(grid.channels),
            "duration_frames": np.asarray([grid.duration_frames], dtype=np.int32),
        }
        raw_phys = physical_features(
            {"combo": combo, "duration_frames": grid.duration_frames},
            fake_data,
            frame_ms,
        )
        phys_values.append((raw_phys - phys_mean) / phys_std)
        course = str(item["row"].get("course") or "")
        courses.append({"Normal": 0, "Hard": 1, "Oni": 2, "Edit": 3}.get(course, 0))

    with torch.no_grad():
        output = model(
            torch.from_numpy(x).to(device),
            torch.from_numpy(np.stack(phys_values).astype(np.float32)).to(device),
            torch.tensor(courses, dtype=torch.long, device=device),
        )
        const_pred = output["const_pred"].detach().cpu().numpy()
        mode_const = output["mode_const"].detach().cpu().numpy()
        bin_probs = torch.softmax(output["bin_logits"], dim=1).detach().cpu().numpy()
        bpm_probs = torch.softmax(output["bpm_logits"], dim=1).detach().cpu().numpy()
        low_probs = torch.sigmoid(output["low_logits"]).detach().cpu().numpy()

    results = []
    for index, item in enumerate(batch):
        pred_bin = int(np.argmax(bin_probs[index]))
        bpm_bin = int(np.argmax(bpm_probs[index]))
        results.append(
            {
                "id": str(item["row"].get("id")),
                "const": float(const_pred[index]),
                "mode_const": float(mode_const[index]),
                "const_bin_pred": pred_bin,
                "const_bin_probs": [float(value) for value in bin_probs[index]],
                "bpm_rhythm_bin_pred": bpm_bin,
                "bpm_rhythm_probs": [float(value) for value in bpm_probs[index]],
                "low_aux_probs": {
                    "const_le_5": float(low_probs[index, 0]),
                    "const_le_6": float(low_probs[index, 1]),
                    "low_density": float(low_probs[index, 2]),
                },
                "duration_frames": int(item["grid"].duration_frames),
                "clipped": bool(item["grid"].clipped),
                "combo": int(getattr(item["parsed"], "playable_note_count", 0) or 0),
                "parse_mode": item["parse_mode"],
            }
        )
    return results


def apply_result(
    row: dict[str, Any],
    base_stats: dict[str, Any] | None,
    result: dict[str, Any],
    checkpoint: Path,
) -> dict[str, Any]:
    stats = dict(base_stats or {})
    previous_const = stats.get("const")
    stats["const"] = round_const(result["const"])
    if result["combo"]:
        stats["combo"] = result["combo"]
    bpm_bin = int(result["bpm_rhythm_bin_pred"])
    bpm_value = BPM_RHYTHM_BIN_VALUES.get(bpm_bin, 0.0)
    features = dict(stats.get("features") or {})
    previous_bpm_change = features.get("bpm_change")
    features["bpm_change"] = bpm_value
    stats["features"] = features
    feature_notes = dict(stats.get("feature_notes") or {})
    feature_notes["bpm_change"] = {
        "source": "bpm_rhythm_bin",
        "model": MODEL_NAME,
        "bin": bpm_bin,
        "bin_label": BPM_RHYTHM_BIN_LABELS.get(bpm_bin, "未知BPM变化档"),
        "representative_value": bpm_value,
        "previous_value": previous_bpm_change,
        "reason": BPM_RHYTHM_BIN_REASON,
    }
    stats["feature_notes"] = feature_notes

    encoder = dict(stats.get("encoder") or {})
    previous_model = encoder.get("model")
    encoder.update(
        {
            "status": "ok",
            "model": f"{previous_model or 'encoder'}+{MODEL_NAME}",
            "const_model": MODEL_NAME,
            "const_checkpoint": str(checkpoint.relative_to(WORKSPACE_ROOT))
            if checkpoint.is_relative_to(WORKSPACE_ROOT)
            else str(checkpoint),
            "const_previous": previous_const,
            "const_raw": round(float(result["const"]), 4),
            "mode_const_raw": round(float(result["mode_const"]), 4),
            "const_bin_pred": int(result["const_bin_pred"]),
            "const_bin_probs": result["const_bin_probs"],
            "bpm_rhythm_bin_pred": bpm_bin,
            "bpm_rhythm_probs": result["bpm_rhythm_probs"],
            "bpm_change_from_bin": bpm_value,
            "bpm_change_from_bin_reason": BPM_RHYTHM_BIN_REASON,
            "low_aux_probs": result["low_aux_probs"],
            "parse_mode": result["parse_mode"],
            "duration_frames": result["duration_frames"],
            "clipped": result["clipped"],
        }
    )
    stats["encoder"] = encoder
    return stats


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Apply ordinal const encoder to existing Taiko encoder stats.")
    parser.add_argument("--chart-data", type=Path, default=PROJECT_ROOT / "data" / "chart_data.json")
    parser.add_argument("--base-stats", type=Path, default=PROJECT_ROOT / "data" / "encoder_chart_stats.json")
    parser.add_argument("--output", type=Path, default=PROJECT_ROOT / "data" / "encoder_chart_stats_ordinal.json")
    parser.add_argument("--summary", type=Path, default=PROJECT_ROOT / "data" / "encoder_chart_stats_ordinal_summary.json")
    parser.add_argument("--checkpoint", type=Path, default=DIFFUSION_ROOT / "checkpoints" / "const_ordinal_lowaux_experiment" / "best.pt")
    parser.add_argument("--frame-ms", type=float, default=46.4399)
    parser.add_argument("--max-frames", type=int, default=8192)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda"])
    parser.add_argument(
        "--courses",
        default="Hard,Oni,Edit,Normal",
        help="Comma-separated courses to update. Defaults to all generated rating-data courses, including the two special Normal charts.",
    )
    parser.add_argument("--include-non-encoder", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    requested = args.device
    device_name = "cuda" if requested == "auto" and torch.cuda.is_available() else requested
    if device_name == "auto":
        device_name = "cpu"
    device = torch.device(device_name)
    model, phys_mean, phys_std = load_model(args.checkpoint, device)

    charts = read_json(args.chart_data, [])
    base_stats_by_id = read_json(args.base_stats, {})
    output: dict[str, Any] = dict(base_stats_by_id)
    allowed_courses = {item.strip() for item in str(args.courses).split(",") if item.strip()}
    selected = [
        row
        for row in charts
        if (args.include_non_encoder or is_encoder_row(row))
        and (not allowed_courses or str(row.get("course") or "") in allowed_courses)
    ]
    if args.limit > 0:
        selected = selected[: args.limit]

    start = time.time()
    generated = 0
    errors: list[dict[str, str]] = []
    by_course = Counter()
    changed_large = 0
    batch: list[dict[str, Any]] = []

    def flush() -> None:
        nonlocal generated, changed_large
        for result in infer_batch(batch, model, phys_mean, phys_std, device, args.frame_ms):
            chart_id = result["id"]
            row = next(item["row"] for item in batch if str(item["row"].get("id")) == chart_id)
            old = output.get(chart_id)
            old_const = old.get("const") if isinstance(old, dict) else None
            new_stats = apply_result(row, old if isinstance(old, dict) else None, result, args.checkpoint)
            if old_const is not None and abs(float(new_stats["const"]) - float(old_const)) >= 1.5:
                changed_large += 1
            output[chart_id] = new_stats
            generated += 1
        batch.clear()

    for row in selected:
        chart_id = str(row.get("id"))
        try:
            parsed, _path, parse_mode = parse_chart(row, discard_branch=True)
            grid = final_grid(parsed, frame_ms=args.frame_ms, max_frames=args.max_frames)
            batch.append({"row": row, "parsed": parsed, "grid": grid, "parse_mode": parse_mode})
            by_course[str(row.get("course"))] += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(
                {
                    "id": chart_id,
                    "title": str(row.get("title")),
                    "course": str(row.get("course")),
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )
        if len(batch) >= max(1, args.batch_size):
            flush()
            if generated and generated % 512 == 0:
                print(f"generated {generated}/{len(selected)}")
    if batch:
        flush()

    elapsed = time.time() - start
    summary = {
        "input_charts": len(charts),
        "selected": len(selected),
        "generated": generated,
        "errors": len(errors),
        "changed_const_by_at_least_1_5": changed_large,
        "by_course": dict(sorted(by_course.items())),
        "courses": sorted(allowed_courses),
        "device": str(device),
        "model": MODEL_NAME,
        "checkpoint": str(args.checkpoint),
        "base_stats": str(args.base_stats),
        "elapsed_seconds": round(elapsed, 2),
        "error_samples": errors[:50],
    }
    write_json(args.output, output)
    write_json(args.summary, summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
