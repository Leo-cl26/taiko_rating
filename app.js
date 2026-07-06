const API_BASE = "https://kinoko.zorua.cn/api/v1";
const DATA_VERSION = "20260706-feedback-worker";
const FEEDBACK_API_BASE = window.TAIKO_FEEDBACK_API_BASE || "";
const RATING_BEST_COUNT = 30;
const CHART_PAGE_SIZE = 10;
const RECOMMEND_COUNT = 20;

const RADAR_DIMS = [
  { key: "power", label: "大歌力" },
  { key: "stamina", label: "体力" },
  { key: "speed", label: "高速力" },
  { key: "accuracy", label: "精度力" },
  { key: "rhythm", label: "节奏处理" },
  { key: "complex", label: "复合处理" },
];

const FIELD_DEFS = [
  { key: "title", label: "曲名", type: "text" },
  { key: "course", label: "难度", type: "text" },
  { key: "level", label: "星级", type: "number" },
  { key: "const", label: "定数", type: "number" },
  { key: "bpm", label: "BPM", type: "number" },
  { key: "combo", label: "combo", type: "number" },
  { key: "complex", label: "复合处理", type: "number" },
  { key: "avg_density", label: "平均密度", type: "number" },
  { key: "peak_density", label: "瞬间密度", type: "number" },
  { key: "note_type", label: "咚咔复杂度", type: "number" },
  { key: "bpm_change", label: "BPM变化", type: "number" },
  { key: "hs_change", label: "HS变化", type: "number" },
  { key: "rhythm", label: "节奏处理", type: "number" },
  { key: "roll_time", label: "连打时长", type: "text" },
  { key: "balloon_num", label: "气球数", type: "number" },
  { key: "source", label: "来源", type: "text" },
];

const FEEDBACK_FIELDS = [
  { key: "const", label: "定数", path: "const" },
  { key: "complex", label: "复合处理", path: "features.complex" },
  { key: "avg_density", label: "平均密度", path: "features.avg_density" },
  { key: "peak_density", label: "瞬间密度", path: "features.peak_density" },
  { key: "note_type", label: "咚咔复杂度", path: "features.note_type" },
  { key: "bpm_change", label: "BPM变化", path: "features.bpm_change" },
  { key: "hs_change", label: "HS变化", path: "features.hs_change" },
  { key: "rhythm", label: "节奏处理", path: "features.rhythm" },
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
  uraRated: [],
  ratingBest: [],
  ratingObjects: [],
  ratingSummary: { classic: { rating: 0, dimensions: {} }, ura: { rating: 0 }, matchedCount: 0 },
  selectedRatingIndex: null,
  chartBrowserRows: [],
  recommendationRows: [],
  recommendationSeed: 0,
  selectedChartIndex: null,
  chartPage: 1,
  chartFilters: [],
  localPreviews: new Map(),
  localPreviewSummary: null,
  localPreviewError: "",
  exportImageUrl: "",
  chartPreviewPlayer: null,
  feedbackSummaries: new Map(),
};

