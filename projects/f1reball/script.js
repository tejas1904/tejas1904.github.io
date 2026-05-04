import { initializeDatabase, runSql } from "./db.js";

const meetings = {
  1140: {
    label: "2023 Pre-Season Testing - Sakhir",
    sessions: [
      { key: "9222", label: "Practice 1" },
      { key: "7763", label: "Practice 2" },
      { key: "7764", label: "Practice 3" }
    ]
  },
  1211: {
    label: "2023 Spanish Grand Prix - Barcelona",
    sessions: [
      { key: "9095", label: "Practice 1" },
      { key: "9096", label: "Practice 2" },
      { key: "9097", label: "Practice 3" },
      { key: "9098", label: "Qualifying" },
      { key: "9102", label: "Race" }
    ]
  },
  1229: {
    label: "2024 Bahrain Grand Prix - Sakhir",
    sessions: [
      { key: "9465", label: "Practice 1" },
      { key: "9466", label: "Practice 2" },
      { key: "9467", label: "Practice 3" },
      { key: "9468", label: "Qualifying" },
      { key: "9472", label: "Race" }
    ]
  },
  1243: {
    label: "2024 Dutch Grand Prix - Zandvoort",
    sessions: [
      { key: "9575", label: "Practice 1" },
      { key: "9576", label: "Practice 2" },
      { key: "9577", label: "Practice 3" },
      { key: "9578", label: "Qualifying" },
      { key: "9582", label: "Race" }
    ]
  },
  1246: {
    label: "2024 Singapore Grand Prix - Marina Bay",
    sessions: [
      { key: "9599", label: "Practice 1" },
      { key: "9600", label: "Practice 2" },
      { key: "9601", label: "Practice 3" },
      { key: "9602", label: "Qualifying" },
      { key: "9606", label: "Race" }
    ]
  }
};

