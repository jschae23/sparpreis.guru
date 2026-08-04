"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { PriceCalendar } from "./price-calendar"
import { DayDetailsModal } from "./day-details-modal"
import { TravelCombinations, type TravelCombination } from "./travel-combinations"
import { IncompleteSearchNotice } from "@/components/search/incomplete-search-notice"
import { logError, logInfo, logWarn } from "@/lib/shared/logger"

const LOG_SCOPE = "bestpreissuche.client"
const BACKGROUND_SEARCH_NOTICE = "Suchen können nicht im Hintergrund ausgeführt werden, um zu viele Anfragen an die Bahn-API zu vermeiden."

interface SearchParams {
  start?: string
  ziel?: string
  reisezeitraumAb?: string
  reisezeitraumBis?: string
  alter?: string
  ermaessigungArt?: string
  ermaessigungKlasse?: string
  klasse?: string
  schnelleVerbindungen?: string
  nurDeutschlandTicketVerbindungen?: string
  maximaleUmstiege?: string
  abfahrtAb?: string
  abfahrtBis?: string
  ankunftAb?: string
  ankunftBis?: string
  rueckfahrt?: string
  minNaechte?: string
  maxNaechte?: string
  returnAbfahrtAb?: string
  returnAbfahrtBis?: string
  returnAnkunftAb?: string
  returnAnkunftBis?: string
  wochentage?: string // Only weekdays
  returnWochentage?: string
  umstiegszeit?: string
}

interface TrainResultsProps {
  searchParams: SearchParams
}

interface PriceHistoryEntry {
  preis: number
  recorded_at: number
}

interface PriceData {
  preis: number
  info: string
  abfahrtsZeitpunkt: string
  ankunftsZeitpunkt: string
  recordedAt?: number
  priceHistory?: PriceHistoryEntry[]
  allIntervals?: Array<{
    preis: number
    abfahrtsZeitpunkt: string
    ankunftsZeitpunkt: string
    abfahrtsOrt: string
    ankunftsOrt: string
    info: string
    umstiegsAnzahl?: number
    isCheapestPerInterval?: boolean
    priceHistory?: PriceHistoryEntry[]
  }>
}

interface MetaData {
  startStation: { name: string; id: string }
  zielStation: { name: string; id: string }
  sessionId?: string
  searchParams?: {
    klasse?: string
    maximaleUmstiege?: string
    schnelleVerbindungen?: string | boolean
    nurDeutschlandTicketVerbindungen?: string | boolean
    abfahrtAb?: string
    abfahrtBis?: string
    ankunftAb?: string
    ankunftBis?: string
    rueckfahrt?: string
    minNaechte?: string
    maxNaechte?: string
    returnAbfahrtAb?: string
    returnAbfahrtBis?: string
    returnAnkunftAb?: string
    returnAnkunftBis?: string
    wochentage?: number[]
    returnWochentage?: number[]
    umstiegszeit?: string
  }
}

interface PriceResults {
  [date: string]: PriceData
}

const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]

function parseWeekdaysParam(value?: string, fallback = ALL_WEEKDAYS) {
  if (!value) return [...fallback]

  try {
    const decoded = decodeURIComponent(value)
    const parsed = decoded.startsWith("[")
      ? JSON.parse(decoded)
      : decoded.split(",").map(Number)

    if (Array.isArray(parsed)) {
      const weekdays = parsed.filter(
        (weekday): weekday is number =>
          typeof weekday === "number" &&
          Number.isInteger(weekday) &&
          weekday >= 0 &&
          weekday <= 6
      )
      if (weekdays.length > 0) return [...new Set(weekdays)]
    }
  } catch {}

  return [...fallback]
}

