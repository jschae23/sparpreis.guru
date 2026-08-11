import {
  getCachedStationSearch,
  getStableStationExtId,
  rankStationSearchResults,
  setCachedStationSearch,
  type StationSearchResult,
} from '@/app/api/search-prices/cache'
import { fetchBahn } from '@/app/api/search-prices/bahn-http'
import { metricsCollector } from '@/app/api/metrics/collector'
import { logDebug, logWarn } from '@/lib/shared/logger'
import {
  getStationSearchRequestKey,
  StationRateLimitError,
  stationRateLimiter,
} from './rate-limit'

const LOG_SCOPE = 'station-search.service'

interface BahnStation {
  extId: string
  id: string
  name: string
  lat?: number
  lon?: number
  type?: string
  products?: string[]
}

export interface StationSearchOutcome {
  results: StationSearchResult[]
  cached: boolean
}

export class StationSearchUpstreamError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Station search upstream returned HTTP ${status}`)
    this.name = 'StationSearchUpstreamError'
    this.status = status
  }
}

const inFlightSearches = new Map<string, Promise<StationSearchOutcome>>()

function parseRetryAfter(value: string | null): number {
  if (!value) return 2000

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.max(100, Math.ceil(seconds * 1000))
  }

  const retryAt = Date.parse(value)
  if (Number.isFinite(retryAt)) {
    return Math.max(100, retryAt - Date.now())
  }

  return 2000
}

async function fetchStationsFromBahn(query: string): Promise<BahnStation[]> {
  return stationRateLimiter.addToQueue(async () => {
    const encodedQuery = encodeURIComponent(query)
    const url = `https://www.bahn.de/web/api/reiseloesung/orte?suchbegriff=${encodedQuery}&typ=ALL&limit=10`
    const apiStartTime = Date.now()
    let response: Awaited<ReturnType<typeof fetchBahn>>

    try {
      response = await fetchBahn(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
          'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
          Referer: 'https://www.bahn.de/',
        },
      })
    } catch (error) {
      metricsCollector.recordStationSearchApiRequest(Date.now() - apiStartTime, 500)
      throw error
    }

    metricsCollector.recordStationSearchApiRequest(Date.now() - apiStartTime, response.status)

    if (response.status === 429) {
      throw new StationRateLimitError(parseRetryAfter(response.getHeader('retry-after')))
    }

    if (!response.ok) {
      throw new StationSearchUpstreamError(response.status)
    }

    return response.json<BahnStation[]>()
  })
}

async function fetchAndCacheStations(query: string): Promise<StationSearchOutcome> {
  logDebug(LOG_SCOPE, 'Station search cache miss; fetching from Bahn API', { query })
  const stations = await fetchStationsFromBahn(query)
  const results = stations
    .filter(station => {
      if (!station.extId || !station.name) {
        logWarn(LOG_SCOPE, 'Ignored station search result without extId or name', {
          query,
          station,
        })
        return false
      }
      return true
    })
    .map(station => ({
      extId: getStableStationExtId(station),
      id: station.id || station.extId,
      name: station.name,
      lat: station.lat,
      lon: station.lon,
      type: station.type,
      products: station.products,
    }))

  const rankedResults = rankStationSearchResults(query, results)
  if (rankedResults.length > 0) {
    setCachedStationSearch(query, rankedResults)
    for (const result of rankedResults) {
      setCachedStationSearch(result.extId, [result])
    }
  }

  return { results: rankedResults, cached: false }
}

export async function searchStations(query: string): Promise<StationSearchOutcome> {
  const trimmedQuery = query.trim()
  const cachedResults = getCachedStationSearch(trimmedQuery)

  if (cachedResults) {
    metricsCollector.recordCacheHit('station')
    logDebug(LOG_SCOPE, 'Station search cache hit', {
      query: trimmedQuery,
      resultCount: cachedResults.length,
      topResult: cachedResults[0]?.name,
    })
    return { results: cachedResults, cached: true }
  }

  metricsCollector.recordCacheMiss('station')
  const requestKey = getStationSearchRequestKey(trimmedQuery)
  const inFlightSearch = inFlightSearches.get(requestKey)
  if (inFlightSearch) {
    return inFlightSearch
  }

  const searchPromise = fetchAndCacheStations(trimmedQuery)
  inFlightSearches.set(requestKey, searchPromise)

  try {
    return await searchPromise
  } finally {
    if (inFlightSearches.get(requestKey) === searchPromise) {
      inFlightSearches.delete(requestKey)
    }
  }
}
