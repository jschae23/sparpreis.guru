#!/usr/bin/env node

const { existsSync, statSync } = require('node:fs')
const { join, resolve } = require('node:path')
const Database = require('better-sqlite3')
const {
  DATABASE_FILE_NAME,
  LATEST_DATABASE_VERSION,
} = require('../lib/database/database-migrations.cjs')
const databasePolicy = require('../lib/database/database-policy.json')

const berlinDateFormatter = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const VALID_COMMANDS = new Set(['stats', 'prune', 'clear'])
const VALID_CLEAR_SCOPES = new Set([
  'station-search',
  'station-usage',
  'connections',
  'price-history',
])

function printHelp() {
  console.log(`Usage:
  node scripts/database-maintenance.cjs stats
  node scripts/database-maintenance.cjs prune [--dry-run | --yes]
  node scripts/database-maintenance.cjs clear --scope=<scope> [--dry-run | --yes]

Clear scopes:
  station-search  Cached station search results
  station-usage   Learned station click priorities
  connections     Cached connection responses
  price-history   All stored price history

Destructive commands only change data when --yes is present.
Without --yes they print a preview and exit with code 2. An explicit
--dry-run prints the same preview and exits successfully.`)
}

function parseArguments(argv) {
  const [command, ...args] = argv
  const options = {
    command,
    dryRun: false,
    help: false,
    scope: null,
    yes: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--dry-run') {
      options.dryRun = true
    } else if (argument === '--yes') {
      options.yes = true
    } else if (argument === '--help' || argument === '-h') {
      options.help = true
    } else if (argument.startsWith('--scope=')) {
      options.scope = argument.slice('--scope='.length)
    } else if (argument === '--scope') {
      index += 1
      options.scope = args[index] || null
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }

  if (command === '--help' || command === '-h') {
    options.help = true
    return options
  }
  if (!VALID_COMMANDS.has(command)) {
    throw new Error(`Unknown or missing command: ${command || '(missing)'}`)
  }
  if (options.yes && options.dryRun) {
    throw new Error('--yes and --dry-run cannot be used together')
  }
  if (command === 'clear') {
    if (!options.scope) {
      throw new Error('The clear command requires --scope=<scope>')
    }
    if (!VALID_CLEAR_SCOPES.has(options.scope)) {
      throw new Error(`Unknown clear scope: ${options.scope}`)
    }
  } else if (options.scope) {
    throw new Error(`--scope is not supported by the ${command} command`)
  }
  if (command === 'stats' && (options.yes || options.dryRun)) {
    throw new Error('The stats command does not accept --yes or --dry-run')
  }

  return options
}

function getDatabasePath() {
  const configuredPath = process.env.DATABASE_PATH || join(process.cwd(), 'data', DATABASE_FILE_NAME)
  return resolve(configuredPath)
}

function getFileSize(filePath) {
  return existsSync(filePath) ? statSync(filePath).size : 0
}

function getCount(db, sql, ...params) {
  return Number(db.prepare(sql).get(...params).count)
}

function getTimestampRange(db, table, column) {
  const row = db.prepare(`
    SELECT MIN(${column}) AS oldest, MAX(${column}) AS newest
    FROM ${table}
  `).get()
  return {
    oldest: row.oldest == null ? null : Number(row.oldest),
    newest: row.newest == null ? null : Number(row.newest),
  }
}

function formatTimestamp(value) {
  return value == null ? '-' : new Date(value).toISOString()
}

function getBerlinDateKey(date = new Date()) {
  const parts = berlinDateFormatter.formatToParts(date)
  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  const day = parts.find(part => part.type === 'day')?.value
  if (!year || !month || !day) {
    throw new Error('Could not determine the current date in Europe/Berlin')
  }
  return `${year}-${month}-${day}`
}

function getPruneCutoffs(now = Date.now()) {
  const dayMs = 24 * 60 * 60 * 1000
  return {
    connection: now - databasePolicy.connectionRetentionDays * dayMs,
    removePastTravelDates: process.env.CLEANUP_PAST_CONNECTIONS !== 'false',
    stationSearch: now - databasePolicy.stationSearchRetentionDays * dayMs,
    stationUsage: now - databasePolicy.stationUsageRetentionDays * dayMs,
    travelDate: getBerlinDateKey(new Date(now)),
  }
}

