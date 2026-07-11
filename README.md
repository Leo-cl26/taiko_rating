# taiko_rating

太鼓の達人 player rating prototype.

This is a static browser app for:

- fetching score data from the Kinoko API
- joining score records with local chart constants
- calculating a CHUNITHM-like Taiko Rating
- rendering chart previews generated from local ESE/TJA files
- rendering and exporting a share image

Run a local static server before opening the app, because the browser needs to
fetch `data/chart_data.json` and `data/local_chart_previews.json`:

```bash
python -m http.server 8765
```

Then open `http://127.0.0.1:8765/`.

GitHub Pages can serve this repo directly as a static site. In the repository
settings, enable Pages with source `Deploy from a branch`, branch `main`, folder
`/ (root)`.

## V2 ability profile

The main Rating remains the absolute strength indicator. The six numeric
abilities use Sakura Bot v2 constants when a numeric arcade song ID is
available: stamina, hand speed, burst, accuracy, rhythm, and complex. Each is a
weighted Best 15, with weights `1.0 / 0.8 / 0.6` for each group of five.

The radar polygon is a relative profile centered at 50. Its baseline is the
median and MAD of v2 charts within `main constant +/- 0.5`; it is an ability
tendency, not a player percentile. Lower difficulties retain a feature-based
fallback. Historical Nijiiro 2020-2024 dojo medians provide the displayed Dan
reference.

Regenerate the vendored v2 constants with:

```bash
python scripts/build_v2_constants.py
```
