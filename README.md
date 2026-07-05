# taiko_rating

太鼓の達人 player rating prototype.

This is a static browser app for:

- fetching score data from the Kinoko API
- joining score records with local chart constants
- calculating a CHUNITHM-like Taiko Rating
- rendering and exporting a share image

Run a local static server before opening the app, because the browser needs to
fetch `data/chart_data.json`:

```bash
python -m http.server 8765
```

Then open `http://127.0.0.1:8765/`.

GitHub Pages can serve this repo directly as a static site. In the repository
settings, enable Pages with source `Deploy from a branch`, branch `main`, folder
`/ (root)`.
