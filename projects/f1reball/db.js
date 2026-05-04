import { PGlite } from "https://cdn.jsdelivr.net/npm/@electric-sql/pglite/dist/index.js";

const csvFiles = [
  "seasons",
  "country",
  "circuit",
  "meetings",
  "sessions",
  "drivers",
  "f1_race_schedules",
  "weather",
  "pit",
  "stints",
  "race_control",
  "car_data"
];

const schemaSql = `
  CREATE TABLE seasons (
    season INTEGER,
    url TEXT
  );

  CREATE TABLE country (
    country_key INTEGER,
    country_code TEXT,
    country_name TEXT
  );

  CREATE TABLE circuit (
    circuit_key INTEGER,
    circuit_short_name TEXT
  );

  CREATE TABLE meetings (
    meeting_key INTEGER,
    meeting_name TEXT,
    meeting_official_name TEXT,
    location TEXT,
    country_key INTEGER,
    circuit_key INTEGER,
    date_start TIMESTAMPTZ,
    gmt_offset TEXT,
    year INTEGER,
    meeting_code TEXT
  );

  CREATE TABLE sessions (
    session_key INTEGER,
    location TEXT,
    session_type TEXT,
    session_name TEXT,
    date_start TIMESTAMPTZ,
    date_end TIMESTAMPTZ,
    gmt_offset TEXT,
    meeting_key INTEGER,
    year INTEGER,
    country_key INTEGER,
    circuit_key INTEGER
  );

  CREATE TABLE drivers (
    driver_number INTEGER,
    broadcast_name TEXT,
    full_name TEXT,
    name_acronym TEXT,
    team_name TEXT,
    team_colour TEXT,
    first_name TEXT,
    last_name TEXT,
    headshot_url TEXT,
    country_code TEXT,
    session_key INTEGER,
    meeting_key INTEGER
  );

  CREATE TABLE f1_race_schedules (
    season INTEGER,
    round INTEGER,
    raceName TEXT,
    circuitName TEXT,
    locality TEXT,
    country TEXT,
    date DATE,
    time TIME,
    url TEXT
  );

  CREATE TABLE weather (
    air_temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    pressure DOUBLE PRECISION,
    rainfall DOUBLE PRECISION,
    track_temperature DOUBLE PRECISION,
    wind_direction INTEGER,
    wind_speed DOUBLE PRECISION,
    date TIMESTAMPTZ,
    session_key INTEGER,
    meeting_key INTEGER
  );

  CREATE TABLE pit (
    pit_duration DOUBLE PRECISION,
    lap_number DOUBLE PRECISION,
    driver_number INTEGER,
    date TIMESTAMPTZ,
    session_key INTEGER,
    meeting_key INTEGER
  );

  CREATE TABLE stints (
    meeting_key INTEGER,
    session_key INTEGER,
    stint_number INTEGER,
    driver_number DOUBLE PRECISION,
    lap_start INTEGER,
    lap_end INTEGER,
    compound TEXT,
    tyre_age_at_start DOUBLE PRECISION
  );

  CREATE TABLE race_control (
    date TIMESTAMPTZ,
    category TEXT,
    flag TEXT,
    scope TEXT,
    message TEXT,
    session_key INTEGER,
    meeting_key INTEGER,
    driver_number DOUBLE PRECISION,
    lap_number DOUBLE PRECISION,
    sector TEXT
  );

  CREATE TABLE car_data (
    brake DOUBLE PRECISION,
    date TIMESTAMPTZ,
    driver_number INTEGER,
    drs DOUBLE PRECISION,
    meeting_key INTEGER,
    n_gear INTEGER,
    rpm INTEGER,
    session_key INTEGER,
    speed DOUBLE PRECISION,
    throttle DOUBLE PRECISION
  );
`;

const indexSql = `
  CREATE INDEX idx_sessions_meeting ON sessions(meeting_key);
  CREATE INDEX idx_drivers_session_driver ON drivers(session_key, driver_number);
  CREATE INDEX idx_car_data_session_driver ON car_data(session_key, driver_number);
  CREATE INDEX idx_pit_meeting_session_driver ON pit(meeting_key, session_key, driver_number);
  CREATE INDEX idx_weather_meeting_session ON weather(meeting_key, session_key);
  CREATE INDEX idx_stints_meeting_session_driver ON stints(meeting_key, session_key, driver_number);
`;

let dbPromise;

export function initializeDatabase(onProgress = () => {}) {
  if (!dbPromise) {
    dbPromise = createDatabase(onProgress);
  }

  return dbPromise;
}

export async function runSql(sql) {
  const db = await initializeDatabase();
  return db.query(sql);
}

async function createDatabase(onProgress) {
  onProgress("Starting PGLite in the browser...");
  const db = await PGlite.create();

  onProgress("Creating normalized tables...");
  await db.exec(schemaSql);

  for (const tableName of csvFiles) {
    onProgress(`Loading ${tableName}.csv...`);
    const response = await fetch(`data/${tableName}.csv`);
    if (!response.ok) {
      throw new Error(`Could not load data/${tableName}.csv`);
    }
    const csvBlob = await response.blob();
    await db.query(
      `COPY ${tableName} FROM '/dev/blob' WITH (FORMAT csv, HEADER true, NULL '')`,
      [],
      { blob: csvBlob }
    );
  }

  onProgress("Adding indexes for common joins...");
  await db.exec(indexSql);

  onProgress("Database ready. Real SQL queries are enabled.");
  return db;
}
