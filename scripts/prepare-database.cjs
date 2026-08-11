#!/usr/bin/env node

const { spawnSync } = require('node:child_process')
const { join } = require('node:path')
const {
  DATABASE_FILE_NAME,
  migrateDatabase,
} = require('../lib/database/database-migrations.cjs')

const databasePath = process.env.DATABASE_PATH || join(process.cwd(), 'data', DATABASE_FILE_NAME)
const maintenanceScript = join(__dirname, 'database-maintenance.cjs')

function log(level, message, context = {}) {
  const details = Object.entries(context)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ')
  console[level](
    `[${new Date().toISOString()}] [${level.toUpperCase()}] [database.prepare] ${message}${details ? ` | ${details}` : ''}`
  )
}

async function prepareDatabase() {
  await migrateDatabase({ databasePath })

  log('info', 'Startup pruning started', { databasePath })
  const result = spawnSync(
    process.execPath,
    [maintenanceScript, 'prune', '--yes'],
    {
      env: {
        ...process.env,
        DATABASE_PATH: databasePath,
      },
      stdio: 'inherit',
    }
  )

  if (result.error) {
    log('warn', 'Startup pruning could not be started; continuing application startup', {
      error: result.error.message,
    })
    return
  }
  if (result.status !== 0) {
    log('warn', 'Startup pruning failed; continuing application startup', {
      exitCode: result.status ?? 'unknown',
      signal: result.signal ?? 'none',
    })
    return
  }

  log('info', 'Startup pruning completed')
}

prepareDatabase().catch(error => {
  console.error(
    `[${new Date().toISOString()}] [ERROR] [database.prepare] Database preparation failed | error=${error instanceof Error ? error.message : String(error)}`
  )
  process.exitCode = 1
})
