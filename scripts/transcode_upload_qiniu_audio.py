from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import hmac
import json
import mimetypes
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

import requests


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TAIKO_ROOT = PROJECT_ROOT.parent
DEFAULT_ENV = TAIKO_ROOT / "taiko_rating_bot" / ".env.qiniu"
DEFAULT_PREVIEWS = PROJECT_ROOT / "data" / "local_chart_previews.json"
DEFAULT_OUTPUT = TAIKO_ROOT / "taiko_audio_opus64"
DEFAULT_MANIFEST = PROJECT_ROOT / "data" / "audio_manifest.json"
QINIU_UPLOAD_ENDPOINTS = {
    "z0": "https://up.qiniup.com",
    "z1": "https://up-z1.qiniup.com",
    "z2": "https://up-z2.qiniup.com",
    "na0": "https://up-na0.qiniup.com",
    "as0": "https://up-as0.qiniup.com",
}
REGION_ALIASES = {
    "cn-east-1": "z0",
    "east": "z0",
    "华东": "z0",
    "cn-north-1": "z1",
    "north": "z1",
    "华北": "z1",
    "cn-south-1": "z2",
    "south": "z2",
    "华南": "z2",
    "us-north-1": "na0",
    "north-america": "na0",
    "ap-southeast-1": "as0",
    "singapore": "as0",
}


