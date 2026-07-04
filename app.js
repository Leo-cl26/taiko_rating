const API_BASE = "https://kinoko.zorua.cn/api/v1";
const DATA_VERSION = "20260704-rating-svg";
const RATING_BEST_COUNT = 20;
const CHART_RENDER_LIMIT = 800;

const FIELD_DEFS = [
  { key: "title", label: "曲名", type: "text" },
  { key: "course", label: "难度", type: "text" },
  { key: "level", label: "星级", type: "number" },
  { key: "const", label: "定数", type: "number" },
  { key: "combo", label: "combo", type: "number" },
  { key: "complex", label: "复合处理", type: "number" },
  { key: "avg_density", label: "平均密度", type: "number" },
  { key: "peak_density", label: "瞬间密度", type: "number" },
  { key: "note_type", label: "叩き分け", type: "number" },
  { key: "bpm_change", label: "BPM变化", type: "number" },
  { key: "hs_change", label: "HS变化", type: "number" },
  { key: "rhythm", label: "节奏处理", type: "number" },
  { key: "roll_time", label: "连打时长", type: "text" },
  { key: "balloon_num", label: "气球数", type: "number" },
  { key: "source", label: "来源", type: "text" },
];

const FILTER_OPS = [
  { value: "contains", label: "包含" },
  { value: "=", label: "=" },
  { value: "!=", label: "!=" },
  { value: ">=", label: ">=" },
  { value: "<=", label: "<=" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: "empty", label: "为空" },
  { value: "not_empty", label: "非空" },
];

const state = {
  records: [],
  chartData: [],
  constantsByTitle: new Map(),
  rated: [],
  ratingBest: [],
  ratingObjects: [],
  selectedRatingIndex: null,
  chartBrowserRows: [],
  selectedChartIndex: null,
  chartFilters: [],
};

const els = {
  useEncoderInput: document.getElementById("useEncoderInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  playerIdInput: document.getElementById("playerIdInput"),
  endpointSelect: document.getElementById("endpointSelect"),
  fetchButton: document.getElementById("fetchButton"),
  fetchStatus: document.getElementById("fetchStatus"),
  constantsStatus: document.getElementById("constantsStatus"),
  recalculateButton: document.getElementById("recalculateButton"),
  exportButton: document.getElementById("exportButton"),
  classicRatingValue: document.getElementById("classicRatingValue"),
  ratingValue: document.getElementById("ratingValue"),
  recordCount: document.getElementById("recordCount"),
  matchedCount: document.getElementById("matchedCount"),
  ratingSvgWrap: document.getElementById("ratingSvgWrap"),
  ratingDetail: document.getElementById("ratingDetail"),
  canvas: document.getElementById("ratingCanvas"),
  imageStatus: document.getElementById("imageStatus"),
  pageTabs: document.querySelectorAll("[data-page-target]"),
  pages: document.querySelectorAll(".page-panel"),
  chartSearchInput: document.getElementById("chartSearchInput"),
  chartCourseSelect: document.getElementById("chartCourseSelect"),
  chartSortField: document.getElementById("chartSortField"),
  chartSortDir: document.getElementById("chartSortDir"),
  addFilterButton: document.getElementById("addFilterButton"),
  clearFiltersButton: document.getElementById("clearFiltersButton"),
  filterRows: document.getElementById("filterRows"),
  chartBrowserStatus: document.getElementById("chartBrowserStatus"),
  chartResultCount: document.getElementById("chartResultCount"),
  chartTableBody: document.getElementById("chartTableBody"),
  chartDetail: document.getElementById("chartDetail"),
};

function chartKey(songNo, level) {
  return `${songNo}:${level}`;
}

function titleKey(title, level) {
  return `${normalizeTitle(title)}:${level}`;
}

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("♡", "")
    .replaceAll("～", "~")
    .replaceAll("・", "")
    .replaceAll("ノ", "の")
    .replace(/\(裏\)|（裏）|\bura\b|\bedit\b/g, "")
    .replace(/[^0-9a-z\u3040-\u30ff\u3400-\u9fff]+/g, "");
}

function levelName(level) {
  return {
    1: "梅",
    2: "竹",
    3: "松",
    4: "鬼",
    5: "里",
  }[String(level)] ?? String(level);
}

