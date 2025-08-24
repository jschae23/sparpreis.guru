import { globalRateLimiter } from './rate-limiter'
import { generateCacheKey, getCachedResult, setCachedResult } from './cache'
import { metricsCollector } from '@/app/api/metrics/collector'

// Station Cache Interface
interface StationCacheEntry {
  data: { id: string; normalizedId: string; name: string }
  timestamp: number
  ttl: number
}

// In-Memory Station Cache
const stationCache = new Map<string, StationCacheEntry>()

// Cache-Konfiguration für Stationen
const STATION_CACHE_TTL = 72 * 60 * 60 * 1000 // 72 Stunden in Millisekunden
const MAX_STATION_CACHE_ENTRIES = 10000

function getStationCacheKey(search: string): string {
  return `station_${search.toLowerCase().trim()}`
}

function getCachedStation(search: string): { id: string; normalizedId: string; name: string } | null {
  const cacheKey = getStationCacheKey(search)
  const entry = stationCache.get(cacheKey)
  
  if (!entry) {
    metricsCollector.recordCacheMiss('station')
    return null
  }
  
  const now = Date.now()
  const age = now - entry.timestamp
  
  if (age > entry.ttl) {
    // Cache ist abgelaufen
    stationCache.delete(cacheKey)
    metricsCollector.recordCacheMiss('station')
    return null
  }
  
  console.log(`🚉 Station cache hit for: ${search}`)
  metricsCollector.recordCacheHit('station')
  return entry.data
}

function setCachedStation(search: string, data: { id: string; normalizedId: string; name: string }): void {
  const cacheKey = getStationCacheKey(search)
  
  // LRU-Prinzip: Wenn Limit erreicht, entferne ältesten Eintrag
  if (stationCache.size >= MAX_STATION_CACHE_ENTRIES) {
    const oldestKey = stationCache.keys().next().value
    if (typeof oldestKey === 'string') {
      stationCache.delete(oldestKey)
    }
  }
  
  stationCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
    ttl: STATION_CACHE_TTL
  })
  
    // Nur alle 100 Station-Caches loggen
  if (stationCache.size % 100 === 0) {
    console.log(`💾 Station cache: ${stationCache.size} entries`)
  }
}

// Cache-Bereinigung für Stationen (entfernt abgelaufene Einträge)
function cleanupStationCache(): void {
  const now = Date.now()
  let removed = 0
  
  for (const [key, entry] of stationCache.entries()) {
    if (now - entry.timestamp > entry.ttl) {
      stationCache.delete(key)
      removed++
    }
  }
  
  if (removed > 0) {
    console.log(`🧹 Cleaned up ${removed} expired station cache entries. Cache size: ${stationCache.size}`)
  }
}

// Station Cache-Bereinigung alle 2 Stunden
setInterval(cleanupStationCache, 2 * 60 * 60 * 1000)

// Hilfsfunktion für lokales Datum im Format YYYY-MM-DD
function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const day = date.getDate().toString().padStart(2, "0")
  return `${year}-${month}-${day}`
}

// Station search function
export async function searchBahnhof(search: string): Promise<{ id: string; normalizedId: string; name: string } | null> {
  if (!search) return null

  // Prüfe Cache zuerst
  const cachedResult = getCachedStation(search)
  if (cachedResult) {
    return cachedResult
  }

  try {
    const encodedSearch = encodeURIComponent(search)
    const url = `https://www.bahn.de/web/api/reiseloesung/orte?suchbegriff=${encodedSearch}&typ=ALL&limit=10`

    console.log(`🌐 Station API call: "${search}"`)

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0",
        Accept: "application/json",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
        Referer: "https://www.bahn.de/",
      },
    })

    if (!response.ok) return null

    const data = await response.json()
    if (!data || data.length === 0) return null

    const station = data[0]
    const originalId = station.id

    // Normalisiere die Station-ID: Entferne den Timestamp-Parameter @p=
    const normalizedId = originalId.replace(/@p=\d+@/g, '@')

    console.log(`✅ Found station: ${station.name}`)

    const result = { 
      id: originalId,           // Für API-Aufrufe
      normalizedId: normalizedId, // Für Cache-Keys
      name: station.name 
    }

    // Cache das Ergebnis für 24 Stunden
    setCachedStation(search, result)

    return result
  } catch (error) {
    console.error("Error in searchBahnhof:", error)
    return null
  }
}

