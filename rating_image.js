(() => {
  const CLASSIC_CONST_X = [
    [1, 0.05],
    [1.5, 0.1],
    [2, 0.15],
    [2.5, 0.2],
    [3, 0.25],
    [3.5, 0.3],
    [4, 0.35],
    [4.5, 0.4],
    [5, 0.45],
    [5.5, 0.5],
    [6, 0.55],
    [6.2, 0.65],
    [6.4, 0.75],
    [6.6, 0.85],
    [6.8, 0.95],
    [6.9, 1],
    [7, 1.14285714285714],
    [7.1, 1.28571428571429],
    [7.2, 1.42857142857143],
    [7.3, 1.57142857142857],
    [7.4, 1.71428571428571],
    [7.5, 1.85714285714286],
    [7.6, 2],
    [7.7, 2.25],
    [7.8, 2.5],
    [7.9, 2.75],
    [8, 3],
    [8.1, 3.25],
    [8.2, 3.5],
    [8.3, 3.75],
    [8.4, 4],
    [8.5, 4.25],
    [8.6, 4.5],
    [8.7, 4.75],
    [8.8, 5],
    [8.9, 5.33333333333333],
    [9, 5.66666666666667],
    [9.1, 6],
    [9.2, 6.33333333333333],
    [9.3, 6.66666666666667],
    [9.4, 7],
    [9.5, 7.5],
    [9.6, 8],
    [9.7, 8.5],
    [9.8, 9],
    [9.9, 9.25],
    [10, 9.5],
    [10.1, 9.75],
    [10.2, 10],
    [10.3, 10.5],
    [10.4, 11],
    [10.5, 11.3333333333333],
    [10.6, 11.6666666666667],
    [10.7, 12],
    [10.8, 12.5],
    [10.9, 13],
    [11, 13.3333333333333],
    [11.1, 13.6666666666667],
    [11.2, 14],
    [11.3, 14.5],
    [11.4, 15],
    [11.5, 15.25],
    [11.6, 15.5],
  ];

  const DIMENSIONS = [
    { key: "power", label: "大歌力" },
    { key: "stamina", label: "体力" },
    { key: "speed", label: "高速力" },
    { key: "accuracy", label: "精度力" },
    { key: "rhythm", label: "节奏处理" },
    { key: "complex", label: "复合处理" },
  ];

  const CLASSIC_AGGREGATE_REFERENCE = {
    overall: { threshold: 14.5892210976943, fullMedian: 15.2775466297957, fullWeighted: 15.3068290137788 },
    power: { threshold: 14.5445421349924, fullMedian: 15.2637671006991, fullWeighted: 15.294238850735 },
    stamina: { threshold: 13.3638754177458, fullMedian: 14.6837426405408, fullWeighted: 14.9189624636074 },
    speed: { threshold: 13.9975917429048, fullMedian: 14.2480036541132, fullWeighted: 14.5890753162058 },
    accuracy: { threshold: 15.0844411582434, fullMedian: 15.4361852255512, fullWeighted: 15.4504973206476 },
    rhythm: { threshold: 14.0211817943885, fullMedian: 14.5239364620827, fullWeighted: 14.834438652416 },
    complex: { threshold: 13.4188645707724, fullMedian: 13.7662826486079, fullWeighted: 14.2622361946173 },
  };

  const IMAGE_W = 1440;
  const IMAGE_H = 1900;
  const CLASSIC_BEST_COUNT = 20;
  const URA_BEST_COUNT = 30;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  function fixedAverage(values, count) {
    const denominator = Number(count);
    if (!Number.isFinite(denominator) || denominator <= 0) return 0;
    return values.filter((value) => Number.isFinite(value)).reduce((sum, value) => sum + value, 0) / denominator;
  }

  function averageTop(values, count = CLASSIC_BEST_COUNT) {
    const top = [...values].filter(Number.isFinite).sort((a, b) => b - a).slice(0, count);
    return fixedAverage(top, top.length);
  }

  function calculateClassicAggregate(values, metric) {
    const ranked = [...values].filter(Number.isFinite).sort((a, b) => b - a).slice(0, CLASSIC_BEST_COUNT);
    if (!ranked.length) return 0;
    if (ranked.length < CLASSIC_BEST_COUNT) {
      const middle = Math.floor(ranked.length / 2);
      return ranked.length % 2 ? ranked[middle] : (ranked[middle - 1] + ranked[middle]) / 2;
    }
    const average = (items) => items.reduce((sum, value) => sum + value, 0) / items.length;
    const weighted =
      0.4 * average(ranked.slice(0, 5)) +
      0.3 * average(ranked.slice(5, 10)) +
      0.2 * average(ranked.slice(10, 16)) +
      0.1 * average(ranked.slice(16, 20));
    const median = (ranked[9] + ranked[10]) / 2;
    const reference = CLASSIC_AGGREGATE_REFERENCE[metric];
    const compensation = Math.max(
      (weighted - reference.threshold) / (reference.fullWeighted - reference.threshold),
      0,
    );
    return median + compensation * (15.5 - reference.fullMedian);
  }

  function isPassedRow(row) {
    return row?.passed === true || Number(row?.clearCount ?? row?.clear_cnt ?? row?.raw?.clear_cnt ?? 0) > 0;
  }

  function interpolateAnchors(anchors, value) {
    const x = Number(value);
    if (!Number.isFinite(x)) return null;
    if (x <= anchors[0][0]) return anchors[0][1];
    for (let i = 1; i < anchors.length; i += 1) {
      const [x1, y1] = anchors[i - 1];
      const [x2, y2] = anchors[i];
      if (x <= x2) {
        const t = (x - x1) / (x2 - x1);
        return y1 + (y2 - y1) * t;
      }
    }
    return anchors[anchors.length - 1][1];
  }

  function accuracyY(value) {
    const accuracy = Number(value);
    if (!Number.isFinite(accuracy) || accuracy <= 0.75) return null;
    const g = Math.min(accuracy, 1);
    if (g <= 0.8278) return 16730 * Math.pow(g - 0.75, 3.805);
    if (g <= 0.9793) return 56.4468 * g - 45.7187;
    const highSegment = (point) => 0.2246 * Math.pow(2.718, 120 * (point - 0.972)) + 9.02;
    const boundary = highSegment(0.9793);
    const maximum = highSegment(1);
    return boundary + ((highSegment(g) - boundary) / (maximum - boundary)) * (15.5 - boundary);
  }

  function powerMean(a, b, weight, power) {
    const w = clamp(Number(weight), 0, 1);
    const p = Number(power);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(p)) return null;
    if (Math.abs(p) < 0.000001) {
      return Math.exp(w * Math.log(Math.max(a, 0.000001)) + (1 - w) * Math.log(Math.max(b, 0.000001)));
    }
    const mixed = w * Math.pow(a, p) + (1 - w) * Math.pow(b, p);
    return mixed > 0 ? Math.pow(mixed, 1 / p) : null;
  }

  function featurePairToBody(avgDensity, peakDensity) {
    const avgD = Number(avgDensity);
    const peakD = Number(peakDensity);
    if (!Number.isFinite(avgD) || !Number.isFinite(peakD)) return { stamina: 0, speed: 0 };
    if (avgD <= 0 || peakD <= 0) return { stamina: Math.max(avgD, 0), speed: Math.max(peakD, 0) };
    const stamina =
      avgD > peakD ? avgD + (avgD / 100) * (1 - peakD / avgD) * (100 - avgD) : avgD - (1 - avgD / peakD) * avgD;
    const speed =
      peakD > avgD ? peakD - (1 - avgD / peakD) * (peakD - avgD) : peakD + (1 - peakD / avgD) * (avgD - peakD);
    return { stamina, speed };
  }

  function rhythmValue(noteType, bpmChange) {
    const note = Number(noteType);
    const bpm = Number(bpmChange);
    if (!Number.isFinite(note)) return 0;
    if (!Number.isFinite(bpm)) return note;
    return note + (note / 100) * (bpm / 100) * (100 - note);
  }

  function calculateClassicSingle(row) {
    const judgmentNotes = Number(row.good) + Number(row.ok) + Number(row.ng);
    const chartNotes = Number(row.chartCombo || 0);
    const fallbackNotes = Number(row.combo || row.raw?.combo_cnt || 0);
    const notes = Math.max(chartNotes, judgmentNotes, 0) || fallbackNotes;
    const isDondaful = Number(row.raw?.dondaful_combo_cnt || row.dondafulComboCount || 0) > 0;
    const accuracy = notes > 0 ? (isDondaful ? 1 : (Number(row.good || 0) + Number(row.ok || 0) * 0.5) / notes) : null;
    const x = interpolateAnchors(CLASSIC_CONST_X, row.constant);
    const y = accuracyY(accuracy);
    const f = row.features || {};
    const complex = Number(f.complex ?? 0);
    const { stamina, speed } = featurePairToBody(f.avg_density, f.peak_density);
    const rhythm = rhythmValue(f.note_type, f.bpm_change);
    if (x == null || y == null) return null;

    const pBase = 150;
    const power = pBase - Math.sqrt(Math.max(0, pBase * pBase - Math.pow(x - y, 2) / 2));
    const weight = Math.max(Math.sqrt(Math.max(0, 25 - Math.pow(x - 15.5, 2) / 25 - Math.pow(y - 23, 2) / 69)) - 4, 0.5);
    const single = powerMean(x, y, weight, power);
    if (single == null) return null;

    return {
      ...row,
      classicSingle: single,
      goodRate: accuracy,
      x,
      y,
      dimensions: {
        power: Math.sqrt(single * x),
        stamina: Math.sqrt((single * stamina * 15.5) / 100),
        speed: Math.sqrt((single * speed * 15.5) / 100),
        accuracy: Math.sqrt(single * y),
        rhythm: Math.sqrt((single * rhythm * 15.5) / 100),
        complex: Math.sqrt((single * complex * 15.5) / 100),
      },
    };
  }

  function calculateClassicMetrics(rows) {
    const classicRows = rows
      .map(calculateClassicSingle)
      .filter(Boolean)
      .sort((a, b) => b.classicSingle - a.classicSingle);
    const b20 = classicRows.slice(0, CLASSIC_BEST_COUNT);
    return {
      rows: classicRows,
      b20,
      rating: averageTop(b20.map((row) => row.classicSingle)),
      dimensions: Object.fromEntries(
        DIMENSIONS.map((dim) => [
          dim.key,
          averageTop(classicRows.map((row) => row.dimensions[dim.key])),
        ]),
      ),
    };
  }

  function calculateUraMetrics(rows) {
    const uraRows = [...rows]
      .filter((row) => isPassedRow(row) && Number.isFinite(row.single))
      .sort((a, b) => b.single - a.single || b.highScore - a.highScore);
    const b30 = uraRows.slice(0, URA_BEST_COUNT);
    return {
      rows: uraRows,
      b30,
      rating: fixedAverage(b30.map((row) => row.single), URA_BEST_COUNT),
    };
  }

  function drawText(ctx, textValue, x, y, options = {}) {
    const { size = 28, weight = "400", color = "#1f2933", align = "left", baseline = "alphabetic" } = options;
    ctx.font = `${weight} ${size}px "Microsoft YaHei", "Yu Gothic", "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(String(textValue), x, y);
  }

  function fitText(ctx, textValue, maxWidth) {
    const text = String(textValue || "");
    if (ctx.measureText(text).width <= maxWidth) return text;
    let out = text;
    while (out.length > 1 && ctx.measureText(`${out}...`).width > maxWidth) {
      out = out.slice(0, -1);
    }
    return `${out}...`;
  }

  function drawFitText(ctx, textValue, x, y, maxWidth, options = {}) {
    const { size = 28, weight = "400" } = options;
    ctx.font = `${weight} ${size}px "Microsoft YaHei", "Yu Gothic", "Segoe UI", Arial, sans-serif`;
    drawText(ctx, fitText(ctx, textValue, maxWidth), x, y, options);
  }

  function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function fillRounded(ctx, x, y, w, h, r, fill, stroke = null, lineWidth = 1) {
    roundedRect(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function formatNumber(value, digits = 2) {
    return Number.isFinite(value) && value !== 0 ? value.toFixed(digits) : "--";
  }

  function formatScore(value) {
    return Number(value || 0).toLocaleString("en-US");
  }

  function levelName(level) {
    return {
      1: "梅",
      2: "竹",
      3: "松",
      4: "鬼",
      5: "里",
    }[String(level)] ?? String(level || "--");
  }

  const SCORE_RANK_LABELS = {
    1: "无评价",
    2: "白粹",
    3: "铜粹",
    4: "银粹",
    5: "金雅",
    6: "粉雅",
    7: "紫雅",
    8: "极",
  };

  const SCORE_RANK_COLORS = {
    "白粹": "#7a8594",
    "铜粹": "#b66a3c",
    "银粹": "#8f9aa6",
    "金雅": "#c88a13",
    "粉雅": "#d65b91",
    "紫雅": "#7c4dff",
    "极": "#e03131",
    "无评价": "#8b949e",
  };

  function scoreRankNumber(rowOrRank) {
    return Number(rowOrRank?.bestScoreRank ?? rowOrRank?.best_score_rank ?? rowOrRank?.raw?.best_score_rank ?? rowOrRank ?? 0);
  }

  function fallbackRankLabel(score) {
    const s = Number(score || 0);
    if (s >= 1_000_000) return "极";
    if (s >= 950_000) return "紫雅";
    if (s >= 900_000) return "粉雅";
    if (s >= 800_000) return "金雅";
    if (s >= 700_000) return "银粹";
    return "无评价";
  }

  function scoreRankLabel(rowOrRank, score) {
    return SCORE_RANK_LABELS[scoreRankNumber(rowOrRank)] || fallbackRankLabel(score);
  }

  function rankPaint(ctx, row, x, w) {
    if (scoreRankLabel(row, row?.highScore) !== "极") return SCORE_RANK_COLORS[scoreRankLabel(row, row?.highScore)] || SCORE_RANK_COLORS["无评价"];
    const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
    gradient.addColorStop(0, "#e03131");
    gradient.addColorStop(0.18, "#f08c00");
    gradient.addColorStop(0.36, "#f2c94c");
    gradient.addColorStop(0.54, "#2f9e44");
    gradient.addColorStop(0.72, "#1971c2");
    gradient.addColorStop(1, "#9c36b5");
    return gradient;
  }

  function drawBackground(ctx) {
    ctx.fillStyle = "#f7f5f2";
    ctx.fillRect(0, 0, IMAGE_W, IMAGE_H);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(42, 42, IMAGE_W - 84, IMAGE_H - 84);
    ctx.strokeStyle = "#ded8d1";
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 42, IMAGE_W - 84, IMAGE_H - 84);
  }

  function drawHeader(ctx, classic, ura, matchedCount) {
    drawText(ctx, "Taiko Rating", 96, 116, { size: 42, weight: "700", color: "#202225" });

    fillRounded(ctx, 96, 210, 470, 142, 8, "#fff7f4", "#e6d7d1");
    drawText(ctx, "表 Rating", 126, 260, { size: 27, weight: "700", color: "#a23b35" });
    drawText(ctx, formatNumber(classic.rating), 520, 292, { size: 58, weight: "700", color: "#a23b35", align: "right", baseline: "middle" });

    fillRounded(ctx, 96, 382, 470, 142, 8, "#f2f8fb", "#d0dde4");
    drawText(ctx, "里 Rating", 126, 432, { size: 27, weight: "700", color: "#246f92" });
    drawText(ctx, formatNumber(ura.rating), 520, 464, { size: 58, weight: "700", color: "#246f92", align: "right", baseline: "middle" });

    fillRounded(ctx, 96, 554, 470, 92, 8, "#ffffff", "#ded8d1");
    drawText(ctx, "匹配谱面", 126, 608, { size: 23, weight: "700", color: "#4d4743" });
    drawText(ctx, `${matchedCount}`, 522, 608, { size: 36, weight: "700", color: "#4d4743", align: "right", baseline: "middle" });
  }

  function drawRadar(ctx, dimensions) {
    const cx = 1010;
    const cy = 408;
    const radius = 180;
    const values = DIMENSIONS.map((dim) => dimensions[dim.key] || 0);
    const positive = values.filter((value) => value > 0);
    const minAxis = Math.max(0, (positive.length ? Math.min(...positive) : 0) - 1);
    const maxAxis = Math.max(minAxis + 1, Math.max(...values, 1) + 0.6);

    drawText(ctx, "六维 Rating", 760, 116, { size: 32, weight: "700", color: "#202225" });

    ctx.strokeStyle = "#ded8d1";
    ctx.lineWidth = 1.2;
    for (let ring = 1; ring <= 5; ring += 1) {
      const r = (radius * ring) / 5;
      ctx.beginPath();
      for (let i = 0; i < DIMENSIONS.length; i += 1) {
        const angle = -Math.PI / 2 + (Math.PI * 2 * i) / DIMENSIONS.length;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    for (let i = 0; i < DIMENSIONS.length; i += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / DIMENSIONS.length;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      ctx.stroke();
    }

    ctx.beginPath();
    DIMENSIONS.forEach((dim, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / DIMENSIONS.length;
      const value = clamp(((dimensions[dim.key] || 0) - minAxis) / (maxAxis - minAxis), 0, 1);
      const x = cx + Math.cos(angle) * value * radius;
      const y = cy + Math.sin(angle) * value * radius;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(162, 59, 53, 0.12)";
    ctx.fill();
    ctx.strokeStyle = "#a23b35";
    ctx.lineWidth = 3;
    ctx.stroke();

    DIMENSIONS.forEach((dim, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / DIMENSIONS.length;
      const lx = cx + Math.cos(angle) * (radius + 116);
      const ly = cy + Math.sin(angle) * (radius + 82);
      drawText(ctx, dim.label, lx, ly - 12, { size: 22, weight: "700", color: "#4d4743", align: "center" });
      drawText(ctx, formatNumber(dimensions[dim.key]), lx, ly + 22, {
        size: 25,
        color: "#7b7470",
        align: "center",
        baseline: "middle",
      });
    });
  }

  function drawSection(ctx, title, rows, y, mode) {
    fillRounded(ctx, 78, y, IMAGE_W - 156, 520, 8, "#ffffff", "#ded8d1");
    drawText(ctx, title, 116, y + 54, { size: 30, weight: "700", color: "#2b2826" });

    const cardW = 236;
    const cardH = 54;
    const startX = 102;
    const startY = y + 98;
    const gapX = 16;
    const gapY = 10;
    rows.forEach((row, index) => {
      const col = index % 5;
      const line = Math.floor(index / 5);
      drawSongCard(ctx, row, index, startX + col * (cardW + gapX), startY + line * (cardH + gapY), cardW, cardH, mode);
    });
  }

  function drawSongCard(ctx, row, index, x, y, w, h, mode) {
    const accent = mode === "classic" ? "#a23b35" : "#246f92";
    fillRounded(ctx, x, y, w, h, 6, "#fbfaf8", "#ddd6cf");
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, 5, h);

    const value = mode === "classic" ? row.classicSingle : row.single;
    drawText(ctx, String(index + 1).padStart(2, "0"), x + 16, y + 18, { size: 13, weight: "700", color: "#b0a9a4" });
    drawText(ctx, formatNumber(value), x + 16, y + 41, {
      size: 22,
      weight: "700",
      color: accent,
      baseline: "middle",
    });
    ctx.strokeStyle = "#e4ddd7";
    ctx.beginPath();
    ctx.moveTo(x + 80, y + 10);
    ctx.lineTo(x + 80, y + h - 10);
    ctx.stroke();

    drawFitText(ctx, row.title, x + 94, y + 24, 98, { size: 16, weight: "700", color: "#2b2826" });
    drawText(ctx, `${levelName(row.level)} ★${row.constant.toFixed(1)}`, x + 94, y + 44, {
      size: 13,
      color: "#7b7470",
    });
    drawText(ctx, scoreRankLabel(row, row.highScore), x + w - 12, y + 28, {
      size: 14,
      weight: "700",
      color: rankPaint(ctx, row, x + w - 82, 64),
      align: "right",
      baseline: "middle",
    });
  }

  function renderRatingImage(canvas, payload) {
    const ctx = canvas.getContext("2d");
    canvas.width = IMAGE_W;
    canvas.height = IMAGE_H;

    const allRows = payload.allRows || [];
    const classicRows = payload.classicRows || allRows;
    const uraRows = payload.uraRows || allRows;
    const classic = calculateClassicMetrics(classicRows);
    const ura = calculateUraMetrics(uraRows);

    drawBackground(ctx);
    drawHeader(ctx, classic, ura, classicRows.length);
    drawRadar(ctx, classic.dimensions);
    drawSection(ctx, "表 Rating B20", classic.b20, 730, "classic");
    drawSection(ctx, "里 Rating B30", ura.b30, 1280, "new");

    return {
      classic,
      ura,
      rating: classic.rating,
      uraRating: ura.rating,
      dimensions: classic.dimensions,
    };
  }

  window.TaikoRatingImage = {
    calculateClassicSingle,
    calculateClassicMetrics,
    calculateUraMetrics,
    renderRatingImage,
  };
})();
