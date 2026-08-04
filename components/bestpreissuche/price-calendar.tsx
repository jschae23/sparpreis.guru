"use client"

import React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { logWarn } from "@/lib/shared/logger"
import { SearchQueueStatus } from "@/components/search/search-queue-status"
import { SearchCancelButton } from "@/components/search/search-cancel-button"
import { useSearchQueueStatus } from "@/hooks/use-search-queue-status"

const LOG_SCOPE = "bestpreissuche.price-calendar"

interface IntervalData {
  preis: number
  abfahrtsZeitpunkt: string
  ankunftsZeitpunkt: string
  abfahrtsOrt: string
  ankunftsOrt: string
  info: string
  umstiegsAnzahl?: number
  isCheapestPerInterval?: boolean
}

interface PriceData {
  preis: number
  info: string
  abfahrtsZeitpunkt: string
  ankunftsZeitpunkt: string
  allIntervals?: IntervalData[]
}

interface PriceResults {
  [date: string]: PriceData
}

interface PriceCalendarProps {
  results: PriceResults
  onDayClick: (date: string, data: PriceData) => void
  startStation?: { name: string; id: string }
  zielStation?: { name: string; id: string }
  searchParams?: any
  isStreaming?: boolean
  expectedDays?: number
  sessionId?: string | null
  onCancelSearch?: () => void
  onNavigateDay?: (direction: number) => void // Neue Prop für Tag-Navigation
  selectedDay?: string // Neu: Ausgewählter Tag (YYYY-MM-DD)
}

// Wochentage so anpassen, dass Montag links steht
const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
const months = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
]