interface IntervalAbschnitt {
  abfahrtsZeitpunkt: string
  ankunftsZeitpunkt: string
  abfahrtsOrt: string
  ankunftsOrt: string
}

interface IntervalDetails {
  preis: number
  abschnitte: IntervalAbschnitt[]
  abfahrtsZeitpunkt: string
  ankunftsZeitpunkt: string
  abfahrtsOrt: string
  ankunftsOrt: string
  info: string
  umstiegsAnzahl: number
  isCheapestPerInterval?: boolean
}

interface TrainResult {
  preis: number
  info: string
  abfahrtsZeitpunkt: string
  ankunftsZeitpunkt: string
  allIntervals?: IntervalDetails[]
}

interface TrainResults {
  [date: string]: TrainResult
}

// Main API call function for best price search
export async function getBestPrice(config: any): Promise<{ result: TrainResults | null; wasApiCall: boolean }> {
  const dateObj = config.anfrageDatum as Date
  const sessionId = config.sessionId // Session ID von der Hauptanfrage
  // Format date like the working curl: "2025-07-26T08:00:00"
  const datum = formatDateKey(dateObj) + "T08:00:00"
  const tag = formatDateKey(dateObj)

  // Cache-Key generieren
  const cacheKey = generateCacheKey({
    startStationId: config.startStationNormalizedId, // Verwende normalisierte ID
    zielStationId: config.zielStationNormalizedId,   // Verwende normalisierte ID
    date: tag,
    alter: config.alter,
    ermaessigungArt: config.ermaessigungArt || "KEINE_ERMAESSIGUNG",
    ermaessigungKlasse: config.ermaessigungKlasse || "KLASSENLOS",
    klasse: config.klasse,
    maximaleUmstiege: config.maximaleUmstiege,
    schnelleVerbindungen: Boolean(config.schnelleVerbindungen === true || config.schnelleVerbindungen === "true"),
    nurDeutschlandTicketVerbindungen: Boolean(config.nurDeutschlandTicketVerbindungen === true || config.nurDeutschlandTicketVerbindungen === "true"),
    // abfahrtAb und ankunftBis NICHT im Cache-Key!
    umstiegszeit: (config.umstiegszeit && config.umstiegszeit !== "normal" && config.umstiegszeit !== "undefined") ? config.umstiegszeit : undefined,
  })

  // Prüfe Cache
  const cachedResult = getCachedResult(cacheKey)
  if (cachedResult) {
    console.log(`📦 Cache HIT for ${tag}`)
    metricsCollector.recordCacheHit('connection')
    
    const cachedData = cachedResult[tag]
    if (cachedData && cachedData.allIntervals) {
      // Zeitfilterung auf gecachte Daten anwenden
      const filteredIntervals = cachedData.allIntervals.filter((interval: any) => {
        if (!config.abfahrtAb && !config.ankunftBis) return true
        
        const ersteAbfahrt = interval.abfahrtsZeitpunkt
        const letzteAnkunft = interval.ankunftsZeitpunkt
        
        let abfahrtOk = true
        let ankunftOk = true
        
        if (config.abfahrtAb) {
          const abfahrtTime = new Date(`1970-01-01T${ersteAbfahrt.split('T')[1]}`)
          const filterTime = new Date(`1970-01-01T${config.abfahrtAb}:00`)
          abfahrtOk = abfahrtTime >= filterTime
        }
        
        if (config.ankunftBis) {
          const ankunftTime = new Date(`1970-01-01T${letzteAnkunft.split('T')[1]}`)
          const filterTime = new Date(`1970-01-01T${config.ankunftBis}:00`)
          ankunftOk = ankunftTime <= filterTime
        }
        
        return abfahrtOk && ankunftOk
      })
      
      if (filteredIntervals.length === 0) {
        return {
          result: { [tag]: { preis: 0, info: "Keine Verbindungen im gewählten Zeitraum!", abfahrtsZeitpunkt: "", ankunftsZeitpunkt: "", allIntervals: [] } },
          wasApiCall: false
        }
      }
      
      // Finde günstigste Verbindung
      const minPreis = Math.min(...filteredIntervals.map((iv: any) => iv.preis))
      const bestInterval = filteredIntervals.find((interval: any) => interval.preis === minPreis)
      
      const filteredResult = {
        [tag]: {
          preis: minPreis,
          info: bestInterval?.info || "",
          abfahrtsZeitpunkt: bestInterval?.abfahrtsZeitpunkt || "",
          ankunftsZeitpunkt: bestInterval?.ankunftsZeitpunkt || "",
          allIntervals: filteredIntervals.sort((a: any, b: any) => a.preis - b.preis) as IntervalDetails[]
        }
      }
      
      return { result: filteredResult, wasApiCall: false }
    }
    
    // Fallback für alte Cache-Einträge ohne allIntervals
    if (cachedData) {
      // Normalize cachedData to match TrainResult type
      const normalizedCachedData: TrainResult = {
        ...cachedData,
        allIntervals: Array.isArray(cachedData.allIntervals)
          ? cachedData.allIntervals.map((iv: any) => ({
              ...iv,
              abschnitte: Array.isArray(iv.abschnitte)
                ? iv.abschnitte.map((a: any) => ({
                    abfahrtsZeitpunkt: a.abfahrtsZeitpunkt,
                    ankunftsZeitpunkt: a.ankunftsZeitpunkt,
                    abfahrtsOrt: a.abfahrtsOrt,
                    ankunftsOrt: a.ankunftsOrt,
                  }))
                : [],
            }))
          : [],
      }
      return { result: { [tag]: normalizedCachedData }, wasApiCall: false }
    }
  }

  console.log(`❌ Cache MISS for ${tag}`)
  metricsCollector.recordCacheMiss('connection')

  // Match the EXACT working curl request structure
  const requestBody: any = {
    abfahrtsHalt: config.abfahrtsHalt,
    anfrageZeitpunkt: datum,
    ankunftsHalt: config.ankunftsHalt,
    ankunftSuche: "ABFAHRT",
    klasse: config.klasse,
    maxUmstiege: config.maximaleUmstiege,
    produktgattungen: ["ICE", "EC_IC", "IR", "REGIONAL", "SBAHN", "BUS", "SCHIFF", "UBAHN", "TRAM", "ANRUFPFLICHTIG"],
    reisende: [
      {
        typ: config.alter, 
        ermaessigungen: [
          {
            art: config.ermaessigungArt || "KEINE_ERMAESSIGUNG",
            klasse: config.ermaessigungKlasse || "KLASSENLOS",
          },
        ],
        alter: [],
        anzahl: 1,
      },
    ],
    schnelleVerbindungen: config.schnelleVerbindungen === true || config.schnelleVerbindungen === "true",
    sitzplatzOnly: false,
    bikeCarriage: false,
    reservierungsKontingenteVorhanden: false,
    nurDeutschlandTicketVerbindungen:
      config.nurDeutschlandTicketVerbindungen === true || config.nurDeutschlandTicketVerbindungen === "true",
    deutschlandTicketVorhanden: false,
  }

  // Add minUmstiegszeit only if provided
  if (config.umstiegszeit && config.umstiegszeit !== "" && config.umstiegszeit !== "normal" && config.umstiegszeit !== "undefined" && typeof config.umstiegszeit !== 'undefined') {
    requestBody.minUmstiegszeit = parseInt(config.umstiegszeit)
  }

  try {
    // API-Call über globalen Rate Limiter
    const requestId = `${tag}-${config.startStationNormalizedId}-${config.zielStationNormalizedId}`
    const apiCallResult = await globalRateLimiter.addToQueue(requestId, async () => {
      // Prüfe Session-Abbruch direkt vor API-Call
      if (sessionId && globalRateLimiter.isSessionCancelledSync(sessionId)) {
        throw new Error(`Session ${sessionId} was cancelled`)
      }
      
      console.log(`🌐 API call for ${tag}`)
      // Match the working curl headers exactly
      const response = await fetch("https://www.bahn.de/web/api/angebote/tagesbestpreis", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json; charset=utf-8",
          "Accept-Encoding": "gzip",
          Origin: "https://www.bahn.de",
          Referer: "https://www.bahn.de/buchung/fahrplan/suche",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0",
          Connection: "close",
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        let errorText = ""
        try {
          errorText = await response.text()
          console.error(`HTTP ${response.status} error:`, errorText)
        } catch (e) {
          console.error("Could not read error response")
        }
        throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 100)}`)
      }

      return await response.text()
    }, sessionId) // SessionId übergeben für Abbruch-Prüfung

    const responseText = apiCallResult

    // Check if response contains error message
    if (responseText.includes("Preisauskunft nicht möglich")) {
      console.log("Price info not available for this date")
      const result = { [tag]: { preis: 0, info: "Kein Bestpreis verfügbar!", abfahrtsZeitpunkt: "", ankunftsZeitpunkt: "" } }
      setCachedResult(cacheKey, result)
      return { result, wasApiCall: true }
    }

    let data
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error("Failed to parse JSON:", parseError)
      const errorResult = {
        [tag]: {
          preis: 0,
          info: "JSON Parse Error",
          abfahrtsZeitpunkt: "",
          ankunftsZeitpunkt: "",
        },
      }
      return { result: errorResult, wasApiCall: true }
    }

    if (!data || !data.intervalle) {
      console.log("No intervals found in response")
      const result = { [tag]: { preis: 0, info: "Keine Intervalle gefunden!", abfahrtsZeitpunkt: "", ankunftsZeitpunkt: "" } }
      setCachedResult(cacheKey, result)
      return { result, wasApiCall: true }
    }

    console.log(`Found ${data.intervalle.length} intervals`)

    // Verarbeite ALLE Intervalle für Cache (ohne Zeitfilter)
    const allIntervalsForCache: IntervalDetails[] = []

    // Process ALL intervals (für Cache)
    for (const iv of data.intervalle) {
      if (iv.preis && typeof iv.preis === "object" && "betrag" in iv.preis && Array.isArray(iv.verbindungen)) {
        for (const verbindung of iv.verbindungen) {
          let newPreis = 0
          if (verbindung.abPreis && typeof verbindung.abPreis === "object" && "betrag" in verbindung.abPreis) {
            newPreis = verbindung.abPreis.betrag
          } else {
            newPreis = iv.preis.betrag
          }
          if (verbindung.verbindung && verbindung.verbindung.verbindungsAbschnitte && verbindung.verbindung.verbindungsAbschnitte.length > 0) {
            const abschnitte = verbindung.verbindung.verbindungsAbschnitte.map((abschnitt: any) => ({
              abfahrtsZeitpunkt: abschnitt.abfahrtsZeitpunkt,
              ankunftsZeitpunkt: abschnitt.ankunftsZeitpunkt,
              abfahrtsOrt: abschnitt.abfahrtsOrt,
              ankunftsOrt: abschnitt.ankunftsOrt
            }))
            const info = abschnitte.map((a: IntervalAbschnitt) => `${a.abfahrtsOrt} → ${a.ankunftsOrt}`).join(' | ')
            allIntervalsForCache.push({
              preis: newPreis,
              abschnitte,
              abfahrtsZeitpunkt: abschnitte[0].abfahrtsZeitpunkt,
              ankunftsZeitpunkt: abschnitte[abschnitte.length-1].ankunftsZeitpunkt,
              abfahrtsOrt: abschnitte[0].abfahrtsOrt,
              ankunftsOrt: abschnitte[abschnitte.length-1].ankunftsOrt,
              info,
              umstiegsAnzahl: verbindung.verbindung.umstiegsAnzahl || 0,
            })
          }
        }
      }
    }

    // Sammle alle Intervalle
    const finalAllIntervals: IntervalDetails[] = []
    
    for (const iv of data.intervalle) {
      if (iv.preis && typeof iv.preis === "object" && "betrag" in iv.preis && Array.isArray(iv.verbindungen)) {
        for (const verbindung of iv.verbindungen) {
          let newPreis = 0
          if (verbindung.abPreis && typeof verbindung.abPreis === "object" && "betrag" in verbindung.abPreis) {
            newPreis = verbindung.abPreis.betrag
          } else {
            newPreis = iv.preis.betrag
          }
          if (verbindung.verbindung && verbindung.verbindung.verbindungsAbschnitte && verbindung.verbindung.verbindungsAbschnitte.length > 0) {
            const abschnitte = verbindung.verbindung.verbindungsAbschnitte.map((abschnitt: any) => ({
              abfahrtsZeitpunkt: abschnitt.abfahrtsZeitpunkt,
              ankunftsZeitpunkt: abschnitt.ankunftsZeitpunkt,
              abfahrtsOrt: abschnitt.abfahrtsOrt,
              ankunftsOrt: abschnitt.ankunftsOrt
            }))
            const info = abschnitte.map((a: IntervalAbschnitt) => `${a.abfahrtsOrt} → ${a.ankunftsOrt}`).join(' | ')
            finalAllIntervals.push({
              preis: newPreis,
              abschnitte,
              abfahrtsZeitpunkt: abschnitte[0].abfahrtsZeitpunkt,
              ankunftsZeitpunkt: abschnitte[abschnitte.length-1].ankunftsZeitpunkt,
              abfahrtsOrt: abschnitte[0].abfahrtsOrt,
              ankunftsOrt: abschnitte[abschnitte.length-1].ankunftsOrt,
              info,
              umstiegsAnzahl: verbindung.verbindung.umstiegsAnzahl || 0,
              // Keine isCheapestPerInterval-Markierung hier - wird in route.ts gemacht
            })
          }
        }
      }
    }

    // Erstelle vollständigen Cache-Eintrag mit ALLEN Verbindungen (ohne Markierung)
    const fullResult = {
      [tag]: {
        preis: 0, // Wird später in route.ts gesetzt
        info: "",
        abfahrtsZeitpunkt: "",
        ankunftsZeitpunkt: "",
        allIntervals: finalAllIntervals.sort((a, b) => a.preis - b.preis), // Sort by price
      },
    }

    // Cache ALLE Daten (ohne Zeitfilter)
    setCachedResult(cacheKey, fullResult)

    // Jetzt Zeitfilter für aktuelle Anfrage anwenden
    const timeFilteredIntervals = finalAllIntervals.filter(interval => {
      if (!config.abfahrtAb && !config.ankunftBis) return true
      
      const ersteAbfahrt = interval.abfahrtsZeitpunkt
      const letzteAnkunft = interval.ankunftsZeitpunkt
      
      let abfahrtOk = true
      let ankunftOk = true
      
      if (config.abfahrtAb) {
        const abfahrtTime = new Date(`1970-01-01T${ersteAbfahrt.split('T')[1]}`)
        const filterTime = new Date(`1970-01-01T${config.abfahrtAb}:00`)
        abfahrtOk = abfahrtTime >= filterTime
      }
      
      if (config.ankunftBis) {
        const ankunftTime = new Date(`1970-01-01T${letzteAnkunft.split('T')[1]}`)
        const filterTime = new Date(`1970-01-01T${config.ankunftBis}:00`)
        ankunftOk = ankunftTime <= filterTime
      }
      
      return abfahrtOk && ankunftOk
    })

    if (timeFilteredIntervals.length === 0) {
      console.log("No intervals remaining after time filtering")
      const result = { [tag]: { preis: 0, info: "Keine Verbindungen im gewählten Zeitraum!", abfahrtsZeitpunkt: "", ankunftsZeitpunkt: "", allIntervals: [] } }
      return { result, wasApiCall: true }
    }

    // Finde günstigste Verbindung für Bestpreis-Anzeige (aber ohne isCheapestPerInterval-Markierung)
    const bestPrice = Math.min(...timeFilteredIntervals.map(iv => iv.preis))
    const bestInterval = timeFilteredIntervals.find(interval => interval.preis === bestPrice)
    const sortedTimeFilteredIntervals = timeFilteredIntervals.sort((a, b) => a.preis - b.preis)

    const result = {
      [tag]: {
        preis: bestPrice,
        info: bestInterval?.info || "",
        abfahrtsZeitpunkt: bestInterval?.abfahrtsZeitpunkt || "",
        ankunftsZeitpunkt: bestInterval?.ankunftsZeitpunkt || "",
        allIntervals: sortedTimeFilteredIntervals,
      },
    }

    return { result, wasApiCall: true }
    } catch (error) {
      // Spezielle Behandlung für cancelled sessions
      if (error instanceof Error && error.message.includes('was cancelled')) {
        // Kein zusätzliches Logging - wird bereits in route.ts gehandelt
        const result = {
          [tag]: {
            preis: 0,
            info: "Search cancelled",
            abfahrtsZeitpunkt: "",
            ankunftsZeitpunkt: "",
          },
        }
        return { result, wasApiCall: true }
      }    console.error(`❌ API error for ${tag}:`, error instanceof Error ? error.message : error)
    const result = {
      [tag]: {
        preis: 0,
        info: `API Error: ${error instanceof Error ? error.message : "Unknown"}`,
        abfahrtsZeitpunkt: "",
        ankunftsZeitpunkt: "",
      },
    }
    return { result, wasApiCall: true }
  }
}