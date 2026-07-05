from pathlib import Path


W, H = 1400, 900

COLORS = {
    "bg": "#fbfaf7",
    "ink": "#25211e",
    "muted": "#6d645c",
    "grid": "#ded7cc",
    "grid_strong": "#c7b9a8",
    "axis": "#302b27",
    "line": "#c84632",
    "line_soft": "#2d719d",
    "panel": "#fff8ea",
    "panel_stroke": "#d6bd8e",
    "shade": "#f0f6f8",
}


ANCHORS = [
    (700_000, -2.0, "银粹 / 70w"),
    (750_000, -1.0, ""),
    (800_000, 0.0, "金雅 / 80w"),
    (900_000, 1.0, "粉雅 / 90w"),
    (950_000, 1.5, "紫雅 / 95w"),
    (1_000_000, 2.0, "极 / 100w"),
]


def bonus(score):
    score = max(0, min(score, 1_000_000))
    if score < 700_000:
        return -2.0 - ((700_000 - score) / 50_000) * 2.0
    if score <= 800_000:
        return -2.0 + (score - 700_000) / 50_000
    return (score - 800_000) / 100_000


def single_rating(score, const=10.5):
    value = bonus(score)
    return None if value is None else const + value


class Plot:
    def __init__(self, x, y, w, h, xmin, xmax, ymin, ymax):
        self.x = x
        self.y = y
        self.w = w
        self.h = h
        self.xmin = xmin
        self.xmax = xmax
        self.ymin = ymin
        self.ymax = ymax

    def px(self, value):
        return self.x + (value - self.xmin) / (self.xmax - self.xmin) * self.w

    def py(self, value):
        return self.y + self.h - (value - self.ymin) / (self.ymax - self.ymin) * self.h


def text(x, y, body, cls="small", anchor="start", extra=""):
    return f'<text x="{x}" y="{y}" class="{cls}" text-anchor="{anchor}" {extra}>{body}</text>'


def line(x1, y1, x2, y2, color, width=1, extra=""):
    return (
        f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" '
        f'stroke="{color}" stroke-width="{width}" {extra}/>'
    )


def circle(x, y, r, color):
    return f'<circle cx="{x:.2f}" cy="{y:.2f}" r="{r}" fill="{color}"/>'


def polyline(points, color, width):
    pts = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
    return (
        f'<polyline points="{pts}" fill="none" stroke="{color}" '
        f'stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>'
    )


def sample(plot, fn, step):
    xs = []
    count = int((plot.xmax - plot.xmin) / step) + 1
    for i in range(count + 1):
        xs.append(plot.xmin + i * step)
    for x, _, _ in ANCHORS:
        if plot.xmin <= x <= plot.xmax:
            xs.append(x)
    xs = sorted({round(x, 3) for x in xs if plot.xmin <= x <= plot.xmax})
    return [(plot.px(x), plot.py(y)) for x in xs if (y := fn(x)) is not None]