function getPrunePreview(db, cutoffs) {
  const connectionCacheRows = cutoffs.removePastTravelDates
    ? getCount(
        db,
        `SELECT COUNT(*) AS count
         FROM connection_cache
         WHERE last_fetched_at < ?
            OR CASE
                 WHEN json_valid(cache_key) THEN json_extract(cache_key, '$.date')
                 ELSE NULL
               END < ?`,
        cutoffs.connection,
        cutoffs.travelDate
      )
    : getCount(
        db,
        'SELECT COUNT(*) AS count FROM connection_cache WHERE last_fetched_at < ?',
        cutoffs.connection
      )
  const priceHistoryObservationRows = cutoffs.removePastTravelDates
    ? getCount(
        db,
        `SELECT COUNT(*) AS count
         FROM price_history_observation observation
         JOIN price_history_journey journey ON journey.id = observation.journey_id
         JOIN price_history_context context ON context.id = journey.context_id
         WHERE observation.recorded_at < ? OR context.travel_date < ?`,
        cutoffs.connection,
        cutoffs.travelDate
      )
    : getCount(
        db,
        'SELECT COUNT(*) AS count FROM price_history_observation WHERE recorded_at < ?',
        cutoffs.connection
      )
  const priceHistoryJourneyRows = cutoffs.removePastTravelDates
    ? getCount(
        db,
        `SELECT COUNT(*) AS count
         FROM price_history_journey journey
         JOIN price_history_context context ON context.id = journey.context_id
         WHERE context.travel_date < ?
            OR NOT EXISTS (
              SELECT 1 FROM price_history_observation observation
              WHERE observation.journey_id = journey.id AND observation.recorded_at >= ?
            )`,
        cutoffs.travelDate,
        cutoffs.connection
      )
    : getCount(
        db,
        `SELECT COUNT(*) AS count
         FROM price_history_journey journey
         WHERE NOT EXISTS (
           SELECT 1 FROM price_history_observation observation
           WHERE observation.journey_id = journey.id AND observation.recorded_at >= ?
         )`,
        cutoffs.connection
      )
  const priceHistoryContextRows = cutoffs.removePastTravelDates
    ? getCount(
        db,
        `SELECT COUNT(*) AS count
         FROM price_history_context context
         WHERE context.travel_date < ?
            OR NOT EXISTS (
              SELECT 1
              FROM price_history_journey journey
              JOIN price_history_observation observation ON observation.journey_id = journey.id
              WHERE journey.context_id = context.id AND observation.recorded_at >= ?
            )`,
        cutoffs.travelDate,
        cutoffs.connection
      )
    : getCount(
        db,
        `SELECT COUNT(*) AS count
         FROM price_history_context context
         WHERE NOT EXISTS (
           SELECT 1
           FROM price_history_journey journey
           JOIN price_history_observation observation ON observation.journey_id = journey.id
           WHERE journey.context_id = context.id AND observation.recorded_at >= ?
         )`,
        cutoffs.connection
      )

  return {
    connectionCacheRows,
    priceHistoryContextRows,
    priceHistoryJourneyRows,
    priceHistoryObservationRows,
    stationSearchRows: getCount(
      db,
      'SELECT COUNT(*) AS count FROM station_search_cache WHERE created_at < ?',
      cutoffs.stationSearch
    ),
    stationUsageRows: getCount(
      db,
      'SELECT COUNT(*) AS count FROM station_search_usage WHERE last_clicked_at < ?',
      cutoffs.stationUsage
    ),
  }
}

function getClearPreview(db, scope) {
  if (scope === 'station-search') {
    return {
      stationSearchRows: getCount(db, 'SELECT COUNT(*) AS count FROM station_search_cache'),
    }
  }
  if (scope === 'station-usage') {
    return {
      stationUsageRows: getCount(db, 'SELECT COUNT(*) AS count FROM station_search_usage'),
    }
  }
  if (scope === 'connections') {
    return {
      connectionCacheRows: getCount(db, 'SELECT COUNT(*) AS count FROM connection_cache'),
    }
  }
  return {
    priceHistoryContextRows: getCount(db, 'SELECT COUNT(*) AS count FROM price_history_context'),
    priceHistoryJourneyRows: getCount(db, 'SELECT COUNT(*) AS count FROM price_history_journey'),
    priceHistoryObservationRows: getCount(db, 'SELECT COUNT(*) AS count FROM price_history_observation'),
  }
}

function printValues(title, values) {
  console.log(title)
  for (const [key, value] of Object.entries(values)) {
    console.log(`${key}=${value}`)
  }
}

