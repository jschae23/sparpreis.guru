import { type NextRequest, NextResponse } from "next/server"
import { globalRateLimiter } from './rate-limiter'
import { searchBahnhof, getBestPrice } from './bahn-api'
import { updateProgress, updateAverageResponseTimes, getAverageResponseTimes } from './utils'
import { generateCacheKey, getCachedResult, getCacheSize } from './cache'
import { recommendBestPrice } from '@/lib/recommendation-engine'

// Hilfsfunktion für lokales Datum im Format YYYY-MM-DD
function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const day = date.getDate().toString().padStart(2, "0")
  return `${year}-${month}-${day}`
}

interface TrainResult {
  preis: number
  info: string
  abfahrtsZeitpunkt: string
  ankunftsZeitpunkt: string
  allIntervals?: Array<{
    preis: number
    abfahrtsZeitpunkt: string
    ankunftsZeitpunkt: string
    abfahrtsOrt: string
    ankunftsOrt: string
    info: string
    umstiegsAnzahl: number
  }>
}

interface TrainResults {
  [date: string]: TrainResult
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      sessionId: providedSessionId,
      start,
      ziel,
      tage, // Array der gewünschten Tage im Format ["2024-07-01", "2024-07-03", ...]
      reisezeitraumAb, // Fallback falls tage nicht übergeben wird
      dayLimit, // Fallback falls tage nicht übergeben wird
      alter,
      ermaessigungArt,
      ermaessigungKlasse,
      klasse,
      schnelleVerbindungen,
      nurDeutschlandTicketVerbindungen,
      maximaleUmstiege,
      abfahrtAb,
      ankunftBis,
    } = body

    console.log("\n🚂 Starting bestpreissuche request")
    console.log("📋 Request parameters:")
    console.log("  - Start:", start, "Ziel:", ziel)
    console.log("  - abfahrtAb:", abfahrtAb, "ankunftBis:", ankunftBis)
    console.log("  - klasse:", klasse, "maximaleUmstiege:", maximaleUmstiege)

    if (!start || !ziel) {
      return NextResponse.json({ error: "Start and destination required" }, { status: 400 })
    }

    // Verwende die übergebene sessionId oder generiere eine neue
    const sessionId = providedSessionId || crypto.randomUUID()
    console.log(`📱 Session ID: ${sessionId}`)

    // Search for stations
    console.log("\n📍 Searching for stations...")
    const startStation = await searchBahnhof(start)
    const zielStation = await searchBahnhof(ziel)

    if (!startStation || !zielStation) {
      return NextResponse.json(
        {
          error: `Station not found. Start: ${startStation ? "✓" : "✗"}, Ziel: ${zielStation ? "✓" : "✗"}`,
        },
        { status: 404 },
      )
    }

    // Streaming Response Setup
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        let isStreamClosed = false
        let cancelLoggedForSession = false  // Verhindere mehrfache Cancel-Logs pro Session
        
        // Helper function to safely enqueue data
        const safeEnqueue = (data: Uint8Array) => {
          if (!isStreamClosed) {
            try {
              controller.enqueue(data)
              return true
            } catch (error) {
              if (!cancelLoggedForSession) {
                console.log(`ℹ️ User disconnected - search stopped gracefully (session: ${sessionId})`)
                cancelLoggedForSession = true
              }
              isStreamClosed = true
              return false
            }
          }
          return false
        }
        
        // Helper function to safely close stream
        const safeClose = () => {
          if (!isStreamClosed) {
            try {
              controller.close()
              isStreamClosed = true
            } catch (error) {
              console.log(`ℹ️ Stream was already closed by user`)
              isStreamClosed = true
            }
          }
        }
        
        try {
          // Verwende tage-Array wenn vorhanden, sonst fallback zu altem System
          let datesToProcess: string[] = []
          let maxDays = 0

          if (tage && Array.isArray(tage) && tage.length > 0) {
            // Neues System: Verwende die übergebenen Tage
            datesToProcess = tage.slice(0, 30) // Limitiere auf max 30 Tage
            maxDays = datesToProcess.length
            console.log(`\n🔍 Using provided dates array: ${datesToProcess.length} specific dates`)
            console.log(`📅 Dates to process: ${datesToProcess.join(', ')}`)
          } else {
            // Fallback: Altes System mit Zeitraum
            const [jahr, monat, tag] = reisezeitraumAb.split("-").map(Number)
            const startDate = new Date(jahr, monat - 1, tag)
            maxDays = Math.min(Math.max(Number.parseInt(dayLimit || "3"), 1), 30)
            
            for (let dayCount = 0; dayCount < maxDays; dayCount++) {
              const currentDate = new Date(startDate)
              currentDate.setDate(currentDate.getDate() + dayCount)
              datesToProcess.push(formatDateKey(currentDate))
            }
            console.log(`\n🔍 Using fallback date range: ${maxDays} consecutive days starting from ${formatDateKey(startDate)}`)
          }

          console.log(`📊 Cache status: ${getCacheSize()} entries`)

          // Erstelle Liste aller Tage mit Cache-Status
          const dayStatusList: { date: string; isCached: boolean }[] = []
          for (const dateStr of datesToProcess) {
            const cacheKey = generateCacheKey({
              startStationId: startStation.normalizedId,
              zielStationId: zielStation.normalizedId,
              date: dateStr,
              alter,
              ermaessigungArt: ermaessigungArt || "KEINE_ERMAESSIGUNG",
              ermaessigungKlasse: ermaessigungKlasse || "KLASSENLOS",
              klasse,
              maximaleUmstiege: Number.parseInt(maximaleUmstiege || "0"),
              schnelleVerbindungen: Boolean(schnelleVerbindungen === true || schnelleVerbindungen === "true"),
              nurDeutschlandTicketVerbindungen: Boolean(
                nurDeutschlandTicketVerbindungen === true || nurDeutschlandTicketVerbindungen === "true",
              ),
              abfahrtAb,
              ankunftBis,
            })
            const isCached = !!getCachedResult(cacheKey)
            dayStatusList.push({ date: dateStr, isCached })
          }

          // Gesamtanzahl der gecachten und ungecachten Tage für die gesamte Suche
          let totalUncachedDays = dayStatusList.filter((d) => !d.isCached).length
          let totalCachedDays = dayStatusList.filter((d) => d.isCached).length
          const avgTimes = getAverageResponseTimes()

          // Meta-Daten für Frontend
          const metaData = {
            startStation: startStation,
            zielStation: zielStation,
            searchParams: {
              klasse,
              maximaleUmstiege,
              schnelleVerbindungen,
              nurDeutschlandTicketVerbindungen,
              abfahrtAb,
              ankunftBis,
            },
            sessionId,
          }

          const results: TrainResults = {}

          // Initialer Progress-Update - zeigt sofort die Queue-Size an
          const queueStatus = globalRateLimiter.getQueueStatus()
          await updateProgress(
            sessionId,
            0, // Start bei Tag 0
            maxDays,
            datesToProcess[0] || "",
            false,
            totalUncachedDays,
            totalCachedDays,
            avgTimes.uncached,
            avgTimes.cached,
            queueStatus.queueSize,
            queueStatus.activeRequests
          )

          // Starte alle Requests parallel (nicht sequenziell!)
          const requestPromises = datesToProcess.map(async (currentDateStr, dayCount) => {
            // Prüfe Session-Abbruch VOR jedem Request
            if (globalRateLimiter.isSessionCancelledSync(sessionId)) {
              if (!cancelLoggedForSession) {
                console.log(`🛑 Session ${sessionId} cancelled by user - stopping search`)
                cancelLoggedForSession = true
              }
              return { currentDateStr, dayResponse: { result: null }, dayCount }
            }

            const isCached = dayStatusList[dayCount].isCached
            const currentDate = new Date(currentDateStr)
            const t0 = Date.now()

            const dayResponse = await getBestPrice({
              abfahrtsHalt: startStation.id,
              ankunftsHalt: zielStation.id,
              startStationNormalizedId: startStation.normalizedId,
              zielStationNormalizedId: zielStation.normalizedId,
              anfrageDatum: currentDate,
              sessionId,
              alter,
              ermaessigungArt,
              ermaessigungKlasse,
              klasse,
              maximaleUmstiege: Number.parseInt(maximaleUmstiege || "0"),
              schnelleVerbindungen: schnelleVerbindungen === true || schnelleVerbindungen === "1",
              nurDeutschlandTicketVerbindungen:
                nurDeutschlandTicketVerbindungen === true || nurDeutschlandTicketVerbindungen === "1",
              abfahrtAb,
              ankunftBis,
            })

            // Prüfe Session-Abbruch NACH dem Request aber VOR der Verarbeitung
            if (globalRateLimiter.isSessionCancelledSync(sessionId)) {
              // Nur einmal loggen, nicht für jeden Tag
              return { currentDateStr, dayResponse: { result: null }, dayCount }
            }

            // Filter: Nachtverbindungen nur, wenn reine Uhrzeit von Ankunft bis vor der reinen Uhrzeit Abfahrt liegt
            if (ankunftBis && dayResponse.result) {
              for (const dateKey of Object.keys(dayResponse.result)) {
                const priceData = dayResponse.result[dateKey]
                if (priceData && priceData.allIntervals && Array.isArray(priceData.allIntervals)) {
                  priceData.allIntervals = priceData.allIntervals.filter(interval => {
                    const depDate = new Date(interval.abfahrtsZeitpunkt)
                    const arrDate = new Date(interval.ankunftsZeitpunkt)
                    // Uhrzeiten extrahieren
                    const depMinutes = depDate.getHours() * 60 + depDate.getMinutes()
                    const arrMinutes = arrDate.getHours() * 60 + arrDate.getMinutes()
                    const [h, m] = ankunftBis.split(":").map(Number)
                    const limitMinutes = h * 60 + (m || 0)
                    // Fall 1: Ankunft am selben Tag
                    if (
                      depDate.getFullYear() === arrDate.getFullYear() &&
                      depDate.getMonth() === arrDate.getMonth() &&
                      depDate.getDate() === arrDate.getDate()
                    ) {
                      return arrMinutes <= limitMinutes
                    }
                    // Fall 2: Ankunft am Folgetag, nur wenn arrMinutes <= limitMinutes UND depMinutes > arrMinutes
                    const nextDay = new Date(depDate)
                    nextDay.setDate(depDate.getDate() + 1)
                    if (
                      arrDate.getFullYear() === nextDay.getFullYear() &&
                      arrDate.getMonth() === nextDay.getMonth() &&
                      arrDate.getDate() === nextDay.getDate()
                    ) {
                      return arrMinutes <= limitMinutes && depMinutes > arrMinutes
                    }
                    // Sonst: ausblenden
                    return false
                  })
                }
              }
            }

            // Verbesserte Filterlogik für Abfahrt/Ankunft-Zeitfenster (inkl. Nachtverbindungen)
            if ((abfahrtAb || ankunftBis) && dayResponse.result) {
              for (const dateKey of Object.keys(dayResponse.result)) {
                const priceData = dayResponse.result[dateKey]
                if (priceData && priceData.allIntervals && Array.isArray(priceData.allIntervals)) {
                  const originalIntervals = priceData.allIntervals
                  
                  const filteredIntervals = originalIntervals.filter(interval => {
                    const depDate = new Date(interval.abfahrtsZeitpunkt)
                    const arrDate = new Date(interval.ankunftsZeitpunkt)
                    const depMinutes = depDate.getHours() * 60 + depDate.getMinutes()
                    const arrMinutes = arrDate.getHours() * 60 + arrDate.getMinutes()
                    // Parse Filterzeiten
                    const abfahrtAbMinutes = abfahrtAb ? (() => { const [h, m] = abfahrtAb.split(":").map(Number); return h * 60 + (m || 0) })() : null
                    const ankunftBisMinutes = ankunftBis ? (() => { const [h, m] = ankunftBis.split(":").map(Number); return h * 60 + (m || 0) })() : null

                    // Beide Filter gesetzt
                    if (abfahrtAbMinutes !== null && ankunftBisMinutes !== null) {
                      if (abfahrtAbMinutes < ankunftBisMinutes) {
                        // Zeitfenster innerhalb eines Tages (z.B. 10–18 Uhr): Nur Tagesverbindungen
                        return (
                          depDate.getFullYear() === arrDate.getFullYear() &&
                          depDate.getMonth() === arrDate.getMonth() &&
                          depDate.getDate() === arrDate.getDate() &&
                          depMinutes >= abfahrtAbMinutes &&
                          arrMinutes <= ankunftBisMinutes
                        )
                      } else {
                        // Zeitfenster über Mitternacht (z.B. 22–06 Uhr): Nachtverbindungen erlauben
                        // Fall 1: Abfahrt und Ankunft am selben Tag, Abfahrt >= abfahrtAb
                        if (
                          depDate.getFullYear() === arrDate.getFullYear() &&
                          depDate.getMonth() === arrDate.getMonth() &&
                          depDate.getDate() === arrDate.getDate()
                        ) {
                          return depMinutes >= abfahrtAbMinutes
                        }
                        // Fall 2: Ankunft am Folgetag, Abfahrt >= abfahrtAb, Ankunft <= ankunftBis
                        const nextDay = new Date(depDate)
                        nextDay.setDate(depDate.getDate() + 1)
                        if (
                          arrDate.getFullYear() === nextDay.getFullYear() &&
                          arrDate.getMonth() === nextDay.getMonth() &&
                          arrDate.getDate() === nextDay.getDate()
                        ) {
                          return depMinutes >= abfahrtAbMinutes && arrMinutes <= ankunftBisMinutes
                        }
                        return false
                      }
                    }
                    // Nur abfahrtAb gesetzt
                    if (abfahrtAbMinutes !== null) {
                      return depMinutes >= abfahrtAbMinutes
                    }
                    // Nur ankunftBis gesetzt
                    if (ankunftBisMinutes !== null) {
                      // Nur Verbindungen, die am selben Tag ankommen
                      return (
                        depDate.getFullYear() === arrDate.getFullYear() &&
                        depDate.getMonth() === arrDate.getMonth() &&
                        depDate.getDate() === arrDate.getDate() &&
                        arrMinutes <= ankunftBisMinutes
                      )
                    }
                    // Kein Filter: alles erlauben
                    return true
                  })

                  // Aktualisiere die Intervalle und berechne neuen Bestpreis mit intelligentem Algorithmus
                  priceData.allIntervals = filteredIntervals
                  
                  if (filteredIntervals.length === 0) {
                    // Keine Verbindungen nach Filterung
                    priceData.preis = 0
                    priceData.abfahrtsZeitpunkt = ""
                    priceData.ankunftsZeitpunkt = ""
                    priceData.info = "Keine Verbindungen im gewählten Zeitfenster"
                  } else {
                    // Verwende intelligenten Algorithmus für Bestpreis-Auswahl
                    const recommendedTrip = recommendBestPrice(filteredIntervals)
                    
                    if (recommendedTrip) {
                      priceData.preis = recommendedTrip.preis
                      priceData.abfahrtsZeitpunkt = recommendedTrip.abfahrtsZeitpunkt
                      priceData.ankunftsZeitpunkt = recommendedTrip.ankunftsZeitpunkt
                      priceData.info = recommendedTrip.info
                    } else {
                      // Fallback zur alten Logik falls Algorithmus nichts findet
                      const minPrice = Math.min(...filteredIntervals.map(i => i.preis))
                      const bestPriceIntervals = filteredIntervals.filter(i => i.preis === minPrice)
                      bestPriceIntervals.sort((a, b) => {
                        const aDuration = new Date(a.ankunftsZeitpunkt).getTime() - new Date(a.abfahrtsZeitpunkt).getTime()
                        const bDuration = new Date(b.ankunftsZeitpunkt).getTime() - new Date(b.abfahrtsZeitpunkt).getTime()
                        if (aDuration !== bDuration) return aDuration - bDuration
                        return new Date(a.abfahrtsZeitpunkt).getTime() - new Date(b.abfahrtsZeitpunkt).getTime()
                      })
                      const bestInterval = bestPriceIntervals[0]
                      
                      priceData.preis = minPrice
                      priceData.abfahrtsZeitpunkt = bestInterval?.abfahrtsZeitpunkt || priceData.abfahrtsZeitpunkt
                      priceData.ankunftsZeitpunkt = bestInterval?.ankunftsZeitpunkt || priceData.ankunftsZeitpunkt
                      priceData.info = bestInterval?.info || priceData.info
                    }
                  }
                }
              }
            }

            const duration = Date.now() - t0
            updateAverageResponseTimes(duration, isCached)

            // Markiere günstigste Verbindung pro Zeitfenster NACH allen Filtern
            if (dayResponse.result) {
              for (const dateKey of Object.keys(dayResponse.result)) {
                const priceData = dayResponse.result[dateKey]
                if (priceData && priceData.allIntervals && Array.isArray(priceData.allIntervals)) {
                  // Falls noch kein spezifischer Bestpreis gesetzt wurde (d.h. keine Zeitfilter), 
                  // verwende den intelligenten Algorithmus auch hier
                  if (!abfahrtAb && !ankunftBis && priceData.allIntervals.length > 1) {
                    const recommendedTrip = recommendBestPrice(priceData.allIntervals)
                    if (recommendedTrip) {
                      priceData.preis = recommendedTrip.preis
                      priceData.abfahrtsZeitpunkt = recommendedTrip.abfahrtsZeitpunkt
                      priceData.ankunftsZeitpunkt = recommendedTrip.ankunftsZeitpunkt
                      priceData.info = recommendedTrip.info
                    }
                  }

                  // Definiere die Zeitfenster (wie bei der Bahn)
                  const timeSlots = [
                    { start: 0, end: 7 },    // 0-7 Uhr
                    { start: 7, end: 10 },   // 7-10 Uhr
                    { start: 10, end: 13 },  // 10-13 Uhr
                    { start: 13, end: 16 },  // 13-16 Uhr
                    { start: 16, end: 19 },  // 16-19 Uhr
                    { start: 19, end: 24 },  // 19-24 Uhr
                  ]

                  // Gruppiere Verbindungen nach Zeitfenstern
                  const slotMap = new Map<number, any[]>()
                  for (const interval of priceData.allIntervals) {
                    const depDate = new Date(interval.abfahrtsZeitpunkt)
                    const depHour = depDate.getHours() + (depDate.getMinutes() / 60)
                    const slotIndex = timeSlots.findIndex(slot => depHour >= slot.start && depHour < slot.end)
                    if (slotIndex >= 0) {
                      if (!slotMap.has(slotIndex)) {
                        slotMap.set(slotIndex, [])
                      }
                      slotMap.get(slotIndex)!.push(interval)
                    }
                  }

                  // Markiere günstigste Verbindung pro Zeitfenster
                  slotMap.forEach((intervals) => {
                    if (intervals.length > 0) {
                      // Verwende intelligenten Algorithmus für beste Verbindung pro Slot
                      const bestInSlot = recommendBestPrice(intervals)
                      if (bestInSlot) {
                        // Markiere nur die empfohlene Verbindung im Slot
                        intervals.forEach(interval => {
                          interval.isCheapestPerInterval = interval === bestInSlot
                        })
                      } else {
                        // Fallback: Sortiere nach Preis, dann Reisedauer, dann Abfahrt
                        const sortedIntervals = intervals.slice().sort((a, b) => {
                          if (a.preis !== b.preis) return a.preis - b.preis
                          // Reisedauer berechnen
                          const aDuration = new Date(a.ankunftsZeitpunkt).getTime() - new Date(a.abfahrtsZeitpunkt).getTime()
                          const bDuration = new Date(b.ankunftsZeitpunkt).getTime() - new Date(b.abfahrtsZeitpunkt).getTime()
                          if (aDuration !== bDuration) return aDuration - bDuration
                          // Abfahrtszeit
                          return new Date(a.abfahrtsZeitpunkt).getTime() - new Date(b.abfahrtsZeitpunkt).getTime()
                        })
                        // Nur die erste Verbindung markieren
                        sortedIntervals.forEach((interval, idx) => {
                          interval.isCheapestPerInterval = idx === 0
                        })
                      }
                    }
                  })
                }
              }
            }

            return { currentDateStr, dayResponse, dayCount }
          })

          // Verarbeite Ergebnisse sobald sie ankommen
          let completedRequests = 0
          const processResult = async (resultPromise: Promise<any>) => {
            try {
              const { currentDateStr, dayResponse, dayCount } = await resultPromise
              completedRequests++

              // Prüfe Session-Abbruch BEVOR Ergebnis verarbeitet wird
              if (globalRateLimiter.isSessionCancelledSync(sessionId)) {
                return false
              }

              if (dayResponse.result) {
                Object.assign(results, dayResponse.result)
                //console.log(`Day ${currentDateStr} result:`, Object.values(dayResponse.result)[0])
                
                // Stream einzelnes Tagesergebnis nur wenn Session noch aktiv
                if (!globalRateLimiter.isSessionCancelledSync(sessionId)) {
                  const dayResult = {
                    type: 'dayResult',
                    date: currentDateStr,
                    result: Object.values(dayResponse.result)[0],
                    meta: metaData
                  }
                  
                  if (!safeEnqueue(encoder.encode(JSON.stringify(dayResult) + '\n'))) {
                    // User disconnected - stop processing but don't log multiple times
                    return false
                  }
                }
              }

              // Progress-Update nach jedem abgeschlossenen Request (nur wenn Session noch aktiv)
              if (!globalRateLimiter.isSessionCancelledSync(sessionId)) {
                const updatedQueueStatus = globalRateLimiter.getQueueStatus()
                const updatedAvgTimes = getAverageResponseTimes()
                await updateProgress(
                  sessionId,
                  completedRequests,
                  maxDays,
                  currentDateStr,
                  false,
                  Math.max(0, totalUncachedDays - completedRequests),
                  Math.max(0, totalCachedDays - completedRequests),
                  updatedAvgTimes.uncached,
                  updatedAvgTimes.cached,
                  updatedQueueStatus.queueSize,
                  updatedQueueStatus.activeRequests
                )
              }

              return true
            } catch (error) {
              completedRequests++
              
              // Behandle cancelled sessions nicht als Fehler
              if (error instanceof Error && error.message.includes('was cancelled')) {
                if (!cancelLoggedForSession) {
                  console.log(`ℹ️ Search was cancelled by user (session: ${sessionId})`)
                  cancelLoggedForSession = true
                }
                return true
              }
              
              console.error(`❌ Error processing request:`, error)
              return true
            }
          }

          // Warte auf alle Requests, aber verarbeite sie sobald sie fertig sind
          await Promise.all(requestPromises.map(processResult))

          // Final Progress-Update
          // Hilfsfunktion: Zähle nur echte Tagesergebnisse (ohne _meta und ohne leere Ergebnisse)
          function countProcessedDays(resultsObj: TrainResults) {
            return Object.entries(resultsObj).filter(
              ([key, val]) => key !== '_meta' && val && (val.preis > 0 || (val.preis === 0 && val.info && val.info !== 'Search cancelled'))
            ).length
          }

          // Final Progress-Update
          const finalQueueStatus = globalRateLimiter.getQueueStatus()
          const finalAvgTimes = getAverageResponseTimes()
          const processedDays = countProcessedDays(results)
          await updateProgress(
            sessionId, 
            processedDays, // Tatsächlich verarbeitete Tage
            maxDays, 
            datesToProcess[maxDays - 1] || "",
            true,
            0,
            0,
            finalAvgTimes.uncached,
            finalAvgTimes.cached,
            finalQueueStatus.queueSize,
            finalQueueStatus.activeRequests
          )

          console.log(`\n✅ Bestpreissuche completed: ${processedDays} days processed (of ${maxDays} planned)`)
          console.log(`📊 Final cache status: ${getCacheSize()} entries`)

          // Add station info for booking links
          const resultsWithStations = {
            ...results,
            _meta: metaData,
          }

          // Stream vollständige Ergebnisse am Ende
          const completeResult = {
            type: 'complete',
            results: resultsWithStations,
            processedDays,
            plannedDays: maxDays
          }
          
          // Nur senden wenn Stream noch aktiv ist
          if (safeEnqueue(encoder.encode(JSON.stringify(completeResult) + '\n'))) {
            safeClose()
          }
          
        } catch (error) {
          console.error("Error in streaming bestpreissuche:", error)
          const errorResult = {
            type: 'error',
            error: "Internal server error",
            details: error instanceof Error ? error.message : "Unknown error"
          }
          safeEnqueue(encoder.encode(JSON.stringify(errorResult) + '\n'))
          safeClose()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Transfer-Encoding': 'chunked',
      },
    })
  } catch (error) {
    console.error("Error in bestpreissuche API:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
