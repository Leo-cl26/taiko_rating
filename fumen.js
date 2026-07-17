const FUMEN_DATA_VERSION = "20260717-audio-playback-v1";
const COURSE_ORDER = { Easy: 1, Normal: 2, Hard: 3, Oni: 4, Edit: 5 };
const COURSE_COLORS = { Easy: "#e53935", Normal: "#8cac53", Hard: "#414a2c", Oni: "#db1685", Edit: "#7232db" };

const fumenState = {
  previews: new Map(),
  audioConfig: { base_url: "" },
  audioManifest: { objects: {} },
  songKey: "",
  songCharts: [],
  selectedChart: null,
  player: null,
};

const fumenEls = {
  loading: document.getElementById("fumenLoading"),
  error: document.getElementById("fumenError"),
  content: document.getElementById("fumenContent"),
};

function clamp(value, lower, upper) {
  return Math.min(upper, Math.max(lower, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replaceAll("♡", "")
    .replaceAll("～", "~")
    .replaceAll("・", "")
    .replace(/\(裏\)|（裏）|\bura\b|\bedit\b/giu, "")
    .replace(/[^0-9a-z\u3040-\u30ff\u3400-\u9fff]+/giu, "");
}

function chartTitle(chart) {
  return String(chart?.display_title || chart?.title || "").replace(/\s+·\s+\d{2}\s+[^·]+$/u, "").trim();
}

function formatNumber(value, digits = 1) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : "--";
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function selectedPreview() {
  return fumenState.previews.get(fumenState.selectedChart?.id) || null;
}

async function fetchJson(path, fallback = null) {
  const response = await fetch(`${path}?v=${FUMEN_DATA_VERSION}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} 返回 HTTP ${response.status}`);
  const payload = await response.json();
  return payload ?? fallback;
}

function findSongCharts(charts, songKey) {
  const exact = charts.filter((chart) => String(chart.title_normalized || "") === songKey);
  const fallback = exact.length
    ? exact
    : charts.filter((chart) => normalizeTitle(chart.title) === songKey || normalizeTitle(chart.display_title) === songKey);
  const sourceRank = { excel: 3, fumen: 2, encoder: 1 };
  const bestByCourse = new Map();
  for (const chart of fallback.filter((item) => item?.id)) {
    const current = bestByCourse.get(chart.course);
    const currentRank = sourceRank[current?.source] || 0;
    const nextRank = sourceRank[chart.source] || 0;
    const shouldReplace = !current
      || nextRank > currentRank
      || (nextRank === currentRank && Number(chart.duplicate_index || 1) < Number(current.duplicate_index || 1));
    if (shouldReplace) bestByCourse.set(chart.course, chart);
  }
  return [...bestByCourse.values()]
    .sort((left, right) => {
      const levelOrder = (COURSE_ORDER[left.course] || 99) - (COURSE_ORDER[right.course] || 99);
      if (levelOrder) return levelOrder;
      return Number(left.const || 0) - Number(right.const || 0);
    });
}

function showError(message) {
  fumenEls.loading.hidden = true;
  fumenEls.content.hidden = true;
  fumenEls.error.hidden = false;
  fumenEls.error.innerHTML = `${escapeHtml(message)}<a class="button-link" href="./">返回 Taiko Rating</a>`;
}

function audioUrl(audio) {
  const base = String(fumenState.audioConfig?.base_url || "").trim();
  const sourcePath = String(audio?.path || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!base || !sourcePath) return "";
  try {
    const mapped = fumenState.audioManifest?.objects?.[sourcePath];
    const objectPath = String(mapped?.key || sourcePath).replaceAll("\\", "/").replace(/^\/+/, "");
    const baseUrl = new URL(`${base.replace(/\/+$/, "")}/`);
    if (window.location.protocol === "https:" && baseUrl.protocol !== "https:") return "";
    const encodedPath = objectPath.split("/").map((part) => encodeURIComponent(part)).join("/");
    return new URL(encodedPath, baseUrl).href;
  } catch {
    return "";
  }
}

function audioAvailabilityNote(audio, source) {
  if (!audio) return "该谱面未声明可用的音源。";
  const base = String(fumenState.audioConfig?.base_url || "").trim();
  if (!base) return "音源等待部署；谱面仍可无音乐播放。";
  if (window.location.protocol === "https:" && base.startsWith("http://")) {
    return "音源 CDN 尚未启用 HTTPS；为避免混合内容，音乐暂不加载。";
  }
  if (!source) return "音源映射尚未生成；谱面仍可无音乐播放。";
  return `音画同步已启用${Number(audio.offset) ? `（TJA OFFSET ${Number(audio.offset).toFixed(3)}s）` : ""}`;
}

function renderSongPage(preserveTime = 0) {
  const chart = fumenState.selectedChart;
  const preview = selectedPreview();
  if (!chart || !preview) {
    showError("该歌曲暂时没有可播放的本地 TJA 谱面数据。");
    return;
  }
  const audio = preview.audio || null;
  const audioSource = audioUrl(audio);
  const title = chartTitle(chart);
  const tabs = fumenState.songCharts
    .map((item) => {
      const active = item.id === chart.id;
      const color = COURSE_COLORS[item.course] || "#4d4743";
      return `<button class="fumen-difficulty${active ? " is-active" : ""}" type="button" data-chart-id="${escapeHtml(item.id)}" style="--difficulty-color:${color}">
        <span>${escapeHtml(item.course_label || item.course)}</span>
        <strong>${formatNumber(item.const)}</strong>
      </button>`;
    })
    .join("");
  const ability = chart.v4 || {};
  const dimensions = [
    ["体力", ability.stamina],
    ["读谱", ability.reading],
    ["爆发", ability.burst],
    ["节奏", ability.rhythm],
    ["复合", ability.complex],
  ]
    .map(([label, value]) => `<div><span>${label}</span><strong>${formatNumber(value, 2)}</strong></div>`)
    .join("");
  const audioNote = audioAvailabilityNote(audio, audioSource);

  fumenEls.content.innerHTML = `
    <section class="fumen-hero">
      <p class="fumen-kicker">本地 TJA 谱面播放器</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(chart.ese?.category || "太鼓之达人")}</p>
      <div class="fumen-meta">
        <span>定数 <strong>${formatNumber(chart.const)}</strong></span>
        <span>${escapeHtml(chart.course_label || chart.course)} ★${escapeHtml(chart.level ?? "--")}</span>
        <span>BPM ${formatNumber(chart.bpm, 0)}</span>
        <span>${formatNumber(chart.combo, 0)} Combo</span>
      </div>
    </section>
    <nav class="fumen-difficulties" aria-label="选择难度">${tabs}</nav>
    <section class="fumen-player-card">
      <div class="fumen-player-head">
        <div>
          <h2>${escapeHtml(chart.course_label || chart.course)}谱面</h2>
          <p data-audio-status>${escapeHtml(audioNote)}</p>
        </div>
        <span class="fumen-source-badge">${escapeHtml(preview.source || "local_tja")}</span>
      </div>
      <div class="chart-player fumen-chart-player" data-chart-player>
        <canvas class="chart-player-canvas" data-chart-canvas aria-label="${escapeHtml(title)} ${escapeHtml(chart.course_label || chart.course)} 动态谱面"></canvas>
        <div class="chart-player-controls fumen-player-controls">
          <button type="button" data-chart-play>播放</button>
          <input data-chart-progress type="range" min="0" max="1000" value="0" aria-label="播放进度" />
          <span class="chart-player-time" data-chart-time>0:00 / 0:00</span>
          <select data-chart-speed aria-label="播放速度">
            <option value="0.75">0.75x</option><option value="1" selected>1x</option><option value="1.5">1.5x</option><option value="2">2x</option>
          </select>
          <button type="button" data-chart-reset>重置</button>
        </div>
        ${audioSource ? `<audio class="fumen-audio" data-chart-audio controls preload="metadata" src="${escapeHtml(audioSource)}"></audio>` : ""}
      </div>
    </section>
    <section class="fumen-info-grid">
      <article><h2>谱面五维</h2><div class="fumen-abilities">${dimensions}</div></article>
      <article><h2>播放说明</h2><p>红、蓝分别为咚、咔；较大圆为大音符；黄色和紫色为连打与气球，深色菱形表示连打结束。各音符保持自身的 BPM 与 HS 流速，因此同屏混合流速会分别呈现。</p><p>播放速度会同时作用于音乐与谱面。切换难度时会保留当前播放时间。</p></article>
    </section>
  `;
  fumenEls.loading.hidden = true;
  fumenEls.error.hidden = true;
  fumenEls.content.hidden = false;
  for (const button of fumenEls.content.querySelectorAll("[data-chart-id]")) {
    button.addEventListener("click", () => {
      const next = fumenState.songCharts.find((item) => item.id === button.dataset.chartId);
      if (!next || next.id === fumenState.selectedChart?.id) return;
      const currentTime = fumenState.player?.currentTime || 0;
      destroyPlayer();
      fumenState.selectedChart = next;
      renderSongPage(currentTime);
    });
  }
  mountPlayer(chart, preview, preserveTime);
}

function parseBalloonCounts(chart) {
  return String(chart?.ese?.balloon_declared ?? chart?.balloon_declared ?? "")
    .split(/[,\s/;|]+/u)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function buildTimeline(preview, chart) {
  const measures = Array.isArray(preview?.measures) ? preview.measures : [];
  const baseBpm = Number(chart?.bpm) > 0 ? Number(chart.bpm) : 120;
  const defaultDuration = (60 / baseBpm) * 4;
  const timings = Array.isArray(preview?.measure_timings) ? preview.measure_timings : null;
  const segmentTimings = preview?.segment_timings && typeof preview.segment_timings === "object" ? preview.segment_timings : {};
  const events = [];
  const lines = [];
  const balloons = parseBalloonCounts(chart);
  let balloonIndex = 0;
  let time = 0;

  const addEvents = (chars, measure, segment) => {
    const start = clamp(Number(segment[0] ?? 0), 0, chars.length);
    const end = clamp(Number(segment[1] ?? chars.length), start, chars.length);
    const startTime = Number(segment[2] ?? 0);
    const duration = Math.max(0, Number(segment[4] ?? 0));
    const length = Math.max(1, end - start);
    for (let index = start; index < end; index += 1) {
      const type = chars[index];
      if (type === "0") continue;
      const balloon = type === "7" || type === "9";
      events.push({
        type,
        time: startTime + duration * ((index - start) / length),
        measure: measure + 1,
        bpm: Number(segment[6] ?? baseBpm),
        scroll: Number(segment[7] ?? 1),
        balloonCount: balloon ? (balloons[balloonIndex++] ?? null) : null,
      });
    }
  };

  measures.forEach((measure, index) => {
    const chars = String(measure || "0").split("");
    const timing = timings?.[index];
    const startTime = Array.isArray(timing) ? Number(timing[0] ?? time) : time;
    const duration = Array.isArray(timing) ? Number(timing[2] ?? defaultDuration) : defaultDuration;
    const bpm = Array.isArray(timing) ? Number(timing[4] ?? baseBpm) : baseBpm;
    const scroll = Array.isArray(timing) ? Number(timing[5] ?? 1) : 1;
    lines.push({ time: startTime, index: index + 1, barline: !Array.isArray(timing) || Number(timing[6] ?? 1) !== 0, bpm, scroll });
    const segments = Array.isArray(segmentTimings[String(index)])
      ? segmentTimings[String(index)]
      : [[0, chars.length, startTime, 0, duration, 0, bpm, scroll]];
    for (const segment of segments) addEvents(chars, index, segment);
    time = startTime + duration;
  });
  lines.push({ time, index: measures.length + 1, barline: true, bpm: baseBpm, scroll: 1 });
  events.sort((left, right) => left.time - right.time);

  const rolls = [];
  let open = null;
  for (const event of events) {
    if (["5", "6", "7", "9"].includes(event.type)) {
      if (open) rolls.push({ ...open, endTime: event.time, endBpm: event.bpm, endScroll: event.scroll });
      open = { type: event.type, startTime: event.time, bpm: event.bpm, scroll: event.scroll };
    } else if (event.type === "8" && open) {
      rolls.push({ ...open, endTime: Math.max(event.time, open.startTime), endBpm: event.bpm, endScroll: event.scroll });
      open = null;
    }
  }
  if (open) rolls.push({ ...open, endTime: Math.min(time, open.startTime + defaultDuration * 2), endBpm: open.bpm, endScroll: open.scroll });
  return { events, lines, rolls, totalTime: Math.max(time, 1), baseBpm, measureCount: measures.length, summary: preview?.timing_summary || {} };
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  if (typeof ctx.roundRect === "function") return ctx.roundRect(x, y, width, height, r);
  ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r); ctx.arcTo(x + width, y + height, x, y + height, r); ctx.arcTo(x, y + height, x, y, r); ctx.arcTo(x, y, x + width, y, r);
}

function drawNote(ctx, type, x, y, scale, balloonCount, normalRadius) {
  const value = String(type);
  const large = ["3", "4", "6", "7", "9"].includes(value);
  const radius = (large ? normalRadius * 1.36 : normalRadius) * scale;
  const color = (value === "1" || value === "3") ? ["#e5484d", "#8f1f24"] : (value === "2" || value === "4") ? ["#3584e4", "#174d8d"] : (value === "5" || value === "6") ? ["#f0b429", "#9f6b00"] : (value === "7" || value === "9") ? ["#f2c94c", "#9f6b00"] : null;
  if (color) {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = color[0]; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = color[1]; ctx.stroke();
    if (value === "1" || value === "2" || value === "3" || value === "4" || value === "7" || value === "9") { ctx.beginPath(); ctx.arc(x - radius * .25, y - radius * .28, radius * .27, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,.4)"; ctx.fill(); }
    if ((value === "7" || value === "9") && Number(balloonCount) > 0) { const label = String(Math.round(Number(balloonCount))); const size = Math.max(12, radius * (label.length >= 3 ? 1.5 : label.length === 2 ? 1.86 : 2.18)); ctx.fillStyle = "#4d3200"; ctx.font = `900 ${size}px "Microsoft YaHei", sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(label, x, y); }
    return;
  }
  if (value === "8") { const r = normalRadius * 1.08 * scale; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fillStyle = "#3d4650"; ctx.fill(); }
}

function drawFrame(player) {
  const { ctx, width, height, timeline, chart } = player;
  const laneY = Math.round(height * .56), judgeX = Math.max(112, Math.round(width * .16)), spawnX = width + 68;
  const baseSpeed = (spawnX - judgeX) / player.baseLeadTime;
  const factor = (item) => (Number(item?.bpm) > 0 ? Number(item.bpm) / player.baseBpm : 1) * (Number.isFinite(Number(item?.scroll)) ? Math.max(.02, Math.abs(Number(item.scroll))) : 1);
  const xAt = (item, key = "time") => judgeX + (Number(item?.[key] ?? 0) - player.currentTime) * baseSpeed * factor(item);
  const normalRadius = Math.max(2, ((15 / player.baseBpm) * baseSpeed) / 2 - 1);
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = "#f6f8fb"; ctx.fillRect(0, 0, width, height); ctx.fillStyle = "#fff"; ctx.fillRect(14, 14, width - 28, height - 28); ctx.strokeStyle = "#d9dee5"; ctx.strokeRect(14, 14, width - 28, height - 28);
  ctx.fillStyle = "#20252b"; ctx.font = "700 18px 'Microsoft YaHei', sans-serif"; ctx.fillText(chartTitle(chart), 28, 42);
  ctx.fillStyle = "#66717d"; ctx.font = "13px 'Microsoft YaHei', sans-serif"; ctx.fillText(`${chart.course_label || chart.course}  ★${chart.level ?? "--"}  BPM ${formatNumber(timeline.baseBpm, 0)}  ${timeline.measureCount} 小节  HS ${timeline.summary.scroll_change_count || 0} / BPM ${timeline.summary.bpm_change_count || 0}`, 28, 64);
  ctx.fillStyle = "#fff8ea"; ctx.fillRect(judgeX, laneY - 32, width - judgeX - 24, 64); ctx.strokeStyle = "#d8c7a5"; ctx.strokeRect(judgeX, laneY - 32, width - judgeX - 24, 64); ctx.beginPath(); ctx.moveTo(judgeX, laneY); ctx.lineTo(width - 24, laneY); ctx.strokeStyle = "#b9c5cf"; ctx.lineWidth = 3; ctx.stroke();
  for (const line of timeline.lines) { if (!line.barline) continue; const x = xAt(line); if (x < judgeX - 80 || x > spawnX + 80) continue; ctx.beginPath(); ctx.moveTo(x, laneY - 35); ctx.lineTo(x, laneY + 35); ctx.strokeStyle = line.index % 4 === 1 ? "rgba(36,111,146,.38)" : "rgba(102,113,125,.22)"; ctx.lineWidth = line.index % 4 === 1 ? 2 : 1; ctx.stroke(); if (line.index % 8 === 1) { ctx.fillStyle = "#7b8794"; ctx.font = "11px 'Microsoft YaHei', sans-serif"; ctx.fillText(String(line.index), x + 4, laneY - 42); } }
  for (const roll of timeline.rolls) { const x1 = xAt(roll, "startTime"); const x2 = xAt({ time: roll.endTime, bpm: roll.endBpm, scroll: roll.endScroll }); const left = Math.max(judgeX - 12, Math.min(x1, x2)), right = Math.min(width - 24, Math.max(x1, x2)); if (right <= judgeX - 12 || left >= width - 24) continue; ctx.beginPath(); roundedRect(ctx, left, laneY - 12, Math.max(1, right - left), 24, 12); ctx.fillStyle = "rgba(240,180,41,.36)"; ctx.fill(); ctx.strokeStyle = "rgba(159,107,0,.58)"; ctx.lineWidth = 1.4; ctx.stroke(); }
  ctx.beginPath(); ctx.arc(judgeX, laneY, 24, 0, Math.PI * 2); ctx.fillStyle = "#f7fafc"; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = "#20252b"; ctx.stroke(); ctx.beginPath(); ctx.arc(judgeX, laneY, 13, 0, Math.PI * 2); ctx.strokeStyle = "#c84632"; ctx.lineWidth = 2; ctx.stroke();
  for (const event of timeline.events) { const x = xAt(event); if (x < judgeX - 48 || x > width + 48) continue; const age = player.currentTime - event.time; const scale = age > 0 ? Math.max(.72, 1 - age * .7) : 1; ctx.globalAlpha = age > 0 ? Math.max(.2, 1 - age * 1.8) : 1; drawNote(ctx, event.type, x, laneY, scale, event.balloonCount, normalRadius); ctx.globalAlpha = 1; }
  const barX = 28, barY = height - 34, barW = width - 56; ctx.fillStyle = "#e7edf3"; ctx.fillRect(barX, barY, barW, 6); ctx.fillStyle = "#246f92"; ctx.fillRect(barX, barY, barW * clamp(player.currentTime / timeline.totalTime, 0, 1), 6);
}

function updateControls(player) {
  player.playButton.textContent = player.playing ? "暂停" : "播放";
  player.progress.value = String(Math.round(player.currentTime / player.timeline.totalTime * 1000));
  player.timeLabel.textContent = `${formatTime(player.currentTime)} / ${formatTime(player.timeline.totalTime)}`;
}

function setPlayerTime(player, seconds) {
  player.currentTime = clamp(Number(seconds) || 0, 0, player.timeline.totalTime);
  if (player.audio && Number.isFinite(player.audio.duration)) player.audio.currentTime = clamp(player.currentTime - player.audioOffset, 0, player.audio.duration);
  updateControls(player); drawFrame(player);
}

function stopPlayer(player) {
  player.playing = false;
  if (player.frame) cancelAnimationFrame(player.frame);
  player.frame = null; player.lastFrame = null; updateControls(player);
}

function startPlayer(player) {
  if (player.playing) return;
  if (player.currentTime >= player.timeline.totalTime) setPlayerTime(player, 0);
  player.playing = true; player.lastFrame = null; updateControls(player);
  const step = (now) => {
    if (!player.playing) return;
    if (player.audio && !player.audio.paused) player.currentTime = clamp(player.audio.currentTime + player.audioOffset, 0, player.timeline.totalTime);
    else if (!player.audio && player.lastFrame != null) player.currentTime = Math.min(player.timeline.totalTime, player.currentTime + (now - player.lastFrame) / 1000 * player.speed);
    player.lastFrame = now; updateControls(player); drawFrame(player);
    if (player.currentTime >= player.timeline.totalTime) { if (player.audio) player.audio.pause(); stopPlayer(player); return; }
    player.frame = requestAnimationFrame(step);
  };
  player.frame = requestAnimationFrame(step);
}

function destroyPlayer() {
  const player = fumenState.player;
  if (!player) return;
  stopPlayer(player); player.cleanup?.(); fumenState.player = null;
}

function mountPlayer(chart, preview, preserveTime) {
  const root = fumenEls.content.querySelector("[data-chart-player]");
  const canvas = root?.querySelector("[data-chart-canvas]"), playButton = root?.querySelector("[data-chart-play]"), resetButton = root?.querySelector("[data-chart-reset]"), progress = root?.querySelector("[data-chart-progress]"), speedInput = root?.querySelector("[data-chart-speed]"), timeLabel = root?.querySelector("[data-chart-time]"), audio = root?.querySelector("[data-chart-audio]"), audioStatus = fumenEls.content.querySelector("[data-audio-status]");
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx || !playButton || !resetButton || !progress || !speedInput || !timeLabel) return;
  const player = { chart, canvas, ctx, playButton, resetButton, progress, speedInput, timeLabel, audio, timeline: buildTimeline(preview, chart), currentTime: 0, speed: 1, playing: false, frame: null, lastFrame: null, baseLeadTime: 2.2, baseBpm: 180, logicalWidth: 960, logicalHeight: 260, width: 960, height: 260, audioOffset: Number(preview.audio?.offset) || 0, cleanup: null };
  const resize = () => { const rect = canvas.getBoundingClientRect(), displayWidth = Math.max(1, rect.width || player.logicalWidth), displayHeight = Math.max(1, rect.height || player.logicalHeight), dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.round(displayWidth * dpr); canvas.height = Math.round(displayHeight * dpr); const scale = Math.min(displayWidth / player.logicalWidth, displayHeight / player.logicalHeight); ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0); drawFrame(player); };
  const toggle = async () => { if (player.playing) { if (audio) audio.pause(); stopPlayer(player); return; } if (audio) { audio.playbackRate = player.speed; try { await audio.play(); } catch { audioStatus.textContent = "音乐无法开始播放（请检查音源地址、网络或浏览器自动播放限制）；已切换为无音乐谱面预览。"; player.audio = null; startPlayer(player); } } else startPlayer(player); };
  const reset = () => { if (audio) audio.pause(); stopPlayer(player); setPlayerTime(player, 0); };
  const scrub = () => setPlayerTime(player, Number(progress.value) / 1000 * player.timeline.totalTime);
  const setSpeed = () => { player.speed = Number(speedInput.value) || 1; if (audio) audio.playbackRate = player.speed; };
  playButton.addEventListener("click", toggle); resetButton.addEventListener("click", reset); progress.addEventListener("input", scrub); speedInput.addEventListener("change", setSpeed); window.addEventListener("resize", resize);
  if (audio) { audio.addEventListener("play", () => startPlayer(player)); audio.addEventListener("pause", () => stopPlayer(player)); audio.addEventListener("loadedmetadata", () => setPlayerTime(player, preserveTime)); audio.addEventListener("error", () => { audioStatus.textContent = "音乐源加载失败；可继续使用无音乐谱面预览。"; if (player.playing) stopPlayer(player); player.audio = null; }); }
  player.cleanup = () => { playButton.removeEventListener("click", toggle); resetButton.removeEventListener("click", reset); progress.removeEventListener("input", scrub); speedInput.removeEventListener("change", setSpeed); window.removeEventListener("resize", resize); if (audio) audio.pause(); };
  fumenState.player = player; resize(); setPlayerTime(player, preserveTime);
}

async function initializeFumenPage() {
  const songKey = new URLSearchParams(window.location.search).get("song")?.trim() || "";
  if (!songKey) { showError("缺少歌曲参数。请从 Bot 的 /查歌 结果或网页谱面详情进入。\n"); return; }
  try {
    const [index, config] = await Promise.all([
      fetchJson("data/song_preview_index.json", { songs: {} }),
      fetchJson("data/audio_config.json", { base_url: "" }).catch(() => ({ base_url: "" })),
    ]);
    const entry = index?.songs?.[songKey];
    if (!entry?.file) { showError(`找不到“${songKey}”对应的可预览歌曲。`); return; }
    const page = await fetchJson(`data/song_previews/${encodeURIComponent(entry.file)}`, { charts: [] });
    const pageCharts = Array.isArray(page?.charts) ? page.charts : [];
    fumenState.previews = new Map(pageCharts.map((item) => [item?.chart?.id, item?.preview]).filter(([id, preview]) => id && preview));
    fumenState.audioConfig = config && typeof config === "object" ? config : { base_url: "" };
    const manifestPath = String(fumenState.audioConfig.manifest_url || "").trim();
    if (manifestPath) {
      fumenState.audioManifest = await fetchJson(manifestPath, { objects: {} }).catch(() => ({ objects: {} }));
    }
    fumenState.songKey = songKey;
    fumenState.songCharts = findSongCharts(pageCharts.map((item) => item?.chart).filter(Boolean), songKey).filter((chart) => fumenState.previews.has(chart.id));
    if (!fumenState.songCharts.length) { showError(`找不到“${songKey}”对应的可预览歌曲。`); return; }
    fumenState.selectedChart = fumenState.songCharts.find((chart) => chart.course === "Oni") || fumenState.songCharts[0];
    document.title = `${chartTitle(fumenState.selectedChart)} · 谱面预览 · Taiko Rating`;
    renderSongPage();
  } catch (error) {
    showError(`谱面数据载入失败：${error instanceof Error ? error.message : "未知错误"}`);
  }
}

initializeFumenPage();