const els = {
  useEncoderInput: document.getElementById("useEncoderInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  playerIdInput: document.getElementById("playerIdInput"),
  endpointSelect: document.getElementById("endpointSelect"),
  fetchButton: document.getElementById("fetchButton"),
  fetchStatus: document.getElementById("fetchStatus"),
  constantsStatus: document.getElementById("constantsStatus"),
  curveButton: document.getElementById("curveButton"),
  classicRuleButton: document.getElementById("classicRuleButton"),
  recalculateButton: document.getElementById("recalculateButton"),
  exportButton: document.getElementById("exportButton"),
  classicRatingValue: document.getElementById("classicRatingValue"),
  ratingValue: document.getElementById("ratingValue"),
  recordCount: document.getElementById("recordCount"),
  matchedCount: document.getElementById("matchedCount"),
  ratingSvgWrap: document.getElementById("ratingSvgWrap"),
  ratingDetail: document.getElementById("ratingDetail"),
  recommendRefreshButton: document.getElementById("recommendRefreshButton"),
  recommendTargetSelect: document.getElementById("recommendTargetSelect"),
  recommendEncoderInput: document.getElementById("recommendEncoderInput"),
  recommendLowDifficultyInput: document.getElementById("recommendLowDifficultyInput"),
  recommendSummary: document.getElementById("recommendSummary"),
  recommendWeakness: document.getElementById("recommendWeakness"),
  recommendCount: document.getElementById("recommendCount"),
  recommendTableBody: document.getElementById("recommendTableBody"),
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
  chartPagination: document.getElementById("chartPagination"),
  chartModal: document.getElementById("chartModal"),
  chartModalTitle: document.getElementById("chartModalTitle"),
  chartModalBody: document.getElementById("chartModalBody"),
  chartModalClose: document.getElementById("chartModalClose"),
  curveModal: document.getElementById("curveModal"),
  curveModalClose: document.getElementById("curveModalClose"),
  classicRuleModal: document.getElementById("classicRuleModal"),
  classicRuleModalClose: document.getElementById("classicRuleModalClose"),
  exportModal: document.getElementById("exportModal"),
  exportModalClose: document.getElementById("exportModalClose"),
  exportDownloadLink: document.getElementById("exportDownloadLink"),
  exportOpenButton: document.getElementById("exportOpenButton"),
  exportImage: document.getElementById("exportImage"),
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
  if (source === "excel") return "社区数据";
  if (source === "fumen") return "网站数据";
  if (needsEncoder || source === "encoder" || source === "encoder_pending") return "神经网络";
  return source || "神经网络";
}

function sourceClass(source) {
  if (source === "excel") return "excel";
  if (source === "fumen") return "fumen";
  return "encoder";
}

function sourcePriority(source) {
  return {
    excel: 3,
    fumen: 2,
    encoder: 1,
  }[source] ?? 0;
}

function isEstimatedSource(chart) {
  return chart.source === "encoder" || chart.source === "encoder_pending" || chart.needs_encoder;
}

function scoreBonus(score) {
  const scoreValue = Number(score);
  if (!Number.isFinite(scoreValue)) return null;
  const clamped = Math.max(0, Math.min(scoreValue, 1_000_000));
  if (clamped < 700_000) return -2 - ((700_000 - clamped) / 50_000) * 2;
  if (clamped <= 800_000) return -2 + (clamped - 700_000) / 50_000;
  return (clamped - 800_000) / 100_000;
}

function getUseEncoder() {
  return Boolean(els.useEncoderInput.checked);
}

function chartAllowedBySource(chart) {
  return getUseEncoder() || !isEstimatedSource(chart);
}

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function fixedAverage(values, count) {
  const denominator = Number(count);
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  return values.filter((value) => Number.isFinite(value)).reduce((sum, value) => sum + value, 0) / denominator;
}

function chartUsableForRating(chart) {
  const scoreLevel = Number(chart.score_level);
  return chartAllowedBySource(chart) && !chart.rating_excluded && Number.isFinite(scoreLevel) && scoreLevel >= 3 && hasNumericValue(chart.const);
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

function formatRatingValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0 ? number.toFixed(2) : "--";
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

function normalizeScoreRank(item) {
  return Number(item?.bestScoreRank ?? item?.best_score_rank ?? item?.score_rank ?? item?.rank ?? item?.raw?.best_score_rank ?? 0);
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

function scoreRankLabel(rank, score) {
  return SCORE_RANK_LABELS[normalizeScoreRank({ bestScoreRank: rank })] || fallbackRankLabel(score);
}

function scoreRankColor(rank, score) {
  return SCORE_RANK_COLORS[scoreRankLabel(rank, score)] || SCORE_RANK_COLORS["无评价"];
}

function scoreRankSvgFill(rank, score) {
  return scoreRankLabel(rank, score) === "极" ? "url(#rankRainbow)" : scoreRankColor(rank, score);
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

function getFeedbackClientId() {
  const key = "taiko_rating_feedback_client_id";
  let value = localStorage.getItem(key);
  if (!value) {
    const random = new Uint8Array(16);
    crypto.getRandomValues(random);
    value = [...random].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(key, value);
  }
  return value;
}

function getPathValue(object, path) {
  return String(path)
    .split(".")
    .reduce((current, key) => (current && current[key] != null ? current[key] : null), object);
}

function feedbackSummaryKey(chart) {
  return chart?.id || "";
}

function feedbackVoteLabel(vote) {
  if (vote === "too_high") return "偏高";
  if (vote === "too_low") return "偏低";
  return "";
}

function renderFeedbackSection(chart) {
  if (!isEstimatedSource(chart)) {
    return "";
  }
  const configured = Boolean(FEEDBACK_API_BASE);
  return `
    <section class="modal-section feedback-section" data-feedback-chart-id="${escapeHtml(chart.id)}">
      <div class="feedback-head">
        <h3>神经网络数据反馈</h3>
        <span data-feedback-status>${configured ? "读取反馈中" : "反馈服务尚未配置"}</span>
      </div>
      <div class="feedback-grid">
        ${FEEDBACK_FIELDS.map((field) => {
          const value = getPathValue(chart, field.path);
          return `
            <div class="feedback-row" data-feedback-field="${field.key}">
              <div>
                <strong>${escapeHtml(field.label)}</strong>
                <span>当前值 ${escapeHtml(formatLoose(value))}</span>
              </div>
              <div class="feedback-buttons">
                <button type="button" data-feedback-vote="too_high" ${configured ? "" : "disabled"}>偏高</button>
                <button type="button" data-feedback-vote="too_low" ${configured ? "" : "disabled"}>偏低</button>
              </div>
              <span class="feedback-counts" data-feedback-counts>暂无反馈</span>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function applyFeedbackSummary(chart, payload) {
  const section = els.chartModalBody.querySelector(`[data-feedback-chart-id="${CSS.escape(chart.id)}"]`);
  if (!section) return;
  const summary = payload?.summary || {};
  const mine = payload?.mine || {};
  for (const row of section.querySelectorAll("[data-feedback-field]")) {
    const field = row.dataset.feedbackField;
    const counts = summary[field] || {};
    const high = Number(counts.too_high || 0);
    const low = Number(counts.too_low || 0);
    const countsEl = row.querySelector("[data-feedback-counts]");
    if (countsEl) countsEl.textContent = high || low ? `偏高 ${high} / 偏低 ${low}` : "暂无反馈";
    for (const button of row.querySelectorAll("[data-feedback-vote]")) {
      const voted = mine[field] === button.dataset.feedbackVote;
      button.classList.toggle("is-selected", voted);
      button.textContent = voted ? `已投${feedbackVoteLabel(button.dataset.feedbackVote)}` : feedbackVoteLabel(button.dataset.feedbackVote);
    }
  }
  const status = section.querySelector("[data-feedback-status]");
  if (status) status.textContent = "反馈已同步";
}

async function loadFeedbackSummary(chart) {
  if (!FEEDBACK_API_BASE || !isEstimatedSource(chart)) return;
  const section = els.chartModalBody.querySelector(`[data-feedback-chart-id="${CSS.escape(chart.id)}"]`);
  try {
    const url = new URL(`${FEEDBACK_API_BASE.replace(/\/$/, "")}/summary`);
    url.searchParams.set("chart_id", chart.id);
    url.searchParams.set("client_id", getFeedbackClientId());
    const resp = await fetch(url);
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload.error || `HTTP ${resp.status}`);
    state.feedbackSummaries.set(feedbackSummaryKey(chart), payload);
    applyFeedbackSummary(chart, payload);
  } catch (err) {
    const status = section?.querySelector("[data-feedback-status]");
    if (status) status.textContent = err instanceof Error ? `反馈读取失败：${err.message}` : "反馈读取失败";
  }
}

async function submitFeedbackVote(chart, field, vote) {
  if (!FEEDBACK_API_BASE || !chart || !field || !vote) return;
  const section = els.chartModalBody.querySelector(`[data-feedback-chart-id="${CSS.escape(chart.id)}"]`);
  const status = section?.querySelector("[data-feedback-status]");
  if (status) status.textContent = "提交中";
  const fieldDef = FEEDBACK_FIELDS.find((item) => item.key === field);
  try {
    const resp = await fetch(`${FEEDBACK_API_BASE.replace(/\/$/, "")}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chart_id: chart.id,
        title: chartTitle(chart),
        course: chart.course_label || chart.course,
        source: sourceLabel(chart.source, chart.needs_encoder),
        field,
        vote,
        current_value: fieldDef ? Number(getPathValue(chart, fieldDef.path)) : null,
        client_id: getFeedbackClientId(),
      }),
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload.error || `HTTP ${resp.status}`);
    state.feedbackSummaries.set(feedbackSummaryKey(chart), payload);
    applyFeedbackSummary(chart, payload);
  } catch (err) {
    if (status) status.textContent = err instanceof Error ? `提交失败：${err.message}` : "提交失败";
  }
}

function cleanDisplayTitle(value) {
  return String(value || "").replace(/\s+·\s+\d{2}\s+[^·]+$/u, "").trim();
}

function chartTitle(chart) {
  return cleanDisplayTitle(chart?.display_title || chart?.title || "");
}

function getLocalPreview(chart) {
  return state.localPreviews.get(chart?.id) || null;
}

function findChartById(id) {
  return state.chartData.find((chart) => chart.id === id) || null;
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
      const key = titleKey(name, scoreLevel);
      if (!state.constantsByTitle.has(key)) {
        state.constantsByTitle.set(key, []);
      }
      state.constantsByTitle.get(key).push(indexed);
    }
  }
  for (const chartsForTitle of state.constantsByTitle.values()) {
    chartsForTitle.sort((a, b) => {
      const sourceDiff = sourcePriority(b.source) - sourcePriority(a.source);
      if (sourceDiff) return sourceDiff;
      return String(a.raw?.display_title || a.title).localeCompare(String(b.raw?.display_title || b.title), "zh-CN");
    });
  }
}

function updateChartStatus() {
  const included = state.chartData.filter(chartAllowedBySource);
  const excelCount = included.filter((chart) => chart.source === "excel").length;
  const fumenCount = included.filter((chart) => chart.source === "fumen").length;
  const encoderCount = included.length - excelCount - fumenCount;
  const usableCount = included.filter((chart) => hasNumericValue(chart.const)).length;
  els.constantsStatus.textContent = `当前启用 ${included.length} 张谱面：社区数据 ${excelCount}，网站数据 ${fumenCount}，神经网络 ${encoderCount}，可用于 Rating ${usableCount}`;
}

async function loadLocalPreviews() {
  try {
    const resp = await fetch(`data/local_chart_previews.json?v=${DATA_VERSION}`, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const payload = await resp.json();
    const previews = payload?.previews && typeof payload.previews === "object" ? payload.previews : {};
    state.localPreviews = new Map(Object.entries(previews));
    state.localPreviewSummary = payload?.summary || null;
    state.localPreviewError = "";
  } catch (err) {
    state.localPreviews = new Map();
    state.localPreviewSummary = null;
    state.localPreviewError = err instanceof Error ? err.message : "未知错误";
  }
}

async function loadChartData() {
  try {
    const resp = await fetch(`data/chart_data.json?v=${DATA_VERSION}`, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const charts = await resp.json();
    state.chartData = Array.isArray(charts) ? charts : [];
    await loadLocalPreviews();
    indexChartData(state.chartData);
    updateChartStatus();
    renderChartBrowser();
    calculateRating();
  } catch (err) {
    els.constantsStatus.textContent = `谱面库未载入：${err instanceof Error ? err.message : "未知错误"}`;
    els.chartBrowserStatus.textContent = "谱面库未载入";
    renderRecommendations();
  }
}

function pickChartCandidate(candidates, record) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const chart of candidates) {
    const chartCombo = Number(chart.combo);
    const recordCombo = Number(record.combo);
    let score = sourcePriority(chart.source) * 10000;
    if (Number.isFinite(chartCombo) && Number.isFinite(recordCombo) && recordCombo > 0) {
      if (chartCombo >= recordCombo) {
        if (recordCombo >= chartCombo * 0.85) {
          score += 1000 - Math.min(999, chartCombo - recordCombo);
        }
      } else {
        score -= 3000 + Math.min(999, recordCombo - chartCombo);
      }
    }
    score -= Number(chart.raw?.duplicate_index || 1) * 0.01;
    if (score > bestScore) {
      best = chart;
      bestScore = score;
    }
  }
  return best;
}

function findChart(record) {
  const titleCandidates = [
    record.title,
    record.titleJp,
    record.titleCn,
    ...(record.aliases || []),
  ].filter(Boolean);
  for (const title of titleCandidates) {
    const chart = pickChartCandidate(state.constantsByTitle.get(titleKey(title, record.level)), record);
    if (chart) return chart;
  }
  return null;
}

function normalizeHirobaScore(item) {
  const detail = item.song_detail ?? {};
  const clearCount = Number(item.clear_cnt ?? 0);
  return {
    songNo: Number(item.song_no),
    level: Number(item.level),
    title: detail.song_name || detail.song_name_jp || `song ${item.song_no}`,
    titleJp: detail.song_name_jp || "",
    titleCn: detail.song_name || "",
    aliases: [detail.song_name, detail.song_name_jp, detail.subtitle].filter(Boolean),
    genre: detail.type || "",
    highScore: Number(item.high_score ?? 0),
    bestScoreRank: normalizeScoreRank(item),
    good: Number(item.good_cnt ?? 0),
    ok: Number(item.ok_cnt ?? 0),
    ng: Number(item.ng_cnt ?? 0),
    combo: Number(item.combo_cnt ?? 0),
    clearCount,
    fullComboCount: Number(item.full_combo_cnt ?? 0),
    dondafulComboCount: Number(item.dondaful_combo_cnt ?? 0),
    passed: clearCount > 0,
    date: item.highscore_datetime || item.update_datetime || "",
    raw: item,
  };
}

function normalizeKinokoScore(group) {
  const scores = Array.isArray(group.scoreInfo) ? group.scoreInfo : [];
  return scores.map((item) => {
    const clearCount = Number(item.clear_cnt ?? 0);
    return {
      songNo: Number(group.song_no ?? item.song_no),
      level: Number(group.level ?? item.level),
      title: group.title_cn || group.title || `song ${group.song_no ?? item.song_no}`,
      titleJp: group.title || "",
      titleCn: group.title_cn || "",
      aliases: [group.title_cn, group.title, group.subTitle, group.subTitle_cn].filter(Boolean),
      genre: group.genre || "",
      highScore: Number(item.high_score ?? 0),
      bestScoreRank: normalizeScoreRank(item),
      good: Number(item.good_cnt ?? 0),
      ok: Number(item.ok_cnt ?? 0),
      ng: Number(item.ng_cnt ?? 0),
      combo: Number(item.combo_cnt ?? 0),
      clearCount,
      fullComboCount: Number(item.full_combo_cnt ?? 0),
      dondafulComboCount: Number(item.dondaful_combo_cnt ?? 0),
      passed: clearCount > 0,
      date: item.highscore_datetime || item.update_datetime || "",
      raw: item,
    };
  });
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

function isPassedRecord(record) {
  return Number(record?.clearCount ?? record?.clear_cnt ?? record?.raw?.clear_cnt ?? 0) > 0;
}

function rateRecords(records) {
  return records
    .map((record) => {
      const chart = findChart(record);
      if (!chart) return null;
      const bonus = scoreBonus(record.highScore);
      const single = bonus == null ? null : chart.const + bonus;
      const clearCount = Number(record.clearCount ?? record.raw?.clear_cnt ?? 0);
      const bestScoreRank = normalizeScoreRank(record);
      return {
        ...record,
        chart,
        constant: chart.const,
        constantTitle: cleanDisplayTitle(chart.raw?.display_title || chart.title),
        chartSource: chart.source,
        needsEncoder: chart.needs_encoder,
        chartCombo: chart.combo,
        features: chart.features || {},
        clearCount,
        bestScoreRank,
        passed: isPassedRecord(record),
        bonus,
        single,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.single ?? -Infinity) - (a.single ?? -Infinity) || b.highScore - a.highScore);
}

function calculateRating() {
  const bestRecords = pickBestRecords(state.records);
  const bestPassedRecords = pickBestRecords(state.records.filter(isPassedRecord));
  const rated = rateRecords(bestRecords);
  const uraRated = rateRecords(bestPassedRecords).filter((row) => row.passed && Number.isFinite(row.single));

  state.rated = rated;
  state.uraRated = uraRated;
  state.ratingBest = uraRated.slice(0, RATING_BEST_COUNT);
  const classicMetrics = window.TaikoRatingImage?.calculateClassicMetrics?.(rated) || { b20: [], rating: 0, dimensions: {} };
  const uraRating = fixedAverage(state.ratingBest.map((row) => row.single), RATING_BEST_COUNT);
  const classicBest = classicMetrics.b20 || [];
  els.classicRatingValue.textContent = formatRatingValue(classicMetrics.rating);
  els.ratingValue.textContent = formatRatingValue(uraRating);
  state.ratingObjects = [
    ...state.ratingBest.map((row) => ({ mode: "里", row, displaySingle: row.single })),
    ...classicBest.map((row) => ({ mode: "表", row, displaySingle: row.classicSingle })),
  ];
  if (!state.ratingObjects.length) state.selectedRatingIndex = null;
  else if (state.selectedRatingIndex == null || state.selectedRatingIndex >= state.ratingObjects.length) state.selectedRatingIndex = 0;

  els.recordCount.textContent = String(bestRecords.length);
  els.matchedCount.textContent = String(rated.length);
  state.ratingSummary = {
    classic: classicMetrics,
    ura: { rating: uraRating },
    matchedCount: rated.length,
  };
  renderRatingTable();
  renderRatingDetail(state.selectedRatingIndex == null ? null : state.ratingObjects[state.selectedRatingIndex]);
  renderRecommendations();
}

function radarSvg(dimensions, x, y, radius, color) {
  const values = RADAR_DIMS.map((dim) => Number(dimensions?.[dim.key]) || 0);
  const positive = values.filter((value) => value > 0);
  const minAxis = Math.max(0, (positive.length ? Math.min(...positive) : 0) - 1);
  const maxAxis = Math.max(minAxis + 1, Math.max(...values, 1) + 0.6);
  const point = (index, r) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / RADAR_DIMS.length;
    return [x + Math.cos(angle) * r, y + Math.sin(angle) * r];
  };
  const polygon = (points) => points.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const rings = [1, 2, 3, 4, 5]
    .map((ring) => {
      const r = (radius * ring) / 5;
      return `<polygon points="${polygon(RADAR_DIMS.map((_, index) => point(index, r)))}" fill="none" stroke="#d9dee5" stroke-width="1" />`;
    })
    .join("");
  const axes = RADAR_DIMS.map((_, index) => {
    const [px, py] = point(index, radius);
    return `<line x1="${x}" y1="${y}" x2="${px.toFixed(1)}" y2="${py.toFixed(1)}" stroke="#d9dee5" stroke-width="1" />`;
  }).join("");
  const dataPoints = RADAR_DIMS.map((dim, index) => {
    const value = clamp(((Number(dimensions?.[dim.key]) || 0) - minAxis) / (maxAxis - minAxis), 0, 1);
    return point(index, value * radius);
  });
  const labels = RADAR_DIMS.map((dim, index) => {
    const [lx, ly] = point(index, radius + 42);
    const anchor = lx < x - 10 ? "end" : lx > x + 10 ? "start" : "middle";
    return `
      <text x="${lx.toFixed(1)}" y="${(ly - 2).toFixed(1)}" font-size="13" font-weight="700" fill="#4d5660" text-anchor="${anchor}">${escapeHtml(dim.label)}</text>
      <text x="${lx.toFixed(1)}" y="${(ly + 16).toFixed(1)}" font-size="12" fill="#66717d" text-anchor="${anchor}">${escapeHtml(formatRatingValue(dimensions?.[dim.key]))}</text>
    `;
  }).join("");

  return `
    <g>
      ${rings}
      ${axes}
      <polygon points="${polygon(dataPoints)}" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="3" />
      ${labels}
    </g>
  `;
}

function renderRatingTable(summary = state.ratingSummary) {
  const rows = state.ratingObjects;
  if (!rows.length) {
    els.ratingSvgWrap.className = "rating-svg-wrap muted-box";
    els.ratingSvgWrap.textContent = "没有可计算成绩";
    return;
  }

  const width = 1900;
  const height = 2400;
  const margin = 34;
  const gap = 28;
  const columnWidth = (width - margin * 2 - gap) / 2;
  const rowHeight = 58;
  const rowGap = 5;
  const headerHeight = 106;
  const sectionY = 330;
  const sections = [
    { mode: "里", title: "里 Rating B30", x: margin, color: "#246f92", total: summary.ura?.rating, count: RATING_BEST_COUNT },
    { mode: "表", title: "表 Rating B20", x: margin + columnWidth + gap, color: "#a23b35", total: summary.classic?.rating, count: 20 },
  ];
  const topCards = `
    <g>
      <rect x="${margin}" y="44" width="340" height="118" rx="8" fill="#f2f8fb" stroke="#d0dde4" />
      <text x="${margin + 24}" y="86" font-size="20" font-weight="800" fill="#246f92">里 Rating 总分</text>
      <text x="${margin + 316}" y="126" font-size="42" font-weight="800" fill="#246f92" text-anchor="end">${escapeHtml(formatRatingValue(summary.ura?.rating))}</text>

      <rect x="${margin}" y="186" width="340" height="100" rx="8" fill="#fff7f4" stroke="#e6d7d1" />
      <text x="${margin + 24}" y="226" font-size="20" font-weight="800" fill="#a23b35">表 Rating 总分</text>
      <text x="${margin + 316}" y="258" font-size="38" font-weight="800" fill="#a23b35" text-anchor="end">${escapeHtml(formatRatingValue(summary.classic?.rating))}</text>

      <rect x="${margin + 370}" y="44" width="260" height="242" rx="8" fill="#ffffff" stroke="#d9dee5" />
      <text x="${margin + 394}" y="88" font-size="20" font-weight="800" fill="#20252b">匹配谱面</text>
      <text x="${margin + 606}" y="176" font-size="62" font-weight="800" fill="#20252b" text-anchor="end">${escapeHtml(summary.matchedCount ?? 0)}</text>
    </g>
  `;
  const radarBlock = `
    <g>
      <text x="1110" y="82" font-size="28" font-weight="800" fill="#20252b">六维 Rating</text>
      ${radarSvg(summary.classic?.dimensions || {}, 1510, 170, 96, "#a23b35")}
    </g>
  `;

  const sectionSvg = sections
    .map(
      (section) => {
        const entries = rows
          .map((item, index) => ({ item, index }))
          .filter((entry) => entry.item.mode === section.mode)
          .slice(0, section.count);
        const y = sectionY;
        const rowSvg = entries
          .map((entry, rankIndex) => {
            const item = entry.item;
            const row = item.row;
            const rowY = y + headerHeight + rankIndex * (rowHeight + rowGap);
            const selected = state.selectedRatingIndex === entry.index;
            const fill = selected ? "#eef7fb" : "#ffffff";
            const stroke = selected ? section.color : "#d9dee5";
            const title = escapeHtml(truncateText(row.title, 28));
            const matchedTitle = escapeHtml(truncateText(row.constantTitle, 32));
            const source = escapeHtml(sourceLabel(row.chartSource, row.needsEncoder));
            const subtitle = escapeHtml(`${levelName(row.level)} · ${source}`);
            const score = escapeHtml(formatScore(row.highScore));
            const rank = escapeHtml(scoreRankLabel(row.bestScoreRank, row.highScore));
            const rankFill = scoreRankSvgFill(row.bestScoreRank, row.highScore);
            const single = escapeHtml(formatSingle(item.displaySingle));
            const constant = escapeHtml(Number(row.constant).toFixed(1));
            const bonus = escapeHtml(formatBonus(row.bonus));
            return `
              <g class="rating-svg-row" data-rating-index="${entry.index}" tabindex="0" role="button">
                <rect x="${section.x}" y="${rowY}" width="${columnWidth}" height="${rowHeight}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="${selected ? 2 : 1}" />
                <rect x="${section.x}" y="${rowY}" width="5" height="${rowHeight}" rx="2" fill="${section.color}" />
                <text x="${section.x + 18}" y="${rowY + 31}" font-size="17" font-weight="700" fill="#8b949e">${String(rankIndex + 1).padStart(2, "0")}</text>
                <text x="${section.x + 58}" y="${rowY + 20}" font-size="16" font-weight="700" fill="#20252b">${title}</text>
                <text x="${section.x + 58}" y="${rowY + 38}" font-size="12" fill="#66717d">匹配：${matchedTitle}</text>
                <text x="${section.x + 58}" y="${rowY + 52}" font-size="11" fill="#8b949e">${subtitle}</text>
                <text x="${section.x + columnWidth - 468}" y="${rowY + 31}" font-size="15" font-weight="700" fill="#20252b" text-anchor="end">${score}</text>
                <text x="${section.x + columnWidth - 358}" y="${rowY + 31}" font-size="15" font-weight="800" fill="${rankFill}" text-anchor="end">${rank}</text>
                <text x="${section.x + columnWidth - 262}" y="${rowY + 31}" font-size="16" font-weight="700" fill="#20252b" text-anchor="end">${constant}</text>
                <text x="${section.x + columnWidth - 162}" y="${rowY + 31}" font-size="15" fill="#66717d" text-anchor="end">${bonus}</text>
                <text x="${section.x + columnWidth - 22}" y="${rowY + 32}" font-size="22" font-weight="800" fill="${section.color}" text-anchor="end">${single}</text>
              </g>
            `;
          })
          .join("");
        return `
          <g>
            <rect x="${section.x}" y="${y}" width="${columnWidth}" height="${height - y - 30}" rx="10" fill="#fbfcfd" stroke="#d9dee5" />
            <text x="${section.x + 22}" y="${y + 40}" font-size="28" font-weight="800" fill="${section.color}">${section.title}</text>
            <text x="${section.x + columnWidth - 22}" y="${y + 40}" font-size="30" font-weight="800" fill="${section.color}" text-anchor="end">${escapeHtml(formatRatingValue(section.total))}</text>
            <text x="${section.x + columnWidth - 22}" y="${y + 68}" font-size="14" fill="#66717d" text-anchor="end">总分 / B${section.count}</text>
            <text x="${section.x + columnWidth - 468}" y="${y + 95}" font-size="12" fill="#8b949e" text-anchor="end">总分</text>
            <text x="${section.x + columnWidth - 358}" y="${y + 95}" font-size="12" fill="#8b949e" text-anchor="end">评价</text>
            <text x="${section.x + columnWidth - 262}" y="${y + 95}" font-size="12" fill="#8b949e" text-anchor="end">定数</text>
            <text x="${section.x + columnWidth - 162}" y="${y + 95}" font-size="12" fill="#8b949e" text-anchor="end">补正</text>
            <text x="${section.x + columnWidth - 22}" y="${y + 95}" font-size="12" fill="#8b949e" text-anchor="end">单曲R</text>
            ${rowSvg}
          </g>
        `;
      },
    )
    .join("");

  els.ratingSvgWrap.className = "rating-svg-wrap";
  els.ratingSvgWrap.innerHTML = `
    <svg id="ratingObjectSvg" class="rating-object-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Rating B20/B30">
      <defs>
        <linearGradient id="rankRainbow" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#e03131" />
          <stop offset="18%" stop-color="#f08c00" />
          <stop offset="36%" stop-color="#f2c94c" />
          <stop offset="54%" stop-color="#2f9e44" />
          <stop offset="72%" stop-color="#1971c2" />
          <stop offset="100%" stop-color="#9c36b5" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="#f7fafc" />
      <text x="${margin}" y="24" font-size="14" fill="#66717d">点击任意歌曲查看详细数值</text>
      ${topCards}
      ${radarBlock}
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
    ["Rating对象", `${item.mode} Rating ${item.mode === "里" ? "B30" : "B20"}`],
    ["曲名", row.title],
    ["匹配谱面", row.constantTitle],
    ["难度", levelName(row.level)],
    ["来源", sourceLabel(row.chartSource, row.needsEncoder)],
    ["定数", row.constant.toFixed(1)],
    ["分数", formatScore(row.highScore)],
    ["评价", scoreRankLabel(row.bestScoreRank, row.highScore)],
    ["通关次数", formatLoose(row.clearCount, 0)],
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
    title: chartTitle(chart),
    course: chart.course,
    level: chart.level,
    const: chart.const,
    bpm: chart.bpm,
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
  return [
    chart.id,
    chart.title,
    chart.display_title,
    chart.variant_label,
    chart.title_normalized,
    chart.course,
    chart.course_label,
    chart.fumen?.url,
    ...(chart.aliases || []),
  ]
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

function renderChartPagination(totalPages) {
  if (!els.chartPagination) return;
  if (totalPages <= 1) {
    els.chartPagination.innerHTML = "";
    return;
  }

  const current = state.chartPage;
  const pages = new Set([1, totalPages, current - 1, current, current + 1]);
  const pageButtons = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  const controls = [];
  controls.push(`<button type="button" data-chart-page="prev" ${current <= 1 ? "disabled" : ""}>上一页</button>`);
  let previous = 0;
  for (const page of pageButtons) {
    if (page - previous > 1) controls.push(`<span class="pagination-gap">...</span>`);
    controls.push(
      `<button type="button" data-chart-page="${page}" class="${page === current ? "is-active" : ""}" ${page === current ? 'aria-current="page"' : ""}>${page}</button>`,
    );
    previous = page;
  }
  controls.push(`<button type="button" data-chart-page="next" ${current >= totalPages ? "disabled" : ""}>下一页</button>`);
  els.chartPagination.innerHTML = controls.join("");
}

function resetChartBrowserPage() {
  state.chartPage = 1;
  renderChartBrowser();
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
  const totalPages = Math.max(1, Math.ceil(rows.length / CHART_PAGE_SIZE));
  state.chartPage = clamp(Math.trunc(state.chartPage || 1), 1, totalPages);
  const pageStart = (state.chartPage - 1) * CHART_PAGE_SIZE;
  const visibleRows = rows.slice(pageStart, pageStart + CHART_PAGE_SIZE);
  els.chartBrowserStatus.textContent = getUseEncoder()
    ? "当前数据范围：社区数据 + 网站数据 + 神经网络"
    : "当前数据范围：社区数据 + 网站数据";
  const rangeStart = rows.length ? pageStart + 1 : 0;
  const rangeEnd = rows.length ? pageStart + visibleRows.length : 0;
  els.chartResultCount.textContent = `命中 ${rows.length} 张，第 ${state.chartPage}/${totalPages} 页，显示 ${rangeStart}-${rangeEnd}`;
  renderChartPagination(totalPages);

  if (!visibleRows.length) {
    els.chartTableBody.innerHTML = '<tr><td colspan="13" class="empty-cell">没有符合条件的谱面</td></tr>';
    return;
  }

  els.chartTableBody.innerHTML = visibleRows
    .map((chart, index) => {
      const globalIndex = pageStart + index;
      const f = chart.features || {};
      return `
        <tr class="clickable-row ${state.selectedChartIndex === globalIndex ? "is-selected" : ""}" data-chart-index="${globalIndex}">
          <td>${escapeHtml(chartTitle(chart))}</td>
          <td>${escapeHtml(chart.course_label || chart.course)}</td>
          <td class="numeric">${formatLoose(chart.level, 0)}</td>
          <td class="numeric">${formatLoose(chart.const, 1)}</td>
          <td class="numeric">${formatLoose(chart.bpm)}</td>
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

function chartFeatureNumber(chart, key) {
  const f = chart?.features || {};
  const value = key === "const" ? chart?.const : f[key];
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function chartTrainingProfile(chart) {
  const complex = chartFeatureNumber(chart, "complex");
  const avgDensity = chartFeatureNumber(chart, "avg_density");
  const peakDensity = chartFeatureNumber(chart, "peak_density");
  const noteType = chartFeatureNumber(chart, "note_type");
  const bpmChange = chartFeatureNumber(chart, "bpm_change");
  const hsChange = chartFeatureNumber(chart, "hs_change");
  const rhythm = chartFeatureNumber(chart, "rhythm") || noteType;
  const stability = 100 - (complex * 0.28 + rhythm * 0.24 + bpmChange * 0.22 + hsChange * 0.18 + peakDensity * 0.08);
  return {
    power: clamp((Number(chart.const) - 4) / 8, 0, 1),
    stamina: clamp(avgDensity / 100, 0, 1),
    speed: clamp(peakDensity / 100, 0, 1),
    accuracy: clamp(stability / 100, 0, 1),
    rhythm: clamp((rhythm + bpmChange * 0.35 + hsChange * 0.2) / 130, 0, 1),
    complex: clamp(complex / 100, 0, 1),
  };
}

function getRecommendUseEncoder() {
  return Boolean(els.recommendEncoderInput?.checked);
}

function getRecommendAllowLowDifficulty() {
  return Boolean(els.recommendLowDifficultyInput?.checked && getRecommendUseEncoder());
}

function syncRecommendControls() {
  if (!els.recommendLowDifficultyInput) return;
  const canUseLowDifficulty = getRecommendUseEncoder();
  els.recommendLowDifficultyInput.disabled = !canUseLowDifficulty;
  if (!canUseLowDifficulty) {
    els.recommendLowDifficultyInput.checked = false;
  }
}

function chartUsableForRecommendation(chart) {
  const scoreLevel = Number(chart.score_level);
  if (!Number.isFinite(scoreLevel) || scoreLevel < 1) return false;
  if (!getRecommendUseEncoder() && isEstimatedSource(chart)) return false;
  if (!getRecommendAllowLowDifficulty() && scoreLevel < 4) return false;
  return !chart.rating_excluded && hasNumericValue(chart.const);
}

function getWeakDimensions(dimensions) {
  const entries = RADAR_DIMS.map((dim) => ({
    ...dim,
    value: Number(dimensions?.[dim.key]),
  })).filter((dim) => Number.isFinite(dim.value) && dim.value > 0);
  if (!entries.length) return [];
  entries.sort((a, b) => a.value - b.value);
  return entries.slice(0, Math.min(2, entries.length));
}

function getSelectedPracticeDims(weakDims) {
  const selected = els.recommendTargetSelect?.value || "auto";
  if (selected === "auto") return weakDims;
  const dim = RADAR_DIMS.find((item) => item.key === selected);
  return dim ? [dim] : weakDims;
}

function isAutoPracticeSelection() {
  return (els.recommendTargetSelect?.value || "auto") === "auto";
}

function formatPracticeTarget(dims, isAuto) {
  const names = dims.length ? dims.map((dim) => dim.label).join(" / ") : "综合";
  return isAuto ? `自动：${names}` : names;
}

function practiceDescription(dims) {
  const keys = new Set(dims.map((dim) => dim.key));
  const names = dims.map((dim) => dim.label).join(" / ");
  if (dims.length > 1 && keys.has("power") && keys.has("accuracy")) return "会优先挑选同时适合两项练习对象的谱面；大歌力偏向略高定数，精度力偏向略低定数。";
  if (dims.length > 1 && keys.has("power")) return `会优先挑选同时适合 ${names} 的谱面；大歌力偏向略高定数，其余对象按谱面特征筛选。`;
  if (dims.length > 1 && keys.has("accuracy")) return `会优先挑选同时适合 ${names} 的谱面；精度力偏向略低定数，其余对象按谱面特征筛选。`;
  if (dims.length > 1) return `会优先挑选在 ${names} 上都比较合适的谱面。`;
  if (keys.has("power")) return "大歌力偏向推荐略高定数的歌曲。";
  if (keys.has("accuracy")) return "精度力偏向推荐略低定数的歌曲。";
  if (dims.length) return `优先挑选接近当前里 Rating、并能练到 ${names} 的谱面。`;
  return "六维数据不足时，优先按定数接近当前里 Rating 推荐。";
}

function desiredDeltaForPractice(dims) {
  const offsets = dims.flatMap((dim) => {
    if (dim.key === "power") return [0.55];
    if (dim.key === "accuracy") return [-0.55];
    return [0.08];
  });
  if (!offsets.length) return 0;
  return offsets.reduce((sum, value) => sum + value, 0) / offsets.length;
}

function practiceQuotas(dims, balanced = false) {
  const keys = new Set(dims.map((dim) => dim.key));
  if (balanced && keys.has("power") && keys.has("accuracy")) return { 略高: 7, 略低: 7, 同水平: 6 };
  if (balanced && keys.has("power")) return { 略高: 8, 同水平: 8, 略低: 4 };
  if (balanced && keys.has("accuracy")) return { 略低: 8, 同水平: 8, 略高: 4 };
  if (keys.has("power") && keys.has("accuracy")) return { 略高: 8, 略低: 8, 同水平: 4 };
  if (keys.has("power")) return { 略高: 12, 同水平: 5, 略低: 3 };
  if (keys.has("accuracy")) return { 略低: 12, 同水平: 5, 略高: 3 };
  return { 同水平: 8, 略高: 7, 略低: 5 };
}

function practiceMatchScore(dim, band, profile) {
  if (dim.key === "power") {
    if (band === "略高") return 1;
    if (band === "同水平") return 0.42;
    return 0.06;
  }
  if (dim.key === "accuracy") {
    const bandScore = band === "略低" ? 1 : band === "同水平" ? 0.44 : 0.08;
    return bandScore * 0.7 + (profile.accuracy || 0) * 0.3;
  }
  return profile[dim.key] || 0;
}

function aggregatePracticeScores(scores, balanced = false) {
  const values = scores.filter((score) => Number.isFinite(score));
  if (!values.length) return 0.5;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!balanced || values.length < 2) return average;
  const weakest = Math.min(...values);
  return weakest * 0.72 + average * 0.28;
}

function recommendationBand(delta) {
  if (delta > 0.25) return "略高";
  if (delta < -0.25) return "略低";
  return "同水平";
}

function recommendationBandClass(band) {
  if (band === "略高") return "high";
  if (band === "略低") return "low";
  return "same";
}

function recommendationFeatureText(chart) {
  const f = chart.features || {};
  return `密度 ${formatLoose(f.avg_density)}/${formatLoose(f.peak_density)} · 节奏 ${formatLoose(f.rhythm)} · 复合 ${formatLoose(f.complex)}`;
}

function recommendationKey(chart) {
  return `${normalizeTitle(chart.title)}:${chart.course}:${formatLoose(chart.const, 1)}`;
}

function hashText(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function recommendationJitter(chart) {
  return hashText(`${state.recommendationSeed}:${chart.id || chart.title}`) / 0xffffffff;
}

function buildRecommendations() {
  const rating = Number(state.ratingSummary?.ura?.rating);
  if (!Number.isFinite(rating) || rating <= 0) return { rating, weakDims: [], practiceDims: [], rows: [] };
  const weakDims = getWeakDimensions(state.ratingSummary?.classic?.dimensions || {});
  const practiceDims = getSelectedPracticeDims(weakDims);
  const balancedPractice = isAutoPracticeSelection() && practiceDims.length > 1;
  const desiredDelta = desiredDeltaForPractice(practiceDims);
  const b30Ids = new Set(state.ratingBest.map((row) => row.chart?.raw?.id).filter(Boolean));
  const scoredCharts = [];

  for (const chart of state.chartData) {
    if (!chartUsableForRecommendation(chart)) continue;
    if (b30Ids.has(chart.id)) continue;
    const constant = Number(chart.const);
    if (!Number.isFinite(constant)) continue;
    const delta = constant - rating;
    if (Math.abs(delta) > 1.2) continue;
    const band = recommendationBand(delta);
    const profile = chartTrainingProfile(chart);
    const practiceScores = practiceDims.map((dim) => practiceMatchScore(dim, band, profile));
    const practiceScore = aggregatePracticeScores(practiceScores, balancedPractice);
    const focusDims = practiceDims.slice(0, 2);
    const distanceScore = 1 - Math.min(Math.abs(delta - desiredDelta) / 1.35, 1);
    const neutralDistance = 1 - Math.min(Math.abs(delta) / 1.2, 1);
    const jitter = recommendationJitter(chart);
    const score = distanceScore * 1.35 + neutralDistance * 0.45 + practiceScore * 1.25 + sourcePriority(chart.source) * 0.025 + jitter * 0.72;
    scoredCharts.push({
      chart,
      band,
      focusDims: focusDims.length ? focusDims : practiceDims.slice(0, 1),
      featureText: recommendationFeatureText(chart),
      score,
      delta,
    });
  }

  scoredCharts.sort((a, b) => b.score - a.score || Math.abs(a.delta) - Math.abs(b.delta));

  const quotas = practiceQuotas(practiceDims, balancedPractice);
  const selected = [];
  const seen = new Set();
  const take = (filter, limit = RECOMMEND_COUNT) => {
    for (const row of scoredCharts) {
      if (selected.length >= limit) return;
      if (!filter(row)) continue;
      const key = recommendationKey(row.chart);
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(row);
    }
  };

  for (const [band, quota] of Object.entries(quotas)) {
    const before = selected.length;
    take((row) => row.band === band, before + quota);
  }
  take(() => true);

  return { rating, weakDims, practiceDims, rows: selected.slice(0, RECOMMEND_COUNT) };
}

function renderRecommendations() {
  if (!els.recommendTableBody) return;
  syncRecommendControls();
  const { rating, practiceDims, rows } = buildRecommendations();
  state.recommendationRows = rows;

  if (!Number.isFinite(rating) || rating <= 0) {
    els.recommendSummary.innerHTML = '<span class="recommend-chip">暂无里 Rating</span>';
    els.recommendWeakness.textContent = "先获取成绩并刷新 Rating 后，再生成进步推荐。";
    els.recommendCount.textContent = "";
    els.recommendTableBody.innerHTML = '<tr><td colspan="7" class="empty-cell">暂无可推荐歌曲</td></tr>';
    return;
  }

  const lower = Math.max(0, rating - 1.2);
  const upper = rating + 1.2;
  const targetText = formatPracticeTarget(practiceDims, (els.recommendTargetSelect?.value || "auto") === "auto");
  const sourceText = getRecommendUseEncoder() ? "含神经网络" : "不含神经网络";
  const difficultyText = getRecommendAllowLowDifficulty() ? "含松以下" : "仅鬼/里";
  els.recommendSummary.innerHTML = `
    <span class="recommend-chip"><strong>${escapeHtml(formatRatingValue(rating))}</strong> 里 Rating</span>
    <span class="recommend-chip">${escapeHtml(formatNumber(lower, 1))} - ${escapeHtml(formatNumber(upper, 1))} 推荐定数</span>
    <span class="recommend-chip">练习对象 ${escapeHtml(targetText)}</span>
    <span class="recommend-chip">${escapeHtml(sourceText)}</span>
    <span class="recommend-chip">${escapeHtml(difficultyText)}</span>
  `;
  els.recommendWeakness.textContent = practiceDescription(practiceDims);
  els.recommendCount.textContent = `推荐 ${rows.length}/${RECOMMEND_COUNT} 首`;

  if (!rows.length) {
    els.recommendTableBody.innerHTML = '<tr><td colspan="7" class="empty-cell">当前数据范围内没有合适谱面</td></tr>';
    return;
  }

  els.recommendTableBody.innerHTML = rows
    .map((row, index) => {
      const chart = row.chart;
      const focusText = row.focusDims.length ? row.focusDims.map((dim) => dim.label).join(" / ") : "综合";
      return `
        <tr class="clickable-row" data-recommend-index="${index}">
          <td class="numeric">${index + 1}</td>
          <td>${escapeHtml(chartTitle(chart))}</td>
          <td>${escapeHtml(chart.course_label || chart.course)}</td>
          <td class="numeric">${formatLoose(chart.const, 1)}</td>
          <td><span class="recommend-band ${recommendationBandClass(row.band)}">${escapeHtml(row.band)}</span></td>
          <td>${escapeHtml(focusText)}</td>
          <td>${escapeHtml(row.featureText)} · ${escapeHtml(sourceLabel(chart.source, chart.needs_encoder))}</td>
        </tr>
      `;
    })
    .join("");
}

function formatTimecode(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function parseBalloonCounts(chart) {
  const text = String(chart?.ese?.balloon_declared ?? chart?.balloon_declared ?? "");
  return text
    .split(/[,\s/;|]+/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function buildChartPreviewTimeline(preview, chart) {
  const measures = Array.isArray(preview?.measures) ? preview.measures : [];
  const bpm = Number(chart?.bpm) > 0 ? Number(chart.bpm) : 120;
  const measureDuration = (60 / bpm) * 4;
  const timings = Array.isArray(preview?.measure_timings) ? preview.measure_timings : null;
  const segmentTimings = preview?.segment_timings && typeof preview.segment_timings === "object" ? preview.segment_timings : {};
  const events = [];
  const measureLines = [];
  const visualSegments = [];
  const balloonCounts = parseBalloonCounts(chart);
  let balloonIndex = 0;
  let time = 0;
  let visual = 0;

  const addVisualSegment = (segment) => {
    const startTime = Number(segment[2] ?? 0);
    const startVisual = Number(segment[3] ?? 0);
    const duration = Math.max(0, Number(segment[4] ?? 0));
    const visualDuration = Number(segment[5] ?? 0);
    visualSegments.push({ time: startTime, visual: startVisual, duration, visualDuration });
  };

  const addNoteEvents = (chars, measureIndex, segment) => {
    const startIndex = Math.max(0, Number(segment[0] ?? 0));
    const endIndex = Math.min(chars.length, Number(segment[1] ?? chars.length));
    const startTime = Number(segment[2] ?? 0);
    const startVisual = Number(segment[3] ?? 0);
    const duration = Math.max(0, Number(segment[4] ?? 0));
    const visualDuration = Number(segment[5] ?? 0);
    const length = Math.max(1, endIndex - startIndex);
    for (let noteIndex = startIndex; noteIndex < endIndex; noteIndex += 1) {
      const type = chars[noteIndex];
      if (type === "0") continue;
      const ratio = (noteIndex - startIndex) / length;
      const isBalloon = type === "7" || type === "9";
      events.push({
        type,
        time: startTime + duration * ratio,
        visual: startVisual + visualDuration * ratio,
        measure: measureIndex + 1,
        bpm: Number(segment[6] ?? bpm),
        scroll: Number(segment[7] ?? 1),
        balloonCount: isBalloon ? (balloonCounts[balloonIndex++] ?? null) : null,
      });
    }
  };

  measures.forEach((measure, measureIndex) => {
    const chars = String(measure || "0").split("");
    const timing = timings?.[measureIndex];
    if (Array.isArray(timing)) {
      const measureTime = Number(timing[0] ?? time);
      const measureVisual = Number(timing[1] ?? visual);
      const duration = Number(timing[2] ?? measureDuration);
      const visualDuration = Number(timing[3] ?? 4);
      const barline = Number(timing[6] ?? 1) !== 0;
      measureLines.push({
        time: measureTime,
        visual: measureVisual,
        index: measureIndex + 1,
        barline,
        bpm: Number(timing[4] ?? bpm),
        scroll: Number(timing[5] ?? 1),
      });
      const segments = Array.isArray(segmentTimings[String(measureIndex)])
        ? segmentTimings[String(measureIndex)]
        : [[0, chars.length, measureTime, measureVisual, duration, visualDuration, Number(timing[4] ?? bpm), Number(timing[5] ?? 1)]];
      for (const segment of segments) {
        addVisualSegment(segment);
        addNoteEvents(chars, measureIndex, segment);
      }
      time = measureTime + duration;
      visual = measureVisual + visualDuration;
      return;
    }

    const resolution = Math.max(1, chars.length);
    measureLines.push({ time, visual, index: measureIndex + 1, barline: true, bpm, scroll: 1 });
    const fallbackSegment = [0, chars.length, time, visual, measureDuration, 4, bpm, 1];
    addVisualSegment(fallbackSegment);
    addNoteEvents(chars, measureIndex, fallbackSegment);
    time += measureDuration;
    visual += 4;
  });
  measureLines.push({ time, visual, index: measures.length + 1, barline: true, bpm, scroll: 1 });
  visualSegments.sort((a, b) => a.time - b.time || a.visual - b.visual);

  const rolls = [];
  let openRoll = null;
  for (const event of events) {
    if (event.type === "5" || event.type === "6" || event.type === "7" || event.type === "9") {
      if (openRoll) {
        rolls.push({
          ...openRoll,
          endTime: event.time,
          endVisual: event.visual,
          endBpm: event.bpm,
          endScroll: event.scroll,
        });
      }
      openRoll = {
        type: event.type,
        startTime: event.time,
        startVisual: event.visual,
        bpm: event.bpm,
        scroll: event.scroll,
        balloonCount: event.balloonCount,
      };
    } else if (event.type === "8" && openRoll) {
      rolls.push({
        ...openRoll,
        endTime: Math.max(event.time, openRoll.startTime),
        endVisual: Math.max(event.visual, openRoll.startVisual),
        endBpm: event.bpm,
        endScroll: event.scroll,
      });
      openRoll = null;
    }
  }
  if (openRoll) {
    rolls.push({
      ...openRoll,
      endTime: Math.min(time, openRoll.startTime + measureDuration * 2),
      endVisual: openRoll.startVisual + 4,
      endBpm: openRoll.bpm,
      endScroll: openRoll.scroll,
    });
  }

  const visualAt = (seconds) => {
    const target = Number(seconds) || 0;
    let previous = visualSegments[0] || { time: 0, visual: 0, duration: 1, visualDuration: 0 };
    for (const segment of visualSegments) {
      if (target < segment.time) break;
      const end = segment.time + segment.duration;
      if (target <= end) {
        const ratio = segment.duration > 0 ? (target - segment.time) / segment.duration : 1;
        return segment.visual + segment.visualDuration * clamp(ratio, 0, 1);
      }
      previous = segment;
    }
    return previous.visual + previous.visualDuration;
  };

  const summary = preview?.timing_summary || {};

  return {
    bpm,
    events,
    measureLines,
    rolls,
    totalTime: Math.max(time, 1),
    totalVisual: Math.max(visual, 1),
    visualAt,
    timingSummary: summary,
    noteCount: Number(preview?.note_count || 0),
    measureCount: measures.length,
    scrollChangeCount: Number(summary.scroll_change_count || 0),
    bpmChangeCount: Number(summary.bpm_change_count || 0),
  };
}

function roundedCanvasRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
}

function drawCanvasNote(ctx, type, x, y, scale = 1, balloonCount = null) {
  const value = String(type);
  const radius = value === "3" || value === "4" || value === "6" || value === "7" || value === "9" ? 15 * scale : 11 * scale;
  if (value === "1" || value === "3") {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#e5484d";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#8f1f24";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - radius * 0.25, y - radius * 0.28, radius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.fill();
    return;
  }
  if (value === "2" || value === "4") {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#3584e4";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#174d8d";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - radius * 0.25, y - radius * 0.28, radius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.fill();
    return;
  }
  if (value === "5" || value === "6") {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#f0b429";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#9f6b00";
    ctx.stroke();
    return;
  }
  if (value === "7" || value === "9") {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#f2c94c";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#9f6b00";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - radius * 0.25, y - radius * 0.28, radius * 0.26, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.fill();
    if (Number.isFinite(Number(balloonCount)) && Number(balloonCount) > 0) {
      const label = String(Math.round(Number(balloonCount)));
      const fontSize = label.length >= 3 ? 9 : label.length === 2 ? 11 : 12;
      ctx.save();
      ctx.fillStyle = "#4d3200";
      ctx.font = `700 ${Math.max(7, fontSize * scale)}px "Microsoft YaHei", "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x, y + 0.5 * scale);
      ctx.restore();
    }
    return;
  }
  if (value === "8") {
    ctx.beginPath();
    ctx.moveTo(x, y - 12 * scale);
    ctx.lineTo(x + 12 * scale, y);
    ctx.lineTo(x, y + 12 * scale);
    ctx.lineTo(x - 12 * scale, y);
    ctx.closePath();
    ctx.fillStyle = "#3d4650";
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.arc(x, y, 8 * scale, 0, Math.PI * 2);
  ctx.fillStyle = "#7a8490";
  ctx.fill();
}

function drawChartPreviewFrame(player) {
  const { ctx, width, height, timeline, chart } = player;
  const current = player.currentTime;
  const laneY = Math.round(height * 0.56);
  const judgeX = Math.max(112, Math.round(width * 0.16));
  const spawnX = width + 68;
  const baseSpeed = (spawnX - judgeX) / player.baseLeadTime;
  const speedFactor = (item) => {
    const itemBpm = Number(item?.bpm);
    const itemScroll = Number(item?.scroll);
    const bpmFactor = Number.isFinite(itemBpm) && itemBpm > 0 ? itemBpm / player.baseBpm : 1;
    const scrollFactor = Number.isFinite(itemScroll) ? Math.max(0.02, Math.abs(itemScroll)) : 1;
    return bpmFactor * scrollFactor;
  };
  const xAt = (item, timeKey = "time") => judgeX + (Number(item?.[timeKey] ?? 0) - current) * baseSpeed * speedFactor(item);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f6f8fb";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(14, 14, width - 28, height - 28);
  ctx.strokeStyle = "#d9dee5";
  ctx.lineWidth = 1;
  ctx.strokeRect(14, 14, width - 28, height - 28);

  ctx.fillStyle = "#20252b";
  ctx.font = "700 18px 'Microsoft YaHei', 'Segoe UI', Arial, sans-serif";
  ctx.fillText(truncateText(chartTitle(chart) || "Taiko chart", width < 640 ? 24 : 42), 28, 42);
  ctx.fillStyle = "#66717d";
  ctx.font = "13px 'Microsoft YaHei', 'Segoe UI', Arial, sans-serif";
  ctx.fillText(
    `${chart.course_label || chart.course || ""} ★${formatLoose(chart.level, 0)}  BPM ${formatLoose(timeline.bpm, 0)}  ${timeline.measureCount} 小节  HS变化 ${timeline.scrollChangeCount}  BPM变化 ${timeline.bpmChangeCount}`,
    28,
    64,
  );

  ctx.fillStyle = "#fff8ea";
  ctx.fillRect(judgeX, laneY - 32, width - judgeX - 24, 64);
  ctx.strokeStyle = "#d8c7a5";
  ctx.strokeRect(judgeX, laneY - 32, width - judgeX - 24, 64);
  ctx.beginPath();
  ctx.moveTo(judgeX, laneY);
  ctx.lineTo(width - 24, laneY);
  ctx.strokeStyle = "#b9c5cf";
  ctx.lineWidth = 3;
  ctx.stroke();

  for (const lineInfo of timeline.measureLines) {
    if (!lineInfo.barline) continue;
    const x = xAt(lineInfo);
    if (x < judgeX - 80 || x > spawnX + 80) continue;
    ctx.beginPath();
    ctx.moveTo(x, laneY - 35);
    ctx.lineTo(x, laneY + 35);
    ctx.strokeStyle = lineInfo.index % 4 === 1 ? "rgba(36,111,146,0.38)" : "rgba(102,113,125,0.22)";
    ctx.lineWidth = lineInfo.index % 4 === 1 ? 2 : 1;
    ctx.stroke();
    if (lineInfo.index % 8 === 1) {
      ctx.fillStyle = "#7b8794";
      ctx.font = "11px 'Microsoft YaHei', 'Segoe UI', Arial, sans-serif";
      ctx.fillText(String(lineInfo.index), x + 4, laneY - 42);
    }
  }

  for (const roll of timeline.rolls) {
    const x1 = xAt(roll, "startTime");
    const x2 = xAt(
      {
        time: roll.endTime,
        bpm: roll.endBpm ?? roll.bpm,
        scroll: roll.endScroll ?? roll.scroll,
      },
    );
    const left = Math.max(judgeX - 12, Math.min(x1, x2));
    const right = Math.min(width - 24, Math.max(x1, x2));
    if (right <= judgeX - 12 || left >= width - 24) continue;
    ctx.beginPath();
    roundedCanvasRect(ctx, left, laneY - 12, Math.max(1, right - left), 24, 12);
    ctx.fillStyle = "rgba(240,180,41,0.36)";
    ctx.fill();
    ctx.strokeStyle = "rgba(159,107,0,0.58)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(judgeX, laneY, 24, 0, Math.PI * 2);
  ctx.fillStyle = "#f7fafc";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#20252b";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(judgeX, laneY, 13, 0, Math.PI * 2);
  ctx.strokeStyle = "#c84632";
  ctx.lineWidth = 2;
  ctx.stroke();

  for (const event of timeline.events) {
    const x = xAt(event);
    if (x < judgeX - 48 || x > width + 48) continue;
    const age = current - event.time;
    const scale = age > 0 ? Math.max(0.72, 1 - age * 0.7) : 1;
    ctx.globalAlpha = age > 0 ? Math.max(0.2, 1 - age * 1.8) : 1;
    drawCanvasNote(ctx, event.type, x, laneY, scale, event.balloonCount);
    ctx.globalAlpha = 1;
  }

  const barX = 28;
  const barY = height - 34;
  const barW = width - 56;
  ctx.fillStyle = "#e7edf3";
  ctx.fillRect(barX, barY, barW, 6);
  ctx.fillStyle = "#246f92";
  ctx.fillRect(barX, barY, barW * clamp(current / timeline.totalTime, 0, 1), 6);
}

function updateChartPreviewControls(player) {
  if (!player) return;
  player.playButton.textContent = player.playing ? "暂停" : "播放";
  player.progress.value = String(Math.round((player.currentTime / player.timeline.totalTime) * 1000));
  player.timeLabel.textContent = `${formatTimecode(player.currentTime)} / ${formatTimecode(player.timeline.totalTime)}`;
}

function setChartPreviewTime(player, seconds) {
  player.currentTime = clamp(Number(seconds) || 0, 0, player.timeline.totalTime);
  updateChartPreviewControls(player);
  drawChartPreviewFrame(player);
}

function stopChartPreviewPlayer(player) {
  if (!player) return;
  player.playing = false;
  if (player.animationFrame) cancelAnimationFrame(player.animationFrame);
  player.animationFrame = null;
  player.lastFrameAt = null;
  updateChartPreviewControls(player);
}

function startChartPreviewPlayer(player) {
  if (!player || player.playing) return;
  if (player.currentTime >= player.timeline.totalTime) setChartPreviewTime(player, 0);
  player.playing = true;
  player.lastFrameAt = null;
  updateChartPreviewControls(player);
  const step = (timestamp) => {
    if (!player.playing) return;
    if (player.lastFrameAt != null) {
      const delta = ((timestamp - player.lastFrameAt) / 1000) * player.speed;
      player.currentTime = Math.min(player.timeline.totalTime, player.currentTime + delta);
    }
    player.lastFrameAt = timestamp;
    updateChartPreviewControls(player);
    drawChartPreviewFrame(player);
    if (player.currentTime >= player.timeline.totalTime) {
      stopChartPreviewPlayer(player);
      return;
    }
    player.animationFrame = requestAnimationFrame(step);
  };
  player.animationFrame = requestAnimationFrame(step);
}

function destroyChartPreviewPlayer() {
  const player = state.chartPreviewPlayer;
  if (!player) return;
  stopChartPreviewPlayer(player);
  player.cleanup?.();
  state.chartPreviewPlayer = null;
}

function mountChartPreviewPlayer(chart) {
  destroyChartPreviewPlayer();
  const preview = getLocalPreview(chart);
  const root = els.chartModalBody.querySelector("[data-chart-player]");
  if (!preview || !root) return;

  const canvas = root.querySelector("[data-chart-canvas]");
  const playButton = root.querySelector("[data-chart-play]");
  const resetButton = root.querySelector("[data-chart-reset]");
  const progress = root.querySelector("[data-chart-progress]");
  const speedInput = root.querySelector("[data-chart-speed]");
  const timeLabel = root.querySelector("[data-chart-time]");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx || !playButton || !resetButton || !progress || !speedInput || !timeLabel) return;

  const player = {
    chart,
    canvas,
    ctx,
    playButton,
    resetButton,
    progress,
    speedInput,
    timeLabel,
    timeline: buildChartPreviewTimeline(preview, chart),
    currentTime: 0,
    speed: Number(speedInput.value) || 1,
    playing: false,
    animationFrame: null,
    lastFrameAt: null,
    baseLeadTime: 2.2,
    baseBpm: 180,
    width: 960,
    height: 260,
    cleanup: null,
  };

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width || 960));
    const height = Math.max(220, Math.round(rect.height || 260));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      player.width = width;
      player.height = height;
    }
    drawChartPreviewFrame(player);
  };

  const toggle = () => {
    if (player.playing) stopChartPreviewPlayer(player);
    else startChartPreviewPlayer(player);
  };
  const reset = () => {
    stopChartPreviewPlayer(player);
    setChartPreviewTime(player, 0);
  };
  const scrub = () => {
    setChartPreviewTime(player, (Number(progress.value) / 1000) * player.timeline.totalTime);
  };
  const setSpeed = () => {
    player.speed = Number(speedInput.value) || 1;
  };

  playButton.addEventListener("click", toggle);
  resetButton.addEventListener("click", reset);
  progress.addEventListener("input", scrub);
  speedInput.addEventListener("change", setSpeed);
  window.addEventListener("resize", resize);
  player.cleanup = () => {
    playButton.removeEventListener("click", toggle);
    resetButton.removeEventListener("click", reset);
    progress.removeEventListener("input", scrub);
    speedInput.removeEventListener("change", setSpeed);
    window.removeEventListener("resize", resize);
  };

  state.chartPreviewPlayer = player;
  resize();
  updateChartPreviewControls(player);
}

function renderChartPreviewPlayer(preview, chart) {
  if (!preview) return "";
  const count = `${preview.shown_measure_count || 0}/${preview.measure_count || 0} 小节`;
  const timing = preview.timing_summary || {};
  const timingText = `HS ${timing.scroll_change_count || 0} / BPM ${timing.bpm_change_count || 0}`;
  return `
    <figure class="preview-figure chart-player-figure">
      <div class="chart-player" data-chart-player>
        <canvas class="chart-player-canvas" data-chart-canvas aria-label="${escapeHtml(chartTitle(chart))} 动态谱面预览"></canvas>
        <div class="chart-player-controls">
          <button type="button" data-chart-play>播放</button>
          <input data-chart-progress type="range" min="0" max="1000" value="0" aria-label="播放进度" />
          <span class="chart-player-time" data-chart-time>0:00 / 0:00</span>
          <select data-chart-speed aria-label="播放速度">
            <option value="0.75">0.75x</option>
            <option value="1" selected>1x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
          <button type="button" data-chart-reset>重置</button>
        </div>
      </div>
      <figcaption>
        <span>本地 TJA 动态预览</span>
        <span>${escapeHtml(`${count} · ${timingText}`)}</span>
      </figcaption>
    </figure>
  `;
}

function previewNoteSvg(note, x, y) {
  const value = String(note);
  const common = `cx="${x.toFixed(1)}" cy="${y.toFixed(1)}"`;
  if (value === "1") return `<circle ${common} r="6.2" fill="#e5484d" stroke="#8f1f24" stroke-width="1.4" />`;
  if (value === "2") return `<circle ${common} r="6.2" fill="#3584e4" stroke="#174d8d" stroke-width="1.4" />`;
  if (value === "3") return `<circle ${common} r="8.8" fill="#e5484d" stroke="#8f1f24" stroke-width="1.6" />`;
  if (value === "4") return `<circle ${common} r="8.8" fill="#3584e4" stroke="#174d8d" stroke-width="1.6" />`;
  if (value === "5" || value === "6") {
    return `<rect x="${(x - 7).toFixed(1)}" y="${(y - 7).toFixed(1)}" width="14" height="14" rx="7" fill="#f0b429" stroke="#9f6b00" stroke-width="1.2" />`;
  }
  if (value === "7" || value === "9") {
    return `<circle ${common} r="8.8" fill="#f2c94c" stroke="#9f6b00" stroke-width="1.4" />`;
  }
  if (value === "8") {
    return `<path d="M ${x.toFixed(1)} ${(y - 7).toFixed(1)} L ${(x + 7).toFixed(1)} ${y.toFixed(1)} L ${x.toFixed(1)} ${(y + 7).toFixed(1)} L ${(x - 7).toFixed(1)} ${y.toFixed(1)} Z" fill="#3d4650" />`;
  }
  return `<circle ${common} r="4.6" fill="#7a8490" />`;
}

function renderLocalPreviewSvg(preview, chart) {
  const measures = Array.isArray(preview?.measures) ? preview.measures : [];
  if (!measures.length) return "";

  const width = 1180;
  const cols = 4;
  const margin = 26;
  const gap = 18;
  const measureWidth = (width - margin * 2 - gap * (cols - 1)) / cols;
  const measureHeight = 54;
  const rowGap = 12;
  const top = 86;
  const rows = Math.ceil(measures.length / cols);
  const height = top + rows * (measureHeight + rowGap) + 52;
  const title = chartTitle(chart) || "Taiko chart";
  const subtitle = `${chart.course_label || chart.course || ""}  ★${formatLoose(chart.level, 0)}  ${preview.shown_measure_count || measures.length}/${preview.measure_count || measures.length} 小节`;

  const measureSvgs = measures
    .map((measure, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = margin + col * (measureWidth + gap);
      const y = top + row * (measureHeight + rowGap);
      const laneY = y + 29;
      const notes = String(measure || "0").split("");
      const noteSvgs = notes
        .map((note, noteIndex) => {
          if (note === "0") return "";
          const noteX = x + 34 + ((measureWidth - 48) * (noteIndex + 0.5)) / Math.max(1, notes.length);
          return previewNoteSvg(note, noteX, laneY);
        })
        .join("");
      return `
        <g>
          <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${measureWidth.toFixed(1)}" height="${measureHeight}" rx="7" fill="#fffaf2" stroke="#d8c7a5" />
          <line x1="${(x + 28).toFixed(1)}" y1="${laneY}" x2="${(x + measureWidth - 14).toFixed(1)}" y2="${laneY}" stroke="#c7d0d8" stroke-width="2" />
          <text x="${(x + 10).toFixed(1)}" y="${(y + 18).toFixed(1)}" font-size="11" fill="#7b6a4a">${index + 1}</text>
          ${noteSvgs}
        </g>
      `;
    })
    .join("");

  const clippedText = preview.is_clipped ? " · 仅显示前段预览" : "";
  return `
    <svg class="local-preview-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)} 谱面预览">
      <rect width="${width}" height="${height}" fill="#f7f8fa" />
      <text x="26" y="34" font-size="22" font-weight="800" fill="#20262d">${escapeHtml(truncateText(title, 52))}</text>
      <text x="26" y="62" font-size="14" fill="#66717d">${escapeHtml(subtitle)}${escapeHtml(clippedText)}</text>
      <g>${measureSvgs}</g>
      <text x="26" y="${height - 20}" font-size="12" fill="#8a94a0">本地 TJA 解析生成：红/蓝为咚/咔，较大圆为大音符，黄/紫为连打/气球，深色菱形为连打结束。</text>
    </svg>
  `;
}

function renderPreviewImages(chart) {
  const localPreview = getLocalPreview(chart);
  if (localPreview) {
    return renderChartPreviewPlayer(localPreview, chart);
  }
  const images = Array.isArray(chart.preview_images) ? chart.preview_images.slice(0, 2) : [];
  if (!images.length) {
    return '<div class="muted-box preview-empty">暂无谱面预览</div>';
  }
  return `
    <div class="preview-images">
      ${images
        .map((image, index) => {
          const size = image.width && image.height ? `${image.width} x ${image.height}` : "谱面预览";
          const caption = image.alt || `谱面预览 ${index + 1}`;
          return `
            <figure class="preview-figure">
              <img
                src="${escapeHtml(image.url)}"
                alt="${escapeHtml(`${chartTitle(chart)} ${caption}`)}"
                loading="lazy"
                referrerpolicy="no-referrer"
                crossorigin="anonymous"
              />
              <figcaption>
                <span>${escapeHtml(caption)}</span>
                <span>${escapeHtml(size)}</span>
              </figcaption>
            </figure>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderChartModalBody(chart) {
  const f = chart.features || {};
  const localPreview = getLocalPreview(chart);
  const timing = localPreview?.timing_summary || {};
  const items = [
    ["曲名", chartTitle(chart)],
    ["原曲名", chart.title],
    ["难度", chart.course_label || chart.course],
    ["星级", formatLoose(chart.level, 0)],
    ["定数", formatLoose(chart.const, 1)],
    ["BPM", formatLoose(chart.bpm)],
    ["combo", formatLoose(chart.combo, 0)],
    ["来源", sourceLabel(chart.source, chart.needs_encoder)],
    ["复合处理", formatLoose(f.complex)],
    ["平均密度", formatLoose(f.avg_density)],
    ["瞬间密度", formatLoose(f.peak_density)],
    ["咚咔复杂度", formatLoose(f.note_type)],
    ["BPM变化", formatLoose(f.bpm_change)],
    ["HS变化", formatLoose(f.hs_change)],
    ["节奏处理", formatLoose(f.rhythm)],
    ["连打时长", formatLoose(chart.roll_time)],
    ["气球数", formatLoose(chart.balloon_num, 0)],
    ["Rating计入", chart.rating_excluded ? "不计入" : "计入"],
    ["排除原因", chart.rating_exclusion_reason || "--"],
    ["重名组", chart.duplicate_group_size > 1 ? `${chart.duplicate_index}/${chart.duplicate_group_size}` : "--"],
    ["预览来源", localPreview ? "本地 TJA 动态预览" : "--"],
    ["预览小节", localPreview ? `${localPreview.shown_measure_count}/${localPreview.measure_count}` : "--"],
    ["预览HS事件", localPreview ? formatLoose(timing.scroll_change_count, 0) : "--"],
    ["预览BPM事件", localPreview ? formatLoose(timing.bpm_change_count, 0) : "--"],
    ["预览延迟", localPreview ? `${formatLoose(timing.total_delay)}秒` : "--"],
    ["网站", chart.fumen?.url || "--"],
  ];
  return `
    <section class="modal-section">
      <h3>谱面预览</h3>
      ${renderPreviewImages(chart)}
    </section>
    <section class="modal-section">
      <h3>数值</h3>
      <div class="detail-grid">${items
        .map(([label, value]) => `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
        .join("")}</div>
    </section>
    ${renderFeedbackSection(chart)}
  `;
}

function syncModalOpenClass() {
  const hasOpenModal = [els.chartModal, els.curveModal, els.classicRuleModal, els.exportModal].some((modal) => modal && !modal.hidden);
  document.body.classList.toggle("modal-open", hasOpenModal);
}

function openChartModal(chart) {
  if (!chart || !els.chartModal) return;
  els.chartModalTitle.textContent = `${chartTitle(chart)} / ${chart.course_label || chart.course}`;
  els.chartModalBody.innerHTML = renderChartModalBody(chart);
  els.chartModal.hidden = false;
  syncModalOpenClass();
  mountChartPreviewPlayer(chart);
  loadFeedbackSummary(chart);
  els.chartModalClose?.focus();
}

function closeChartModal() {
  if (!els.chartModal || els.chartModal.hidden) return;
  destroyChartPreviewPlayer();
  els.chartModal.hidden = true;
  els.chartModalBody.innerHTML = "";
  syncModalOpenClass();
}

function openCurveModal() {
  if (!els.curveModal) return;
  els.curveModal.hidden = false;
  syncModalOpenClass();
  els.curveModalClose?.focus();
}

function closeCurveModal() {
  if (!els.curveModal || els.curveModal.hidden) return;
  els.curveModal.hidden = true;
  syncModalOpenClass();
}

function openClassicRuleModal() {
  if (!els.classicRuleModal) return;
  els.classicRuleModal.hidden = false;
  syncModalOpenClass();
  els.classicRuleModalClose?.focus();
}

function closeClassicRuleModal() {
  if (!els.classicRuleModal || els.classicRuleModal.hidden) return;
  els.classicRuleModal.hidden = true;
  syncModalOpenClass();
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
  if (pageId === "recommendPage") {
    renderRecommendations();
  }
}

function refreshRating() {
  calculateRating();
  els.fetchStatus.textContent = state.records.length ? `已刷新 ${state.records.length} 条记录` : "暂无成绩，先获取成绩";
}

function rerollRecommendations() {
  state.recommendationSeed += 1;
  renderRecommendations();
}

function updateRecommendationOption() {
  state.recommendationSeed += 1;
  syncRecommendControls();
  renderRecommendations();
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    if (!canvas.toBlob) {
      const dataUrl = canvas.toDataURL("image/png");
      const bytes = atob(dataUrl.split(",")[1] || "");
      const array = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i += 1) array[i] = bytes.charCodeAt(i);
      resolve(new Blob([array], { type: "image/png" }));
      return;
    }
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function isLikelyMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") || window.innerWidth <= 760;
}

function openExportModal(url, filename) {
  if (!els.exportModal) return;
  if (state.exportImageUrl) URL.revokeObjectURL(state.exportImageUrl);
  state.exportImageUrl = url;
  els.exportImage.src = url;
  els.exportDownloadLink.href = url;
  els.exportDownloadLink.download = filename;
  els.exportModal.hidden = false;
  syncModalOpenClass();
  els.exportDownloadLink.focus();
}

function closeExportModal() {
  if (!els.exportModal || els.exportModal.hidden) return;
  els.exportModal.hidden = true;
  els.exportImage.removeAttribute("src");
  if (state.exportImageUrl) {
    URL.revokeObjectURL(state.exportImageUrl);
    state.exportImageUrl = "";
  }
  syncModalOpenClass();
}

function downloadBlob(url, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 30_000);
}

async function exportPng() {
  calculateRating();
  if (!window.TaikoRatingImage?.renderRatingImage) {
    els.fetchStatus.textContent = "图片导出模块未载入";
    return;
  }
  if (!state.rated.length) {
    els.fetchStatus.textContent = "暂无可导出的成绩";
    return;
  }
  els.exportButton.disabled = true;
  const originalText = els.exportButton.textContent;
  els.exportButton.textContent = "生成中";
  try {
    const canvas = document.createElement("canvas");
    window.TaikoRatingImage.renderRatingImage(canvas, { allRows: state.rated, classicRows: state.rated, uraRows: state.uraRated });
    const blob = await canvasToBlob(canvas);
    if (!blob) throw new Error("PNG 生成失败");
    const filename = `taiko-rating-${Date.now()}.png`;
    const url = URL.createObjectURL(blob);
    if (isLikelyMobileDevice()) {
      openExportModal(url, filename);
      els.fetchStatus.textContent = "PNG 已生成，手机端可长按图片保存";
    } else {
      downloadBlob(url, filename);
      els.fetchStatus.textContent = "PNG 已生成";
    }
  } catch (err) {
    els.fetchStatus.textContent = err instanceof Error ? err.message : "PNG 生成失败";
  } finally {
    els.exportButton.disabled = false;
    els.exportButton.textContent = originalText;
  }
}

els.fetchButton.addEventListener("click", fetchScores);
els.curveButton?.addEventListener("click", openCurveModal);
els.classicRuleButton?.addEventListener("click", openClassicRuleModal);
els.recalculateButton.addEventListener("click", refreshRating);
els.exportButton.addEventListener("click", exportPng);
els.recommendRefreshButton?.addEventListener("click", rerollRecommendations);
els.recommendTargetSelect?.addEventListener("change", updateRecommendationOption);
els.recommendEncoderInput?.addEventListener("change", updateRecommendationOption);
els.recommendLowDifficultyInput?.addEventListener("change", updateRecommendationOption);

els.useEncoderInput.addEventListener("change", () => {
  indexChartData(state.chartData);
  updateChartStatus();
  state.selectedRatingIndex = null;
  state.chartPage = 1;
  calculateRating();
  renderChartBrowser();
  closeChartModal();
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
  openChartModal(state.chartBrowserRows[state.selectedChartIndex]);
});

els.chartModalBody?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-feedback-vote]");
  if (!button || button.disabled) return;
  const section = button.closest("[data-feedback-chart-id]");
  const row = button.closest("[data-feedback-field]");
  const chart = findChartById(section?.dataset.feedbackChartId);
  if (!chart || !row) return;
  submitFeedbackVote(chart, row.dataset.feedbackField, button.dataset.feedbackVote);
});

els.recommendTableBody?.addEventListener("click", (event) => {
  const row = event.target.closest("[data-recommend-index]");
  if (!row) return;
  const item = state.recommendationRows[Number(row.dataset.recommendIndex)];
  if (item?.chart) openChartModal(item.chart);
});

els.chartPagination?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-chart-page]");
  if (!button || button.disabled) return;
  const target = button.dataset.chartPage;
  const totalPages = Math.max(1, Math.ceil(state.chartBrowserRows.length / CHART_PAGE_SIZE));
  if (target === "prev") state.chartPage -= 1;
  else if (target === "next") state.chartPage += 1;
  else state.chartPage = Number(target);
  state.chartPage = clamp(Math.trunc(state.chartPage || 1), 1, totalPages);
  renderChartBrowser();
});

els.chartModalClose?.addEventListener("click", closeChartModal);
els.curveModalClose?.addEventListener("click", closeCurveModal);
els.classicRuleModalClose?.addEventListener("click", closeClassicRuleModal);
els.exportModalClose?.addEventListener("click", closeExportModal);

els.chartModal?.addEventListener("click", (event) => {
  if (event.target === els.chartModal) {
    closeChartModal();
  }
});

els.curveModal?.addEventListener("click", (event) => {
  if (event.target === els.curveModal) {
    closeCurveModal();
  }
});

els.classicRuleModal?.addEventListener("click", (event) => {
  if (event.target === els.classicRuleModal) {
    closeClassicRuleModal();
  }
});

els.exportModal?.addEventListener("click", (event) => {
  if (event.target === els.exportModal) {
    closeExportModal();
  }
});

els.exportOpenButton?.addEventListener("click", () => {
  const url = state.exportImageUrl;
  if (url) window.open(url, "_blank", "noopener");
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (els.exportModal && !els.exportModal.hidden) closeExportModal();
    else if (els.classicRuleModal && !els.classicRuleModal.hidden) closeClassicRuleModal();
    else if (els.curveModal && !els.curveModal.hidden) closeCurveModal();
    else closeChartModal();
  }
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
  control.addEventListener("input", resetChartBrowserPage);
  control.addEventListener("change", resetChartBrowserPage);
}

els.addFilterButton.addEventListener("click", () => {
  addFilter();
  resetChartBrowserPage();
});

els.clearFiltersButton.addEventListener("click", () => {
  state.chartFilters = [];
  renderFilterRows();
  resetChartBrowserPage();
});

els.filterRows.addEventListener("input", (event) => {
  const row = event.target.closest(".filter-row");
  if (!row) return;
  updateFilterFromRow(row);
  resetChartBrowserPage();
});

els.filterRows.addEventListener("change", (event) => {
  const row = event.target.closest(".filter-row");
  if (!row) return;
  updateFilterFromRow(row);
  resetChartBrowserPage();
});

els.filterRows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-filter]");
  if (!button) return;
  const row = button.closest(".filter-row");
  state.chartFilters = state.chartFilters.filter((filter) => filter.id !== row.dataset.filterId);
  renderFilterRows();
  resetChartBrowserPage();
});

populateControls();
syncRecommendControls();
{
  const initialPage = location.hash.slice(1);
  if (initialPage && document.getElementById(initialPage)?.classList.contains("page-panel")) {
    switchPage(initialPage);
  }
}
loadChartData();