function sourceLabel(source, needsEncoder = false) {
  if (source === "excel") return "xlsx";
  if (needsEncoder) return "encoder待生成";
  return source || "encoder";
}

function sourceClass(source) {
  return source === "excel" ? "excel" : "encoder";
}

function scoreBonus(score) {
  const scoreValue = Number(score);
  if (!Number.isFinite(scoreValue) || scoreValue < 700_000) return null;
  const rate = Math.max(0, Math.min(scoreValue / 1_000_000, 1));
  const anchors = [
    [0.7, -2.0],
    [0.75, -1.0],
    [0.8, 0.0],
    [0.9, 0.5],
    [0.95, 1.0],
    [1.0, 1.5],
  ];

  if (rate <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i += 1) {
    const [x1, y1] = anchors[i - 1];
    const [x2, y2] = anchors[i];
    if (rate <= x2) {
      const t = (rate - x1) / (x2 - x1);
      return y1 + (y2 - y1) * t;
    }
  }
  return anchors[anchors.length - 1][1];
}

function getUseEncoder() {
  return Boolean(els.useEncoderInput.checked);
}

function chartAllowedBySource(chart) {
  return getUseEncoder() || chart.source === "excel";
}

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function chartUsableForRating(chart) {
  const scoreLevel = Number(chart.score_level);
  return chartAllowedBySource(chart) && Number.isFinite(scoreLevel) && hasNumericValue(chart.const);
}

function formatScore(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : "--";
}

function formatLoose(value, digits = 2) {
  if (value == null || value === "") return "--";
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(digits) : String(value);
}

function formatBonus(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}`;
}

function formatSingle(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "--";
}

function rankLabel(score) {
  const s = Number(score || 0);
  if (s >= 1_000_000) return "极";
  if (s >= 950_000) return "紫雅";
  if (s >= 900_000) return "粉雅";
  if (s >= 800_000) return "金雅";
  if (s >= 750_000) return "银粹";
  if (s >= 700_000) return "过关";
  return "未通";
}

function truncateText(value, maxLength) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, Math.max(1, maxLength - 1))}…` : text;
}

