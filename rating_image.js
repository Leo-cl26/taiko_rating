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
    { key: "stamina", label: "体力" },
    { key: "handspeed", label: "手速" },
    { key: "burst", label: "爆发" },
    { key: "accuracy", label: "精度" },
    { key: "rhythm", label: "节奏" },
    { key: "complex", label: "复合" },
  ];
  const ABILITY_BEST_COUNT = 15;
  let abilityCatalog = [];
  const DAN_ANCHORS = [
    [0.847, 6.900, "初段"], [1.581, 7.456, "二段"], [2.760, 7.950, "三段"],
    [3.858, 8.450, "四段"], [4.687, 8.733, "五段"], [5.610, 9.092, "六段"],
    [7.034, 9.500, "七段"], [7.695, 9.567, "八段"], [8.847, 9.825, "九段"],
    [10.194, 10.244, "十段"], [10.923, 10.422, "玄人"], [11.984, 10.678, "名人"],
    [12.903, 10.878, "超人"], [14.535, 11.322, "达人"],
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

  const IMAGE_W = 1600;
  const IMAGE_H = 1600;
  const CLASSIC_BEST_COUNT = 20;

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

  function weightedAbility(values) {
    const ranked = [...values].filter(Number.isFinite).sort((a, b) => b - a).slice(0, ABILITY_BEST_COUNT);
    let total = 0;
    let weightTotal = 0;
    ranked.forEach((value, index) => {
      const weight = index < 5 ? 1 : index < 10 ? 0.8 : 0.6;
      total += value * weight;
      weightTotal += weight;
    });
    return weightTotal ? total / weightTotal : 0;
  }

  function median(values) {
    const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function referenceAt(rating, key) {
    let nearby = abilityCatalog.filter((row) => Math.abs(Number(row.main) - rating) <= 0.5);
    if (nearby.length < 20) nearby = abilityCatalog.filter((row) => Math.abs(Number(row.main) - rating) <= 1);
    const values = nearby.map((row) => Number(row[key])).filter(Number.isFinite);
    const center = median(values);
    const spread = median(values.map((value) => Math.abs(value - center))) * 1.4826;
    return { center, spread: Math.max(spread, 0.75) };
  }

  function buildTendencies(dimensions, rating, sampleCounts) {
    return Object.fromEntries(DIMENSIONS.map((dim) => {
      const reference = dim.key === "accuracy" ? { center: rating, spread: 0.9 } : referenceAt(rating, dim.key);
      const z = (Number(dimensions[dim.key]) - reference.center) / reference.spread;
      const confidence = Math.min((sampleCounts[dim.key] || 0) / 8, 1);
      const raw = 50 + 25 * Math.tanh(z / 1.5);
      return [dim.key, 50 + (raw - 50) * confidence];
    }));
  }

  function danLevel(rating) {
    if (!Number.isFinite(rating) || rating < DAN_ANCHORS[0][0]) return "初段以下";
    for (let index = 1; index < DAN_ANCHORS.length; index += 1) {
      if (rating < DAN_ANCHORS[index][0]) return `${DAN_ANCHORS[index - 1][2]}～${DAN_ANCHORS[index][2]}`;
    }
    return "达人以上";
  }

  function recommendedConstant(rating) {
    const value = Number(rating);
    if (!Number.isFinite(value)) return 0;
    let left = DAN_ANCHORS[0];
    let right = DAN_ANCHORS[1];
    if (value >= DAN_ANCHORS[DAN_ANCHORS.length - 1][0]) {
      left = DAN_ANCHORS[DAN_ANCHORS.length - 2];
      right = DAN_ANCHORS[DAN_ANCHORS.length - 1];
    } else if (value > DAN_ANCHORS[0][0]) {
      for (let index = 1; index < DAN_ANCHORS.length; index += 1) {
        if (value <= DAN_ANCHORS[index][0]) {
          left = DAN_ANCHORS[index - 1];
          right = DAN_ANCHORS[index];
          break;
        }
      }
    }
    const ratio = (value - left[0]) / (right[0] - left[0]);
    return clamp(left[1] + ratio * (right[1] - left[1]), 1, 11.6);
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

    const calculated = { ...row, classicSingle: single, goodRate: accuracy, x, y };
    const fallback = {
      stamina: Math.sqrt((single * stamina * 15.5) / 100),
      handspeed: Math.sqrt((single * stamina * 15.5) / 100),
      burst: Math.sqrt((single * speed * 15.5) / 100),
      accuracy: Math.sqrt(single * y),
      rhythm: Math.sqrt((single * rhythm * 15.5) / 100),
      complex: Math.sqrt((single * complex * 15.5) / 100),
    };
    calculated.dimensions = calculateAbilityDimensions(calculated, accuracy, notes) || fallback;
    return calculated;
  }

  function calculateAbilityDimensions(row, accuracyPer, notes) {
    const chart = row.ability;
    const accuracy = accuracyY(accuracyPer);
    if (!chart || !Number.isFinite(accuracy)) return null;
    const singleRating = (constant) => {
      const x = Number(constant);
      const p = 150 - Math.sqrt(Math.max(0, 150 ** 2 - (x - accuracy) ** 2 / 2));
      const w = Math.max(Math.sqrt(Math.max(0, 25 - (x - 15.5) ** 2 / 25 - (accuracy - 23) ** 2 / 69)) - 4, 0.5);
      return powerMean(x, accuracy, w, p) || 0;
    };
    const handspeed = singleRating(chart.handspeed);
    const hsFactor = Number(chart.handspeed) > 0 ? Math.min(accuracy / Number(chart.handspeed), 1) : 1;
    const burstCandidate = singleRating(chart.burst) * hsFactor;
    const denominator = Number(chart.burst) - Number(chart.handspeed);
    const blend = Math.abs(denominator) < 1e-9
      ? (accuracy > Number(chart.handspeed) ? 1 : 0)
      : clamp((accuracy - Number(chart.handspeed)) / denominator, 0, 1);
    const burst = burstCandidate > handspeed ? handspeed + blend * (burstCandidate - handspeed) : burstCandidate;
    const badRate = notes > 0 ? Number(row.ng || 0) / notes : 0;
    const complexPenalty = (5000 / 9) * Math.max(0.03 - badRate, 0) ** 2 + 0.5;
    const rating = Number(row.classicSingle || 0);
    const base = Math.min(rating, accuracy);
    const upper = Math.max(rating, accuracy);
    let accuracyRt;
    if (accuracy <= rating) {
      accuracyRt = base + Math.log(upper - base + 1);
    } else {
      // Preserve Sakura v2's published high-side behavior exactly.
      accuracyRt = Math.sqrt(base * upper);
    }
    return {
      stamina: singleRating(chart.stamina),
      handspeed,
      burst,
      accuracy: accuracyRt,
      rhythm: singleRating(chart.rhythm) * hsFactor,
      complex: singleRating(chart.complex) * complexPenalty,
    };
  }

  function calculateClassicMetrics(rows) {
    const classicRows = rows
      .map(calculateClassicSingle)
      .filter(Boolean)
      .sort((a, b) => b.classicSingle - a.classicSingle);
    const b20 = classicRows.slice(0, CLASSIC_BEST_COUNT);
    const rating = averageTop(b20.map((row) => row.classicSingle));
    const dimensions = Object.fromEntries(
      DIMENSIONS.map((dim) => [dim.key, weightedAbility(classicRows.map((row) => row.dimensions[dim.key]))]),
    );
    const sampleCounts = Object.fromEntries(
      DIMENSIONS.map((dim) => [dim.key, Math.min(classicRows.filter((row) => Number.isFinite(row.dimensions[dim.key])).length, ABILITY_BEST_COUNT)]),
    );
    return {
      rows: classicRows,
      b20,
      rating,
      recommendedConstant: recommendedConstant(rating),
      dimensions,
      tendencies: buildTendencies(dimensions, rating, sampleCounts),
      sampleCounts,
      danLevel: danLevel(rating),
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

  function levelColor(level) {
    return {
      1: "#e53935",
      2: "#70ad47",
      3: "#414A2C",
      4: "#DB1685",
      5: "#7232DB",
    }[String(level)] ?? "#8b949e";
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
    fillRounded(ctx, 35, 35, IMAGE_W - 70, IMAGE_H - 70, 30, "#ffffff", "#ded8d1", 3);
  }

  function drawMetricCard(ctx, box, label, value, color, digits = 2) {
    const [left, top, right, bottom] = box;
    fillRounded(ctx, left, top, right - left, bottom - top, 18, "#fffdfb", "#ded8d1", 2);
    fillRounded(ctx, left, top, 8, bottom - top, 4, color);
    drawText(ctx, label, left + 34, top + 54, { size: 25, weight: "700", color });
    const text = Number(value).toFixed(digits);
    drawText(ctx, text, right - 30, bottom - 45, {
      size: 60,
      weight: "700",
      color,
      align: "right",
      baseline: "middle",
    });
  }

  function drawHeader(ctx, classic, matchedCount) {
    drawText(ctx, "TAIKO RATING", 85, 125, { size: 48, weight: "700", color: "#252525" });
    drawText(ctx, new Date().toLocaleString("zh-CN", { hour12: false }), IMAGE_W - 85, 113, {
      size: 20,
      color: "#6b7280",
      align: "right",
    });
    drawMetricCard(ctx, [85, 205, 570, 385], "综合 Rating / B20", classic.rating, "#a23b35");
    drawMetricCard(ctx, [85, 410, 570, 590], "推荐歌曲定数", classic.recommendedConstant, "#246f92");
    drawMetricCard(ctx, [85, 615, 570, 795], "谱面匹配", matchedCount, "#4d4743", 0);
  }

  function drawRadar(ctx, dimensions, tendencies) {
    const left = 595;
    const top = 205;
    const right = 1515;
    const bottom = 795;
    const cx = (left + right) / 2;
    const cy = top + 330;
    const radius = 165;
    fillRounded(ctx, left, top, right - left, bottom - top, 18, "#fffdfb", "#ded8d1", 2);
    drawText(ctx, "能力倾向（中心 = 同 Rating 基准）", left + 28, top + 54, { size: 27, weight: "700", color: "#252525" });
    drawText(ctx, "绝对六维 · 同水平相对倾向", right - 28, top + 52, {
      size: 16,
      color: "#6b7280",
      align: "right",
    });

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
      const value = clamp((Number(tendencies[dim.key] || 50) - 25) / 50, 0, 1);
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
      const lx = cx + Math.cos(angle) * (radius + 60);
      const ly = cy + Math.sin(angle) * (radius + 60);
      drawText(ctx, dim.label, lx, ly - 9, { size: 21, weight: "700", color: "#252525", align: "center", baseline: "middle" });
      drawText(ctx, `${formatNumber(dimensions[dim.key])} · ${Math.round(tendencies[dim.key] || 50)}`, lx, ly + 20, {
        size: 18,
        color: "#6b7280",
        align: "center",
        baseline: "middle",
      });
    });
  }

  function drawSection(ctx, title, rows, y) {
    drawText(ctx, title, 85, y + 36, { size: 33, weight: "700", color: "#a23b35" });
    drawText(ctx, "同一歌曲的不同难度分别计入", 1515, y + 34, { size: 18, color: "#6b7280", align: "right" });

    const cardW = 276;
    const cardH = 122;
    const startX = 85;
    const startY = y + 58;
    const gapX = 17;
    const gapY = 14;
    rows.forEach((row, index) => {
      const col = index % 5;
      const line = Math.floor(index / 5);
      drawSongCard(ctx, row, index, startX + col * (cardW + gapX), startY + line * (cardH + gapY), cardW, cardH);
    });
  }

  function drawSongCard(ctx, row, index, x, y, w, h) {
    const accent = levelColor(row.level);
    fillRounded(ctx, x, y, w, h, 12, "#fffdfb", "#ddd6cf", 2);
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, 7, h);
    ctx.strokeStyle = "#e6dfd8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 88, y + 14);
    ctx.lineTo(x + 88, y + h - 14);
    ctx.stroke();

    const value = row.classicSingle;
    const ratingY = y + h / 2;
    drawText(ctx, String(index + 1).padStart(2, "0"), x + 18, y + 14, {
      size: 18,
      weight: "700",
      color: "#9f9892",
      baseline: "top",
    });
    drawText(ctx, formatNumber(value), x + 18, ratingY, {
      size: 32,
      weight: "700",
      color: "#a23b35",
      baseline: "middle",
    });
    const goodRate = Number(row.goodRate);
    drawText(ctx, `良率 ${Number.isFinite(goodRate) ? `${(goodRate * 100).toFixed(1)}%` : "--"}`, x + 18, ratingY + 36, {
      size: 12,
      color: "#6b7280",
      baseline: "middle",
    });

    drawFitText(ctx, row.title, x + 103, y + 14, 155, { size: 20, weight: "700", color: "#252525", baseline: "top" });
    drawText(ctx, `${levelName(row.level)}  定数 ${row.constant.toFixed(1)}`, x + 103, y + 48, {
      size: 16,
      weight: "700",
      color: accent,
      baseline: "top",
    });
    drawText(ctx, formatScore(row.highScore), x + 103, y + 82, {
      size: 14,
      color: "#6b7280",
      baseline: "top",
    });
    drawText(ctx, scoreRankLabel(row, row.highScore), x + w - 12, ratingY, {
      size: 17,
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
    const classic = calculateClassicMetrics(classicRows);

    drawBackground(ctx);
    drawHeader(ctx, classic, classicRows.length);
    drawRadar(ctx, classic.dimensions, classic.tendencies);
    drawSection(ctx, "综合 Rating B20", classic.b20, 845);
    drawText(ctx, `匹配 ${classicRows.length} · Taiko Rating Web`, IMAGE_W / 2, IMAGE_H - 55, {
      size: 19,
      color: "#6b7280",
      align: "center",
      baseline: "middle",
    });

    return {
      classic,
      rating: classic.rating,
      recommendedConstant: classic.recommendedConstant,
      dimensions: classic.dimensions,
      tendencies: classic.tendencies,
    };
  }

  window.TaikoRatingImage = {
    setAbilityCatalog(rows) {
      abilityCatalog = Array.isArray(rows) ? rows : [];
    },
    calculateClassicSingle,
    calculateClassicMetrics,
    renderRatingImage,
  };
})();