function printStats(db, databasePath) {
  const pageSize = Number(db.pragma('page_size', { simple: true }))
  const pageCount = Number(db.pragma('page_count', { simple: true }))
  const freelistPages = Number(db.pragma('freelist_count', { simple: true }))
  const connectionRange = getTimestampRange(db, 'connection_cache', 'last_fetched_at')
  const stationSearchRange = getTimestampRange(db, 'station_search_cache', 'created_at')
  const stationUsageRange = getTimestampRange(db, 'station_search_usage', 'last_clicked_at')
  const priceHistoryRange = getTimestampRange(db, 'price_history_observation', 'recorded_at')
  const cutoffs = getPruneCutoffs()

  printValues('Database statistics', {
    databasePath,
    schemaVersion: Number(db.pragma('user_version', { simple: true })),
    databaseBytes: getFileSize(databasePath),
    walBytes: getFileSize(`${databasePath}-wal`),
    shmBytes: getFileSize(`${databasePath}-shm`),
    pageSize,
    pageCount,
    freelistPages,
    reclaimableBytes: freelistPages * pageSize,
    connectionCacheRows: getCount(db, 'SELECT COUNT(*) AS count FROM connection_cache'),
    connectionCacheOldest: formatTimestamp(connectionRange.oldest),
    connectionCacheNewest: formatTimestamp(connectionRange.newest),
    stationSearchRows: getCount(db, 'SELECT COUNT(*) AS count FROM station_search_cache'),
    stationSearchOldest: formatTimestamp(stationSearchRange.oldest),
    stationSearchNewest: formatTimestamp(stationSearchRange.newest),
    stationUsageRows: getCount(db, 'SELECT COUNT(*) AS count FROM station_search_usage'),
    stationUsageOldest: formatTimestamp(stationUsageRange.oldest),
    stationUsageNewest: formatTimestamp(stationUsageRange.newest),
    priceHistoryContextRows: getCount(db, 'SELECT COUNT(*) AS count FROM price_history_context'),
    priceHistoryJourneyRows: getCount(db, 'SELECT COUNT(*) AS count FROM price_history_journey'),
    priceHistoryObservationRows: getCount(db, 'SELECT COUNT(*) AS count FROM price_history_observation'),
    priceHistoryOldest: formatTimestamp(priceHistoryRange.oldest),
    priceHistoryNewest: formatTimestamp(priceHistoryRange.newest),
    pastTravelCleanupEnabled: cutoffs.removePastTravelDates,
    berlinTravelDate: cutoffs.travelDate,
    ...Object.fromEntries(
      Object.entries(getPrunePreview(db, cutoffs)).map(([key, value]) => [`expired${key[0].toUpperCase()}${key.slice(1)}`, value])
    ),
  })
}

function pruneDatabase(db, cutoffs) {
  return db.transaction(() => {
    const before = {
      connectionCacheRows: getCount(db, 'SELECT COUNT(*) AS count FROM connection_cache'),
      priceHistoryContextRows: getCount(db, 'SELECT COUNT(*) AS count FROM price_history_context'),
      priceHistoryJourneyRows: getCount(db, 'SELECT COUNT(*) AS count FROM price_history_journey'),
      priceHistoryObservationRows: getCount(db, 'SELECT COUNT(*) AS count FROM price_history_observation'),
      stationSearchRows: getCount(db, 'SELECT COUNT(*) AS count FROM station_search_cache'),
      stationUsageRows: getCount(db, 'SELECT COUNT(*) AS count FROM station_search_usage'),
    }

    if (cutoffs.removePastTravelDates) {
      db.prepare(`
        DELETE FROM connection_cache
        WHERE last_fetched_at < ?
           OR CASE
                WHEN json_valid(cache_key) THEN json_extract(cache_key, '$.date')
                ELSE NULL
              END < ?
      `).run(cutoffs.connection, cutoffs.travelDate)
      db.prepare('DELETE FROM price_history_context WHERE travel_date < ?').run(cutoffs.travelDate)
    } else {
      db.prepare('DELETE FROM connection_cache WHERE last_fetched_at < ?').run(cutoffs.connection)
    }
    db.prepare('DELETE FROM price_history_observation WHERE recorded_at < ?').run(cutoffs.connection)
    db.prepare(`
      DELETE FROM price_history_journey
      WHERE NOT EXISTS (
        SELECT 1 FROM price_history_observation
        WHERE price_history_observation.journey_id = price_history_journey.id
      )
    `).run()
    db.prepare(`
      DELETE FROM price_history_context
      WHERE NOT EXISTS (
        SELECT 1 FROM price_history_journey
        WHERE price_history_journey.context_id = price_history_context.id
      )
    `).run()
    db.prepare('DELETE FROM station_search_cache WHERE created_at < ?').run(cutoffs.stationSearch)
    db.prepare('DELETE FROM station_search_usage WHERE last_clicked_at < ?').run(cutoffs.stationUsage)

    const after = {
      connectionCacheRows: getCount(db, 'SELECT COUNT(*) AS count FROM connection_cache'),
      priceHistoryContextRows: getCount(db, 'SELECT COUNT(*) AS count FROM price_history_context'),
      priceHistoryJourneyRows: getCount(db, 'SELECT COUNT(*) AS count FROM price_history_journey'),
      priceHistoryObservationRows: getCount(db, 'SELECT COUNT(*) AS count FROM price_history_observation'),
      stationSearchRows: getCount(db, 'SELECT COUNT(*) AS count FROM station_search_cache'),
      stationUsageRows: getCount(db, 'SELECT COUNT(*) AS count FROM station_search_usage'),
    }
    return Object.fromEntries(
      Object.keys(before).map(key => [key, before[key] - after[key]])
    )
  }).immediate()
}