function percent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${(number * 100).toFixed(2)}%` : "--";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function indexChartData(charts) {
  state.constantsByTitle.clear();
  for (const chart of charts) {
    if (!chartUsableForRating(chart)) continue;
    const scoreLevel = Number(chart.score_level);
    const indexed = {
      title: chart.title,
      aliases: chart.aliases || [],
      const: Number(chart.const),
      combo: chart.combo,
      features: chart.features || {},
      source: chart.source,
      needs_encoder: Boolean(chart.needs_encoder),
      raw: chart,
    };
    const names = [chart.title, ...(chart.aliases || [])].filter(Boolean);
    for (const name of names) {
      state.constantsByTitle.set(titleKey(name, scoreLevel), indexed);
    }
  }
}

function updateChartStatus() {
  const included = state.chartData.filter(chartAllowedBySource);
  const excelCount = included.filter((chart) => chart.source === "excel").length;
  const encoderCount = included.length - excelCount;
  const usableCount = included.filter((chart) => hasNumericValue(chart.const)).length;
  els.constantsStatus.textContent = `当前启用 ${included.length} 张谱面：xlsx ${excelCount}，encoder ${encoderCount}，可用于 Rating ${usableCount}`;
}

async function loadChartData() {
  try {
    const resp = await fetch(`data/chart_data.json?v=${DATA_VERSION}`, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const charts = await resp.json();
    state.chartData = Array.isArray(charts) ? charts : [];
    indexChartData(state.chartData);
    updateChartStatus();
    renderChartBrowser();
    calculateRating();
  } catch (err) {
    els.constantsStatus.textContent = `谱面库未载入：${err instanceof Error ? err.message : "未知错误"}`;
    els.chartBrowserStatus.textContent = "谱面库未载入";
  }
}

function findChart(record) {
  const titleCandidates = [
    record.title,
    record.titleJp,
    record.titleCn,
    ...(record.aliases || []),
  ].filter(Boolean);
  for (const title of titleCandidates) {
    const chart = state.constantsByTitle.get(titleKey(title, record.level));
    if (chart) return chart;
  }
  return null;
}

function normalizeHirobaScore(item) {
  const detail = item.song_detail ?? {};
  return {
    songNo: Number(item.song_no),
    level: Number(item.level),
    title: detail.song_name || detail.song_name_jp || `song ${item.song_no}`,
    titleJp: detail.song_name_jp || "",
    titleCn: detail.song_name || "",
    aliases: [detail.song_name, detail.song_name_jp, detail.subtitle].filter(Boolean),
    genre: detail.type || "",
    highScore: Number(item.high_score ?? 0),
    good: Number(item.good_cnt ?? 0),
    ok: Number(item.ok_cnt ?? 0),
    ng: Number(item.ng_cnt ?? 0),
    combo: Number(item.combo_cnt ?? 0),
    date: item.highscore_datetime || item.update_datetime || "",
    raw: item,
  };
}

function normalizeKinokoScore(group) {
  const scores = Array.isArray(group.scoreInfo) ? group.scoreInfo : [];
  return scores.map((item) => ({
    songNo: Number(group.song_no ?? item.song_no),
    level: Number(group.level ?? item.level),
    title: group.title_cn || group.title || `song ${group.song_no ?? item.song_no}`,
    titleJp: group.title || "",
    titleCn: group.title_cn || "",
    aliases: [group.title_cn, group.title, group.subTitle, group.subTitle_cn].filter(Boolean),
    genre: group.genre || "",
    highScore: Number(item.high_score ?? 0),
    good: Number(item.good_cnt ?? 0),
    ok: Number(item.ok_cnt ?? 0),
    ng: Number(item.ng_cnt ?? 0),
    combo: Number(item.combo_cnt ?? 0),
    date: item.highscore_datetime || item.update_datetime || "",
    raw: item,
  }));
}

function normalizeApiResponse(payload, endpoint) {
  const scoreInfo = payload?.data?.playedRecords?.scoreInfo;
  if (!Array.isArray(scoreInfo)) return [];
  if (endpoint === "kinoko") {
    return scoreInfo.flatMap(normalizeKinokoScore);
  }
  return scoreInfo.map(normalizeHirobaScore);
}

function pickBestRecords(records) {
  const best = new Map();
  for (const record of records) {
    const key = chartKey(record.songNo, record.level);
    const current = best.get(key);
    if (!current || record.highScore > current.highScore) {
      best.set(key, record);
    }
  }
  return [...best.values()];
}

function calculateRating() {
  const bestRecords = pickBestRecords(state.records);
  const rated = bestRecords
    .map((record) => {
      const chart = findChart(record);
      if (!chart) return null;
      const bonus = scoreBonus(record.highScore);
      const single = bonus == null ? null : chart.const + bonus;
      return {
        ...record,
        chart,
        constant: chart.const,
        constantTitle: chart.title,
        chartSource: chart.source,
        needsEncoder: chart.needs_encoder,
        chartCombo: chart.combo,
        features: chart.features || {},
        bonus,
        single,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.single ?? -Infinity) - (a.single ?? -Infinity) || b.highScore - a.highScore);

  state.rated = rated;
  state.ratingBest = rated.filter((row) => Number.isFinite(row.single)).slice(0, RATING_BEST_COUNT);
  const classicBest = window.TaikoRatingImage?.calculateClassicMetrics?.(rated)?.b20 || [];
  state.ratingObjects = [
    ...state.ratingBest.map((row) => ({ mode: "里", row, displaySingle: row.single })),
    ...classicBest.map((row) => ({ mode: "表", row, displaySingle: row.classicSingle })),
  ];
  if (!state.ratingObjects.length) state.selectedRatingIndex = null;
  else if (state.selectedRatingIndex == null || state.selectedRatingIndex >= state.ratingObjects.length) state.selectedRatingIndex = 0;

  els.recordCount.textContent = String(bestRecords.length);
  els.matchedCount.textContent = String(rated.length);
  renderRatingTable();
  renderRatingDetail(state.selectedRatingIndex == null ? null : state.ratingObjects[state.selectedRatingIndex]);
  renderCanvas(rated);
}

function renderRatingTable() {
  const rows = state.ratingObjects;
  if (!rows.length) {
    els.ratingSvgWrap.className = "rating-svg-wrap muted-box";
    els.ratingSvgWrap.textContent = "没有可计算成绩";
    return;
  }

  const width = 1400;
  const height = 1210;
  const margin = 34;
  const gap = 28;
  const columnWidth = (width - margin * 2 - gap) / 2;
  const rowHeight = 46;
  const rowGap = 7;
  const headerHeight = 106;
  const sections = [
    { mode: "里", title: "里 Rating B20", subtitle: "新公式：定数 + 分数补正", x: margin, color: "#246f92" },
    { mode: "表", title: "表 Rating B20", subtitle: "旧公式：定数得点 x 良率表现", x: margin + columnWidth + gap, color: "#a23b35" },
  ];

  const sectionSvg = sections
    .map(
      (section) => {
        const entries = rows
          .map((item, index) => ({ item, index }))
          .filter((entry) => entry.item.mode === section.mode)
          .slice(0, RATING_BEST_COUNT);
        const y = 30;
        const rowSvg = entries
          .map((entry, rankIndex) => {
            const item = entry.item;
            const row = item.row;
            const rowY = y + headerHeight + rankIndex * (rowHeight + rowGap);
            const selected = state.selectedRatingIndex === entry.index;
            const fill = selected ? "#eef7fb" : "#ffffff";
            const stroke = selected ? section.color : "#d9dee5";
            const title = escapeHtml(truncateText(row.title, 23));
            const source = escapeHtml(sourceLabel(row.chartSource, row.needsEncoder));
            const subtitle = escapeHtml(`${levelName(row.level)} · ${source} · ${formatScore(row.highScore)} · ${rankLabel(row.highScore)}`);
            const single = escapeHtml(formatSingle(item.displaySingle));
            const constant = escapeHtml(Number(row.constant).toFixed(1));
            const bonus = escapeHtml(formatBonus(row.bonus));
            return `
              <g class="rating-svg-row" data-rating-index="${entry.index}" tabindex="0" role="button">
                <rect x="${section.x}" y="${rowY}" width="${columnWidth}" height="${rowHeight}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="${selected ? 2 : 1}" />
                <rect x="${section.x}" y="${rowY}" width="5" height="${rowHeight}" rx="2" fill="${section.color}" />
                <text x="${section.x + 18}" y="${rowY + 29}" font-size="17" font-weight="700" fill="#8b949e">${String(rankIndex + 1).padStart(2, "0")}</text>
                <text x="${section.x + 58}" y="${rowY + 22}" font-size="17" font-weight="700" fill="#20252b">${title}</text>
                <text x="${section.x + 58}" y="${rowY + 40}" font-size="12" fill="#66717d">${subtitle}</text>
                <text x="${section.x + columnWidth - 212}" y="${rowY + 29}" font-size="16" font-weight="700" fill="#20252b" text-anchor="end">${constant}</text>
                <text x="${section.x + columnWidth - 134}" y="${rowY + 29}" font-size="15" fill="#66717d" text-anchor="end">${bonus}</text>
                <text x="${section.x + columnWidth - 20}" y="${rowY + 30}" font-size="22" font-weight="800" fill="${section.color}" text-anchor="end">${single}</text>
              </g>
            `;
          })
          .join("");
        return `
          <g>
            <rect x="${section.x}" y="${y}" width="${columnWidth}" height="${height - 60}" rx="10" fill="#fbfcfd" stroke="#d9dee5" />
            <text x="${section.x + 22}" y="${y + 40}" font-size="28" font-weight="800" fill="${section.color}">${section.title}</text>
            <text x="${section.x + 22}" y="${y + 70}" font-size="16" fill="#66717d">${section.subtitle}</text>
            <text x="${section.x + columnWidth - 20}" y="${y + 40}" font-size="18" font-weight="700" fill="#66717d" text-anchor="end">B20</text>
            <text x="${section.x + columnWidth - 214}" y="${y + 95}" font-size="12" fill="#8b949e" text-anchor="end">定数</text>
            <text x="${section.x + columnWidth - 134}" y="${y + 95}" font-size="12" fill="#8b949e" text-anchor="end">补正</text>
            <text x="${section.x + columnWidth - 20}" y="${y + 95}" font-size="12" fill="#8b949e" text-anchor="end">单曲R</text>
            ${rowSvg}
          </g>
        `;
      },
    )
    .join("");

  els.ratingSvgWrap.className = "rating-svg-wrap";
  els.ratingSvgWrap.innerHTML = `
    <svg id="ratingObjectSvg" class="rating-object-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Rating B20">
      <rect width="${width}" height="${height}" fill="#f7fafc" />
      <text x="${margin}" y="24" font-size="14" fill="#66717d">点击任意歌曲查看详细数值</text>
      ${sectionSvg}
    </svg>
  `;
}

function renderRatingDetail(item) {
  if (!item) {
    els.ratingDetail.className = "detail-panel muted-box";
    els.ratingDetail.textContent = "点击 Rating 图中的歌曲查看详细数值";
    return;
  }

  const row = item.row;
  const classic = window.TaikoRatingImage?.calculateClassicSingle?.(row);
  const noteTotal = Number(row.good) + Number(row.ok) + Number(row.ng);
  const goodRate = noteTotal > 0 ? row.good / noteTotal : null;
  const dims = classic?.dimensions || {};
  const f = row.features || {};
  const items = [
    ["Rating对象", `${item.mode} Rating B20`],
    ["曲名", row.title],
    ["匹配谱面", row.constantTitle],
    ["难度", levelName(row.level)],
    ["来源", sourceLabel(row.chartSource, row.needsEncoder)],
    ["定数", row.constant.toFixed(1)],
    ["分数", formatScore(row.highScore)],
    ["良 / 可 / 不可", `${row.good} / ${row.ok} / ${row.ng}`],
    ["良率", percent(goodRate)],
    ["分数补正", formatBonus(row.bonus)],
    ["当前单曲R", formatSingle(item.displaySingle)],
    ["单曲里R", Number.isFinite(row.single) ? row.single.toFixed(2) : "--"],
    ["单曲表R", classic ? classic.classicSingle.toFixed(2) : "--"],
    ["定数得点 x", classic ? classic.x.toFixed(2) : "--"],
    ["良率表现 y", classic ? classic.y.toFixed(2) : "--"],
    ["大歌力", formatNumber(dims.power)],
    ["体力", formatNumber(dims.stamina)],
    ["高速力", formatNumber(dims.speed)],
    ["精度力", formatNumber(dims.accuracy)],
    ["节奏处理", formatNumber(dims.rhythm)],
    ["复合处理", formatNumber(dims.complex)],
    ["平均密度", formatLoose(f.avg_density)],
    ["瞬间密度", formatLoose(f.peak_density)],
    ["BPM变化", formatLoose(f.bpm_change)],
    ["HS变化", formatLoose(f.hs_change)],
    ["combo", formatLoose(row.chartCombo, 0)],
  ];

  els.ratingDetail.className = "detail-panel";
  els.ratingDetail.innerHTML = `<div class="detail-grid">${items
    .map(([label, value]) => `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("")}</div>`;
}

function renderCanvas(allRows) {
  if (!window.TaikoRatingImage) return;
  const metrics = window.TaikoRatingImage.renderRatingImage(els.canvas, { allRows });
  els.classicRatingValue.textContent = metrics.classic.rating ? metrics.classic.rating.toFixed(2) : "--";
  els.ratingValue.textContent = metrics.ura.rating ? metrics.ura.rating.toFixed(2) : "--";
  els.imageStatus.textContent = allRows.length ? "已生成" : "未生成";
}

async function fetchScores() {
  const token = els.apiKeyInput.value.trim();
  const playerId = els.playerIdInput.value.trim();
  const endpoint = els.endpointSelect.value;
  if (!token) {
    els.fetchStatus.textContent = "缺少 API Key";
    return;
  }

  const params = new URLSearchParams();
  if (playerId) params.set("player_id", playerId);
  const url = `${API_BASE}/scores/${endpoint}${params.toString() ? `?${params.toString()}` : ""}`;

  els.fetchButton.disabled = true;
  els.fetchStatus.textContent = "获取中";
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(payload.detail || `HTTP ${resp.status}`);
    }
    state.records = normalizeApiResponse(payload, endpoint);
    state.selectedRatingIndex = null;
    els.fetchStatus.textContent = `已获取 ${state.records.length} 条记录`;
    calculateRating();
  } catch (err) {
    els.fetchStatus.textContent = err instanceof Error ? err.message : "获取失败";
  } finally {
    els.fetchButton.disabled = false;
  }
}

