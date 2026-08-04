const { createHash } = require('node:crypto')

function connectionKey(connectionId) {
  if (typeof connectionId !== 'string') {
    throw new TypeError('connection_id must be a string')
  }
  return createHash('sha256').update(connectionId, 'utf8').digest()
}

module.exports = { connectionKey }
