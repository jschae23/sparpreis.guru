module.exports = [
  {
    fileName: '001-baseline-schema.cjs',
    migration: require('./001-baseline-schema.cjs'),
  },
  {
    fileName: '002-normalize-price-history.cjs',
    migration: require('./002-normalize-price-history.cjs'),
  },
]
