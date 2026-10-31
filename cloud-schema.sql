CREATE TABLE IF NOT EXISTS observations(symbol TEXT NOT NULL,time INTEGER NOT NULL,reference_price REAL NOT NULL,direction INTEGER NOT NULL,PRIMARY KEY(symbol,time));
CREATE TABLE IF NOT EXISTS results(symbol TEXT NOT NULL,time INTEGER NOT NULL,horizon INTEGER NOT NULL,directional_pct REAL NOT NULL,PRIMARY KEY(symbol,time,horizon));
CREATE INDEX IF NOT EXISTS obs_time ON observations(time);
CREATE TABLE IF NOT EXISTS collector_runs(started_at INTEGER PRIMARY KEY,report TEXT NOT NULL);
