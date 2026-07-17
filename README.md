# taiko_rating

太鼓の達人 player rating prototype.

This is a static browser app for:

- fetching score data from the Kinoko API
- joining score records with local chart constants
- calculating a CHUNITHM-like Taiko Rating
- rendering chart previews generated from local ESE/TJA files
- rendering and exporting a share image
- opening a shareable, per-song preview page with all available difficulties

The user-facing score is the classic comprehensive B20 Rating. A monotonic
piecewise curve calibrated from historical red-pass Dan requirements converts
that Rating into a recommended traditional chart constant. Different
difficulties of the same song are independent B20 candidates.

Run a local static server before opening the app, because the browser needs to
fetch `data/chart_data.json` and `data/local_chart_previews.json`:

```bash
python -m http.server 8765
```

Then open `http://127.0.0.1:8765/`.

GitHub Pages can serve this repo directly as a static site. In the repository
settings, enable Pages with source `Deploy from a branch`, branch `main`, folder
`/ (root)`.

## Shareable song preview pages and music

Every locally parsed song has a shareable page in this form. The page first
downloads a compact song index and then only that song's preview package; it
does not wait for the full chart library on a phone:

```text
https://taiko.mmt.qd.je/fumen.html?song=<title_normalized>
```

The page lists the song's available difficulties, plays the event-accurate TJA
visual chart, and keeps the chart synchronized with an HTML audio element when
an audio host is configured. The Bot's `/查歌` result sends this page after its
image reply.

Audio files deliberately stay out of this GitHub Pages repository: the local
ESE collection is about 10 GiB. `scripts/generate_local_chart_previews.py`
records the source-relative audio path and TJA `OFFSET` for every preview in
`data/local_chart_previews.json`. The checked-in `audio_manifest.json` maps
those paths to safe, content-addressed Opus object keys; it keeps local file
names out of public URLs and lets all difficulty charts sharing one source use
one CDN object.

For the production 64 kbps Opus build on Qiniu Kodo, create a local
`../taiko_rating_bot/.env.qiniu` file (never commit it) containing
`QINIU_ACCESS_KEY`, `QINIU_SECRET_KEY`, `QINIU_BUCKET`, `QINIU_REGION`, and
`QINIU_CDN_BASE_URL`, then run:

```bash
python scripts/transcode_upload_qiniu_audio.py --transcode-workers 2 --upload-workers 4
```

The script is restart-safe: it retains completed local transcodes and treats
Qiniu's insert-only "already exists" response as success. It writes
`data/audio_manifest.json`; after a successful upload, configure the public,
HTTPS, CORS-enabled CDN root in `data/audio_config.json`, for example:

```json
{
  "base_url":"https://audio.example.com",
  "manifest_url":"data/audio_manifest.json"
}
```

The public origin must permit anonymous HTTPS reads, byte-range requests, and
a permissive CORS header for `audio/ogg` responses. Before that configuration
is supplied, the same pages remain usable as visual-only chart players and
state that music is awaiting deployment.

## V4 ability profile

The comprehensive Rating remains the absolute strength indicator. The six numeric
abilities use the local v4 encoder catalog embedded in `chart_data.json`:
stamina, reading, burst, accuracy, rhythm, and complex. Reading models native
BPM/#SCROLL visual flow, screen information load, abrupt speed changes, and
simultaneous mixed-speed notes. The catalog covers
all Oni/Edit/Hard charts plus generated Normal reference charts
`DARK EX MACHINA♡` and `幽玄之乱`; the Easy/Normal rows for these two songs
remain excluded from Rating while their Hard and higher rows are included.
Sakura v2 is retained only as a compatibility fallback. Each player ability is
an independent simple-average B20: the top twenty single-chart values for that
specific axis are averaged without additional decay weights.

The radar polygon is a relative profile centered at 50. Its baseline is the
median and MAD of v4 charts within `main constant +/- 0.5`; it is an ability
tendency, not a player percentile. Lower difficulties retain a feature-based
fallback. Historical Nijiiro 2020-2024 dojo medians provide the displayed Dan
reference.

The v4 catalog is generated in the sibling encoder project and then embedded
when chart data is rebuilt:

```bash
python ../encoder/scripts/generate_v3_full_catalog.py --checkpoint ../encoder/checkpoints/encoder_custom_abilities_v4_reading_density/best.pt --output data/v4_reading_abilities.json --model-name encoder_custom_abilities_v4_reading_density --overwrite
python scripts/build_chart_data.py
```

For charts without spreadsheet/community constants, `build_chart_data.py`
currently retains `encoder_chart_stats_ordinal.json`, the established ordinal
const checkpoint chosen before the next const-model tuning round.

Regenerate the vendored v2 constants with:

```bash
python scripts/build_v2_constants.py
```
