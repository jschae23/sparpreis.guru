const { connectionKey } = require('../connection-key.cjs')

module.exports = {
  version: 2,
  name: 'normalize_price_history',
  requiresBackup(db) {
    const sourceTableExists = db
      .prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='price_history'")
      .get()

    return sourceTableExists
      ? db.prepare('SELECT EXISTS(SELECT 1 FROM price_history) AS value').get().value === 1
      : false
  },
  compactAfter: true,
  up(db, log) {
    db.function('connection_key', { deterministic: true }, connectionKey)

    const sourceRows = db.prepare('SELECT COUNT(*) AS count FROM price_history').get().count
    log('info', 'Normalizing price history', { sourceRows })

    db.exec(`
      CREATE TABLE price_history_context (
        id INTEGER PRIMARY KEY,
        start_station_id TEXT NOT NULL,
        destination_station_id TEXT NOT NULL,
        travel_date TEXT NOT NULL,
        age_type TEXT NOT NULL,
        discount_type TEXT NOT NULL,
        discount_class TEXT NOT NULL,
        travel_class TEXT NOT NULL,
        UNIQUE (
          start_station_id,
          destination_station_id,
          travel_date,
          age_type,
          discount_type,
          discount_class,
          travel_class
        )
      );

      CREATE INDEX idx_price_history_context_date
        ON price_history_context(travel_date);

      CREATE TABLE price_history_journey (
        id INTEGER PRIMARY KEY,
        context_id INTEGER NOT NULL,
        connection_key BLOB NOT NULL,
        UNIQUE(context_id, connection_key),
        FOREIGN KEY(context_id) REFERENCES price_history_context(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_price_history_journey_key
        ON price_history_journey(connection_key, context_id);

      CREATE TABLE price_history_observation (
        journey_id INTEGER NOT NULL,
        recorded_at INTEGER NOT NULL,
        price REAL NOT NULL,
        PRIMARY KEY(journey_id, recorded_at),
        FOREIGN KEY(journey_id) REFERENCES price_history_journey(id) ON DELETE CASCADE
      ) WITHOUT ROWID;

      CREATE INDEX idx_price_history_observation_recorded
        ON price_history_observation(recorded_at);

      INSERT INTO price_history_context (
        start_station_id,
        destination_station_id,
        travel_date,
        age_type,
        discount_type,
        discount_class,
        travel_class
      )
      SELECT
        start_station_id,
        ziel_station_id,
        date,
        "alter",
        ermaessigung_art,
        ermaessigung_klasse,
        klasse
      FROM price_history
      GROUP BY
        start_station_id,
        ziel_station_id,
        date,
        "alter",
        ermaessigung_art,
        ermaessigung_klasse,
        klasse;

      INSERT INTO price_history_journey (context_id, connection_key)
      SELECT
        context.id,
        connection_key(history.connection_id)
      FROM price_history history
      JOIN price_history_context context
        ON context.start_station_id = history.start_station_id
        AND context.destination_station_id = history.ziel_station_id
        AND context.travel_date = history.date
        AND context.age_type = history."alter"
        AND context.discount_type = history.ermaessigung_art
        AND context.discount_class = history.ermaessigung_klasse
        AND context.travel_class = history.klasse
      GROUP BY context.id, history.connection_id;

      INSERT INTO price_history_observation (journey_id, recorded_at, price)
      SELECT
        journey.id,
        history.recorded_at,
        history.preis
      FROM price_history history
      JOIN price_history_context context
        ON context.start_station_id = history.start_station_id
        AND context.destination_station_id = history.ziel_station_id
        AND context.travel_date = history.date
        AND context.age_type = history."alter"
        AND context.discount_type = history.ermaessigung_art
        AND context.discount_class = history.ermaessigung_klasse
        AND context.travel_class = history.klasse
      JOIN price_history_journey journey
        ON journey.context_id = context.id
        AND journey.connection_key = connection_key(history.connection_id);
    `)

    const targetRows = db.prepare('SELECT COUNT(*) AS count FROM price_history_observation').get().count
    if (targetRows !== sourceRows) {
      throw new Error(`Price history migration lost rows: source=${sourceRows}, target=${targetRows}`)
    }

    const foreignKeyErrors = db.pragma('foreign_key_check')
    if (foreignKeyErrors.length > 0) {
      throw new Error(`Price history migration created ${foreignKeyErrors.length} foreign key violations`)
    }

    const contextRows = db.prepare('SELECT COUNT(*) AS count FROM price_history_context').get().count
    const journeyRows = db.prepare('SELECT COUNT(*) AS count FROM price_history_journey').get().count
    log('info', 'Price history normalization validated', {
      sourceRows,
      targetRows,
      contextRows,
      journeyRows,
    })

    db.exec('DROP TABLE price_history')
  },
}