export function PriceCalendar({ results, onDayClick, startStation, zielStation, searchParams, isStreaming, expectedDays, sessionId, onCancelSearch, onNavigateDay, selectedDay }: PriceCalendarProps) {
  const today = new Date()
  const resultDates = Object.keys(results).filter(key => key !== '_meta').sort()
  
  // Hilfsfunktion: Date zu YYYY-MM-DD (lokal, nicht UTC!)
  const formatDateKey = (date: Date) => {
    const year = date.getFullYear()
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    const day = date.getDate().toString().padStart(2, "0")
    return `${year}-${month}-${day}`
  }
  
  if (resultDates.length === 0 && !isStreaming) {
    return (
      <div className="text-center py-8 text-gray-500">
        Keine Suchergebnisse verfügbar. Bitte starte eine neue Suche.
      </div>
    )
  }

  // Get the date range from results or expected range
  const dates = Object.keys(results).filter(key => key !== '_meta').sort()
  
  // Generate expected date range if streaming
  const getExpectedDateRange = () => {
    // Wenn nicht streamend, verwende die bereits vorhandenen Daten
    if (!isStreaming) {
      return dates
    }
    
    // Berechne erwartete Daten aus Wochentagen und Datumsbereich
    if (searchParams?.reisezeitraumAb && searchParams?.reisezeitraumBis) {
      try {
        // Parse weekdays from readable format or default to all days
        let weekdays: number[]
        if (searchParams.wochentage) {
          const decoded = decodeURIComponent(searchParams.wochentage)
          if (decoded.startsWith('[')) {
            // Old JSON format
            weekdays = JSON.parse(decoded)
          } else {
            // New readable format: "1,2,3,4,5"
            weekdays = decoded.split(',').map(Number).filter(n => !isNaN(n) && n >= 0 && n <= 6)
          }
        } else {
          // No weekdays param = all days
          weekdays = [1, 2, 3, 4, 5, 6, 0]
        }
        
        const startDate = new Date(searchParams.reisezeitraumAb)
        const endDate = new Date(searchParams.reisezeitraumBis)
        const expectedDates: string[] = []
        
        for (let d = new Date(startDate); d <= endDate && expectedDates.length < 30; d.setDate(d.getDate() + 1)) {
          if (weekdays.includes(d.getDay())) {
            expectedDates.push(formatDateKey(d))
          }
        }
        
        return expectedDates.sort()
      } catch (error) {
        logWarn(LOG_SCOPE, "Could not calculate expected dates from weekdays", {
          fromDate: searchParams?.reisezeitraumAb,
          toDate: searchParams?.reisezeitraumBis,
          weekdays: searchParams?.wochentage,
          error: error instanceof Error ? error.message : error,
        })
      }
    }
    
    return dates
  }
  
  const expectedDateRange = getExpectedDateRange()
  const firstExpectedDate = expectedDateRange.length > 0 ? new Date(expectedDateRange[0]) : (dates.length > 0 ? new Date(dates[0]) : new Date())
  const lastExpectedDate = expectedDateRange.length > 0 ? new Date(expectedDateRange[expectedDateRange.length - 1]) : (dates.length > 0 ? new Date(dates[dates.length - 1]) : new Date())

  if (dates.length === 0 && expectedDateRange.length === 0) return null

  const firstDate = dates.length > 0 ? new Date(dates[0]) : firstExpectedDate
  const lastDate = dates.length > 0 ? new Date(dates[dates.length - 1]) : lastExpectedDate

  // State for calendar navigation
  const [currentMonth, setCurrentMonth] = useState(() => new Date())

  useEffect(() => {
    if (firstDate) {
      setCurrentMonth(new Date(firstDate.getFullYear(), firstDate.getMonth(), 1))
    }
  }, [firstDate.getFullYear(), firstDate.getMonth()])

  // Find min and max prices for color coding
  const prices = Object.values(results)
    .map((r) => r.preis)
    .filter((p) => p > 0)

  const minPrice = prices.length > 0 ? Math.min(...prices) : 0
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0

  // Generate calendar days for current month
  const generateCalendarDays = () => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()

    // First day of the month
    const firstDayOfMonth = new Date(year, month, 1)
    // Last day of the month
    const lastDayOfMonth = new Date(year, month + 1, 0)

    // Start from the first Monday of the week containing the first day
    const startDate = new Date(firstDayOfMonth)
    const dayOfWeek = (startDate.getDay() + 6) % 7 // Montag=0, Sonntag=6
    startDate.setDate(startDate.getDate() - dayOfWeek)

    // End at the last Sunday of the week containing the last day
    const endDate = new Date(lastDayOfMonth)
    const endDayOfWeek = (endDate.getDay() + 6) % 7
    endDate.setDate(endDate.getDate() + (6 - endDayOfWeek))

    const days = []
    const current = new Date(startDate)

    while (current <= endDate) {
      days.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }

    return days
  }

  const calendarDays = generateCalendarDays()

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const getPriceColor = (price: number) => {
    if (price === 0) return "text-gray-400"
    if (price === minPrice) return "text-green-600"
    if (price === maxPrice) return "text-red-600"
    return "text-orange-600"
  }

  const getPriceBg = (price: number) => {
    if (price === 0) return "bg-gray-50"
    if (price === minPrice) return "bg-green-50 border-green-200 rounded"
    if (price === maxPrice) return "bg-red-50 border-red-200 rounded"
    return "bg-orange-50 border-orange-200 rounded"
  }

  const handleDayClick = (dateKey: string, priceData: PriceData | undefined) => {
    if (priceData && priceData.preis > 0) {
      onDayClick(dateKey, priceData)
    }
  }

  // --- Tag-Navigation (Pfeile, Keyboard, Swipe) ---
  // Hole alle Tage mit Preis
  const dayKeys = dates.filter(dateKey => results[dateKey]?.preis > 0)

  // Ermittle den aktuell ausgewählten Tag (aus Parent)
  // (Parent-Komponente muss selectedDay und onNavigateDay bereitstellen)

  // Swipe-Handling
  const touchStartX = React.useRef<number | null>(null)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(deltaX) > 50) {
      if (deltaX < 0) {
        // Swipe nach links → nächster Tag
        onNavigateDay && onNavigateDay(1)
      } else {
        // Swipe nach rechts → vorheriger Tag
        onNavigateDay && onNavigateDay(-1)
      }
    }
    touchStartX.current = null
  }

  // Keyboard-Handling
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        onNavigateDay && onNavigateDay(-1)
      } else if (e.key === 'ArrowRight') {
        onNavigateDay && onNavigateDay(1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onNavigateDay])

  const totalDays = expectedDateRange.length > 0 ? expectedDateRange.length : (expectedDays || (searchParams?.dayLimit ? parseInt(searchParams.dayLimit) : resultDates.length))
  const completedDays = Object.values(results).filter(r => r && r.preis !== undefined).length
  const isCompleteNow = totalDays > 0 && completedDays >= totalDays
  const progressPercentage = totalDays > 0 ? Math.min(100, Math.round((completedDays / totalDays) * 100)) : 0
  const queueStatus = useSearchQueueStatus({
    sessionId,
    isActive: Boolean(isStreaming && !isCompleteNow),
    remainingRequests: Math.max(0, totalDays - completedDays),
    searchType: "bestpreissuche",
  })

  return (
    <>
      {isStreaming && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-blue-950">Reisezeitraum-Analyse</h2>
              <div className="mt-1 text-sm text-blue-800">
                {startStation?.name || "Start"} nach {zielStation?.name || "Ziel"}
              </div>
            </div>
            {onCancelSearch && (
              <SearchCancelButton onClick={onCancelSearch} />
            )}
          </div>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-blue-800">
              <span>{completedDays} von {totalDays} Reisetagen geprüft</span>
              <span>{progressPercentage}%</span>
            </div>
            <div className="h-2 rounded bg-blue-100">
              <div
                className="h-2 rounded bg-blue-600 transition-all"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <SearchQueueStatus status={queueStatus} className="mt-3" />
          </div>
        </div>
      )}

      {/* Calendar Header und Legende */}
      <div className="bg-white rounded-lg border mt-4">
        {/* Calendar Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPreviousMonth}
            disabled={currentMonth <= new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">
              {months[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </h3>
            {/* Tag-Navigation für ausgewählten Tag (Parent muss selectedDay und onNavigateDay bereitstellen) */}
            {typeof selectedDay === 'string' && (
              <>
                <Button variant="ghost" size="icon" onClick={() => onNavigateDay && onNavigateDay(-1)} disabled={dayKeys.indexOf(selectedDay) <= 0}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onNavigateDay && onNavigateDay(1)} disabled={dayKeys.indexOf(selectedDay) === dayKeys.length - 1}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={goToNextMonth}
            disabled={currentMonth >= new Date(lastDate.getFullYear(), lastDate.getMonth(), 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Price Legend immer anzeigen */}
        <div className="p-4 border-b bg-gray-50">
          <div className="flex items-center justify-center gap-4 sm:gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div>
              <span className="text-green-600 font-medium">Günstigster: {minPrice > 0 ? minPrice + '€' : '– €'}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded"></div>
              <span className="text-orange-600 font-medium">Durchschnitt: {prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) + '€' : '– €'}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div>
              <span className="text-red-600 font-medium">Teuerster: {maxPrice > 0 ? maxPrice + '€' : '– €'}</span>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="p-4"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekdays.map((day) => (
              <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const dateKey = formatDateKey(day)
              const priceData = results[dateKey]
              const isCurrentMonth = day.getMonth() === currentMonth.getMonth()
              const isToday = dateKey === new Date().toISOString().split("T")[0]
              const hasPrice = priceData && priceData.preis > 0
              const hasResult = !!priceData
              const hasMultipleOptions = priceData?.allIntervals && priceData.allIntervals.length > 1
              
              // Check if this day is expected but not yet loaded (pending)
              const isExpectedDay = expectedDateRange.includes(dateKey)
              const isPendingDay = isStreaming && isExpectedDay && !hasResult

              return (
                <div
                  key={dateKey}
                  className={`
                    relative min-h-[90px] sm:min-h-[100px] p-1 sm:p-3 border rounded-lg transition-all hover:shadow-sm flex flex-col justify-between
                    ${!isCurrentMonth ? "opacity-30" : ""}
                    ${isToday ? "ring-2 ring-blue-500" : ""}
                    ${hasPrice ? getPriceBg(priceData.preis) : 
                      hasResult ? "bg-gray-50" : 
                      isPendingDay ? "bg-blue-50 border-blue-200" : "bg-white"}
                    ${hasPrice ? "cursor-pointer hover:shadow-md hover:scale-105" : ""}
                  `}
                  onClick={() => hasPrice && handleDayClick(dateKey, priceData)}
                >
                  {/* Day Number und Multiple options indicator */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs sm:text-sm font-medium text-gray-900">{day.getDate()}</div>
                    {hasMultipleOptions && (
                      <span className="text-[10px] sm:text-xs bg-blue-100 text-blue-600 px-1 rounded ml-1">{priceData.allIntervals!.length}</span>
                    )}
                    {isPendingDay && (
                      <span className="text-[10px] sm:text-xs bg-blue-100 text-blue-600 px-1 rounded ml-1">
                        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      </span>
                    )}
                  </div>

                  {/* Price nur anzeigen, wenn Ergebnis vorhanden */}
                  {hasResult && (
                    <div className="space-y-1 flex flex-col h-full justify-between pb-5">
                      <div>
                        <div className={`text-xs sm:text-sm font-bold ${getPriceColor(priceData.preis)}`}> 
                          {priceData.preis > 0 && (
                            <>
                              <span className="block sm:hidden">{Math.round(priceData.preis)}€</span>
                              <span className="hidden sm:block">{priceData.preis}€</span>
                            </>
                          )}
                        </div>
                        {/* Price indicators */}
                        {priceData.preis > 0 && (
                          <div className="text-[10px] sm:text-xs">
                            {priceData.preis === minPrice && <span>🏆</span>}
                            {priceData.preis === maxPrice && <span>💸</span>}
                          </div>
                        )}
                      </div>
                      {/* Departure time immer unten, absolut positioniert */}
                      {priceData.preis > 0 && priceData.abfahrtsZeitpunkt && priceData.ankunftsZeitpunkt && (
                        <div className="absolute left-1 right-1 bottom-1 text-[10px] sm:text-xs text-gray-500 text-right pointer-events-none max-w-full flex flex-col items-end">
                          {/* Mobil: Zwei Zeilen */}
                          <span className="block sm:hidden truncate">
                            {new Date(priceData.abfahrtsZeitpunkt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <span className="block sm:hidden truncate">
                            <span className="mx-1">→</span>
                            {new Date(priceData.ankunftsZeitpunkt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {/* Desktop: Eine Zeile */}
                          <span className="hidden sm:inline truncate whitespace-nowrap">
                            {new Date(priceData.abfahrtsZeitpunkt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                            <span className="mx-1">→</span>
                            {new Date(priceData.ankunftsZeitpunkt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Pending indicator for days being searched */}
                  {isPendingDay && (
                    <div className="flex flex-col items-center justify-center h-full text-blue-600">
                      <div className="text-[9px] sm:text-xs font-medium text-center max-w-full sm:max-w-none truncate whitespace-pre-line">
                        <span className="block sm:hidden">Wird<br/>geladen...</span>
                        <span className="hidden sm:inline">Wird geladen...</span>
                      </div>
                    </div>
                  )}

                  {/* Click indicator for bookable days entfernt */}
                  {/* Indikator für Tage ohne Fahrten: nur für geprüfte Tage */}
                  {hasResult && priceData?.preis === 0 && (
                    <div className="absolute bottom-1 right-1">
                      <span className="text-gray-400 text-xs select-none">❌</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Route Info */}
        {startStation && zielStation && (
          <div className="p-4 border-t bg-gray-50 text-center text-sm text-gray-600">
            <div className="font-medium">
              {startStation.name} → {zielStation.name}
            </div>
            <div className="text-xs mt-1">
              Klicke auf einen Tag mit Preis für alle Verbindungen • {resultDates.length} Tage durchsucht
              {isStreaming && (
                <span className="text-blue-600 ml-2">
                  (Weitere Ergebnisse werden geladen...)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

    </>
  )
}
