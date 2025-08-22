// Cache-Interface
interface CacheEntry {
  data: TrainResults | null
  timestamp: number
  ttl: number // Time to live in milliseconds
}

// In-Memory Cache
const cache = new Map<string, CacheEntry>()

// Cache-Konfiguration
const CACHE_TTL = 60 * 60 * 1000 // 60 Minuten in Millisekunden
const MAX_CACHE_ENTRIES = 100000

interface TrainResult {
  preis: number
  info: string
  abfahrtsZeitpunkt: string
  ankunftsZeitpunkt: string
  allIntervals?: Array<{
    preis: number
    abschnitte?: Array<{
      abfahrtsZeitpunkt: string
      ankunftsZeitpunkt: string
      abfahrtsOrt: string
      ankunftsOrt: string
    }>
    abfahrtsZeitpunkt: string
    ankunftsZeitpunkt: string
    abfahrtsOrt: string
    ankunftsOrt: string
    info: string
    umstiegsAnzahl: number
    isCheapestPerInterval?: boolean
  }>
}

interface TrainResults {
  [date: string]: TrainResult
}

// Cache-Hilfsfunktionen
export function generateCacheKey(params: {
  startStationId: string
  zielStationId: string
  date: string
  alter: string
  ermaessigungArt: string
  ermaessigungKlasse: string
  klasse: string
  maximaleUmstiege: number
  schnelleVerbindungen: boolean
  nurDeutschlandTicketVerbindungen: boolean
  abfahrtAb?: string
  ankunftBis?: string
  umstiegszeit?: string
}): string {
  // Bereinige undefined Werte für konsistente Cache-Keys
  const cleanedParams = {
    startStationId: params.startStationId,
    zielStationId: params.zielStationId,
    date: params.date,
    alter: params.alter,
    ermaessigungArt: params.ermaessigungArt,
    ermaessigungKlasse: params.ermaessigungKlasse,
    klasse: params.klasse,
    maximaleUmstiege: params.maximaleUmstiege,
    schnelleVerbindungen: params.schnelleVerbindungen,
    nurDeutschlandTicketVerbindungen: params.nurDeutschlandTicketVerbindungen,
    // Nur definierte optionale Parameter hinzufügen
    ...(params.abfahrtAb && params.abfahrtAb !== "undefined" && { abfahrtAb: params.abfahrtAb }),
    ...(params.ankunftBis && params.ankunftBis !== "undefined" && { ankunftBis: params.ankunftBis }),
    ...(params.umstiegszeit && params.umstiegszeit !== "undefined" && { umstiegszeit: params.umstiegszeit }),
  }
  
  return JSON.stringify(cleanedParams)
}

export function getCachedResult(cacheKey: string): TrainResults | null {
  const entry = cache.get(cacheKey)
  if (!entry) {
    return null
  }
  
  const now = Date.now()
  const age = now - entry.timestamp
  
  if (age > entry.ttl) {
    // Cache ist abgelaufen
    cache.delete(cacheKey)
    return null
  }
  
  return entry.data
}

export function setCachedResult(cacheKey: string, data: TrainResults | null): void {
  // LRU-Prinzip: Wenn Limit erreicht, entferne ältesten Eintrag
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (typeof oldestKey === 'string') {
      cache.delete(oldestKey)
    }
  }
  cache.set(cacheKey, {
    data,
    timestamp: Date.now(),
    ttl: CACHE_TTL
  })
  
  // Reduzierte Logs: Nur alle 50 Cache-Einträge loggen
  if (cache.size % 50 === 0 || cache.size < 10) {
    let totalBytes = 0
    for (const entry of cache.values()) {
      try {
        totalBytes += Buffer.byteLength(JSON.stringify(entry), 'utf8')
      } catch {}
    }
    let sizeStr = totalBytes < 1024 * 1024
      ? (totalBytes / 1024).toFixed(1) + ' kB'
      : (totalBytes / (1024 * 1024)).toFixed(2) + ' MB'
    console.log(`� Cache: ${cache.size} entries, ${sizeStr}`)
  }
}

// Cache-Bereinigung (entfernt abgelaufene Einträge)
function cleanupCache(): void {
  const now = Date.now()
  let removed = 0
  
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > entry.ttl) {
      cache.delete(key)
      removed++
    }
  }
  
  if (removed > 0) {
    console.log(`🧹 Cleaned up ${removed} expired cache entries. Cache size: ${cache.size}`)
  }
}

// Cache-Bereinigung alle 5 Minuten
setInterval(cleanupCache, 5 * 60 * 1000)

export function getCacheSize(): number {
  return cache.size
}