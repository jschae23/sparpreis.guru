module.exports = {
  version: 1,
  name: 'baseline_schema',
  requiresBackup: false,
  compactAfter: false,
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS connection_cache (
        cache_key TEXT NOT NULL,
        data_compressed BLOB NOT NULL,
        created_at INTEGER NOT NULL,
        last_fetched_at INTEGER NOT NULL,
        PRIMARY KEY (cache_key)
      );

      CREATE INDEX IF NOT EXISTS idx_last_fetched ON connection_cache(last_fetched_at);

      CREATE TABLE IF NOT EXISTS price_history (
        connection_id TEXT NOT NULL,
        start_station_id TEXT NOT NULL,
        ziel_station_id TEXT NOT NULL,
        date TEXT NOT NULL,
        "alter" TEXT NOT NULL,
        ermaessigung_art TEXT NOT NULL,
        ermaessigung_klasse TEXT NOT NULL,
        klasse TEXT NOT NULL,
        abfahrts_zeitpunkt TEXT NOT NULL,
        ankunfts_zeitpunkt TEXT NOT NULL,
        preis REAL NOT NULL,
        info TEXT NOT NULL,
        recorded_at INTEGER NOT NULL,
        PRIMARY KEY (connection_id, "alter", ermaessigung_art, ermaessigung_klasse, klasse, recorded_at)
      );

      CREATE INDEX IF NOT EXISTS idx_price_history_connection ON price_history(
        start_station_id, ziel_station_id, date, "alter", ermaessigung_art, ermaessigung_klasse, klasse
      );
      CREATE INDEX IF NOT EXISTS idx_price_history_recorded ON price_history(recorded_at);

      CREATE TABLE IF NOT EXISTS station_search_cache (
        search_term TEXT NOT NULL,
        ext_id TEXT NOT NULL,
        station_id TEXT NOT NULL,
        name TEXT NOT NULL,
        lat REAL,
        lon REAL,
        station_type TEXT,
        products TEXT,
        result_rank INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (search_term, ext_id)
      );

      CREATE INDEX IF NOT EXISTS idx_station_search_term ON station_search_cache(search_term);
      CREATE INDEX IF NOT EXISTS idx_station_created ON station_search_cache(created_at);

      CREATE TABLE IF NOT EXISTS station_search_usage (
        search_term TEXT NOT NULL,
        ext_id TEXT NOT NULL,
        name TEXT,
        click_count INTEGER NOT NULL DEFAULT 0,
        last_clicked_at INTEGER NOT NULL,
        PRIMARY KEY (search_term, ext_id)
      );

      CREATE INDEX IF NOT EXISTS idx_station_usage_term ON station_search_usage(search_term);
      CREATE INDEX IF NOT EXISTS idx_station_usage_clicked ON station_search_usage(last_clicked_at);
    `)

    const stationSearchColumns = db.prepare('PRAGMA table_info(station_search_cache)').all()
    if (!stationSearchColumns.some(column => column.name === 'result_rank')) {
      db.exec('ALTER TABLE station_search_cache ADD COLUMN result_rank INTEGER NOT NULL DEFAULT 0')
    }
  },
}