function getChartValue(chart, field) {
  const f = chart.features || {};
  const values = {
    title: chart.title,
    course: chart.course,
    level: chart.level,
    const: chart.const,
    combo: chart.combo,
    complex: f.complex,
    avg_density: f.avg_density,
    peak_density: f.peak_density,
    note_type: f.note_type,
    bpm_change: f.bpm_change,
    hs_change: f.hs_change,
    rhythm: f.rhythm,
    roll_time: chart.roll_time,
    balloon_num: chart.balloon_num,
    source: sourceLabel(chart.source, chart.needs_encoder),
  };
  return values[field];
}

function getChartSearchText(chart) {
  return [chart.id, chart.title, chart.title_normalized, chart.course, chart.course_label, ...(chart.aliases || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesFilter(chart, filter) {
  if (!filter || !filter.field || !filter.op) return true;
  const raw = getChartValue(chart, filter.field);
  const op = filter.op;
  if (op === "empty") return raw == null || raw === "";
  if (op === "not_empty") return raw != null && raw !== "";
  if (filter.value == null || filter.value === "") return true;

  const def = FIELD_DEFS.find((item) => item.key === filter.field);
  if (def?.type === "number" && op !== "contains") {
    const left = Number(raw);
    const right = Number(filter.value);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (op === "=") return left === right;
    if (op === "!=") return left !== right;
    if (op === ">=") return left >= right;
    if (op === "<=") return left <= right;
    if (op === ">") return left > right;
    if (op === "<") return left < right;
    return true;
  }

  const left = String(raw ?? "").toLowerCase();
  const right = String(filter.value).toLowerCase();
  if (op === "contains") return left.includes(right);
  if (op === "=") return left === right;
  if (op === "!=") return left !== right;
  return true;
}

function sortCharts(rows) {
  const field = els.chartSortField.value || "const";
  const dir = els.chartSortDir.value === "asc" ? 1 : -1;
  const def = FIELD_DEFS.find((item) => item.key === field);
  return [...rows].sort((a, b) => {
    const av = getChartValue(a, field);
    const bv = getChartValue(b, field);
    if (def?.type === "number") {
      const an = Number(av);
      const bn = Number(bv);
      const aValid = Number.isFinite(an);
      const bValid = Number.isFinite(bn);
      if (aValid && bValid) return (an - bn) * dir;
      if (aValid) return -1;
      if (bValid) return 1;
      return String(a.title).localeCompare(String(b.title), "zh-CN");
    }
    return String(av ?? "").localeCompare(String(bv ?? ""), "zh-CN") * dir;
  });
}

function renderChartBrowser() {
  const search = els.chartSearchInput.value.trim().toLowerCase();
  const course = els.chartCourseSelect.value;
  const rows = sortCharts(
    state.chartData
      .filter(chartAllowedBySource)
      .filter((chart) => !course || chart.course === course)
      .filter((chart) => !search || getChartSearchText(chart).includes(search))
      .filter((chart) => state.chartFilters.every((filter) => matchesFilter(chart, filter))),
  );

  state.chartBrowserRows = rows;
  const visibleRows = rows.slice(0, CHART_RENDER_LIMIT);
  els.chartBrowserStatus.textContent = getUseEncoder()
    ? "当前数据范围：xlsx + encoder"
    : "当前数据范围：仅 xlsx";
  els.chartResultCount.textContent = `命中 ${rows.length} 张，显示 ${visibleRows.length} 张`;

  if (!visibleRows.length) {
    els.chartTableBody.innerHTML = '<tr><td colspan="12" class="empty-cell">没有符合条件的谱面</td></tr>';
    return;
  }

  els.chartTableBody.innerHTML = visibleRows
    .map((chart, index) => {
      const f = chart.features || {};
      return `
        <tr class="clickable-row ${state.selectedChartIndex === index ? "is-selected" : ""}" data-chart-index="${index}">
          <td>${escapeHtml(chart.title)}</td>
          <td>${escapeHtml(chart.course_label || chart.course)}</td>
          <td class="numeric">${formatLoose(chart.level, 0)}</td>
          <td class="numeric">${formatLoose(chart.const, 1)}</td>
          <td class="numeric">${formatLoose(chart.combo, 0)}</td>
          <td class="numeric">${formatLoose(f.complex)}</td>
          <td class="numeric">${formatLoose(f.avg_density)}</td>
          <td class="numeric">${formatLoose(f.peak_density)}</td>
          <td class="numeric">${formatLoose(f.note_type)}</td>
          <td class="numeric">${formatLoose(f.bpm_change)}</td>
          <td class="numeric">${formatLoose(f.hs_change)}</td>
          <td><span class="source-badge ${sourceClass(chart.source)}">${sourceLabel(chart.source, chart.needs_encoder)}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderChartDetail(chart) {
  if (!chart) {
    els.chartDetail.className = "detail-panel muted-box";
    els.chartDetail.textContent = "点击谱面列表中的行查看 JSON 数据";
    return;
  }
  const f = chart.features || {};
  const items = [
    ["曲名", chart.title],
    ["难度", chart.course_label || chart.course],
    ["星级", formatLoose(chart.level, 0)],
    ["定数", formatLoose(chart.const, 1)],
    ["combo", formatLoose(chart.combo, 0)],
    ["来源", sourceLabel(chart.source, chart.needs_encoder)],
    ["复合处理", formatLoose(f.complex)],
    ["平均密度", formatLoose(f.avg_density)],
    ["瞬间密度", formatLoose(f.peak_density)],
    ["叩き分け", formatLoose(f.note_type)],
    ["BPM变化", formatLoose(f.bpm_change)],
    ["HS变化", formatLoose(f.hs_change)],
    ["节奏处理", formatLoose(f.rhythm)],
    ["连打时长", formatLoose(chart.roll_time)],
    ["气球数", formatLoose(chart.balloon_num, 0)],
    ["路径", chart.ese?.path || "--"],
  ];
  els.chartDetail.className = "detail-panel";
  els.chartDetail.innerHTML = `
    <div class="detail-grid">${items
      .map(([label, value]) => `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
      .join("")}</div>
    <pre class="json-block">${escapeHtml(JSON.stringify(chart, null, 2))}</pre>
  `;
}

function renderFilterRows() {
  if (!state.chartFilters.length) {
    els.filterRows.innerHTML = '<div class="muted-box">暂无筛选条件。点击“新增筛选”添加一条 AND 条件。</div>';
    return;
  }

  const fieldOptions = FIELD_DEFS.map((field) => `<option value="${field.key}">${field.label}</option>`).join("");
  const opOptions = FILTER_OPS.map((op) => `<option value="${op.value}">${op.label}</option>`).join("");
  els.filterRows.innerHTML = state.chartFilters
    .map(
      (filter) => `
        <div class="filter-row" data-filter-id="${filter.id}">
          <label>
            字段
            <select data-filter-field>${fieldOptions}</select>
          </label>
          <label>
            条件
            <select data-filter-op>${opOptions}</select>
          </label>
          <label>
            值
            <input data-filter-value type="text" value="${escapeHtml(filter.value)}" placeholder="例如 10.5" />
          </label>
          <button type="button" data-remove-filter>删除</button>
        </div>
      `,
    )
    .join("");

  for (const row of els.filterRows.querySelectorAll(".filter-row")) {
    const filter = state.chartFilters.find((item) => item.id === row.dataset.filterId);
    row.querySelector("[data-filter-field]").value = filter.field;
    row.querySelector("[data-filter-op]").value = filter.op;
  }
}

function addFilter() {
  state.chartFilters.push({
    id: `filter-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    field: "const",
    op: ">=",
    value: "",
  });
  renderFilterRows();
}

function updateFilterFromRow(row) {
  const filter = state.chartFilters.find((item) => item.id === row.dataset.filterId);
  if (!filter) return;
  filter.field = row.querySelector("[data-filter-field]").value;
  filter.op = row.querySelector("[data-filter-op]").value;
  filter.value = row.querySelector("[data-filter-value]").value;
}

function populateControls() {
  const options = FIELD_DEFS.map((field) => `<option value="${field.key}">${field.label}</option>`).join("");
  els.chartSortField.innerHTML = options;
  els.chartSortField.value = "const";
  renderFilterRows();
}

function switchPage(pageId) {
  for (const tab of els.pageTabs) {
    tab.classList.toggle("is-active", tab.dataset.pageTarget === pageId);
  }
  for (const page of els.pages) {
    page.classList.toggle("is-active", page.id === pageId);
  }
  if (location.hash !== `#${pageId}`) {
    history.replaceState(null, "", `#${pageId}`);
  }
}

function exportSvgAsPng(svg) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const viewBox = svg.viewBox.baseVal;
  const width = viewBox?.width || Number(svg.getAttribute("width")) || 1400;
  const height = viewBox?.height || Number(svg.getAttribute("height")) || 1210;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  const source = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, width, height);
    URL.revokeObjectURL(url);
    const link = document.createElement("a");
    link.download = `taiko-rating-b20-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    els.imageStatus.textContent = "SVG 导出失败";
  };
  image.src = url;
}

function exportPng() {
  calculateRating();
  const svg = document.getElementById("ratingObjectSvg");
  if (svg) {
    exportSvgAsPng(svg);
    return;
  }
  const link = document.createElement("a");
  link.download = `taiko-rating-${Date.now()}.png`;
  link.href = els.canvas.toDataURL("image/png");
  link.click();
}

els.fetchButton.addEventListener("click", fetchScores);
els.recalculateButton.addEventListener("click", calculateRating);
els.exportButton.addEventListener("click", exportPng);

els.useEncoderInput.addEventListener("change", () => {
  indexChartData(state.chartData);
  updateChartStatus();
  state.selectedRatingIndex = null;
  calculateRating();
  renderChartBrowser();
  renderChartDetail(null);
});

els.ratingSvgWrap.addEventListener("click", (event) => {
  const row = event.target.closest("[data-rating-index]");
  if (!row) return;
  state.selectedRatingIndex = Number(row.dataset.ratingIndex);
  renderRatingTable();
  renderRatingDetail(state.ratingObjects[state.selectedRatingIndex]);
});

els.ratingSvgWrap.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("[data-rating-index]");
  if (!row) return;
  event.preventDefault();
  state.selectedRatingIndex = Number(row.dataset.ratingIndex);
  renderRatingTable();
  renderRatingDetail(state.ratingObjects[state.selectedRatingIndex]);
});

els.chartTableBody.addEventListener("click", (event) => {
  const row = event.target.closest("[data-chart-index]");
  if (!row) return;
  state.selectedChartIndex = Number(row.dataset.chartIndex);
  renderChartBrowser();
  renderChartDetail(state.chartBrowserRows[state.selectedChartIndex]);
});

for (const tab of els.pageTabs) {
  tab.addEventListener("click", () => switchPage(tab.dataset.pageTarget));
}

window.addEventListener("hashchange", () => {
  const target = location.hash.slice(1);
  if (target && document.getElementById(target)?.classList.contains("page-panel")) {
    switchPage(target);
  }
});

for (const control of [els.chartSearchInput, els.chartCourseSelect, els.chartSortField, els.chartSortDir]) {
  control.addEventListener("input", renderChartBrowser);
  control.addEventListener("change", renderChartBrowser);
}

els.addFilterButton.addEventListener("click", () => {
  addFilter();
  renderChartBrowser();
});

els.clearFiltersButton.addEventListener("click", () => {
  state.chartFilters = [];
  renderFilterRows();
  renderChartBrowser();
});

els.filterRows.addEventListener("input", (event) => {
  const row = event.target.closest(".filter-row");
  if (!row) return;
  updateFilterFromRow(row);
  renderChartBrowser();
});

els.filterRows.addEventListener("change", (event) => {
  const row = event.target.closest(".filter-row");
  if (!row) return;
  updateFilterFromRow(row);
  renderChartBrowser();
});

els.filterRows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-filter]");
  if (!button) return;
  const row = button.closest(".filter-row");
  state.chartFilters = state.chartFilters.filter((filter) => filter.id !== row.dataset.filterId);
  renderFilterRows();
  renderChartBrowser();
});

populateControls();
if (location.hash.slice(1) === "dataPage") {
  switchPage("dataPage");
}
renderCanvas([]);
loadChartData();
