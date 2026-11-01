CREATE TABLE IF NOT EXISTS observations(symbol TEXT NOT NULL,time INTEGER NOT NULL,reference_price REAL NOT NULL,direction INTEGER NOT NULL,methodology_version TEXT,PRIMARY KEY(symbol,time));
CREATE TABLE IF NOT EXISTS results(symbol TEXT NOT NULL,time INTEGER NOT NULL,horizon INTEGER NOT NULL,directional_pct REAL NOT NULL,PRIMARY KEY(symbol,time,horizon));
CREATE INDEX IF NOT EXISTS obs_time ON observations(time);
CREATE TABLE IF NOT EXISTS collector_runs(started_at INTEGER PRIMARY KEY,report TEXT NOT NULL);

-- Preview only. Owner approval required before applying to persistent D1.
-- New isolated control row; no alterations to observations/results/collector_runs.
CREATE TABLE IF NOT EXISTS collector_control (
  provider TEXT PRIMARY KEY CHECK(provider='coinbase'),
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  last_slot INTEGER NOT NULL DEFAULT -1,
  cooldown_until INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT '{}'
);
INSERT OR IGNORE INTO collector_control(provider) VALUES('coinbase');