const templates = {
  driverPerformance: {
    summary: "Top speed report for a selected session, joined from drivers, sessions, meetings, and car_data.",
    sql: `SELECT
  m.meeting_name,
  s.session_name,
  s.location,
  d.driver_number,
  d.full_name,
  d.team_name,
  MAX(c.speed) AS top_speed_kmh
FROM drivers d
JOIN car_data c
  ON d.driver_number = c.driver_number
 AND d.session_key = c.session_key
JOIN sessions s
  ON d.session_key = s.session_key
JOIN meetings m
  ON s.meeting_key = m.meeting_key
WHERE s.session_key = :session_key
GROUP BY m.meeting_name, s.session_name, s.location, d.driver_number, d.full_name, d.team_name
ORDER BY top_speed_kmh DESC
LIMIT 10;`
  },
  teamComparison: {
    summary: "Team-level report for a selected race weekend, using joins and aggregation.",
    sql: `SELECT
  m.meeting_name,
  s.session_name,
  s.session_type,
  s.location,
  d.team_name,
  COUNT(DISTINCT d.driver_number) AS drivers_count,
  ROUND(AVG(c.speed)::numeric, 1) AS avg_speed_kmh,
  ROUND(MIN(p.pit_duration)::numeric, 1) AS fastest_pitstop_sec
FROM drivers d
JOIN sessions s ON d.session_key = s.session_key
JOIN meetings m ON s.meeting_key = m.meeting_key
LEFT JOIN car_data c
  ON d.driver_number = c.driver_number
 AND d.session_key = c.session_key
LEFT JOIN pit p
  ON d.driver_number = p.driver_number
 AND d.session_key = p.session_key
WHERE s.meeting_key = :meeting_key
GROUP BY m.meeting_name, s.session_name, s.session_type, s.location, d.team_name
ORDER BY s.session_type, avg_speed_kmh DESC NULLS LAST
LIMIT 20;`
  },
  weatherReview: {
    summary: "Weather condition review for a selected race weekend.",
    sql: `SELECT
  m.meeting_name,
  s.session_name,
  s.session_type,
  s.location,
  ROUND(AVG(w.track_temperature)::numeric, 1) AS avg_track_temp_c,
  ROUND(AVG(w.air_temperature)::numeric, 1) AS avg_air_temp_c,
  CASE WHEN SUM(w.rainfall) > 0 THEN 'Wet' ELSE 'Dry' END AS track_condition
FROM weather w
JOIN sessions s ON w.session_key = s.session_key
JOIN meetings m ON w.meeting_key = m.meeting_key
WHERE s.meeting_key = :meeting_key
GROUP BY m.meeting_name, s.session_name, s.session_type, s.location
ORDER BY s.session_name;`
  },
  tyreStrategy: {
    summary: "Tyre strategy report using stint data and driver/session joins.",
    sql: `SELECT
  m.meeting_name,
  s.session_name,
  d.full_name,
  d.team_name,
  STRING_AGG(
    CASE
      WHEN st.compound = 'SOFT' THEN 'S'
      WHEN st.compound = 'MEDIUM' THEN 'M'
      WHEN st.compound = 'HARD' THEN 'H'
      WHEN st.compound = 'INTERMEDIATE' THEN 'I'
      WHEN st.compound = 'WET' THEN 'W'
      ELSE COALESCE(st.compound, 'UNKNOWN')
    END,
    '-' ORDER BY st.stint_number
  ) AS tyre_strategy,
  COUNT(*) AS stint_count,
  ROUND(AVG(st.lap_end - st.lap_start + 1)::numeric, 1) AS avg_stint_length
FROM stints st
JOIN drivers d
  ON st.driver_number = d.driver_number
 AND st.session_key = d.session_key
JOIN sessions s ON st.session_key = s.session_key
JOIN meetings m ON st.meeting_key = m.meeting_key
WHERE st.meeting_key = :meeting_key
  AND st.compound IS NOT NULL
  AND st.compound <> ''
GROUP BY m.meeting_name, s.session_name, d.full_name, d.team_name
ORDER BY stint_count DESC, d.full_name
LIMIT 15;`
  },
  pitEfficiency: {
    summary: "Fastest pit stop observations for a selected race weekend.",
    sql: `SELECT
  m.meeting_name,
  s.session_name,
  d.full_name,
  d.team_name,
  p.lap_number,
  ROUND(p.pit_duration::numeric, 1) AS pit_duration_sec
FROM pit p
JOIN drivers d
  ON p.driver_number = d.driver_number
 AND p.session_key = d.session_key
JOIN sessions s ON p.session_key = s.session_key
JOIN meetings m ON p.meeting_key = m.meeting_key
WHERE p.meeting_key = :meeting_key
ORDER BY p.pit_duration ASC
LIMIT 10;`
  },
  dataQuality: {
    summary: "Data quality checks generated directly from the loaded database tables.",
    sql: `SELECT 'car_data' AS table_name, COUNT(*) AS records, COUNT(*) FILTER (WHERE speed IS NULL) AS key_missing_or_null, 'speed/rpm range checks' AS qc_focus
FROM car_data
UNION ALL
SELECT 'race_control', COUNT(*), COUNT(*) FILTER (WHERE message IS NULL OR message = ''), 'message completeness and nullable driver/lap handling'
FROM race_control
UNION ALL
SELECT 'weather', COUNT(*), COUNT(*) FILTER (WHERE track_temperature IS NULL), 'temperature and rainfall validity'
FROM weather
UNION ALL
SELECT 'stints', COUNT(*), COUNT(*) FILTER (WHERE compound IS NULL OR compound = ''), 'lap range and tyre compound validity'
FROM stints
UNION ALL
SELECT 'drivers', COUNT(*), COUNT(*) FILTER (WHERE session_key IS NULL OR meeting_key IS NULL), 'country/team/session references'
FROM drivers;`
  }
};

const sqlEditor = document.querySelector("#sqlEditor");
const templateSelect = document.querySelector("#templateSelect");
const resultSummary = document.querySelector("#resultSummary");
const rowCount = document.querySelector("#rowCount");
const resultTable = document.querySelector("#resultTable");
const meetingKey = document.querySelector("#meetingKey");
const sessionKey = document.querySelector("#sessionKey");
const meetingKeyHelp = document.querySelector("#meetingKeyHelp");
const sessionKeyHelp = document.querySelector("#sessionKeyHelp");
const dbStatus = document.querySelector("#dbStatus");
const loadTemplateButton = document.querySelector("#loadTemplate");
const runQueryButton = document.querySelector("#runQuery");

let databaseReady = false;