export function TrainResults({ searchParams }: TrainResultsProps) {
  const [priceResults, setPriceResults] = useState<PriceResults>({})
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedData, setSelectedData] = useState<PriceData | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [returnPriceResults, setReturnPriceResults] = useState<PriceResults>({})
  const [travelCombinations, setTravelCombinations] = useState<TravelCombination[]>([])
  const activeSessionIdRef = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const calendarRef = useRef<HTMLDivElement>(null)
  const [hasScrolledToCalendar, setHasScrolledToCalendar] = useState(false)
  const [showAbortModal, setShowAbortModal] = useState(false)
  const [abortModalMessage, setAbortModalMessage] = useState("")
  const [searchWasCancelled, setSearchWasCancelled] = useState(false)

  const hasReturnSearch = searchParams.rueckfahrt === "1"

  const countExpectedDates = (weekdays: number[]) => {
    if (!searchParams.reisezeitraumAb || !searchParams.reisezeitraumBis) {
      return 0
    }
    try {
      const startDate = new Date(searchParams.reisezeitraumAb)
      const endDate = new Date(searchParams.reisezeitraumBis)
      let count = 0
      
      for (let d = new Date(startDate); d <= endDate && count < 30; d.setDate(d.getDate() + 1)) {
        if (weekdays.includes(d.getDay())) {
          count++
        }
      }
      return count
    } catch {
      return 0
    }
  }

  const outwardWeekdays = parseWeekdaysParam(searchParams.wochentage)
  const returnWeekdays = parseWeekdaysParam(searchParams.returnWochentage, outwardWeekdays)
  const expectedOutwardDays = countExpectedDates(outwardWeekdays)
  const expectedReturnDays = hasReturnSearch
    ? countExpectedDates(returnWeekdays)
    : 0
  const expectedDays = expectedOutwardDays + expectedReturnDays

  // Track der bereits eingetroffenen dayResults
  const processedDaysRef = useRef<Set<string>>(new Set())

  // Generate sessionId when search starts
  const generateSessionId = () => {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID()
    }
    // Fallback für ältere Browser
    return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }

  const validPriceResults = Object.entries(priceResults).filter(([key]) => key !== "_meta") as [string, PriceData][]
  const _meta = (priceResults as any)._meta as MetaData | undefined
  const startStation = _meta?.startStation
  const zielStation = _meta?.zielStation

  // Beendet Stream und Progress-Polling sofort; die Backend-Benachrichtigung läuft separat.
  const cancelSearchWithReason = useCallback((reason: 'user_request' | 'page_hidden') => {
    const activeSessionId = activeSessionIdRef.current
    const activeController = abortControllerRef.current
    if (!activeSessionId && !activeController) return

    logInfo(LOG_SCOPE, "Bestpreissuche cancellation requested", { sessionId: activeSessionId, reason })

    activeSessionIdRef.current = null
    abortControllerRef.current = null
    activeController?.abort()

    setLoading(false)
    setIsStreaming(false)
    setSessionId(null)
    setSearchWasCancelled(true)

    setAbortModalMessage(
      reason === 'page_hidden'
        ? `Die Suche wurde automatisch abgebrochen, weil der Tab gewechselt oder die Seite verlassen wurde. ${BACKGROUND_SEARCH_NOTICE}`
        : "Die Suche wurde abgebrochen."
    )
    setShowAbortModal(true)

    if (activeSessionId) {
      void fetch(`/api/search-prices/cancel-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId, reason }),
        keepalive: true,
      }).then(() => {
        logInfo(LOG_SCOPE, "Backend notified about search cancellation", { sessionId: activeSessionId, reason })
      }).catch((error) => {
        logWarn(LOG_SCOPE, "Could not notify backend about search cancellation", {
          sessionId: activeSessionId,
          reason,
          error: error instanceof Error ? error.message : error,
        })
      })
    }
  }, [])

  const cancelSearch = useCallback(() => {
    cancelSearchWithReason('user_request')
  }, [cancelSearchWithReason])

  // Cleanup bei Component Unmount oder Navigation
  useEffect(() => {
    const notifyPageUnload = (reason: 'page_unload' | 'component_unmount') => {
      const activeSessionId = activeSessionIdRef.current
      if (activeSessionId) {
        const payload = new Blob(
          [JSON.stringify({ sessionId: activeSessionId, reason })],
          { type: 'application/json' }
        )
        navigator.sendBeacon('/api/search-prices/cancel-search', payload)
      }
    }

    const handleBeforeUnload = () => {
      notifyPageUnload('page_unload')
      abortControllerRef.current?.abort()
    }

    const handleVisibilityChange = () => {
      if (document.hidden && activeSessionIdRef.current) {
        cancelSearchWithReason('page_hidden')
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      notifyPageUnload('component_unmount')
      abortControllerRef.current?.abort()
      activeSessionIdRef.current = null
      abortControllerRef.current = null
    }
  }, [cancelSearchWithReason])

  // Create a unique key for the current search to prevent duplicate requests
  const currentSearchKey = JSON.stringify({
    start: searchParams.start,
    ziel: searchParams.ziel,
    reisezeitraumAb: searchParams.reisezeitraumAb,
    reisezeitraumBis: searchParams.reisezeitraumBis,
    ermaessigungArt: searchParams.ermaessigungArt,
    ermaessigungKlasse: searchParams.ermaessigungKlasse,
    alter: searchParams.alter,
    klasse: searchParams.klasse,
    schnelleVerbindungen: searchParams.schnelleVerbindungen,
    nurDeutschlandTicketVerbindungen: searchParams.nurDeutschlandTicketVerbindungen,
    maximaleUmstiege: searchParams.maximaleUmstiege,
    abfahrtAb: searchParams.abfahrtAb,
    abfahrtBis: searchParams.abfahrtBis,
    ankunftAb: searchParams.ankunftAb,
    ankunftBis: searchParams.ankunftBis,
    rueckfahrt: searchParams.rueckfahrt,
    minNaechte: searchParams.minNaechte,
    maxNaechte: searchParams.maxNaechte,
    returnAbfahrtAb: searchParams.returnAbfahrtAb,
    returnAbfahrtBis: searchParams.returnAbfahrtBis,
    returnAnkunftAb: searchParams.returnAnkunftAb,
    returnAnkunftBis: searchParams.returnAnkunftBis,
    wochentage: searchParams.wochentage, // Changed from 'tage'
    returnWochentage: searchParams.returnWochentage,
    umstiegszeit: searchParams.umstiegszeit,
  })

  useEffect(() => {
    // Only search if we have required params and this is a new search
    if (!searchParams.start || !searchParams.ziel || currentSearchKey === "") {
      return
    }

    const searchPrices = async () => {
      setLoading(true)
      setPriceResults({})
      setReturnPriceResults({})
      setTravelCombinations([])
      setIsStreaming(true)
      setShowAbortModal(false)
      setSearchWasCancelled(false)
      processedDaysRef.current = new Set()
      
      // Generiere sessionId sofort im Frontend
      const newSessionId = generateSessionId()
      activeSessionIdRef.current = newSessionId
      setSessionId(newSessionId)

      // Erstelle AbortController für diese Anfrage
      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        const response = await fetch("/api/search-prices", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            sessionId: newSessionId,
            start: searchParams.start,
            ziel: searchParams.ziel,
            reisezeitraumAb: searchParams.reisezeitraumAb || new Date().toISOString().split("T")[0],
            reisezeitraumBis: searchParams.reisezeitraumBis,
            wochentage: outwardWeekdays,
            returnWochentage: returnWeekdays,
            alter: searchParams.alter || "ERWACHSENER",
            ermaessigungArt: searchParams.ermaessigungArt || "KEINE_ERMAESSIGUNG",
            ermaessigungKlasse: searchParams.ermaessigungKlasse || "KLASSENLOS",
            klasse: searchParams.klasse || "KLASSE_2",
            schnelleVerbindungen: searchParams.schnelleVerbindungen === "1",
            nurDeutschlandTicketVerbindungen: searchParams.nurDeutschlandTicketVerbindungen === "1",
            ...(searchParams.maximaleUmstiege !== undefined && searchParams.maximaleUmstiege !== "" && { maximaleUmstiege: Number.parseInt(searchParams.maximaleUmstiege) }),
            abfahrtAb: searchParams.abfahrtAb,
            abfahrtBis: searchParams.abfahrtBis,
            ankunftAb: searchParams.ankunftAb,
            ankunftBis: searchParams.ankunftBis,
            rueckfahrt: searchParams.rueckfahrt,
            minNaechte: searchParams.minNaechte,
            maxNaechte: searchParams.maxNaechte,
            returnAbfahrtAb: searchParams.returnAbfahrtAb,
            returnAbfahrtBis: searchParams.returnAbfahrtBis,
            returnAnkunftAb: searchParams.returnAnkunftAb,
            returnAnkunftBis: searchParams.returnAnkunftBis,
            umstiegszeit: searchParams.umstiegszeit,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
          throw new Error(errorData.error || `HTTP ${response.status}: Bestpreissuche fehlgeschlagen`)
        }

        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        
        if (reader) {
          // Streaming response verarbeiten
          let buffer = ""
          
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ""
              
              for (const line of lines) {
                if (line.trim()) {
                  try {
                    const data = JSON.parse(line)
                    
                    if (data.type === 'dayResult') {
                      // Einzelnes Tagesergebnis hinzufügen
                      setPriceResults(prev => ({
                        ...prev,
                        [data.date]: data.result,
                        _meta: data.meta || prev._meta
                      }))
                      if (Array.isArray(data.travelCombinations)) {
                        setTravelCombinations(data.travelCombinations)
                      }
                      processedDaysRef.current.add(`outward:${data.date}`)
                    } else if (data.type === 'returnDayResult') {
                      setReturnPriceResults(prev => ({
                        ...prev,
                        [data.date]: data.result,
                      }))
                      if (Array.isArray(data.travelCombinations)) {
                        setTravelCombinations(data.travelCombinations)
                      }
                      processedDaysRef.current.add(`return:${data.date}`)
                    } else if (data.type === 'complete') {
                      // Vollständige Ergebnisse bei Abschluss
                      setPriceResults(data.results)
                      setReturnPriceResults(data.returnResults || {})
                      setTravelCombinations(data.travelCombinations || [])
                      setLoading(false)
                      setIsStreaming(false)
                      activeSessionIdRef.current = null
                      abortControllerRef.current = null
                      setSessionId(null)
                      return
                    }
                  } catch {
                    logWarn(LOG_SCOPE, "Could not parse Bestpreissuche streaming response line", {
                      sessionId: newSessionId,
                      line,
                    })
                  }
                }
              }
            }
            // Set status to completed after streaming ends
            setLoading(false)
            setIsStreaming(false)
          } finally {
            reader.releaseLock()
          }
          
          // Fallback: Versuche finalen Buffer als JSON zu parsen
          if (buffer.trim()) {
            try {
              const finalData = JSON.parse(buffer)
              setPriceResults(finalData.results || finalData)
              setReturnPriceResults(finalData.returnResults || {})
              setTravelCombinations(finalData.travelCombinations || [])
            } catch (e) {
              logWarn(LOG_SCOPE, "Could not parse Bestpreissuche final streaming buffer", {
                sessionId: newSessionId,
                buffer,
                error: e instanceof Error ? e.message : e,
              })
            }
          }
        } else {
          // Fallback für non-streaming response
          const data = await response.json()
          setPriceResults(data.results || data)
          setReturnPriceResults(data.returnResults || {})
          setTravelCombinations(data.travelCombinations || [])
        }
        
        if (activeSessionIdRef.current === newSessionId) {
          activeSessionIdRef.current = null
          abortControllerRef.current = null
          setSessionId(null)
        }
      } catch (err) {
         // Check if error was due to abort
        if (err instanceof Error && err.name === 'AbortError') {
          logInfo(LOG_SCOPE, "Bestpreissuche request aborted by user", { sessionId: newSessionId })
        } else {
          logError(LOG_SCOPE, "Bestpreissuche client request failed", err, { sessionId: newSessionId })
        }
      } finally {
        if (activeSessionIdRef.current === newSessionId) {
          activeSessionIdRef.current = null
          abortControllerRef.current = null
          setLoading(false)
          setIsStreaming(false)
          setSessionId(null)
        }
      }
    }

    searchPrices()
  }, [
    currentSearchKey,
    searchParams.start,
    searchParams.ziel,
    searchParams.reisezeitraumAb,
    searchParams.reisezeitraumBis,
    searchParams.alter,
    searchParams.klasse,
    searchParams.schnelleVerbindungen,
    searchParams.nurDeutschlandTicketVerbindungen,
    searchParams.maximaleUmstiege,
    searchParams.ermaessigungArt,
    searchParams.ermaessigungKlasse,
    searchParams.abfahrtAb,
    searchParams.abfahrtBis,
    searchParams.ankunftAb,
    searchParams.ankunftBis,
    searchParams.rueckfahrt,
    searchParams.minNaechte,
    searchParams.maxNaechte,
    searchParams.returnAbfahrtAb,
    searchParams.returnAbfahrtBis,
    searchParams.returnAnkunftAb,
    searchParams.returnAnkunftBis,
    searchParams.wochentage, // Changed from 'tage'
    searchParams.returnWochentage,
    searchParams.umstiegszeit,
  ])

  // --- Tag-Navigation für Modal und Kalender ---
  const dayKeys = validPriceResults.map(([date]) => date).sort()
  const handleNavigateDay = (direction: number) => {
    if (!selectedDay) return
    const idx = dayKeys.indexOf(selectedDay)
    const newIdx = idx + direction
    if (newIdx >= 0 && newIdx < dayKeys.length) {
      const newDay = dayKeys[newIdx]
      setSelectedDay(newDay)
      setSelectedData(priceResults[newDay])
    }
  }

  const prices = validPriceResults
    .map(([, r]) => r.preis)
    .filter((p) => p > 0)

  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const avgPrice = Math.round(prices.reduce((a: number, b: number) => a + b, 0) / prices.length)

  useEffect(() => {
    // Sobald der Kalender sichtbar ist (auch beim Laden), einmalig scrollen
    if (!hasScrolledToCalendar && calendarRef.current && (loading || isStreaming || validPriceResults.length > 0)) {
      calendarRef.current.scrollIntoView({ behavior: "smooth", block: "start" })
      setHasScrolledToCalendar(true)
    }
  }, [loading, isStreaming, hasScrolledToCalendar, validPriceResults.length])

  // Show nothing if no search params
  if (!searchParams.start || !searchParams.ziel) {
    return null
  }

  // Reset scroll-Flag, wenn neue Suche gestartet wird
  useEffect(() => {
    setHasScrolledToCalendar(false)
  }, [currentSearchKey])

  // Always show calendar when search is active or has results
  if (!hasReturnSearch && !loading && !isStreaming && !showAbortModal && !searchWasCancelled && (!validPriceResults || validPriceResults.length === 0)) {
    return (
        <div className="text-center py-8">
          <p className="text-red-600 font-medium">Keine Bestpreise gefunden</p>
          <p className="text-gray-600 text-sm mt-2">
            Bitte überprüfe die Bahnhofsnamen und versuche es erneut.
          </p>
        </div>
    )
  }

  // Only show "no prices" message if search is completely done and no valid prices found
  if (!hasReturnSearch && !loading && !isStreaming && !showAbortModal && !searchWasCancelled && prices.length === 0) {
    return (
        <div className="text-center py-8">
          <p className="text-orange-600 font-medium">Keine Preise gefunden</p>
          <p className="text-gray-600 text-sm mt-2">Für den gewählten Zeitraum sind keine Bestpreise verfügbar. Bitte prüfe insbesondere gesetzte Filter auf Widersprüche.</p>
        </div>
    )
  }

  return (
      <div className="space-y-6">
        {searchWasCancelled && <IncompleteSearchNotice />}

        {hasReturnSearch ? (
          <div ref={calendarRef}>
            <TravelCombinations
              combinations={travelCombinations}
              outwardResults={priceResults}
              returnResults={returnPriceResults}
              expectedOutwardDays={expectedOutwardDays}
              expectedReturnDays={expectedReturnDays}
              startStation={startStation}
              zielStation={zielStation}
              searchParams={searchParams}
              isStreaming={isStreaming}
              sessionId={sessionId}
              onCancelSearch={cancelSearch}
            />
          </div>
        ) : (
          <>
            {/* Calendar View */}
            <div ref={calendarRef}>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                📅 Preiskalender
                <span className="text-sm font-normal text-gray-500">(Klicken zum Buchen)</span>
              </h3>
              <PriceCalendar
                  results={priceResults}
                  onDayClick={(date, data) => {
                    setSelectedDay(date)
                    setSelectedData(data)
                  }}
                  startStation={startStation}
                  zielStation={zielStation}
                  searchParams={searchParams}
                  isStreaming={isStreaming}
                  sessionId={sessionId}
                  onCancelSearch={cancelSearch}
                  selectedDay={selectedDay || undefined}
                  onNavigateDay={handleNavigateDay}
                  expectedDays={expectedDays}
              />
            </div>

            {/* Day Details Modal */}
            <DayDetailsModal
                isOpen={!!selectedDay}
                onClose={() => {
                  setSelectedDay(null)
                  setSelectedData(null)
                }}
                date={selectedDay}
                data={selectedData}
                startStation={startStation}
                zielStation={zielStation}
                searchParams={searchParams}
                onNavigateDay={handleNavigateDay}
                dayKeys={dayKeys}
            />
          </>
        )}

        {showAbortModal && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 text-center shadow-lg">
              <div className="mb-2 text-lg font-semibold text-gray-900">Suche abgebrochen</div>
              <div className="mb-4 text-sm text-gray-600">{abortModalMessage}</div>
              <button
                type="button"
                onClick={() => setShowAbortModal(false)}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>
  )
}
