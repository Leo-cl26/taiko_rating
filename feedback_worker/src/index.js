const ALLOWED_ORIGINS = new Set([
  "https://mmtumr.github.io",
  "http://127.0.0.1:8000",
  "http://localhost:8000",
]);

const ALLOWED_FIELDS = new Set([
  "const",
  "complex",
  "avg_density",
  "peak_density",
  "note_type",
  "bpm_change",
  "hs_change",
  "rhythm",
]);

const ALLOWED_VOTES = new Set(["too_high", "too_low"]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://mmtumr.github.io";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(request, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(request),
    },
  });
}

function cleanText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function assertPayload(payload) {
  const chartId = cleanText(payload.chart_id, 500);
  const title = cleanText(payload.title, 200);
  const course = cleanText(payload.course, 40);
  const source = cleanText(payload.source, 40);
  const field = cleanText(payload.field, 40);
  const vote = cleanText(payload.vote, 20);
  const clientId = cleanText(payload.client_id, 80);
  const currentValue = Number(payload.current_value);

  if (!chartId || !title || !course || !clientId) {
    throw new Error("missing required fields");
  }
  if (!ALLOWED_FIELDS.has(field)) {
    throw new Error("invalid field");
  }
  if (!ALLOWED_VOTES.has(vote)) {
    throw new Error("invalid vote");
  }

  return {
    chartId,
    title,
    course,
    source,
    field,
    vote,
    clientId,
    currentValue: Number.isFinite(currentValue) ? currentValue : null,
  };
}

async function getSummary(env, chartId, clientId = "") {
  const rows = await env.DB.prepare(
    `SELECT field, vote, COUNT(*) AS count
     FROM feedback_votes
     WHERE chart_id = ?
     GROUP BY field, vote`,
  )
    .bind(chartId)
    .all();

  const summary = {};
  for (const row of rows.results || []) {
    if (!summary[row.field]) {
      summary[row.field] = { too_high: 0, too_low: 0 };
    }
    summary[row.field][row.vote] = Number(row.count || 0);
  }

  const mine = {};
  if (clientId) {
    const myRows = await env.DB.prepare(
      `SELECT field, vote
       FROM feedback_votes
       WHERE chart_id = ? AND client_id = ?`,
    )
      .bind(chartId, clientId)
      .all();
    for (const row of myRows.results || []) {
      mine[row.field] = row.vote;
    }
  }

  return { chart_id: chartId, summary, mine };
}

async function handleVote(request, env) {
  const payload = assertPayload(await request.json());
  const userAgent = cleanText(request.headers.get("User-Agent") || "", 200);

  await env.DB.prepare(
    `INSERT INTO feedback_votes
       (chart_id, title, course, source, field, vote, current_value, client_id, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chart_id, field, client_id)
     DO UPDATE SET
       title = excluded.title,
       course = excluded.course,
       source = excluded.source,
       vote = excluded.vote,
       current_value = excluded.current_value,
       user_agent = excluded.user_agent,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      payload.chartId,
      payload.title,
      payload.course,
      payload.source,
      payload.field,
      payload.vote,
      payload.currentValue,
      payload.clientId,
      userAgent,
    )
    .run();

  return getSummary(env, payload.chartId, payload.clientId);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === "/health" && request.method === "GET") {
        return jsonResponse(request, { ok: true });
      }

      if (url.pathname === "/summary" && request.method === "GET") {
        const chartId = cleanText(url.searchParams.get("chart_id"), 500);
        const clientId = cleanText(url.searchParams.get("client_id"), 80);
        if (!chartId) return jsonResponse(request, { error: "missing chart_id" }, 400);
        return jsonResponse(request, await getSummary(env, chartId, clientId));
      }

      if (url.pathname === "/vote" && request.method === "POST") {
        return jsonResponse(request, await handleVote(request, env));
      }

      return jsonResponse(request, { error: "not found" }, 404);
    } catch (err) {
      return jsonResponse(request, { error: err instanceof Error ? err.message : "unknown error" }, 400);
    }
  },
};