def load_env(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise FileNotFoundError(f"Qiniu config not found: {path}")
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    required = ("QINIU_ACCESS_KEY", "QINIU_SECRET_KEY", "QINIU_BUCKET", "QINIU_REGION", "QINIU_CDN_BASE_URL")
    missing = [key for key in required if not values.get(key)]
    if missing:
        raise ValueError(f"Missing values in {path.name}: {', '.join(missing)}")
    return values


def qiniu_region(value: str) -> str:
    region = str(value).strip().casefold()
    region = REGION_ALIASES.get(region, region)
    if region not in QINIU_UPLOAD_ENDPOINTS:
        supported = ", ".join(QINIU_UPLOAD_ENDPOINTS)
        raise ValueError(f"Unsupported QINIU_REGION {value!r}; use one of: {supported}")
    return region


def collect_audio_paths(preview_path: Path) -> list[str]:
    payload = json.loads(preview_path.read_text(encoding="utf-8"))
    previews = payload.get("previews") if isinstance(payload, dict) else {}
    paths = {
        str(preview.get("audio", {}).get("path") or "").replace("\\", "/")
        for preview in (previews or {}).values()
        if isinstance(preview, dict) and isinstance(preview.get("audio"), dict)
    }
    return sorted(path for path in paths if path)


def audio_entry(source_path: str) -> dict[str, str]:
    digest = hashlib.sha256(source_path.encode("utf-8")).hexdigest()
    return {
        "key": f"taiko-audio/opus64/{digest[:2]}/{digest}.opus",
        "content_type": "audio/ogg",
    }


def build_jobs(source_paths: list[str], output_root: Path) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    for source_path in source_paths:
        source = TAIKO_ROOT / Path(source_path)
        if not source.is_file():
            raise FileNotFoundError(f"Audio source referenced by preview data is missing: {source_path}")
        entry = audio_entry(source_path)
        output = output_root / Path(entry["key"]).relative_to("taiko-audio/opus64")
        jobs.append({"source_path": source_path, "source": source, "output": output, **entry})
    return jobs


def write_manifest(path: Path, jobs: list[dict[str, Any]]) -> None:
    payload = {
        "version": "taiko_audio_manifest_v1",
        "codec": "opus",
        "bitrate_kbps": 64,
        "objects": {job["source_path"]: {"key": job["key"], "content_type": job["content_type"]} for job in jobs},
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def transcode_one(job: dict[str, Any], ffmpeg: str, bitrate_kbps: int) -> tuple[str, str]:
    output = Path(job["output"])
    if output.is_file() and output.stat().st_size > 0:
        return job["source_path"], "skipped"
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".part.opus")
    if temporary.exists():
        temporary.unlink()
    command = [
        ffmpeg,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(job["source"]),
        "-map",
        "0:a:0",
        "-vn",
        "-map_metadata",
        "-1",
        "-c:a",
        "libopus",
        "-b:a",
        f"{bitrate_kbps}k",
        "-vbr",
        "on",
        "-application",
        "audio",
        str(temporary),
    ]
    subprocess.run(command, check=True)
    temporary.replace(output)
    return job["source_path"], "encoded"


def urlsafe_base64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii")


def upload_token(access_key: str, secret_key: str, bucket: str, key: str) -> str:
    policy = {"scope": f"{bucket}:{key}", "deadline": int(time.time()) + 3600, "insertOnly": 1}
    encoded_policy = urlsafe_base64(json.dumps(policy, separators=(",", ":")).encode("utf-8"))
    signature = urlsafe_base64(hmac.new(secret_key.encode("utf-8"), encoded_policy.encode("ascii"), hashlib.sha1).digest())
    return f"{access_key}:{signature}:{encoded_policy}"


def upload_one(job: dict[str, Any], config: dict[str, str], endpoint: str, retries: int) -> tuple[str, str]:
    output = Path(job["output"])
    if not output.is_file() or output.stat().st_size <= 0:
        raise FileNotFoundError(f"Compressed output not found: {output}")
    token = upload_token(config["QINIU_ACCESS_KEY"], config["QINIU_SECRET_KEY"], config["QINIU_BUCKET"], job["key"])
    last_error = ""
    for attempt in range(1, retries + 1):
        try:
            with output.open("rb") as content:
                response = requests.post(
                    endpoint,
                    data={"token": token, "key": job["key"]},
                    files={"file": (output.name, content, job["content_type"])},
                    timeout=(30, 600),
                )
            if response.status_code == 200:
                return job["source_path"], "uploaded"
            if response.status_code == 614:
                return job["source_path"], "exists"
            last_error = f"HTTP {response.status_code}: {response.text[:300]}"
        except requests.RequestException as exc:
            last_error = f"{type(exc).__name__}: {exc}"
        if attempt < retries:
            time.sleep(min(30, 2 ** (attempt - 1)))
    raise RuntimeError(f"Qiniu upload failed for {job['key']}: {last_error}")


def run_parallel(label: str, jobs: list[dict[str, Any]], workers: int, callback) -> None:
    total = len(jobs)
    completed = 0
    counts: dict[str, int] = {}
    lock = threading.Lock()
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        futures = [executor.submit(callback, job) for job in jobs]
        for future in concurrent.futures.as_completed(futures):
            source_path, status = future.result()
            with lock:
                completed += 1
                counts[status] = counts.get(status, 0) + 1
                if completed == 1 or completed % 25 == 0 or completed == total:
                    print(f"{label}: {completed}/{total} ({', '.join(f'{key}={value}' for key, value in sorted(counts.items()))})", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcode licensed Taiko preview audio to Opus and upload it to Qiniu Kodo.")
    parser.add_argument("--env", type=Path, default=DEFAULT_ENV)
    parser.add_argument("--previews", type=Path, default=DEFAULT_PREVIEWS)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--ffmpeg", default=os.environ.get("FFMPEG_PATH", r"C:\Program Files\ImageMagick-7.1.0-Q16\ffmpeg.exe"))
    parser.add_argument("--bitrate-kbps", type=int, default=64)
    parser.add_argument("--transcode-workers", type=int, default=2)
    parser.add_argument("--upload-workers", type=int, default=4)
    parser.add_argument("--retries", type=int, default=5)
    parser.add_argument("--limit", type=int, default=0, help="Process only the first N files; 0 processes every referenced file.")
    parser.add_argument("--transcode-only", action="store_true")
    parser.add_argument("--upload-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.transcode_only and args.upload_only:
        raise ValueError("--transcode-only and --upload-only cannot be used together")
    if args.bitrate_kbps != 64:
        raise ValueError("This uploader is intentionally locked to the approved 64 kbps profile")
    if not Path(args.ffmpeg).is_file():
        raise FileNotFoundError(f"ffmpeg not found: {args.ffmpeg}")

    config = load_env(args.env)
    region = qiniu_region(config["QINIU_REGION"])
    source_paths = collect_audio_paths(args.previews)
    all_jobs = build_jobs(source_paths, args.output_root)
    write_manifest(args.manifest, all_jobs)
    jobs = all_jobs
    if args.limit > 0:
        jobs = jobs[: args.limit]
    print(f"Prepared {len(jobs)}/{len(all_jobs)} audio jobs; manifest: {args.manifest}")
    print(f"Qiniu bucket configured; upload region={region}; CDN={config['QINIU_CDN_BASE_URL'].rstrip('/')}")
    if args.dry_run:
        return
    if not args.upload_only:
        run_parallel(
            "Transcode",
            jobs,
            args.transcode_workers,
            lambda job: transcode_one(job, args.ffmpeg, args.bitrate_kbps),
        )
    if not args.transcode_only:
        endpoint = QINIU_UPLOAD_ENDPOINTS[region]
        run_parallel(
            "Upload",
            jobs,
            args.upload_workers,
            lambda job: upload_one(job, config, endpoint, args.retries),
        )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