function updateSessionOptions() {
  const currentMeeting = meetings[meetingKey.value];
  sessionKey.innerHTML = currentMeeting.sessions
    .map((session) => `<option value="${session.key}">${session.label} (${session.key})</option>`)
    .join("");
  updateKeyHelp();
}

function updateKeyHelp() {
  const currentMeeting = meetings[meetingKey.value];
  const currentSession = currentMeeting.sessions.find((session) => session.key === sessionKey.value);
  meetingKeyHelp.textContent = `meeting_key ${meetingKey.value} maps to ${currentMeeting.label}.`;
  sessionKeyHelp.textContent = `session_key ${sessionKey.value} maps to ${currentSession.label} in this race weekend.`;
}

function fillParameters(sql) {
  return sql
    .replaceAll(":session_key", sessionKey.value || "9465")
    .replaceAll(":meeting_key", meetingKey.value || "1229");
}

function loadTemplate() {
  const template = templates[templateSelect.value];
  sqlEditor.value = fillParameters(template.sql);
  resultSummary.textContent = template.summary;
  if (databaseReady) {
    executeCurrentQuery();
  }
}

async function executeCurrentQuery() {
  const sql = sqlEditor.value.trim();
  if (!sql) {
    renderMessage("Enter a SQL query or load a template.", "0 rows");
    return;
  }

  setBusy(true, "Running SQL query...");

  try {
    const result = await runSql(sql);
    renderResults(result.rows || [], result.affectedRows);
    resultSummary.textContent = templates[templateSelect.value]?.summary || "Custom SQL query completed.";
  } catch (error) {
    renderError(error);
  } finally {
    setBusy(false, "Database ready. Real SQL queries are enabled.");
  }
}

function renderResults(rows, affectedRows) {
  if (!rows.length) {
    const affected = Number.isInteger(affectedRows) ? `${affectedRows} affected row${affectedRows === 1 ? "" : "s"}` : "0 rows";
    renderMessage("Query completed. No result rows returned.", affected);
    return;
  }

  rowCount.textContent = `${rows.length} row${rows.length === 1 ? "" : "s"}`;
  const columns = Object.keys(rows[0]);
  const header = columns.map((column) => `<th scope="col">${formatLabel(column)}</th>`).join("");
  const body = rows.map((row) => {
    const cells = columns.map((column) => `<td>${formatCell(row[column])}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  resultTable.innerHTML = `
    <table class="table table-sm table-striped align-middle">
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function renderMessage(message, countText) {
  rowCount.textContent = countText;
  resultTable.innerHTML = `<div class="text-secondary small">${message}</div>`;
}

function renderError(error) {
  rowCount.textContent = "SQL error";
  resultSummary.textContent = "The database returned an error. Check the SQL syntax or selected fields.";
  resultTable.innerHTML = `<pre class="error-box mb-0">${escapeHtml(error.message)}</pre>`;
}

function formatLabel(value) {
  return value.replaceAll("_", " ");
}

function formatCell(value) {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return value.toISOString();
  return escapeHtml(String(value));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setBusy(isBusy, statusText) {
  runQueryButton.disabled = isBusy || !databaseReady;
  loadTemplateButton.disabled = isBusy;
  dbStatus.textContent = statusText;
  dbStatus.classList.toggle("loading", isBusy);
}

function handleDatabaseProgress(message) {
  dbStatus.textContent = message;
}

async function boot() {
  updateSessionOptions();
  loadTemplate();
  runQueryButton.disabled = true;
  loadTemplateButton.disabled = true;

  try {
    await initializeDatabase(handleDatabaseProgress);
    databaseReady = true;
    loadTemplateButton.disabled = false;
    runQueryButton.disabled = false;
    loadTemplate();
  } catch (error) {
    dbStatus.textContent = "Database failed to load.";
    renderError(error);
  }
}

loadTemplateButton.addEventListener("click", loadTemplate);
runQueryButton.addEventListener("click", executeCurrentQuery);
templateSelect.addEventListener("change", loadTemplate);
meetingKey.addEventListener("change", () => {
  updateSessionOptions();
  loadTemplate();
});
sessionKey.addEventListener("change", () => {
  updateKeyHelp();
  loadTemplate();
});

boot();