function clearDatabaseScope(db, scope) {
  return db.transaction(() => {
    if (scope === 'station-search') {
      return {
        stationSearchRows: db.prepare('DELETE FROM station_search_cache').run().changes,
      }
    }
    if (scope === 'station-usage') {
      return {
        stationUsageRows: db.prepare('DELETE FROM station_search_usage').run().changes,
      }
    }
    if (scope === 'connections') {
      return {
        connectionCacheRows: db.prepare('DELETE FROM connection_cache').run().changes,
      }
    }

    const before = getClearPreview(db, scope)
    db.prepare('DELETE FROM price_history_context').run()
    return before
  }).immediate()
}

function assertSupportedSchema(db) {
  const currentVersion = Number(db.pragma('user_version', { simple: true }))
  if (currentVersion !== LATEST_DATABASE_VERSION) {
    throw new Error(
      `Database schema mismatch: current=${currentVersion}, expected=${LATEST_DATABASE_VERSION}. ` +
      'Run the database migration before maintenance.'
    )
  }
}

function run() {
  let options
  try {
    options = parseArguments(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    printHelp()
    process.exitCode = 1
    return
  }

  if (options.help) {
    printHelp()
    return
  }

  const databasePath = getDatabasePath()
  if (!existsSync(databasePath)) {
    throw new Error(`Database file does not exist: ${databasePath}`)
  }

  const writable = options.command !== 'stats' && options.yes
  const db = new Database(databasePath, {
    readonly: !writable,
    fileMustExist: true,
  })
  try {
    db.pragma('busy_timeout = 30000')
    db.pragma('foreign_keys = ON')
    if (writable) {
      db.pragma('journal_mode = WAL')
      db.pragma('synchronous = NORMAL')
    }
    assertSupportedSchema(db)

    if (options.command === 'stats') {
      printStats(db, databasePath)
      return
    }

    const cutoffs = getPruneCutoffs()
    const preview = options.command === 'prune'
      ? getPrunePreview(db, cutoffs)
      : getClearPreview(db, options.scope)
    printValues('Database maintenance preview', {
      command: options.command,
      databasePath,
      ...(options.scope ? { scope: options.scope } : {}),
      ...(options.command === 'prune'
        ? {
            pastTravelCleanupEnabled: cutoffs.removePastTravelDates,
            berlinTravelDate: cutoffs.travelDate,
          }
        : {}),
      ...preview,
    })

    if (!options.yes) {
      if (options.dryRun) {
        console.log('Dry run complete. No data changed.')
      } else {
        console.error('No data changed. Re-run the command with --yes to apply it.')
        process.exitCode = 2
      }
      return
    }

    const changes = options.command === 'prune'
      ? pruneDatabase(db, cutoffs)
      : clearDatabaseScope(db, options.scope)
    db.pragma('optimize')
    const foreignKeyErrors = db.pragma('foreign_key_check')
    if (foreignKeyErrors.length > 0) {
      throw new Error(`Database has ${foreignKeyErrors.length} foreign key violations after maintenance`)
    }
    printValues('Database maintenance completed', {
      ...changes,
      foreignKeyCheck: 'ok',
    })
  } finally {
    db.close()
  }
}

try {
  run()
} catch (error) {
  console.error(
    `[${new Date().toISOString()}] [ERROR] [database.maintenance] ${error instanceof Error ? error.message : String(error)}`
  )
  process.exitCode = 1
}