def make_svg():
    main = Plot(92, 128, 850, 470, 500_000, 1_000_000, -10.5, 2.25)
    overview = Plot(92, 720, 1210, 100, 0, 1_000_000, -30.5, 2.25)
    out = []

    out.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
    )
    out.append(f'<rect width="100%" height="100%" fill="{COLORS["bg"]}"/>')
    out.append(
        "<style>"
        "text{font-family:'Microsoft YaHei','Segoe UI',Arial,sans-serif;fill:#25211e}"
        ".title{font-size:34px;font-weight:700}"
        ".sub{font-size:18px;fill:#6d645c}"
        ".label{font-size:18px;font-weight:650}"
        ".small{font-size:15px;fill:#6d645c}"
        ".tick{font-size:14px;fill:#6d645c}"
        ".rank{font-size:16px;font-weight:700;fill:#c84632}"
        ".mono{font-family:Consolas,'Microsoft YaHei',monospace;font-size:16px;fill:#3a332e}"
        "</style>"
    )

    out.append(text(92, 50, "Taiko Rating &#20998;&#25968;&#34917;&#27491;&#26354;&#32447;", "title"))
    out.append(
        text(
            92,
            82,
            "&#21333;&#26354; TR = &#35889;&#38754;&#23450;&#25968; + G(&#23448;&#26041;&#20998;&#25968;)",
            "sub",
        )
    )
    out.append(
        text(
            92,
            108,
            "&#36830;&#32493;&#20998;&#27573;&#30452;&#32447;&#65306;70&#19975;&#20026;-2&#65292;70&#19975;&#20197;&#19979;&#27599;5&#19975;&#20998;&#20877;&#25187;2&#65307;80&#19975;&#37329;&#38597;&#36215;&#27599;10&#19975;&#20998;+1&#12290;",
            "small",
        )
    )

    for y in [-10, -8, -6, -4, -2, -1, 0, 1, 2]:
        yy = main.py(y)
        out.append(line(main.x, yy, main.x + main.w, yy, COLORS["grid"]))
        label = f"{y:+g}"
        out.append(text(main.x - 14, yy + 5, label, "tick", "end"))

    for x in [500_000, 600_000, 650_000, 700_000, 750_000, 800_000, 900_000, 950_000, 1_000_000]:
        xx = main.px(x)
        out.append(line(xx, main.y, xx, main.y + main.h, COLORS["grid_strong"]))
        label = f"{x // 10_000}w" if x < 1_000_000 else "100w"
        out.append(text(xx, main.y + main.h + 28, label, "tick", "middle"))

    out.append(line(main.x, main.y + main.h, main.x + main.w, main.y + main.h, COLORS["axis"], 2))
    out.append(line(main.x, main.y, main.x, main.y + main.h, COLORS["axis"], 2))
    out.append(
        f'<rect x="{main.px(700000):.2f}" y="{main.y:.2f}" width="{main.px(1000000)-main.px(700000):.2f}" '
        f'height="{main.h:.2f}" fill="{COLORS["shade"]}" opacity="0.8"/>'
    )
    out.append(polyline(sample(main, bonus, 500), COLORS["line"], 4))

    out.append(text(main.x + main.w / 2, main.y + main.h + 64, "&#23448;&#26041;&#20998;&#25968; Score", "label", "middle"))
    out.append(
        text(
            34,
            main.y + main.h / 2,
            "G(&#20998;&#25968;) = &#21333;&#26354;TR - &#23450;&#25968;",
            "label",
            "middle",
            f'transform="rotate(-90 34 {main.y + main.h / 2})"',
        )
    )

    for score, value, label in ANCHORS:
        out.append(circle(main.px(score), main.py(value), 5, COLORS["line"]))
        if label:
            out.append(text(main.px(score), main.py(value) - 16, label, "rank", "middle"))

    # Example panel.
    px, py, pw, ph = 990, 155, 325, 310
    out.append(
        f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="8" fill="{COLORS["panel"]}" stroke="{COLORS["panel_stroke"]}"/>'
    )
    out.append(text(px + 18, py + 32, "&#20363;&#65306;&#23450;&#25968; 10.5", "label"))
    examples = [500_000, 600_000, 650_000, 700_000, 750_000, 800_000, 900_000, 950_000, 1_000_000]
    for i, score in enumerate(examples):
        rating = single_rating(score)
        result = "skip" if rating is None else f"{rating:.2f}"
        out.append(
            text(
                px + 18,
                py + 64 + i * 24,
                f"{score // 10000:>3}w  ->  {result}",
                "mono",
            )
        )

    # Overview.
    out.append(text(92, 684, "0 - 100&#19975; &#24635;&#35272;&#65306;&#20302;&#20998;&#27573;&#32487;&#32493;&#32447;&#24615;&#25187;&#20998;&#65292;&#37329;&#38597;&#20197;&#19978;&#27599;10w +1", "label"))
    for y in [-30, -20, -10, -2, 0, 2]:
        yy = overview.py(y)
        out.append(line(overview.x, yy, overview.x + overview.w, yy, COLORS["grid"]))
        out.append(text(overview.x - 14, yy + 5, f"{y:+g}", "tick", "end"))
    for x in [0, 500_000, 700_000, 750_000, 800_000, 900_000, 950_000, 1_000_000]:
        xx = overview.px(x)
        out.append(line(xx, overview.y, xx, overview.y + overview.h, COLORS["grid"]))
        label = "0" if x == 0 else f"{x // 10_000}w"
        out.append(text(xx, overview.y + overview.h + 24, label, "tick", "middle"))
    out.append(line(overview.x, overview.y + overview.h, overview.x + overview.w, overview.y + overview.h, COLORS["axis"], 2))
    out.append(line(overview.x, overview.y, overview.x, overview.y + overview.h, COLORS["axis"], 2))
    out.append(polyline(sample(overview, bonus, 2000), COLORS["line_soft"], 3))
    out.append(
        f'<rect x="{overview.px(700000):.2f}" y="{overview.y:.2f}" width="{overview.px(1000000)-overview.px(700000):.2f}" '
        f'height="{overview.h:.2f}" fill="none" stroke="{COLORS["line"]}" stroke-width="2" stroke-dasharray="7 5"/>'
    )

    out.append(text(92, 858, "说明：里 Rating 仅计入 clear_cnt > 0 的成绩；B30 固定除以 30，未满按 0 补位。", "small"))
    out.append(text(92, 882, "分数补正：低于70万不再清零；50w=-10，60w=-6，65w=-4，70w=-2，80w=+0，90w=+1，100w=+2。", "small"))
    out.append("</svg>")
    return "\n".join(out) + "\n"


def main():
    Path("taiko_rating_curve.svg").write_text(make_svg(), encoding="utf-8")


if __name__ == "__main__":
    main()
