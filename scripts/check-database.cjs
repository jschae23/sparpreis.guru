#!/usr/bin/env node

const { join } = require('node:path')
const Database = require('better-sqlite3')
const {
  DATABASE_FILE_NAME,
  assertIntegrity,
} = require('../lib/database/database-migrations.cjs')

const databasePath = process.env.DATABASE_PATH || join(process.cwd(), 'data', DATABASE_FILE_NAME)
const startedAt = Date.now()

try {
  console.log(
    `[${new Date().toISOString()}] [INFO] [database.check] Database integrity check started | databasePath=${databasePath}`
  )

  const db = new Database(databasePath, { readonly: true, fileMustExist: true })
  try {
    db.pragma('busy_timeout = 30000')
    db.pragma('foreign_keys = ON')
    assertIntegrity(db, 'integrity_check')

    const foreignKeyErrors = db.pragma('foreign_key_check')
    if (foreignKeyErrors.length > 0) {
      throw new Error(`Database has ${foreignKeyErrors.length} foreign key violations`)
    }

    console.log(
      `[${new Date().toISOString()}] [INFO] [database.check] Database integrity check completed | version=${db.pragma('user_version', { simple: true })} durationMs=${Date.now() - startedAt} integrityCheck=ok foreignKeyCheck=ok`
    )
  } finally {
    db.close()
  }
} catch (error) {
  console.error(
    `[${new Date().toISOString()}] [ERROR] [database.check] Database integrity check failed | error=${error instanceof Error ? error.message : String(error)}`
  )
  process.exitCode = 1
}
