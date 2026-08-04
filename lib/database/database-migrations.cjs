const { existsSync, mkdirSync, statSync, statfsSync } = require('node:fs')
const { basename, dirname, join } = require('node:path')
const Database = require('better-sqlite3')
const { connectionKey } = require('./connection-key.cjs')
const { latestVersion: LATEST_DATABASE_VERSION } = require('./database-schema.json')
const registeredMigrations = require('./migrations/index.cjs')

const DATABASE_FILE_NAME = 'connection-cache.db'
const DATABASE_LOG_SCOPE = 'database.migration'
const MIN_COMPACTION_BYTES = 64 * 1024 * 1024
const MIN_COMPACTION_RATIO = 0.15

function formatContext(context) {
  const entries = Object.entries(context || {})
  return entries.length > 0
    ? ` | ${entries.map(([key, value]) => `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`).join(' ')}`
    : ''
}

function defaultLog(level, message, context) {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${DATABASE_LOG_SCOPE}] ${message}${formatContext(context)}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

function getPragmaValue(db, pragma) {
  return Number(db.pragma(pragma, { simple: true }))
}

function configureDatabase(db) {
  db.pragma('busy_timeout = 30000')
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
}

function assertIntegrity(db, pragma = 'quick_check(20)') {
  const rows = db.pragma(pragma)
  const errors = rows
    .map(row => String(Object.values(row)[0]))
    .filter(value => value !== 'ok')

  if (errors.length > 0) {
    throw new Error(`Database integrity check failed: ${errors.join('; ')}`)
  }
}

