"use client"

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"
import {
  ArrowRight,
  AlertTriangle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Euro,
  GripVertical,
  Loader2,
  Maximize2,
  Shuffle,
  Train,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { calculateDuration, createBookingLink, getDurationMinutes } from "@/lib/train-search/day-details-utils"
import { JourneyTimelineHorizontal, JourneyTimelineVertical } from "./journey-timeline"
import { ConnectionsTable } from "./day-connections-table"
import { DayDetailsModal } from "./day-details-modal"
import { VehicleTypesSummary } from "./vehicle-types-summary"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SearchQueueStatus } from "@/components/search/search-queue-status"
import { SearchCancelButton } from "@/components/search/search-cancel-button"
import { useSearchQueueStatus } from "@/hooks/use-search-queue-status"

interface JourneyLeg {
  abfahrtsZeitpunkt: string
  ankunftsZeitpunkt: string
  abfahrtsOrt: string
  ankunftsOrt: string
  verkehrsmittel?: {
    produktGattung?: string
    kategorie?: string
    name?: string
    mittelText?: string
  }
}

export interface TravelCombination {
  outwardDate: string
  returnDate: string
  nights: number
  outwardPrice: number
  returnPrice: number
  totalPrice: number
  outwardDeparture: string
  outwardArrival: string
  returnDeparture: string
  returnArrival: string
  outwardTransfers?: number
  returnTransfers?: number
  outwardLegs?: JourneyLeg[]
  returnLegs?: JourneyLeg[]
}

type CombinationSortKey = "outward" | "return" | "nights" | "price"

interface TravelCombinationsProps {
  combinations: TravelCombination[]
  outwardResults: PriceResults
  returnResults: PriceResults
  expectedOutwardDays: number
  expectedReturnDays: number
  startStation?: { name: string; id: string }
  zielStation?: { name: string; id: string }
  searchParams: any
  isStreaming?: boolean
  sessionId?: string | null
  onCancelSearch?: () => void
}

interface PriceData {
  preis: number
  info: string
  abfahrtsZeitpunkt: string
  ankunftsZeitpunkt: string
  allIntervals?: Array<{
    preis: number
    abfahrtsZeitpunkt: string
    ankunftsZeitpunkt: string
    abfahrtsOrt?: string
    ankunftsOrt?: string
    info?: string
    umstiegsAnzahl?: number
    isCheapestPerInterval?: boolean
    priceHistory?: { preis: number }[]
    abschnitte?: JourneyLeg[]
  }>
}

interface PriceResults {
  [date: string]: PriceData
}

function normalizeDayDetailsData(
  data: PriceData | undefined,
  fromName: string,
  toName: string
) {
  if (!data) return null

  const intervals = data.allIntervals?.length
    ? data.allIntervals
    : data.preis > 0
      ? [{
          preis: data.preis,
          abfahrtsZeitpunkt: data.abfahrtsZeitpunkt,
          ankunftsZeitpunkt: data.ankunftsZeitpunkt,
          abfahrtsOrt: fromName,
          ankunftsOrt: toName,
          info: data.info,
          umstiegsAnzahl: 0,
          isCheapestPerInterval: true,
        }]
      : []

  return {
    preis: data.preis,
    info: data.info,
    abfahrtsZeitpunkt: data.abfahrtsZeitpunkt,
    ankunftsZeitpunkt: data.ankunftsZeitpunkt,
    allIntervals: intervals.map((interval) => ({
      preis: interval.preis,
      abfahrtsZeitpunkt: interval.abfahrtsZeitpunkt,
      ankunftsZeitpunkt: interval.ankunftsZeitpunkt,
      abfahrtsOrt: interval.abfahrtsOrt || fromName,
      ankunftsOrt: interval.ankunftsOrt || toName,
      info: interval.info || data.info || "",
      umstiegsAnzahl: interval.umstiegsAnzahl,
      isCheapestPerInterval: interval.isCheapestPerInterval,
    })),
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  })
}

function formatFullDate(value?: string) {
  if (!value) return "-"
  return new Date(value).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function formatTime(value: string) {
  if (!value) return "--:--"
  return new Date(value).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
}

function formatPrice(value: number) {
  return `${value.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`
}

function isSameCombination(left?: TravelCombination | null, right?: TravelCombination | null) {
  return Boolean(
    left &&
    right &&
    left.outwardDate === right.outwardDate &&
    left.returnDate === right.returnDate
  )
}

function getCombinationKey(outwardDate: string, returnDate: string) {
  return `${outwardDate}::${returnDate}`
}

function generateDateKeys(from?: string, to?: string, weekdaysParam?: string, limit = 30) {
  if (!from || !to) return []

  let weekdays = [1, 2, 3, 4, 5, 6, 0]
  if (weekdaysParam) {
    try {
      const decoded = decodeURIComponent(weekdaysParam)
      weekdays = decoded.startsWith("[")
        ? JSON.parse(decoded)
        : decoded.split(",").map(Number).filter((n) => !Number.isNaN(n) && n >= 0 && n <= 6)
    } catch {}
  }

  const dates: string[] = []
  const start = new Date(from)
  const end = new Date(to)
  for (let d = new Date(start); d <= end && dates.length < limit; d.setDate(d.getDate() + 1)) {
    if (weekdays.includes(d.getDay())) {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, "0")
      const day = String(d.getDate()).padStart(2, "0")
      dates.push(`${year}-${month}-${day}`)
    }
  }
  return dates
}

function resultEntries(results: PriceResults) {
  return Object.entries(results).filter(([key]) => key !== "_meta") as [string, PriceData][]
}

