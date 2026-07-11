from __future__ import annotations

import csv
import json
import urllib.request
from pathlib import Path


URL = "https://viewer.sakura-bot.cn/api/taiko/data/constants_id_v2"
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "v2_constants.json"


def number(row: dict[str, str], key: str) -> float:
    return float((row.get(key) or "0").strip())


def main() -> None:
    with urllib.request.urlopen(URL, timeout=60) as response:
        text = response.read().decode("utf-8-sig")
    rows = []
    for row in csv.DictReader(text.splitlines()):
        try:
            song_id = int(row["id"])
        except (KeyError, ValueError):
            # Arcade score APIs use numeric song IDs; console-only IDs cannot
            # be joined to a player's arcade records.
            continue
        difficulty = (row.get("difficulty") or "").strip()
        level = 4 if difficulty == "oni" else 5 if difficulty == "edit" else 0
        if not level:
            continue
        rows.append(
            {
                "id": song_id,
                "level": level,
                "main": number(row, "main_constant"),
                "low": number(row, "sub_constant_1"),
                "high": number(row, "sub_constant_2"),
                "stamina": number(row, "stamina"),
                "handspeed": number(row, "handspeed"),
                "burst": number(row, "burst"),
                "complex": number(row, "complex"),
                "rhythm": number(row, "rhythm"),
            }
        )
    OUTPUT.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(rows)} charts to {OUTPUT}")


if __name__ == "__main__":
    main()