function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL
    );
  `)
}

function loadMigrations() {
  const migrations = registeredMigrations.map(({ fileName, migration }) => {
    const match = /^(\d{3})-[a-z0-9-]+\.cjs$/.exec(fileName)
    if (!match) {
      throw new Error(`Invalid database migration filename: ${fileName}`)
    }

    const fileVersion = Number(match[1])
    if (
      !migration ||
      !Number.isInteger(migration.version) ||
      migration.version !== fileVersion ||
      typeof migration.name !== 'string' ||
      migration.name.length === 0 ||
      typeof migration.up !== 'function' ||
      !['boolean', 'function'].includes(typeof migration.requiresBackup) ||
      typeof migration.compactAfter !== 'boolean'
    ) {
      throw new Error(`Invalid database migration export: ${fileName}`)
    }

    return Object.freeze({ ...migration, fileName })
  }).sort((left, right) => left.version - right.version)

  for (let index = 0; index < migrations.length; index += 1) {
    const expectedVersion = index + 1
    if (migrations[index].version !== expectedVersion) {
      throw new Error(
        `Database migrations must be consecutive: expected=${expectedVersion}, actual=${migrations[index].version}`
      )
    }
  }

  const discoveredVersion = migrations.at(-1)?.version || 0
  if (discoveredVersion !== LATEST_DATABASE_VERSION) {
    throw new Error(
      `Database migration files do not match latest version: discovered=${discoveredVersion}, configured=${LATEST_DATABASE_VERSION}`
    )
  }

  return Object.freeze(migrations)
}

const migrations = loadMigrations()

function initializeEmptyDatabase(db) {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  ensureMigrationTable(db)

  const silentLog = () => {}
  for (const migration of migrations) {
    const startedAt = Date.now()
    const applyMigration = db.transaction(() => {
      migration.up(db, silentLog)
      db.prepare(`
        INSERT INTO schema_migrations (version, name, applied_at, duration_ms)
        VALUES (?, ?, ?, ?)
      `).run(migration.version, migration.name, Date.now(), Date.now() - startedAt)
      db.pragma(`user_version = ${migration.version}`)
    })
    applyMigration.exclusive()
  }
}

function getAvailableBytes(directory) {
  const stats = statfsSync(directory)
  return Number(stats.bavail) * Number(stats.bsize)
}

function assertBackupIntegrity(backupPath) {
  const backupDb = new Database(backupPath, { readonly: true, fileMustExist: true })
  try {
    assertIntegrity(backupDb)
  } finally {
    backupDb.close()
  }
}

async function createMigrationBackup(db, databasePath, fromVersion, toVersion, log) {
  if (process.env.DATABASE_MIGRATION_BACKUP === 'false') {
    log('warn', 'Automatic migration backup disabled', { fromVersion, toVersion })
    return null
  }

  const sourceSize = statSync(databasePath).size
  const requiredFreeBytes = Math.ceil(sourceSize * 1.25) + 256 * 1024 * 1024
  const availableBytes = getAvailableBytes(dirname(databasePath))
  if (availableBytes < requiredFreeBytes) {
    throw new Error(
      `Not enough free space for database migration backup: required=${requiredFreeBytes}, available=${availableBytes}`
    )
  }

  const backupPath = join(
    dirname(databasePath),
    `${basename(databasePath)}.backup-v${fromVersion}-before-v${toVersion}`
  )
  if (existsSync(backupPath)) {
    assertBackupIntegrity(backupPath)
    log('info', 'Reusing existing migration backup', { backupPath })
    return backupPath
  }

  log('info', 'Creating database migration backup', {
    backupPath,
    sourceMiB: Math.round(sourceSize / 1024 / 1024),
  })
  let lastLoggedPercent = -10
  await db.backup(backupPath, {
    progress({ totalPages, remainingPages }) {
      const percent = totalPages > 0 ? Math.floor(((totalPages - remainingPages) / totalPages) * 100) : 100
      if (percent >= lastLoggedPercent + 10) {
        lastLoggedPercent = percent
        log('info', 'Database migration backup progress', { percent })
      }
      return 200
    },
  })
  assertBackupIntegrity(backupPath)
  log('info', 'Database migration backup completed', { backupPath })
  return backupPath
}

function compactDatabaseIfNeeded(db, log, force = false) {
  const pageSize = getPragmaValue(db, 'page_size')
  const pageCountBefore = getPragmaValue(db, 'page_count')
  const freePagesBefore = getPragmaValue(db, 'freelist_count')
  const freeBytes = pageSize * freePagesBefore
  const freeRatio = pageCountBefore > 0 ? freePagesBefore / pageCountBefore : 0
  const physicalBytes = statSync(db.name).size
  const logicalBytes = pageSize * pageCountBefore
  const trailingBytes = Math.max(0, physicalBytes - logicalBytes)
  const trailingRatio = physicalBytes > 0 ? trailingBytes / physicalBytes : 0
  const hasReclaimableFreelist = freeBytes >= MIN_COMPACTION_BYTES && freeRatio >= MIN_COMPACTION_RATIO
  const hasTrailingPages = trailingBytes >= MIN_COMPACTION_BYTES && trailingRatio >= MIN_COMPACTION_RATIO

  if (!force && !hasReclaimableFreelist && !hasTrailingPages) {
    return false
  }
  if (freePagesBefore === 0 && trailingBytes === 0) return false

  const startedAt = Date.now()
  log('info', 'Database compaction started', {
    pageCount: pageCountBefore,
    freePages: freePagesBefore,
    freeMiB: Math.round(freeBytes / 1024 / 1024),
    trailingMiB: Math.round(trailingBytes / 1024 / 1024),
  })
  const previousJournalMode = String(db.pragma('journal_mode', { simple: true })).toLowerCase()
  try {
    // Im WAL-Modus kann nach VACUUM eine physisch große Hauptdatei mit
    // verkleinertem logischem page_count zurückbleiben. Der Migrationsrunner
    // läuft exklusiv vor dem Server und kann deshalb vorübergehend DELETE
    // verwenden, wodurch SQLite die Hauptdatei zuverlässig neu schreibt.
    if (previousJournalMode === 'wal') {
      db.pragma('journal_mode = DELETE')
    }
    db.exec('VACUUM')
  } finally {
    if (previousJournalMode === 'wal') {
      db.pragma('journal_mode = WAL')
    }
  }
  const checkpoint = db.pragma('wal_checkpoint(TRUNCATE)')
  log('info', 'Database compaction completed', {
    durationMs: Date.now() - startedAt,
    physicalMiBBefore: Math.round(physicalBytes / 1024 / 1024),
    physicalMiBAfter: Math.round(statSync(db.name).size / 1024 / 1024),
    pageCountBefore,
    pageCountAfter: getPragmaValue(db, 'page_count'),
    freePagesAfter: getPragmaValue(db, 'freelist_count'),
    checkpoint: checkpoint[0],
  })
  return true
}

async function migrateDatabase(options = {}) {
  const databasePath = options.databasePath || join(process.cwd(), 'data', DATABASE_FILE_NAME)
  const log = options.log || defaultLog
  const targetVersion = options.targetVersion || LATEST_DATABASE_VERSION

  if (targetVersion > LATEST_DATABASE_VERSION || targetVersion < 1) {
    throw new Error(`Unsupported database target version: ${targetVersion}`)
  }

  mkdirSync(dirname(databasePath), { recursive: true })
  const databaseExisted = existsSync(/* turbopackIgnore: true */ databasePath)
  const isNewDatabase = !databaseExisted || statSync(/* turbopackIgnore: true */ databasePath).size === 0
  const migrationLog = isNewDatabase
    ? (level, message, context) => {
        if (level === 'warn' || level === 'error') log(level, message, context)
      }
    : log
  let db = new Database(databasePath)

  try {
    configureDatabase(db)
    let currentVersion = getPragmaValue(db, 'user_version')
    if (currentVersion > LATEST_DATABASE_VERSION) {
      throw new Error(
        `Database schema is newer than this application: current=${currentVersion}, supported=${LATEST_DATABASE_VERSION}`
      )
    }
    const hasPendingMigrations = currentVersion < targetVersion
    if (hasPendingMigrations) {
      assertIntegrity(db)
    }
    ensureMigrationTable(db)

    if (isNewDatabase) {
      log('info', 'Creating new database schema', { databasePath, targetVersion })
    } else {
      log('info', 'Database schema detected', {
        databasePath,
        currentVersion,
        targetVersion,
      })
    }

    let shouldCompact = false
    let migrationApplied = false
    for (const migration of migrations) {
      if (migration.version <= currentVersion || migration.version > targetVersion) continue

      const requiresBackup = typeof migration.requiresBackup === 'function'
        ? migration.requiresBackup(db)
        : migration.requiresBackup
      if (requiresBackup && databaseExisted) {
        await createMigrationBackup(db, databasePath, currentVersion, migration.version, log)
      }

      const startedAt = Date.now()
      if (!isNewDatabase) {
        log('info', 'Database migration started', {
          version: migration.version,
          name: migration.name,
        })
      }

      const applyMigration = db.transaction(() => {
        migration.up(db, migrationLog)
        const durationMs = Date.now() - startedAt
        db.prepare(`
          INSERT INTO schema_migrations (version, name, applied_at, duration_ms)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(version) DO UPDATE SET
            name = excluded.name,
            applied_at = excluded.applied_at,
            duration_ms = excluded.duration_ms
        `).run(migration.version, migration.name, Date.now(), durationMs)
        db.pragma(`user_version = ${migration.version}`)
      })

      applyMigration.exclusive()
      currentVersion = migration.version
      migrationApplied = true
      shouldCompact ||= migration.compactAfter && !isNewDatabase
      if (!isNewDatabase) {
        log('info', 'Database migration completed', {
          version: migration.version,
          name: migration.name,
          durationMs: Date.now() - startedAt,
        })
      }
    }

    if (currentVersion !== targetVersion) {
      throw new Error(`Database migration incomplete: current=${currentVersion}, target=${targetVersion}`)
    }

    db.pragma('optimize')

    // Sämtliche Statements der Migrationsphase finalisieren, bevor ein
    // eventuell nötiges VACUUM eine exklusive, frische Verbindung erhält.
    db.close()
    db = new Database(databasePath)
    configureDatabase(db)
    const databaseCompacted = compactDatabaseIfNeeded(db, log, shouldCompact)

    const integrityCheckRequired = migrationApplied || databaseCompacted
    if (integrityCheckRequired) {
      if (databaseCompacted) {
        db.close()
        db = new Database(databasePath)
        configureDatabase(db)
      }

      assertIntegrity(db, 'integrity_check')
      const foreignKeyErrors = db.pragma('foreign_key_check')
      if (foreignKeyErrors.length > 0) {
        throw new Error(`Database has ${foreignKeyErrors.length} foreign key violations`)
      }
    }

    log('info', 'Database schema ready', {
      version: currentVersion,
      integrityCheck: integrityCheckRequired ? 'ok' : 'skipped',
    })
    return { databasePath, version: currentVersion }
  } finally {
    if (db.open) db.close()
  }
}

module.exports = {
  DATABASE_FILE_NAME,
  LATEST_DATABASE_VERSION,
  assertIntegrity,
  connectionKey,
  initializeEmptyDatabase,
  migrateDatabase,
}