function parsePositiveInt(value: unknown, fallback?: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function getDisplayInterval(data: PriceData) {
  const intervals = Array.isArray(data.allIntervals) ? data.allIntervals : []
  return (
    intervals.find((interval) =>
      interval.preis === data.preis &&
      interval.abfahrtsZeitpunkt &&
      interval.ankunftsZeitpunkt
    ) ||
    intervals.find((interval) => interval.abfahrtsZeitpunkt && interval.ankunftsZeitpunkt)
  )
}

function getJourneyTimes(data: PriceData) {
  const displayInterval = getDisplayInterval(data)
  const legs = Array.isArray(displayInterval?.abschnitte) ? displayInterval.abschnitte : []

  return {
    departure: data.abfahrtsZeitpunkt || displayInterval?.abfahrtsZeitpunkt || legs[0]?.abfahrtsZeitpunkt || "",
    arrival: data.ankunftsZeitpunkt || displayInterval?.ankunftsZeitpunkt || legs[legs.length - 1]?.ankunftsZeitpunkt || "",
    transfers: displayInterval?.umstiegsAnzahl || 0,
    legs,
  }
}

function dayOffsetPercent(date: string, from?: string, to?: string) {
  if (!from || !to) return 0
  const start = new Date(from).getTime()
  const end = new Date(to).getTime()
  const current = new Date(date).getTime()
  const span = Math.max(1, end - start)
  return Math.min(100, Math.max(0, ((current - start) / span) * 100))
}

function getNights(outwardDate: string, returnDate: string) {
  return Math.round((new Date(returnDate).getTime() - new Date(outwardDate).getTime()) / 86_400_000)
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatMonthTitle(date: Date) {
  return date.toLocaleDateString("de-DE", { month: "long", year: "numeric" })
}

function generateCalendarDaysForMonth(monthDate: Date) {
  const firstDayOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const lastDayOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
  const startDate = new Date(firstDayOfMonth)
  const startOffset = (startDate.getDay() + 6) % 7
  startDate.setDate(startDate.getDate() - startOffset)

  const endDate = new Date(lastDayOfMonth)
  const endOffset = (endDate.getDay() + 6) % 7
  endDate.setDate(endDate.getDate() + (6 - endOffset))

  const days: Date[] = []
  for (const day = new Date(startDate); day <= endDate; day.setDate(day.getDate() + 1)) {
    days.push(new Date(day))
  }
  return days
}

function getCalendarMonths(dateKeys: string[]) {
  const monthKeys = Array.from(new Set(dateKeys.map((date) => date.slice(0, 7)))).sort()
  return monthKeys.map((key) => {
    const [year, month] = key.split("-").map(Number)
    return new Date(year, month - 1, 1)
  })
}

function getBestReturnForOutward({
  outwardDate,
  returnDates,
  outwardResults,
  returnResults,
  minNights,
  maxNights,
}: {
  outwardDate: string
  returnDates: string[]
  outwardResults: PriceResults
  returnResults: PriceResults
  minNights: number
  maxNights?: number
}) {
  const outward = outwardResults[outwardDate]
  if (!outward || outward.preis <= 0) return null

  return returnDates
    .flatMap((returnDate) => {
      const returning = returnResults[returnDate]
      const nights = getNights(outwardDate, returnDate)
      if (
        !returning ||
        returning.preis <= 0 ||
        nights < minNights ||
        (typeof maxNights === "number" && nights > maxNights)
      ) return []

      return [{
        outwardDate,
        returnDate,
        nights,
        total: Math.round((outward.preis + returning.preis) * 100) / 100,
        outwardPrice: outward.preis,
        returnPrice: returning.preis,
      }]
    })
    .sort((a, b) => a.total - b.total || a.nights - b.nights)[0] || null
}

function TravelTimelinePlanner({
  combinations,
  outwardDates,
  returnDates,
  selectedCombination,
  onSelectCombination,
}: {
  combinations: TravelCombination[]
  outwardDates: string[]
  returnDates: string[]
  selectedCombination?: TravelCombination | null
  onSelectCombination: (outwardDate: string, returnDate: string) => void
}) {
  const best = combinations[0]
  const selected = selectedCombination || best
  const allDates = Array.from(new Set([...outwardDates, ...returnDates, ...combinations.flatMap((combination) => [
    combination.outwardDate,
    combination.returnDate,
  ])])).sort()
  const timelineStart = allDates[0]
  const timelineEnd = allDates[allDates.length - 1]
  const startTime = timelineStart ? new Date(timelineStart).getTime() : 0
  const endTime = timelineEnd ? new Date(timelineEnd).getTime() : startTime + 1
  const span = Math.max(1, endTime - startTime)

  const timelinePosition = (date: string) =>
    Math.min(100, Math.max(0, ((new Date(date).getTime() - startTime) / span) * 100))

  const displayCombinations = [
    ...(selected ? [selected] : []),
    ...combinations,
  ].filter((combination, index, list) =>
    list.findIndex((candidate) =>
      candidate.outwardDate === combination.outwardDate &&
      candidate.returnDate === combination.returnDate
    ) === index
  ).slice(0, 8)

  if (!best && combinations.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        Reisekombinationen erscheinen, sobald Hin- und Rückfahrten ausgewertet sind.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Günstigste Reisezeiträume</h3>
            <p className="text-sm text-gray-600">
              Jeder Balken zeigt Starttag, Aufenthalt und Rückfahrt innerhalb deines Suchfensters.
            </p>
          </div>
          {timelineStart && timelineEnd && (
            <div className="rounded border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800">
              {formatFullDate(timelineStart)} bis {formatFullDate(timelineEnd)}
            </div>
          )}
        </div>
      </div>

      <div className="p-4">
        {timelineStart && timelineEnd && (
          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-blue-900">
              <span>Suchfenster</span>
              <span>{allDates.length} mögliche Reisetage</span>
            </div>
            <div className="relative h-7">
              <div className="absolute left-0 right-0 top-3 h-1 rounded bg-blue-100" />
              <div className="absolute left-0 top-1 h-5 w-5 rounded-full border-2 border-white bg-blue-600 shadow-sm" />
              <div className="absolute right-0 top-1 h-5 w-5 rounded-full border-2 border-white bg-blue-600 shadow-sm" />
            </div>
            <div className="flex justify-between text-xs text-blue-800">
              <span>{formatDate(timelineStart)}</span>
              <span>{formatDate(timelineEnd)}</span>
            </div>
          </div>
        )}

        <div className="mb-3 hidden grid-cols-[7rem_minmax(0,1fr)_6rem] gap-4 px-3 text-xs font-semibold uppercase text-gray-500 md:grid">
          <div>Preis</div>
          <div>Zeitraum</div>
          <div className="text-right">Aufenthalt</div>
        </div>

        <div className="space-y-2">
          {displayCombinations.map((combination, index) => {
            const isSelected =
              selected?.outwardDate === combination.outwardDate &&
              selected?.returnDate === combination.returnDate
            const left = timelinePosition(combination.outwardDate)
            const right = timelinePosition(combination.returnDate)
            const width = Math.max(4, right - left)
            const middle = Math.min(96, Math.max(4, left + width / 2))

            return (
              <button
                key={`${combination.outwardDate}-${combination.returnDate}-${index}`}
                type="button"
                onClick={() => onSelectCombination(combination.outwardDate, combination.returnDate)}
                className={`w-full rounded-lg border p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40 ${
                  isSelected ? "border-blue-300 bg-blue-50 shadow-[inset_3px_0_0_#2563eb]" : "border-gray-200 bg-white"
                }`}
              >
                <div className="grid gap-3 md:grid-cols-[7rem_minmax(0,1fr)_6rem] md:items-center">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-green-700">{combination.totalPrice}€</span>
                      {index === 0 && !selectedCombination && (
                        <span className="text-xs font-semibold text-green-700">Bestpreis</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-600">
                      {combination.outwardPrice}€ hin · {combination.returnPrice}€ zurück
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                      <div className="rounded border border-blue-100 bg-white px-2 py-1.5">
                        <div className="flex items-center gap-1 text-[11px] font-semibold uppercase text-blue-700">
                          <span className="h-2 w-2 rounded-full bg-blue-600" />
                          Hinfahrt
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-gray-900">{formatDate(combination.outwardDate)}</div>
                        <div className="text-xs text-gray-600">{formatTime(combination.outwardDeparture)} ab</div>
                      </div>
                      <ArrowRight className="hidden h-4 w-4 text-blue-300 sm:block" />
                      <div className="rounded border border-green-100 bg-white px-2 py-1.5 sm:text-right">
                        <div className="flex items-center gap-1 text-[11px] font-semibold uppercase text-green-700 sm:justify-end">
                          <span className="h-2 w-2 rounded-full bg-green-600" />
                          Rückfahrt
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-gray-900">{formatDate(combination.returnDate)}</div>
                        <div className="text-xs text-gray-600">{formatTime(combination.returnDeparture)} ab</div>
                      </div>
                    </div>

                    <div className="relative h-10 rounded border border-blue-100 bg-blue-50">
                      <div
                        className="absolute top-[17px] h-2 rounded bg-blue-500"
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                      <div
                        className="absolute top-3 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-blue-600 shadow"
                        style={{ left: `${left}%` }}
                      />
                      <div
                        className="absolute top-3 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white bg-green-600 shadow"
                        style={{ left: `${right}%` }}
                      />
                      <div
                        className="absolute top-2 -translate-x-1/2 rounded-full border border-blue-100 bg-white px-2 py-0.5 text-[11px] font-semibold text-blue-800 shadow-sm"
                        style={{ left: `${middle}%` }}
                      >
                        {combination.nights} Nächte
                      </div>
                    </div>

                    <div className="mt-1 flex justify-between text-[11px] text-gray-500">
                      <span>{formatDate(combination.outwardDate)}</span>
                      <span>{formatDate(combination.returnDate)}</span>
                    </div>
                  </div>

                  <div className="text-left md:text-right">
                    <div className="text-lg font-semibold text-gray-900">{combination.nights}</div>
                    <div className="text-xs text-gray-500">Nächte</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TravelCalendarPlanner({
  combinations,
  outwardDates,
  returnDates,
  outwardResults,
  returnResults,
  best,
  minNights,
  maxNights,
  isStreaming,
  selectedCombination,
  onSelectCombination,
}: {
  combinations: TravelCombination[]
  outwardDates: string[]
  returnDates: string[]
  outwardResults: PriceResults
  returnResults: PriceResults
  best?: TravelCombination
  minNights: number
  maxNights?: number
  isStreaming?: boolean
  selectedCombination?: TravelCombination | null
  onSelectCombination: (outwardDate: string, returnDate: string) => void
}) {
  const selected = selectedCombination || best
  const [focusedOutwardDate, setFocusedOutwardDate] = useState(selected?.outwardDate || outwardDates[0] || "")
  const calendarDates = Array.from(new Set([...outwardDates, ...returnDates])).sort()
  const months = getCalendarMonths(calendarDates)
  const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
  const cheapestCombinations = combinations.slice(0, 6)
  const bestReturnByOutward = new Map(
    outwardDates.map((outwardDate) => [
      outwardDate,
      getBestReturnForOutward({
        outwardDate,
        returnDates,
        outwardResults,
        returnResults,
        minNights,
        maxNights,
      }),
    ])
  )
  const selectedStart = selected?.outwardDate ? new Date(selected.outwardDate).getTime() : null
  const selectedEnd = selected?.returnDate ? new Date(selected.returnDate).getTime() : null

  useEffect(() => {
    if (selected?.outwardDate) {
      setFocusedOutwardDate(selected.outwardDate)
    }
  }, [selected?.outwardDate])

  const returnChoices = focusedOutwardDate
    ? returnDates
        .flatMap((returnDate) => {
          const outward = outwardResults[focusedOutwardDate]
          const returning = returnResults[returnDate]
          const nights = getNights(focusedOutwardDate, returnDate)
          if (
            !outward ||
            !returning ||
            outward.preis <= 0 ||
            returning.preis <= 0 ||
            nights < minNights ||
            (typeof maxNights === "number" && nights > maxNights)
          ) return []

          return [{
            outwardDate: focusedOutwardDate,
            returnDate,
            nights,
            total: Math.round((outward.preis + returning.preis) * 100) / 100,
            returnDeparture: returning.abfahrtsZeitpunkt,
          }]
        })
        .sort((a, b) => a.total - b.total || a.nights - b.nights)
    : []

  const handleDateClick = (dateKey: string) => {
    const outward = outwardResults[dateKey]
    const returning = returnResults[dateKey]
    const canUseAsReturn =
      focusedOutwardDate &&
      returning?.preis > 0 &&
      getNights(focusedOutwardDate, dateKey) >= minNights &&
      (typeof maxNights !== "number" || getNights(focusedOutwardDate, dateKey) <= maxNights) &&
      new Date(dateKey) > new Date(focusedOutwardDate)

    if (canUseAsReturn) {
      onSelectCombination(focusedOutwardDate, dateKey)
      return
    }

    if (outward?.preis > 0) {
      setFocusedOutwardDate(dateKey)
      const bestReturn = getBestReturnForOutward({
        outwardDate: dateKey,
        returnDates,
        outwardResults,
        returnResults,
        minNights,
        maxNights,
      })
      if (bestReturn) {
        onSelectCombination(bestReturn.outwardDate, bestReturn.returnDate)
      }
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Reisezeitraum im Kalender</h3>
            <p className="text-sm text-gray-600">
              Jeder Starttag zeigt den günstigsten Gesamtpreis für Hin- und Rückfahrt. Die gewählte Reise wird als Zeitraum markiert.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700">
              Starttag
            </span>
            <span className="rounded border border-gray-200 bg-white px-2 py-1 font-medium text-gray-700">
              Rückfahrt
            </span>
            <span className="rounded border border-gray-200 bg-gray-50 px-2 py-1 font-medium text-gray-700">
              {minNights}-{typeof maxNights === "number" ? maxNights : "offen"} Nächte
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {cheapestCombinations.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-base font-semibold text-gray-900">Günstigste Möglichkeiten</div>
                <div className="text-sm text-gray-600">Die besten Reisezeiträume, nach Gesamtpreis sortiert.</div>
              </div>
              <div className="text-xs font-medium text-gray-500">nach Gesamtpreis sortiert</div>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-200">
              {cheapestCombinations.map((combination, index) => {
                const isSelected =
                  selected?.outwardDate === combination.outwardDate &&
                  selected?.returnDate === combination.returnDate
                return (
                  <button
                    key={`${combination.outwardDate}-${combination.returnDate}-${index}`}
                    type="button"
                    onClick={() => onSelectCombination(combination.outwardDate, combination.returnDate)}
                    className={`grid w-full gap-3 border-b border-gray-100 p-3 text-left transition last:border-b-0 hover:bg-gray-50 md:grid-cols-[3rem_7rem_minmax(0,1fr)_7rem_8rem] md:items-center ${
                      isSelected ? "bg-gray-50 shadow-[inset_3px_0_0_#111827]" : "bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3 md:block">
                      <div className={`flex h-8 w-8 items-center justify-center rounded border text-sm font-bold ${
                        index === 0 ? "border-green-300 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-700"
                      }`}>
                        {index + 1}
                      </div>
                      <div className="md:hidden">
                        <div className="text-xl font-bold text-gray-950">{combination.totalPrice}€</div>
                        <div className="text-xs text-gray-500">gesamt</div>
                      </div>
                    </div>

                    <div className="hidden md:block">
                      <div className="text-2xl font-bold text-gray-950">{combination.totalPrice}€</div>
                      <div className="text-xs text-gray-500">gesamt</div>
                    </div>

                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900">
                        {formatDate(combination.outwardDate)} bis {formatDate(combination.returnDate)}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                        <span>Hin {formatTime(combination.outwardDeparture)}</span>
                        <span>Rück {formatTime(combination.returnDeparture)}</span>
                        {index === 0 && <span className="font-semibold text-green-700">Bestpreis</span>}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-gray-900">{combination.nights} Nächte</div>
                      <div className="text-xs text-gray-500">Aufenthalt</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 md:block md:text-right">
                      <div>
                        <span className="font-medium text-gray-900">{combination.outwardPrice}€</span>
                        <span className="ml-1 md:ml-0 md:block">hin</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-900">{combination.returnPrice}€</span>
                        <span className="ml-1 md:ml-0 md:block">zurück</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(25rem,100%),1fr))]">
          {months.map((month) => (
            <div key={formatDateKey(month)} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="mb-3 text-center font-semibold text-gray-900">{formatMonthTitle(month)}</div>
              <div className="mb-2 grid grid-cols-7 gap-1">
                {weekdays.map((day) => (
                  <div key={day} className="text-center text-xs font-medium text-gray-500">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {generateCalendarDaysForMonth(month).map((day) => {
                  const dateKey = formatDateKey(day)
                  const bestStart = bestReturnByOutward.get(dateKey)
                  const returning = returnResults[dateKey]
                  const isExpected = calendarDates.includes(dateKey)
                  const isCurrentMonth = day.getMonth() === month.getMonth()
                  const currentTime = new Date(dateKey).getTime()
                  const isInSelectedRange =
                    selectedStart !== null &&
                    selectedEnd !== null &&
                    currentTime >= selectedStart &&
                    currentTime <= selectedEnd
                  const isSelectedOutward = selected?.outwardDate === dateKey
                  const isSelectedReturn = selected?.returnDate === dateKey
                  const isFocusedOutward = focusedOutwardDate === dateKey
                  const isPending = isStreaming && isExpected && !bestStart && !returning
                  const canUseAsReturnForFocused =
                    Boolean(focusedOutwardDate) &&
                    returning?.preis > 0 &&
                    getNights(focusedOutwardDate, dateKey) >= minNights &&
                    (typeof maxNights !== "number" || getNights(focusedOutwardDate, dateKey) <= maxNights) &&
                    new Date(dateKey) > new Date(focusedOutwardDate)
                  const canClick = Boolean(bestStart) || canUseAsReturnForFocused
                  const selectedDayTone = isSelectedOutward
                    ? "border-gray-900 bg-white ring-1 ring-gray-300"
                    : isSelectedReturn
                      ? "border-gray-900 bg-white ring-1 ring-gray-300"
                      : isInSelectedRange
                        ? "border-gray-200 bg-gray-50"
                        : isExpected
                          ? "border-gray-200 bg-white"
                          : "border-gray-100 bg-gray-50"

                  return (
                    <button
                      type="button"
                      key={dateKey}
                      disabled={!canClick}
                      onClick={() => handleDateClick(dateKey)}
                      className={`relative min-h-[5.75rem] rounded-lg border p-2 text-left transition ${
                        !isCurrentMonth ? "opacity-30" : ""
                      } ${selectedDayTone} ${
                        canClick ? "cursor-pointer hover:border-gray-400 hover:shadow-sm" : "cursor-default"
                      } ${
                        !isSelectedOutward && !isSelectedReturn && isFocusedOutward
                            ? "ring-1 ring-gray-300"
                            : ""
                      }`}
                    >
                      {(isSelectedOutward || isSelectedReturn) && (
                        <div className="absolute left-0 top-0 h-full w-1 rounded-l-lg bg-gray-900" />
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900">{day.getDate()}</span>
                        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />}
                      </div>

                      <div className="mt-2 min-h-9">
                        {bestStart && (
                          <div>
                            <div className="text-xs text-gray-500">ab</div>
                            <div className="text-base font-bold text-gray-900">{bestStart.total}€</div>
                          </div>
                        )}
                      </div>

                      {(isSelectedOutward || isSelectedReturn) && (
                        <div className="absolute bottom-1.5 left-2 right-2 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-center text-[10px] font-semibold text-gray-800 shadow-sm">
                          {isSelectedOutward ? "Start" : "Rückfahrt"}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
          <div className="mb-3">
            <div className="text-sm font-semibold text-blue-950">Rückfahrten zum gewählten Starttag</div>
            <div className="text-xs text-blue-800">
              {focusedOutwardDate ? formatFullDate(focusedOutwardDate) : "Wähle im Kalender einen Hinfahrtstag"}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {returnChoices.slice(0, 8).map((choice) => {
              const isSelected =
                selected?.outwardDate === choice.outwardDate &&
                selected?.returnDate === choice.returnDate
              return (
                <button
                  key={`${choice.outwardDate}-${choice.returnDate}`}
                  type="button"
                  onClick={() => onSelectCombination(choice.outwardDate, choice.returnDate)}
                  className={`w-full rounded-lg border bg-white p-3 text-left transition hover:border-blue-300 ${
                    isSelected ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-gray-900">{formatDate(choice.returnDate)}</div>
                      <div className="text-xs text-gray-600">
                        {choice.nights} Nächte · Rück ab {formatTime(choice.returnDeparture)}
                      </div>
                    </div>
                    <div className="text-right font-bold text-green-700">{choice.total}€</div>
                  </div>
                </button>
              )
            })}
            {returnChoices.length === 0 && (
              <div className="rounded-lg border border-blue-100 bg-white p-3 text-sm text-blue-800">
                Für diesen Hinfahrtstag gibt es noch keine passende Rückfahrt im gewählten Nächtefenster.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ComboMatrix({
  outwardDates,
  returnDates,
  outwardResults,
  returnResults,
  best,
  minNights,
  maxNights,
  isStreaming,
  selectedCombination,
  onSelectCombination,
  onOpenLarge,
  expanded = false,
}: {
  outwardDates: string[]
  returnDates: string[]
  outwardResults: PriceResults
  returnResults: PriceResults
  best?: TravelCombination
  minNights: number
  maxNights?: number
  isStreaming?: boolean
  selectedCombination?: TravelCombination | null
  onSelectCombination: (outwardDate: string, returnDate: string) => void
  onOpenLarge?: () => void
  expanded?: boolean
}) {
  const validCells = outwardDates.flatMap((outwardDate) =>
    returnDates.flatMap((returnDate) => {
      const outward = outwardResults[outwardDate]
      const returning = returnResults[returnDate]
      const nights = getNights(outwardDate, returnDate)
      if (
        !outward ||
        !returning ||
        outward.preis <= 0 ||
        returning.preis <= 0 ||
        nights < minNights ||
        (typeof maxNights === "number" && nights > maxNights)
      ) return []
      return [{
        outwardDate,
        returnDate,
        nights,
        total: Math.round((outward.preis + returning.preis) * 100) / 100,
      }]
    })
  )
  const prices = validCells.map((cell) => cell.total)
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 0

  const getCellTone = (price: number) => {
    if (price === minPrice) return "border-green-300 bg-green-50 text-green-800"
    if (maxPrice > minPrice && price === maxPrice) return "border-red-200 bg-red-50 text-red-700"
    return "border-orange-200 bg-orange-50 text-orange-700"
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Preismatrix</h3>
          <p className="text-xs text-gray-600">
            Spalten sind Hinfahrten, Zeilen sind Rückfahrten. Jede Zelle ist der Gesamtpreis.
          </p>
          <p className="mt-1 text-xs font-medium text-gray-700">
            Aufenthalt: mindestens {minNights} Nächte{typeof maxNights === "number" ? `, maximal ${maxNights} Nächte` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded border border-green-200 bg-green-50 px-2 py-1 text-green-700">günstig</span>
          <span className="inline-flex items-center gap-1 rounded border border-orange-200 bg-orange-50 px-2 py-1 text-orange-700">mittel</span>
          <span className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700">teuer</span>
          {onOpenLarge && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-1 h-8 border-blue-200 bg-white text-xs text-blue-700 hover:bg-blue-50"
              onClick={onOpenLarge}
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Groß anzeigen
            </Button>
          )}
        </div>
      </div>

      <div
        className={cn(
          "overflow-auto rounded-lg border border-gray-200 bg-white p-2",
          expanded ? "max-h-[calc(92vh-11rem)]" : "max-h-[36rem]"
        )}
      >
        <div
          className="grid min-w-max gap-1"
          style={{ gridTemplateColumns: `5.5rem repeat(${outwardDates.length}, minmax(4.5rem, 1fr))` }}
        >
          <div className="sticky left-0 top-0 z-30 rounded bg-white p-1 text-xs font-semibold text-gray-500" />
          {outwardDates.map((date) => (
            <div key={date} className="sticky top-0 z-20 rounded bg-blue-50 px-2 py-1 text-center text-[11px] font-semibold text-blue-800">
              <div>Hin</div>
              <div>{formatDate(date)}</div>
            </div>
          ))}

          {returnDates.map((returnDate) => (
            <div key={returnDate} className="contents">
              <div className="sticky left-0 z-10 rounded bg-green-50 px-2 py-2 text-[11px] font-semibold text-green-800">
                <div>Rück</div>
                <div>{formatDate(returnDate)}</div>
              </div>
              {outwardDates.map((outwardDate) => {
                const outward = outwardResults[outwardDate]
                const returning = returnResults[returnDate]
                const nights = getNights(outwardDate, returnDate)
                const isInvalidDuration =
                  nights < minNights ||
                  (typeof maxNights === "number" && nights > maxNights)
                const hasBothPrices = outward?.preis > 0 && returning?.preis > 0 && !isInvalidDuration
                const total = hasBothPrices
                  ? Math.round((outward.preis + returning.preis) * 100) / 100
                  : 0
                const isBest = best?.outwardDate === outwardDate && best?.returnDate === returnDate
                const isSelected =
                  selectedCombination?.outwardDate === outwardDate &&
                  selectedCombination?.returnDate === returnDate
                const isPending = isStreaming && (!outward || !returning)

                return (
                  <button
                    type="button"
                    key={`${outwardDate}-${returnDate}`}
                    disabled={!hasBothPrices}
                    onClick={() => hasBothPrices && onSelectCombination(outwardDate, returnDate)}
                    className={`min-h-14 rounded border px-2 py-1 text-center text-xs ${
                      hasBothPrices
                        ? `${getCellTone(total)} cursor-pointer hover:shadow-sm`
                        : isPending && !isInvalidDuration
                          ? "border-blue-100 bg-blue-50 text-blue-700"
                          : "border-gray-100 bg-gray-50 text-gray-300"
                    } ${isBest ? "ring-2 ring-green-600" : ""} ${isSelected ? "outline outline-2 outline-blue-600" : ""}`}
                  >
                    {hasBothPrices ? (
                      <>
                        <div className="font-bold">{total}€</div>
                        <div className="mt-0.5 text-[10px] opacity-80">{nights} Nächte</div>
                      </>
                    ) : isPending && !isInvalidDuration ? (
                      <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      </div>
                    ) : (
                      <span>-</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CombinationBandEndpoint({
  combination,
  direction,
  startStation,
  zielStation,
  searchParams,
}: {
  combination: TravelCombination
  direction: "outward" | "return"
  startStation?: { name: string; id: string }
  zielStation?: { name: string; id: string }
  searchParams: any
}) {
  const outward = direction === "outward"
  const date = outward ? combination.outwardDate : combination.returnDate
  const departure = outward ? combination.outwardDeparture : combination.returnDeparture
  const arrival = outward ? combination.outwardArrival : combination.returnArrival
  const price = outward ? combination.outwardPrice : combination.returnPrice
  const transfers = outward ? combination.outwardTransfers : combination.returnTransfers
  const legs = (outward ? combination.outwardLegs : combination.returnLegs) || []

  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 sm:px-5">
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md",
          outward ? "bg-blue-600 text-white" : "border border-blue-600 bg-white text-blue-700"
        )}
      >
        <ArrowRight className={cn("h-4 w-4", !outward && "rotate-180")} />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span className="text-xs font-semibold uppercase text-blue-800">
            {outward ? "Hinfahrt" : "Rückfahrt"}
          </span>
          <span className="text-gray-300" aria-hidden="true">·</span>
          <span className="font-medium text-gray-500">Einzelpreis {formatPrice(price)}</span>
        </div>
        <div className="mt-0.5 text-sm font-semibold text-gray-900">{formatFullDate(date)}</div>
        <div className="mt-1 flex items-center gap-1.5 text-lg font-bold tabular-nums text-gray-950">
          <span>{formatTime(departure)}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span>{formatTime(arrival)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
          {departure && arrival && <span>{calculateDuration(departure, arrival)}</span>}
          <span aria-hidden="true">·</span>
          <span>{transfers === 0 ? "Direkt" : `${transfers ?? 0} Umstiege`}</span>
          <VehicleTypesSummary interval={{ abschnitte: legs }} />
        </div>
      </div>
      <div className="justify-self-end">
        <DirectionBookingButton
          combination={combination}
          direction={direction}
          startStation={startStation}
          zielStation={zielStation}
          searchParams={searchParams}
        />
      </div>
    </div>
  )
}

function CombinationSearchTimeline({
  combination,
  searchStart,
  searchEnd,
  outwardDates,
  returnDates,
  outwardResults,
  returnResults,
  isStreaming,
  onSelectCombination,
}: {
  combination: TravelCombination
  searchStart: string
  searchEnd: string
  outwardDates: string[]
  returnDates: string[]
  outwardResults: PriceResults
  returnResults: PriceResults
  isStreaming?: boolean
  onSelectCombination: (outwardDate: string, returnDate: string, focusResult?: boolean) => void
}) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<"outward" | "return" | null>(null)
  const normalizedStart = searchStart || combination.outwardDate
  const normalizedEnd = searchEnd || combination.returnDate
  const totalDays = Math.max(1, getNights(normalizedStart, normalizedEnd))
  const outwardOffset = Math.max(0, Math.min(totalDays, getNights(normalizedStart, combination.outwardDate)))
  const returnOffset = Math.max(0, Math.min(totalDays, getNights(normalizedStart, combination.returnDate)))
  const outwardPosition = (outwardOffset / totalDays) * 100
  const returnPosition = (returnOffset / totalDays) * 100
  const selectedWidth = Math.max(0, returnPosition - outwardPosition)
  const centerPosition = outwardPosition + selectedWidth / 2
  const closeMarkers = selectedWidth < 20
  const ticks = Array.from({ length: totalDays + 1 }, (_, index) => index)
  const dayWidth = 100 / totalDays
  const timelineDays = ticks.map((offset) => {
    const date = new Date(`${normalizedStart}T12:00:00`)
    date.setDate(date.getDate() + offset)
    const position = (offset / totalDays) * 100
    return {
      offset,
      dayOfWeek: date.getDay(),
      weekday: date.toLocaleDateString("de-DE", { weekday: "short" }).replace(".", ""),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      left: Math.max(0, position - dayWidth / 2),
      right: Math.min(100, position + dayWidth / 2),
      position,
    }
  })
  const selectableOutwardDates = outwardDates.filter((date) =>
    outwardResults[date]?.preis > 0 &&
    returnResults[combination.returnDate]?.preis > 0 &&
    getNights(date, combination.returnDate) >= 1
  )
  const selectableReturnDates = returnDates.filter((date) =>
    returnResults[date]?.preis > 0 &&
    outwardResults[combination.outwardDate]?.preis > 0 &&
    getNights(combination.outwardDate, date) >= 1
  )

  const markerAlignment = (position: number) => {
    if (position <= 0) return "translate-x-0"
    if (position >= 100) return "-translate-x-full"
    return "-translate-x-1/2"
  }

  const selectClosestDate = (
    direction: "outward" | "return",
    clientX: number,
    focusResult = false
  ) => {
    const timeline = timelineRef.current
    if (!timeline) return

    const rect = timeline.getBoundingClientRect()
    const pointerPosition = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
    const targetOffset = pointerPosition * totalDays
    const selectableDates = direction === "outward" ? selectableOutwardDates : selectableReturnDates
    if (selectableDates.length === 0) return

    const closestDate = selectableDates.reduce((closest, candidate) => {
      const closestDistance = Math.abs(getNights(normalizedStart, closest) - targetOffset)
      const candidateDistance = Math.abs(getNights(normalizedStart, candidate) - targetOffset)
      return candidateDistance < closestDistance ? candidate : closest
    })

    const outwardDate = direction === "outward" ? closestDate : combination.outwardDate
    const returnDate = direction === "return" ? closestDate : combination.returnDate
    if (focusResult || outwardDate !== combination.outwardDate || returnDate !== combination.returnDate) {
      onSelectCombination(outwardDate, returnDate, focusResult)
    }
  }

  const handlePointerDown = (
    direction: "outward" | "return",
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(direction)
    selectClosestDate(direction, event.clientX)
  }

  const handlePointerMove = (
    direction: "outward" | "return",
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.preventDefault()
    selectClosestDate(direction, event.clientX)
  }

  const handlePointerEnd = (
    direction: "outward" | "return",
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    selectClosestDate(direction, event.clientX, true)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragging(null)
  }

  const handleMarkerKeyDown = (
    direction: "outward" | "return",
    event: ReactKeyboardEvent<HTMLButtonElement>
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()

    const selectableDates = direction === "outward" ? selectableOutwardDates : selectableReturnDates
    const currentDate = direction === "outward" ? combination.outwardDate : combination.returnDate
    const currentIndex = selectableDates.indexOf(currentDate)
    const nextIndex = Math.max(
      0,
      Math.min(selectableDates.length - 1, currentIndex + (event.key === "ArrowRight" ? 1 : -1))
    )
    const nextDate = selectableDates[nextIndex]
    if (!nextDate || nextDate === currentDate) return

    onSelectCombination(
      direction === "outward" ? nextDate : combination.outwardDate,
      direction === "return" ? nextDate : combination.returnDate,
      true
    )
  }

  const markerTitle = (direction: "outward" | "return") => {
    const selectableDates = direction === "outward" ? selectableOutwardDates : selectableReturnDates
    if (selectableDates.length > 1) {
      return direction === "outward" ? "Hinfahrt verschieben" : "Rückfahrt verschieben"
    }
    if (isStreaming) return "Weitere Reisetage werden geladen"
    return direction === "outward" ? "Keine weitere Hinfahrt verfügbar" : "Keine weitere Rückfahrt verfügbar"
  }

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-blue-900">Position im gesuchten Reisezeitraum</span>
        <div className="flex items-center gap-3 text-blue-700">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 border border-gray-200 bg-gray-100" />
            Wochenende
          </span>
          <span>{totalDays + 1} Reisetage</span>
        </div>
      </div>

      <div ref={timelineRef} className="relative mx-1 mt-3 h-32 select-none sm:mx-2">
        {timelineDays.filter((day) => day.isWeekend).map((day) => (
          <span
            key={`weekend-${day.offset}`}
            className={cn(
              "absolute bottom-10 top-8 bg-gray-100/90",
              day.dayOfWeek === 6
                ? "rounded-l-md border-y border-l border-gray-200"
                : "rounded-r-md border-y border-r border-gray-200"
            )}
            style={{ left: `${day.left}%`, width: `${day.right - day.left}%` }}
          />
        ))}
        {timelineDays
          .filter((day) => totalDays <= 14 || day.isWeekend || day.dayOfWeek === 1)
          .map((day) => (
            <span
              key={`weekday-${day.offset}`}
              className={cn(
              "absolute top-[4.1rem] z-10 text-[9px] font-medium",
                markerAlignment(day.position),
                day.isWeekend ? "font-bold text-gray-600" : "text-gray-400"
              )}
              style={{ left: `${day.position}%` }}
            >
              {day.weekday}
            </span>
          ))}
        <div className="absolute left-0 right-0 top-12 h-1 rounded bg-blue-100" />
        {ticks.map((tick) => (
          <span
            key={tick}
            className="absolute top-11 h-3 w-px bg-blue-200"
            style={{ left: `${(tick / totalDays) * 100}%` }}
          />
        ))}

        <div
          className="absolute top-12 h-1 rounded bg-blue-600"
          style={{ left: `${outwardPosition}%`, width: `${selectedWidth}%` }}
        />

        <div
          className={cn(
            "absolute text-xs font-semibold text-blue-800",
            markerAlignment(outwardPosition)
          )}
          style={{ left: `${outwardPosition}%`, top: 0 }}
        >
          Hin · {formatDate(combination.outwardDate)}
        </div>
        <button
          type="button"
          aria-label="Hinfahrtsdatum verschieben"
          aria-valuetext={formatDate(combination.outwardDate)}
          title={markerTitle("outward")}
          onPointerDown={(event) => handlePointerDown("outward", event)}
          onPointerMove={(event) => handlePointerMove("outward", event)}
          onPointerUp={(event) => handlePointerEnd("outward", event)}
          onPointerCancel={(event) => handlePointerEnd("outward", event)}
          onKeyDown={(event) => handleMarkerKeyDown("outward", event)}
          className={cn(
            "absolute top-8 z-20 flex h-8 w-8 touch-none items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
            selectableOutwardDates.length > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default",
            markerAlignment(outwardPosition),
            dragging === "outward" && "z-30"
          )}
          style={{ left: `${outwardPosition}%` }}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-white shadow-sm transition-transform hover:scale-110">
            <GripVertical className="h-3 w-3" />
          </span>
        </button>

        <div
          className={cn(
            "absolute text-xs font-semibold text-blue-800",
            markerAlignment(returnPosition)
          )}
          style={{ left: `${returnPosition}%`, top: closeMarkers ? 20 : 0 }}
        >
          Rück · {formatDate(combination.returnDate)}
        </div>
        <button
          type="button"
          aria-label="Rückfahrtsdatum verschieben"
          aria-valuetext={formatDate(combination.returnDate)}
          title={markerTitle("return")}
          onPointerDown={(event) => handlePointerDown("return", event)}
          onPointerMove={(event) => handlePointerMove("return", event)}
          onPointerUp={(event) => handlePointerEnd("return", event)}
          onPointerCancel={(event) => handlePointerEnd("return", event)}
          onKeyDown={(event) => handleMarkerKeyDown("return", event)}
          className={cn(
            "absolute top-8 z-20 flex h-8 w-8 touch-none items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
            selectableReturnDates.length > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-default",
            markerAlignment(returnPosition),
            dragging === "return" && "z-30"
          )}
          style={{ left: `${returnPosition}%` }}
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-blue-600 bg-white text-blue-700 shadow-sm transition-transform hover:scale-110">
            <GripVertical className="h-3 w-3" />
          </span>
        </button>

        <div
          className="absolute top-[4.9rem] -translate-x-1/2 whitespace-nowrap text-xs font-bold text-gray-900"
          style={{ left: `${centerPosition}%` }}
        >
          {combination.nights} Nächte
        </div>

        <div className="absolute bottom-0 left-0 text-left">
          <div className="text-[10px] uppercase text-gray-500">Suchbeginn</div>
          <div className="text-xs font-semibold text-gray-800 sm:text-sm">{formatDate(normalizedStart)}</div>
        </div>
        <div className="absolute bottom-0 right-0 text-right">
          <div className="text-[10px] uppercase text-gray-500">Suchende</div>
          <div className="text-xs font-semibold text-gray-800 sm:text-sm">{formatDate(normalizedEnd)}</div>
        </div>
      </div>
    </div>
  )
}

function CombinationOverviewBand({
  combination,
  bestPrice,
  worstPrice,
  searchStart,
  searchEnd,
  startStation,
  zielStation,
  searchParams,
  outwardRideCount,
  returnRideCount,
  onShowOutwardRides,
  onShowReturnRides,
  outwardDates,
  returnDates,
  outwardResults,
  returnResults,
  minNights,
  maxNights,
  isStreaming,
  onSelectCombination,
  outsideStayFilter,
}: {
  combination: TravelCombination
  bestPrice: number
  worstPrice: number
  searchStart: string
  searchEnd: string
  startStation?: { name: string; id: string }
  zielStation?: { name: string; id: string }
  searchParams: any
  outwardRideCount: number
  returnRideCount: number
  onShowOutwardRides: () => void
  onShowReturnRides: () => void
  outwardDates: string[]
  returnDates: string[]
  outwardResults: PriceResults
  returnResults: PriceResults
  minNights: number
  maxNights?: number
  isStreaming?: boolean
  onSelectCombination: (outwardDate: string, returnDate: string, focusResult?: boolean) => void
  outsideStayFilter: boolean
}) {
  const totalPriceTone = combination.totalPrice === bestPrice
    ? "bg-green-50 text-green-700"
    : worstPrice > bestPrice && combination.totalPrice === worstPrice
      ? "bg-red-50 text-red-700"
      : "bg-orange-50 text-orange-700"

  return (
    <div className="border-b border-blue-100 bg-white">
      <div className="grid gap-4 bg-blue-50/70 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
            <Train className="h-4 w-4" />
            Ausgewählte Reisekombination
          </div>
          <div className="mt-1 truncate text-sm text-gray-600">
            {startStation?.name || "Start"} nach {zielStation?.name || "Ziel"} und zurück
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 lg:justify-end">
          {combination.totalPrice === bestPrice && (
            <Badge className="flex items-center gap-1 rounded-full border border-green-400 bg-green-100 px-2 py-1 font-semibold text-green-800 shadow-sm">
              <Euro className="h-3 w-3" />
              Bestpreis
            </Badge>
          )}
          <div className="text-right">
            <div className="text-xs text-gray-500">Gesamtpreis</div>
            <div className={cn("mt-0.5 inline-block rounded-md px-2 py-1 text-2xl font-bold tabular-nums", totalPriceTone)}>
              {formatPrice(combination.totalPrice)}
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 md:divide-x md:divide-gray-200">
        <CombinationBandEndpoint
          combination={combination}
          direction="outward"
          startStation={startStation}
          zielStation={zielStation}
          searchParams={searchParams}
        />
        <div className="border-t border-gray-200 md:border-t-0">
          <CombinationBandEndpoint
            combination={combination}
            direction="return"
            startStation={startStation}
            zielStation={zielStation}
            searchParams={searchParams}
          />
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white px-4 py-3 sm:px-5">
        <JourneyDetails combination={combination} />
      </div>

      <div className="border-t border-gray-200 px-4 pb-1 sm:px-5">
        <CombinationSearchTimeline
          combination={combination}
          searchStart={searchStart}
          searchEnd={searchEnd}
          outwardDates={outwardDates}
          returnDates={returnDates}
          outwardResults={outwardResults}
          returnResults={returnResults}
          isStreaming={isStreaming}
          onSelectCombination={onSelectCombination}
        />
      </div>

      {outsideStayFilter && (
        <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 sm:px-5" role="status">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Diese Auswahl hat {combination.nights} {combination.nights === 1 ? "Nacht" : "Nächte"} und liegt außerhalb des ursprünglichen Filters
            {typeof maxNights === "number" ? ` von ${minNights} bis ${maxNights} Nächten.` : ` von mindestens ${minNights} Nächten.`}
          </span>
        </div>
      )}

      <div className="grid gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:grid-cols-2 sm:px-5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 justify-start border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          onClick={onShowOutwardRides}
          disabled={outwardRideCount === 0}
        >
          <Train className="h-4 w-4 text-blue-600" />
          Hinfahrten am {formatDate(combination.outwardDate)} ansehen · {outwardRideCount}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 justify-start border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
          onClick={onShowReturnRides}
          disabled={returnRideCount === 0}
        >
          <Train className="h-4 w-4 text-blue-600" />
          Rückfahrten am {formatDate(combination.returnDate)} ansehen · {returnRideCount}
        </Button>
      </div>
    </div>
  )
}

function CombinationComparisonPanel({
  combinations,
  selectedCombination,
  searchStart,
  searchEnd,
  outwardDates,
  returnDates,
  outwardResults,
  returnResults,
  minNights,
  maxNights,
  isStreaming,
  startStation,
  zielStation,
  searchParams,
  onSelectCombination,
  onSelectTimelineCombination,
}: {
  combinations: TravelCombination[]
  selectedCombination: TravelCombination
  searchStart: string
  searchEnd: string
  outwardDates: string[]
  returnDates: string[]
  outwardResults: PriceResults
  returnResults: PriceResults
  minNights: number
  maxNights?: number
  isStreaming?: boolean
  startStation?: { name: string; id: string }
  zielStation?: { name: string; id: string }
  searchParams: any
  onSelectCombination: (outwardDate: string, returnDate: string) => void
  onSelectTimelineCombination: (outwardDate: string, returnDate: string) => void
}) {
  const [combinationSortKey, setCombinationSortKey] = useState<CombinationSortKey>("price")
  const [combinationSortDir, setCombinationSortDir] = useState<"asc" | "desc">("asc")
  const [pendingResultFocus, setPendingResultFocus] = useState<string | null>(null)
  const [expandedCombinationKeys, setExpandedCombinationKeys] = useState<Set<string>>(new Set())
  const combinationResultRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  const toggleCombinationDetails = (key: string) => {
    setExpandedCombinationKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useEffect(() => {
    if (!pendingResultFocus) return
    if (getCombinationKey(selectedCombination.outwardDate, selectedCombination.returnDate) !== pendingResultFocus) return

    const animationFrame = window.requestAnimationFrame(() => {
      const result = combinationResultRefs.current.get(pendingResultFocus)
      if (!result) return

      result.scrollIntoView({ behavior: "smooth", block: "nearest" })
      result.focus({ preventScroll: true })
      setPendingResultFocus(null)
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [pendingResultFocus, selectedCombination])

  const handleTimelineSelection = (
    outwardDate: string,
    returnDate: string,
    focusResult = false
  ) => {
    if (focusResult) {
      setPendingResultFocus(getCombinationKey(outwardDate, returnDate))
    }
    onSelectTimelineCombination(outwardDate, returnDate)
  }

  const handleCombinationSort = (key: CombinationSortKey) => {
    if (combinationSortKey === key) {
      setCombinationSortDir((direction) => direction === "asc" ? "desc" : "asc")
      return
    }
    setCombinationSortKey(key)
    setCombinationSortDir("asc")
  }

  const compareCombinations = (left: TravelCombination, right: TravelCombination) => {
    let difference = 0

    switch (combinationSortKey) {
      case "outward":
        difference = new Date(left.outwardDeparture || left.outwardDate).getTime() -
          new Date(right.outwardDeparture || right.outwardDate).getTime()
        break
      case "return":
        difference = new Date(left.returnDeparture || left.returnDate).getTime() -
          new Date(right.returnDeparture || right.returnDate).getTime()
        break
      case "nights":
        difference = left.nights - right.nights
        break
      case "price":
        difference = left.totalPrice - right.totalPrice
        break
    }

    if (difference !== 0) {
      return combinationSortDir === "asc" ? difference : -difference
    }
    return left.totalPrice - right.totalPrice || left.nights - right.nights
  }

  const ranked = [...combinations].sort(
    (left, right) => left.totalPrice - right.totalPrice || left.nights - right.nights
  )
  const best = ranked[0]
  const visibleCombinations = (
    ranked.some((combination) => isSameCombination(combination, selectedCombination))
      ? ranked
      : [...ranked, selectedCombination]
  ).sort(compareCombinations)
  const prices = visibleCombinations.map((combination) => combination.totalPrice)
  const minPrice = prices.length > 0 ? Math.min(...prices) : selectedCombination.totalPrice
  const maxPrice = prices.length > 0 ? Math.max(...prices) : selectedCombination.totalPrice
  const shortestTotalTravelTime = visibleCombinations.reduce((shortest, combination) => {
    const outwardMinutes = combination.outwardDeparture && combination.outwardArrival
      ? getDurationMinutes(combination.outwardDeparture, combination.outwardArrival)
      : Number.POSITIVE_INFINITY
    const returnMinutes = combination.returnDeparture && combination.returnArrival
      ? getDurationMinutes(combination.returnDeparture, combination.returnArrival)
      : Number.POSITIVE_INFINITY
    const totalMinutes = outwardMinutes + returnMinutes
    return Number.isFinite(totalMinutes) ? Math.min(shortest, totalMinutes) : shortest
  }, Number.POSITIVE_INFINITY)
  const selectedOutsideStayFilter =
    selectedCombination.nights < minNights ||
    (typeof maxNights === "number" && selectedCombination.nights > maxNights)
  const [dayDetailsDirection, setDayDetailsDirection] = useState<"outward" | "return" | null>(null)
  const [matrixOpen, setMatrixOpen] = useState(false)
  const shouldOfferExpandedMatrix =
    outwardDates.length > 7 || returnDates.length > 7 || outwardDates.length * returnDates.length > 49
  const outwardDayData = outwardResults[selectedCombination.outwardDate]
  const returnDayData = returnResults[selectedCombination.returnDate]
  const outwardRideCount = outwardDayData?.allIntervals?.length || (outwardDayData?.preis > 0 ? 1 : 0)
  const returnRideCount = returnDayData?.allIntervals?.length || (returnDayData?.preis > 0 ? 1 : 0)
  const showingReturn = dayDetailsDirection === "return"
  const modalDate = dayDetailsDirection
    ? showingReturn ? selectedCombination.returnDate : selectedCombination.outwardDate
    : null
  const modalData = dayDetailsDirection
    ? normalizeDayDetailsData(
        showingReturn ? returnDayData : outwardDayData,
        showingReturn ? zielStation?.name || "Ziel" : startStation?.name || "Start",
        showingReturn ? startStation?.name || "Start" : zielStation?.name || "Ziel"
      )
    : null
  const modalSearchParams = showingReturn
    ? {
        ...searchParams,
        abfahrtAb: searchParams.returnAbfahrtAb,
        abfahrtBis: searchParams.returnAbfahrtBis,
        ankunftAb: searchParams.returnAnkunftAb,
        ankunftBis: searchParams.returnAnkunftBis,
      }
    : searchParams

  const priceTone = (price: number) => {
    if (price === minPrice) return "bg-green-50 text-green-700"
    if (maxPrice > minPrice && price === maxPrice) return "bg-red-50 text-red-700"
    return "bg-orange-50 text-orange-700"
  }

  const combinationSortOptions: Array<{ key: CombinationSortKey; label: string }> = [
    { key: "outward", label: "Hinfahrt" },
    { key: "return", label: "Rückfahrt" },
    { key: "nights", label: "Nächte" },
    { key: "price", label: "Gesamtpreis" },
  ]
  const activeCombinationSortLabel = combinationSortOptions.find(
    (option) => option.key === combinationSortKey
  )?.label || "Gesamtpreis"

  return (
    <>
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <CombinationOverviewBand
        combination={selectedCombination}
        bestPrice={minPrice}
        worstPrice={maxPrice}
        searchStart={searchStart}
        searchEnd={searchEnd}
        startStation={startStation}
        zielStation={zielStation}
        searchParams={searchParams}
        outwardRideCount={outwardRideCount}
        returnRideCount={returnRideCount}
        onShowOutwardRides={() => setDayDetailsDirection("outward")}
        onShowReturnRides={() => setDayDetailsDirection("return")}
        outwardDates={outwardDates}
        returnDates={returnDates}
        outwardResults={outwardResults}
        returnResults={returnResults}
        minNights={minNights}
        maxNights={maxNights}
        isStreaming={isStreaming}
        onSelectCombination={handleTimelineSelection}
        outsideStayFilter={selectedOutsideStayFilter}
      />

      <div className="flex flex-col gap-1 border-b border-blue-200 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
            <Train className="h-4 w-4" /> Verfügbare Reisekombinationen ({visibleCombinations.length})
          </div>
          <div className="mt-0.5 text-xs text-blue-700">
            Nach {activeCombinationSortLabel} {combinationSortDir === "asc" ? "aufsteigend" : "absteigend"} sortiert
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs font-medium text-blue-700">
          {isStreaming && (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Wird laufend ergänzt
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-gray-200 bg-white sm:grid-cols-4" aria-label="Reisekombinationen sortieren">
        {combinationSortOptions.map((option) => {
          const active = combinationSortKey === option.key
          return (
            <button
              key={option.key}
              type="button"
              className={cn(
                "flex min-h-10 items-center justify-center gap-1 border-r border-gray-100 px-3 py-2 text-xs font-semibold transition-colors last:border-r-0 hover:bg-blue-50 hover:text-blue-700",
                active ? "bg-blue-50 text-blue-800" : "text-gray-600"
              )}
              onClick={() => handleCombinationSort(option.key)}
              aria-pressed={active}
              aria-label={`${option.label} ${active && combinationSortDir === "asc" ? "absteigend" : "aufsteigend"} sortieren`}
            >
              {option.label}
              {active && (
                combinationSortDir === "asc"
                  ? <ChevronUp className="h-3.5 w-3.5" />
                  : <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          )
        })}
      </div>

      <div className="max-h-[36rem] space-y-2 overflow-y-auto overscroll-contain bg-gray-50 p-3 lg:max-h-[44rem]">
        {visibleCombinations.map((combination) => {
          const active = isSameCombination(combination, selectedCombination)
          const isBestPrice = combination.totalPrice === minPrice
          const combinationKey = getCombinationKey(combination.outwardDate, combination.returnDate)
          const detailsOpen = expandedCombinationKeys.has(combinationKey)
          const outwardLegs = combination.outwardLegs || []
          const returnLegs = combination.returnLegs || []
          const hasJourneyDetails = outwardLegs.length > 0 || returnLegs.length > 0
          const combinationTravelTime = combination.outwardDeparture && combination.outwardArrival && combination.returnDeparture && combination.returnArrival
            ? getDurationMinutes(combination.outwardDeparture, combination.outwardArrival) +
              getDurationMinutes(combination.returnDeparture, combination.returnArrival)
            : Number.POSITIVE_INFINITY
          const hasShortestTravelTime = Number.isFinite(combinationTravelTime) && combinationTravelTime === shortestTotalTravelTime
          const isDirectCombination = combination.outwardTransfers === 0 && combination.returnTransfers === 0

          return (
            <article
              key={combinationKey}
              className={cn(
                "overflow-hidden rounded-lg border bg-white shadow-sm transition",
                isBestPrice ? "border-l-4 border-l-green-500" : "border-gray-200",
                active && "ring-2 ring-blue-500 ring-offset-1"
              )}
            >
              <button
                ref={(element) => {
                  if (element) combinationResultRefs.current.set(combinationKey, element)
                  else combinationResultRefs.current.delete(combinationKey)
                }}
                type="button"
                className="w-full p-3 text-left transition-colors hover:bg-gray-50 sm:p-4"
                onClick={() => onSelectCombination(combination.outwardDate, combination.returnDate)}
                aria-pressed={active}
              >
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {isBestPrice ? (
                    <Badge className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 shadow-none">
                      <Euro className="h-3 w-3" />
                      Bestpreis
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      Alternative
                    </Badge>
                  )}
                  {hasShortestTravelTime && (
                    <Badge className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 shadow-none">
                      <Clock className="h-3 w-3" />
                      Kürzeste Gesamtreisezeit
                    </Badge>
                  )}
                  {isDirectCombination && (
                    <Badge className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 shadow-none">
                      <Train className="h-3 w-3" />
                      Nur Direktverbindungen
                    </Badge>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)_7rem] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className="font-semibold uppercase tracking-wide text-blue-700">Hinfahrt</span>
                      <span className="text-gray-300" aria-hidden="true">·</span>
                      <span className="font-medium text-gray-500">Einzelpreis {formatPrice(combination.outwardPrice)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-sm font-semibold text-gray-900">{formatFullDate(combination.outwardDate)}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-lg font-bold tabular-nums text-gray-950">
                      <span>{formatTime(combination.outwardDeparture)}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span>{formatTime(combination.outwardArrival)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                      <span>{calculateDuration(combination.outwardDeparture, combination.outwardArrival)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{combination.outwardTransfers === 0 ? "Direkt" : `${combination.outwardTransfers ?? 0} Umstiege`}</span>
                      <VehicleTypesSummary interval={{ abschnitte: outwardLegs }} />
                    </div>
                  </div>

                  <div className="flex items-baseline justify-center gap-1 border-y border-gray-100 py-2 text-center sm:block sm:border-x sm:border-y-0 sm:px-2 sm:py-0">
                    <span className="text-lg font-bold text-gray-900">{combination.nights}</span>
                    <span className="text-xs text-gray-500 sm:block">Nächte</span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className="font-semibold uppercase tracking-wide text-blue-700">Rückfahrt</span>
                      <span className="text-gray-300" aria-hidden="true">·</span>
                      <span className="font-medium text-gray-500">Einzelpreis {formatPrice(combination.returnPrice)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-sm font-semibold text-gray-900">{formatFullDate(combination.returnDate)}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-lg font-bold tabular-nums text-gray-950">
                      <span>{formatTime(combination.returnDeparture)}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span>{formatTime(combination.returnArrival)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                      <span>{calculateDuration(combination.returnDeparture, combination.returnArrival)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{combination.returnTransfers === 0 ? "Direkt" : `${combination.returnTransfers ?? 0} Umstiege`}</span>
                      <VehicleTypesSummary interval={{ abschnitte: returnLegs }} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 sm:block sm:text-right">
                    <span className="text-xs text-gray-500 sm:block">Gesamtpreis</span>
                    <span className={cn("inline-block rounded-md px-2 py-1 text-xl font-bold tabular-nums", priceTone(combination.totalPrice))}>
                      {formatPrice(combination.totalPrice)}
                    </span>
                    {isBestPrice && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-green-700 sm:ml-0 sm:mt-1 sm:justify-end">
                        <Euro className="h-3 w-3" /> Bestpreis
                      </span>
                    )}
                  </div>
                </div>
              </button>

              <div className="flex flex-col gap-2 border-t border-gray-100 bg-gray-50/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                {active ? (
                  <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
                    <span className="hidden text-xs font-semibold text-blue-700 sm:inline">Ausgewählt</span>
                    <div className="min-w-0 [&>button]:w-full">
                      <DirectionBookingButton
                        combination={combination}
                        direction="outward"
                        startStation={startStation}
                        zielStation={zielStation}
                        searchParams={searchParams}
                      />
                    </div>
                    <div className="min-w-0 [&>button]:w-full">
                      <DirectionBookingButton
                        combination={combination}
                        direction="return"
                        startStation={startStation}
                        zielStation={zielStation}
                        searchParams={searchParams}
                      />
                    </div>
                  </div>
                ) : <span />}
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 transition-colors hover:text-blue-700 disabled:cursor-not-allowed disabled:text-gray-300"
                  onClick={() => toggleCombinationDetails(combinationKey)}
                  aria-expanded={detailsOpen}
                  disabled={!hasJourneyDetails}
                >
                  <Train className="h-3.5 w-3.5" />
                  {hasJourneyDetails ? (detailsOpen ? "Fahrtverlauf schließen" : "Fahrtverlauf anzeigen") : "Kein Fahrtverlauf verfügbar"}
                  {hasJourneyDetails && (detailsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                </button>
              </div>

              {detailsOpen && hasJourneyDetails && (
                <div className="grid gap-3 border-t border-gray-200 bg-white p-3 sm:p-4 lg:grid-cols-2">
                  <section className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Fahrtverlauf Hinfahrt</h4>
                    {outwardLegs.length > 0 ? (
                      <>
                        <div className="hidden md:block"><JourneyTimelineHorizontal legs={outwardLegs} /></div>
                        <div className="md:hidden"><JourneyTimelineVertical legs={outwardLegs} /></div>
                      </>
                    ) : <p className="text-xs text-gray-500">Keine Detaildaten verfügbar.</p>}
                  </section>
                  <section className="min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">Fahrtverlauf Rückfahrt</h4>
                    {returnLegs.length > 0 ? (
                      <>
                        <div className="hidden md:block"><JourneyTimelineHorizontal legs={returnLegs} /></div>
                        <div className="md:hidden"><JourneyTimelineVertical legs={returnLegs} /></div>
                      </>
                    ) : <p className="text-xs text-gray-500">Keine Detaildaten verfügbar.</p>}
                  </section>
                </div>
              )}
            </article>
          )
        })}
      </div>

      <div className="border-t border-gray-200 bg-gray-50 p-3">
        <ComboMatrix
          outwardDates={outwardDates}
          returnDates={returnDates}
          outwardResults={outwardResults}
          returnResults={returnResults}
          best={best}
          minNights={minNights}
          maxNights={maxNights}
          isStreaming={isStreaming}
          selectedCombination={selectedCombination}
          onSelectCombination={onSelectCombination}
          onOpenLarge={shouldOfferExpandedMatrix ? () => setMatrixOpen(true) : undefined}
        />
      </div>

    </section>

    <DayDetailsModal
      key={dayDetailsDirection || "closed"}
      isOpen={Boolean(dayDetailsDirection)}
      onClose={() => setDayDetailsDirection(null)}
      date={modalDate}
      data={modalData}
      startStation={showingReturn ? zielStation : startStation}
      zielStation={showingReturn ? startStation : zielStation}
      searchParams={modalSearchParams}
    />

    <Dialog open={matrixOpen} onOpenChange={setMatrixOpen}>
      <DialogContent className="h-[92vh] w-[96vw] max-w-[96vw] overflow-hidden p-0">
        <DialogHeader className="border-b border-gray-200 px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Maximize2 className="h-5 w-5 text-blue-600" />
            Preismatrix im Überblick
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-hidden px-4 pb-4">
          <ComboMatrix
            outwardDates={outwardDates}
            returnDates={returnDates}
            outwardResults={outwardResults}
            returnResults={returnResults}
            best={best}
            minNights={minNights}
            maxNights={maxNights}
            isStreaming={isStreaming}
            selectedCombination={selectedCombination}
            onSelectCombination={onSelectCombination}
            expanded
          />
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}

function CombinationTimeline({ combination }: { combination: TravelCombination }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-green-200 bg-white p-3">
      <div>
        <div className="text-xs font-medium uppercase text-gray-500">Hinfahrt</div>
        <div className="font-semibold text-gray-900">{formatDate(combination.outwardDate)}</div>
        <div className="text-sm text-gray-600">{formatTime(combination.outwardDeparture)} ab</div>
      </div>
      <div className="flex min-w-20 flex-col items-center">
        <div className="h-px w-full bg-green-200" />
        <div className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-800">
          {combination.nights} Nächte
        </div>
        <div className="h-px w-full bg-green-200" />
      </div>
      <div className="text-right">
        <div className="text-xs font-medium uppercase text-gray-500">Rückfahrt</div>
        <div className="font-semibold text-gray-900">{formatDate(combination.returnDate)}</div>
        <div className="text-sm text-gray-600">{formatTime(combination.returnDeparture)} ab</div>
      </div>
    </div>
  )
}

function DateRangeBar({
  combination,
  searchParams,
}: {
  combination?: TravelCombination
  searchParams: any
}) {
  const from = searchParams.reisezeitraumAb
  const to = searchParams.reisezeitraumBis
  const outwardPct = combination ? dayOffsetPercent(combination.outwardDate, from, to) : 0
  const returnPct = combination ? dayOffsetPercent(combination.returnDate, from, to) : 100

  return (
    <div className="rounded-lg border border-blue-100 bg-white p-3">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-semibold text-gray-800">Gesuchter Reisezeitraum</div>
        <div className="text-xs text-gray-600">
          {formatFullDate(from)} bis {formatFullDate(to)}
        </div>
      </div>
      <div className="relative h-12">
        <div className="absolute left-0 right-0 top-5 h-2 rounded-full bg-blue-100" />
        {combination && (
          <div
            className="absolute top-5 h-2 rounded-full bg-green-400"
            style={{
              left: `${Math.min(outwardPct, returnPct)}%`,
              width: `${Math.max(3, Math.abs(returnPct - outwardPct))}%`,
            }}
          />
        )}
        {combination && (
          <>
            <div
              className="absolute top-1 -translate-x-1/2"
              style={{ left: `${outwardPct}%` }}
            >
              <div className="rounded-full border-2 border-blue-600 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 shadow-sm">
                Hin
              </div>
            </div>
            <div
              className="absolute top-1 -translate-x-1/2"
              style={{ left: `${returnPct}%` }}
            >
              <div className="rounded-full border-2 border-green-600 bg-white px-2 py-1 text-[11px] font-semibold text-green-700 shadow-sm">
                Rück
              </div>
            </div>
          </>
        )}
      </div>
      {combination && (
        <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
          <div>
            <span className="font-medium text-gray-800">Hin:</span> {formatFullDate(combination.outwardDate)}
          </div>
          <div className="text-center font-semibold text-green-700">{combination.nights} Nächte</div>
          <div className="text-right">
            <span className="font-medium text-gray-800">Rück:</span> {formatFullDate(combination.returnDate)}
          </div>
        </div>
      )}
    </div>
  )
}

function JourneyDetails({
  combination,
  initiallyOpen = false,
}: {
  combination: TravelCombination
  initiallyOpen?: boolean
}) {
  const [open, setOpen] = useState(initiallyOpen)
  const hasOutwardLegs = Boolean(combination.outwardLegs?.length)
  const hasReturnLegs = Boolean(combination.returnLegs?.length)
  const hasDetails = hasOutwardLegs || hasReturnLegs

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold text-gray-800"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="inline-flex items-center gap-2">
          <Train className="h-4 w-4 text-blue-600" />
          {open ? "Fahrtverlauf schließen" : "Fahrtverlauf anzeigen"}
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-gray-200 p-3">
          {!hasDetails && (
            <div className="text-center text-xs text-gray-500">
              Für diese Kombination sind keine Detailabschnitte verfügbar.
            </div>
          )}
          {hasOutwardLegs && (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Hinfahrt</div>
              <div className="hidden md:block">
                <JourneyTimelineHorizontal legs={combination.outwardLegs || []} />
              </div>
              <div className="md:hidden">
                <JourneyTimelineVertical legs={combination.outwardLegs || []} />
              </div>
            </div>
          )}
          {hasReturnLegs && (
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Rückfahrt</div>
              <div className="hidden md:block">
                <JourneyTimelineHorizontal legs={combination.returnLegs || []} />
              </div>
              <div className="md:hidden">
                <JourneyTimelineVertical legs={combination.returnLegs || []} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DirectionBookingButton({
  combination,
  direction,
  startStation,
  zielStation,
  searchParams,
}: {
  combination: TravelCombination
  direction: "outward" | "return"
  startStation?: { name: string; id: string }
  zielStation?: { name: string; id: string }
  searchParams: any
}) {
  if (!startStation || !zielStation) return null

  const openBooking = () => {
    const isReturn = direction === "return"
    const departure = isReturn ? combination.returnDeparture : combination.outwardDeparture
    const from = isReturn ? zielStation : startStation
    const to = isReturn ? startStation : zielStation
    const link = createBookingLink(
      departure,
      from.name,
      to.name,
      from.id,
      to.id,
      searchParams.klasse || "KLASSE_2",
      searchParams.maximaleUmstiege || "",
      searchParams.alter || "ERWACHSENER",
      searchParams.ermaessigungArt || "KEINE_ERMAESSIGUNG",
      searchParams.ermaessigungKlasse || "KLASSENLOS",
      searchParams.umstiegszeit
    )
    if (link) window.open(link, "_blank")
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={direction === "outward" ? "default" : "outline"}
      className={cn(
        "h-8 px-2 text-xs",
        direction === "outward"
          ? "bg-blue-600 text-white hover:bg-blue-700"
          : "border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
      )}
      onClick={openBooking}
      title={direction === "outward" ? "Hinfahrt buchen" : "Rückfahrt buchen"}
    >
      <Train className="h-3.5 w-3.5" />
      {direction === "outward" ? "Hinfahrt buchen" : "Rückfahrt buchen"}
    </Button>
  )
}

function DayRideList({
  title,
  date,
  data,
  fromStation,
  toStation,
  searchParams,
}: {
  title: string
  date: string
  data?: PriceData
  fromStation?: { name: string; id: string }
  toStation?: { name: string; id: string }
  searchParams: any
}) {
  type SortKey = "preis" | "abfahrt" | "ankunft" | "umstiege" | "dauer"

  const [showOnlyCheapest, setShowOnlyCheapest] = useState(false)
  const [showAllJourneyDetails, setShowAllJourneyDetails] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("preis")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const intervals = data?.allIntervals?.length
    ? data.allIntervals
    : data && data.preis > 0
      ? [{
          preis: data.preis,
          abfahrtsZeitpunkt: data.abfahrtsZeitpunkt,
          ankunftsZeitpunkt: data.ankunftsZeitpunkt,
          abfahrtsOrt: fromStation?.name || "",
          ankunftsOrt: toStation?.name || "",
          info: data.info,
        }]
      : []
  const minDuration = intervals.length > 0
    ? Math.min(...intervals.map((interval) => getDurationMinutes(interval.abfahrtsZeitpunkt, interval.ankunftsZeitpunkt)))
    : null

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((direction) => direction === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const sortedIntervals = [...intervals].sort((a, b) => {
    let left = 0
    let right = 0

    switch (sortKey) {
      case "abfahrt":
        left = new Date(a.abfahrtsZeitpunkt).getTime()
        right = new Date(b.abfahrtsZeitpunkt).getTime()
        break
      case "ankunft":
        left = new Date(a.ankunftsZeitpunkt).getTime()
        right = new Date(b.ankunftsZeitpunkt).getTime()
        break
      case "umstiege":
        left = a.umstiegsAnzahl || 0
        right = b.umstiegsAnzahl || 0
        break
      case "dauer":
        left = getDurationMinutes(a.abfahrtsZeitpunkt, a.ankunftsZeitpunkt)
        right = getDurationMinutes(b.abfahrtsZeitpunkt, b.ankunftsZeitpunkt)
        break
      case "preis":
      default:
        left = a.preis
        right = b.preis
        break
    }

    const diff = left - right
    if (diff !== 0) return sortDir === "asc" ? diff : -diff

    return getDurationMinutes(a.abfahrtsZeitpunkt, a.ankunftsZeitpunkt) -
      getDurationMinutes(b.abfahrtsZeitpunkt, b.ankunftsZeitpunkt)
  })

  const displayedIntervals = showOnlyCheapest
    ? (() => {
        const cheapestPerInterval = sortedIntervals.filter((interval) => interval.isCheapestPerInterval)
        return cheapestPerInterval.length > 0 ? cheapestPerInterval : sortedIntervals
      })()
    : sortedIntervals

  const getIntervalPriceColor = (price: number) => {
    const prices = intervals.map((interval) => interval.preis)
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)

    if (price === minPrice) return "text-green-600 bg-green-50"
    if (price === maxPrice) return "text-red-600 bg-red-50"
    return "text-orange-600 bg-orange-50"
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-white">
      <div className="border-b border-blue-100 bg-blue-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-blue-900">{title}</div>
            <div className="text-xs text-blue-700">{formatFullDate(date)}</div>
          </div>
          <span className="rounded bg-white px-2 py-1 text-xs font-medium text-blue-700">
            {intervals.length} Fahrten
          </span>
        </div>
      </div>

      {intervals.length === 0 ? (
        <div className="p-3 text-sm text-gray-500">Keine einzelnen Fahrten für diesen Tag verfügbar.</div>
      ) : (
        <ConnectionsTable
          intervals={intervals}
          displayedIntervals={displayedIntervals}
          hasMultipleIntervals={intervals.length > 1}
          minDuration={minDuration}
          data={data || { preis: 0, info: "", abfahrtsZeitpunkt: "", ankunftsZeitpunkt: "" }}
          recommendedTrip={null}
          startStation={fromStation}
          zielStation={toStation}
          searchParams={searchParams}
          sortKey={sortKey}
          sortDir={sortDir}
          handleSort={handleSort}
          getIntervalPriceColor={getIntervalPriceColor}
          calculateDuration={calculateDuration}
          getDurationMinutes={getDurationMinutes}
          recommendation={null}
          createBookingLink={createBookingLink}
          showOnlyCheapest={showOnlyCheapest}
          setShowOnlyCheapest={setShowOnlyCheapest}
          showAllJourneyDetails={showAllJourneyDetails}
          setShowAllJourneyDetails={setShowAllJourneyDetails}
        />
      )}
    </div>
  )
}

function DayRidesDisclosure({
  combination,
  outwardResults,
  returnResults,
  startStation,
  zielStation,
  searchParams,
}: {
  combination: TravelCombination
  outwardResults: PriceResults
  returnResults: PriceResults
  startStation?: { name: string; id: string }
  zielStation?: { name: string; id: string }
  searchParams: any
}) {
  const [open, setOpen] = useState(false)
  const outwardIntervals = outwardResults[combination.outwardDate]?.allIntervals?.length || 0
  const returnIntervals = returnResults[combination.returnDate]?.allIntervals?.length || 0

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold text-gray-800"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <Train className="h-4 w-4 flex-shrink-0 text-blue-600" />
          <span className="truncate">
            Tagesfahrten anzeigen
            <span className="ml-1 font-normal text-gray-500">({outwardIntervals} hin, {returnIntervals} zurück)</span>
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 flex-shrink-0 text-gray-500" /> : <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-500" />}
      </button>

      {open && (
        <div className="grid gap-3 border-t border-gray-100 bg-gray-50 p-3 xl:grid-cols-2">
          <DayRideList
            title="Hinfahrten an diesem Tag"
            date={combination.outwardDate}
            data={outwardResults[combination.outwardDate]}
            fromStation={startStation}
            toStation={zielStation}
            searchParams={searchParams}
          />
          <DayRideList
            title="Rückfahrten an diesem Tag"
            date={combination.returnDate}
            data={returnResults[combination.returnDate]}
            fromStation={zielStation}
            toStation={startStation}
            searchParams={searchParams}
          />
        </div>
      )}
    </div>
  )
}

function CombinationRoute({ combination }: { combination: TravelCombination }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-gray-800">Hinfahrt</span>
          <span className="font-bold text-green-700">{combination.outwardPrice}€</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-700">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-4 w-4 text-blue-500" />
            {formatDate(combination.outwardDate)}
          </span>
          <span>
            {formatTime(combination.outwardDeparture)}
            <ArrowRight className="mx-1 inline h-3 w-3 text-gray-400" />
            {formatTime(combination.outwardArrival)}
          </span>
          {combination.outwardDeparture && combination.outwardArrival && (
            <span className="inline-flex items-center gap-1 text-gray-600">
              <Clock className="h-4 w-4 text-gray-400" />
              {calculateDuration(combination.outwardDeparture, combination.outwardArrival)}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-gray-600">
            <Shuffle className="h-4 w-4 text-gray-400" />
            {combination.outwardTransfers === 0 ? "Direkt" : `${combination.outwardTransfers ?? 0} Umstiege`}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-gray-800">Rückfahrt</span>
          <span className="font-bold text-green-700">{combination.returnPrice}€</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-700">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-4 w-4 text-blue-500" />
            {formatDate(combination.returnDate)}
          </span>
          <span>
            {formatTime(combination.returnDeparture)}
            <ArrowRight className="mx-1 inline h-3 w-3 text-gray-400" />
            {formatTime(combination.returnArrival)}
          </span>
          {combination.returnDeparture && combination.returnArrival && (
            <span className="inline-flex items-center gap-1 text-gray-600">
              <Clock className="h-4 w-4 text-gray-400" />
              {calculateDuration(combination.returnDeparture, combination.returnArrival)}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-gray-600">
            <Shuffle className="h-4 w-4 text-gray-400" />
            {combination.returnTransfers === 0 ? "Direkt" : `${combination.returnTransfers ?? 0} Umstiege`}
          </span>
        </div>
      </div>
    </div>
  )
}

export function TravelCombinations({
  combinations,
  outwardResults,
  returnResults,
  expectedOutwardDays,
  expectedReturnDays,
  startStation,
  zielStation,
  searchParams,
  isStreaming,
  sessionId,
  onCancelSearch,
}: TravelCombinationsProps) {
  const hasReturnSearch = searchParams.rueckfahrt === "1"
  const [selectedCombination, setSelectedCombination] = useState<TravelCombination | null>(null)
  const selectionScope = [
    searchParams.start,
    searchParams.ziel,
    searchParams.reisezeitraumAb,
    searchParams.reisezeitraumBis,
    searchParams.wochentage,
    searchParams.returnWochentage,
    searchParams.minNaechte,
    searchParams.maxNaechte,
  ].join("|")

  useEffect(() => {
    setSelectedCombination(null)
  }, [selectionScope])

  const outwardDates = generateDateKeys(searchParams.reisezeitraumAb, searchParams.reisezeitraumBis, searchParams.wochentage)
  const returnDates = generateDateKeys(
    searchParams.reisezeitraumAb,
    searchParams.reisezeitraumBis,
    searchParams.returnWochentage || searchParams.wochentage
  )
  const minNights = parsePositiveInt(searchParams.minNaechte, 1) || 1
  const maxNights = parsePositiveInt(searchParams.maxNaechte)
  const completedOutward = resultEntries(outwardResults).length
  const completedReturn = resultEntries(returnResults).length
  const totalDays = expectedOutwardDays + expectedReturnDays
  const completedDays = completedOutward + completedReturn
  const progress = totalDays > 0 ? Math.min(100, Math.round((completedDays / totalDays) * 100)) : 0
  const queueStatus = useSearchQueueStatus({
    sessionId,
    isActive: Boolean(isStreaming && completedDays < totalDays),
    remainingRequests: Math.max(0, totalDays - completedDays),
  })

  if (!hasReturnSearch) return null

  const suppliedCombinationMap = new Map(
    combinations.map((combination) => [
      getCombinationKey(combination.outwardDate, combination.returnDate),
      combination,
    ])
  )
  const buildCombinationFromDates = (
    outwardDate: string,
    returnDate: string,
    allowOutsideStayFilter = false
  ): TravelCombination | null => {
    const existing = suppliedCombinationMap.get(getCombinationKey(outwardDate, returnDate))
    if (existing) return existing

    const outwardData = outwardResults[outwardDate]
    const returnData = returnResults[returnDate]
    const nights = getNights(outwardDate, returnDate)
    if (!outwardData || !returnData || outwardData.preis <= 0 || returnData.preis <= 0) return null
    if (nights < 1) return null
    if (
      !allowOutsideStayFilter &&
      (nights < minNights || (typeof maxNights === "number" && nights > maxNights))
    ) return null

    const outwardJourney = getJourneyTimes(outwardData)
    const returnJourney = getJourneyTimes(returnData)

    return {
      outwardDate,
      returnDate,
      nights,
      outwardPrice: outwardData.preis,
      returnPrice: returnData.preis,
      totalPrice: Math.round((outwardData.preis + returnData.preis) * 100) / 100,
      outwardDeparture: outwardJourney.departure,
      outwardArrival: outwardJourney.arrival,
      returnDeparture: returnJourney.departure,
      returnArrival: returnJourney.arrival,
      outwardTransfers: outwardJourney.transfers,
      returnTransfers: returnJourney.transfers,
      outwardLegs: outwardJourney.legs.length > 0 ? outwardJourney.legs : undefined,
      returnLegs: returnJourney.legs.length > 0 ? returnJourney.legs : undefined,
    }
  }

  const rankedCombinations = outwardDates
    .flatMap((outwardDate) =>
      returnDates.map((returnDate) => buildCombinationFromDates(outwardDate, returnDate))
    )
    .filter((combination): combination is TravelCombination => combination !== null)
    .sort((left, right) => left.totalPrice - right.totalPrice || left.nights - right.nights)
  const best = rankedCombinations[0]
  const primaryCombination = selectedCombination || best
  const searchDates = [
    searchParams.reisezeitraumAb,
    searchParams.reisezeitraumBis,
    ...outwardDates,
    ...returnDates,
  ].filter((date): date is string => Boolean(date)).sort()
  const searchStart = searchParams.reisezeitraumAb || searchDates[0] || primaryCombination?.outwardDate || ""
  const searchEnd = searchDates[searchDates.length - 1] || primaryCombination?.returnDate || searchStart

  const handleSelectCombination = (outwardDate: string, returnDate: string) => {
    const nextCombination = buildCombinationFromDates(outwardDate, returnDate)
    if (nextCombination) {
      setSelectedCombination(nextCombination)
    }
  }

  const handleSelectTimelineCombination = (outwardDate: string, returnDate: string) => {
    const nextCombination = buildCombinationFromDates(outwardDate, returnDate, true)
    if (nextCombination) {
      setSelectedCombination(nextCombination)
    }
  }

  return (
    <div className="space-y-4">
      {isStreaming && (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-blue-950">Reisezeitraum-Analyse</h2>
            <div className="mt-1 text-sm text-blue-800">
              {startStation?.name || "Start"} nach {zielStation?.name || "Ziel"} und zurück
            </div>
          </div>
          {onCancelSearch && (
            <SearchCancelButton onClick={onCancelSearch} />
          )}
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-blue-800">
            <span>{completedDays} von {totalDays} Reisetagen geprüft</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 rounded bg-blue-100">
            <div
              className="h-2 rounded bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <SearchQueueStatus status={queueStatus} className="mt-3" />
        </div>
      </div>
      )}

      {primaryCombination && (
        <CombinationComparisonPanel
          combinations={rankedCombinations}
          selectedCombination={primaryCombination}
          searchStart={searchStart}
          searchEnd={searchEnd}
          outwardDates={outwardDates}
          returnDates={returnDates}
          outwardResults={outwardResults}
          returnResults={returnResults}
          minNights={minNights}
          maxNights={maxNights}
          isStreaming={isStreaming}
          startStation={startStation}
          zielStation={zielStation}
          searchParams={searchParams}
          onSelectCombination={handleSelectCombination}
          onSelectTimelineCombination={handleSelectTimelineCombination}
        />
      )}

      {isStreaming && rankedCombinations.length === 0 && (
        <div className="rounded-lg border border-blue-200 bg-white p-4 text-sm text-blue-800">
          Kombinationspreise erscheinen, sobald eine passende Hin- und Rückfahrt ausgewertet ist.
        </div>
      )}

      {!isStreaming && rankedCombinations.length === 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
          Keine passende Hin- und Rückfahrt-Kombination für die gewählte Aufenthaltsdauer gefunden.
        </div>
      )}

    </div>
  )
}
