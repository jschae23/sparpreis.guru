"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"

import { Button } from "@/components/ui/button"
import { FAQPopup } from "@/components/layout/faq-popup"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeftRight, Ticket, MapPin, Calendar, AlertTriangle, CheckCircle, Moon, Sparkles } from "lucide-react"
import { logError } from "@/lib/shared/logger"
import {
  ConnectionOptionsModule,
  DateTimeControlStyle,
  DirectionTimeFiltersModule,
  TravelerOptionsModule,
  dateTimeControlClass,
  searchControlClass,
} from "@/components/search/train-search-modules"

const LOG_SCOPE = "bestpreissuche.search-form"
const ctrl = searchControlClass
const dateTimeCtrl = dateTimeControlClass

const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]
const WEEKDAY_OPTIONS = [
  { label: "Mo", value: 1 },
  { label: "Di", value: 2 },
  { label: "Mi", value: 3 },
  { label: "Do", value: 4 },
  { label: "Fr", value: 5 },
  { label: "Sa", value: 6 },
  { label: "So", value: 0 },
]

function parseWeekdaysParam(value?: string) {
  if (!value) return [...ALL_WEEKDAYS]

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

  return [...ALL_WEEKDAYS]
}

function sortWeekdays(weekdays: number[]) {
  return [...weekdays].sort(
    (left, right) => ALL_WEEKDAYS.indexOf(left) - ALL_WEEKDAYS.indexOf(right)
  )
}

function formatWeekdaySelection(count: number) {
  if (count === 7) return "alle Tage"
  return `${count} ${count === 1 ? "Tag" : "Tage"}`
}

function addDaysISO(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().split("T")[0]
}

interface WeekdaySelectorProps {
  direction: "Hinfahrt" | "Rückfahrt"
  selected: number[]
  onChange: (weekdays: number[]) => void
}

function WeekdaySelector({ direction, selected, onChange }: WeekdaySelectorProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-gray-700">
        Wochentage der {direction}
      </legend>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Wochentage der ${direction} auswählen`}>
        <button
          type="button"
          className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            selected.length === 7
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
          onClick={() => onChange([...ALL_WEEKDAYS])}
          aria-pressed={selected.length === 7}
        >
          Alle
        </button>
        {WEEKDAY_OPTIONS.map((weekday) => (
          <button
            key={weekday.value}
            type="button"
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              selected.includes(weekday.value)
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
            onClick={() => {
              onChange(
                selected.includes(weekday.value)
                  ? selected.filter((value) => value !== weekday.value)
                  : [...selected, weekday.value]
              )
            }}
            aria-pressed={selected.includes(weekday.value)}
          >
            {weekday.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

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
  wochentage?: string // Only weekdays, not individual dates
  returnWochentage?: string
  umstiegszeit?: string
}

interface TrainSearchFormProps {
  searchParams: SearchParams
  classicModeHref?: string
}

interface StationSuggestion {
  extId: string
  id: string
  name: string
}

export function TrainSearchForm({ searchParams, classicModeHref = "/klassik" }: TrainSearchFormProps) {
  // Helper function to check if a string is a station ID (numeric)
  const isStationId = (value: string): boolean => {
    return /^\d+$/.test(value)
  }

  const [start, setStart] = useState(() => {
    // If the start param is an ID, don't show it, we'll resolve it later
    if (searchParams.start && isStationId(searchParams.start)) {
      return ""
    }
    return searchParams.start || ""
  })
  
  const [startId, setStartId] = useState(() => {
    // If the start param looks like an ID, store it as ID
    return searchParams.start && isStationId(searchParams.start) ? searchParams.start : ""
  })
  
  const [ziel, setZiel] = useState(() => {
    // If the ziel param is an ID, don't show it, we'll resolve it later
    if (searchParams.ziel && isStationId(searchParams.ziel)) {
      return ""
    }
    return searchParams.ziel || ""
  })
  
  const [zielId, setZielId] = useState(() => {
    // If the ziel param looks like an ID, store it as ID
    return searchParams.ziel && isStationId(searchParams.ziel) ? searchParams.ziel : ""
  })
  
  const [startSuggestions, setStartSuggestions] = useState<StationSuggestion[]>([])
  const [zielSuggestions, setZielSuggestions] = useState<StationSuggestion[]>([])
  const [showStartSuggestions, setShowStartSuggestions] = useState(false)
  const [showZielSuggestions, setShowZielSuggestions] = useState(false)
  const [loadingStart, setLoadingStart] = useState(false)
  const [loadingZiel, setLoadingZiel] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [zielError, setZielError] = useState<string | null>(null)
  
  const startInputRef = useRef<HTMLInputElement>(null)
  const zielInputRef = useRef<HTMLInputElement>(null)
  const startSuggestionsRef = useRef<HTMLDivElement>(null)
  const zielSuggestionsRef = useRef<HTMLDivElement>(null)
  
  // Debounce timer refs - use undefined as initial value
  const startDebounceRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const zielDebounceRef = useRef<NodeJS.Timeout | undefined>(undefined)
  
  function getTomorrowISO() {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split("T")[0]
  }

  const [reisezeitraumAb, setReisezeitraumAb] = useState(
    searchParams.reisezeitraumAb || getTomorrowISO()
  )
  const [alter, setAlter] = useState(searchParams.alter || "ERWACHSENER")
  const [ermaessigungArt, setErmaessigungArt] = useState(searchParams.ermaessigungArt || "KEINE_ERMAESSIGUNG")
  const [ermaessigungKlasse, setErmaessigungKlasse] = useState(searchParams.ermaessigungKlasse || "KLASSENLOS")
  const [klasse, setKlasse] = useState(searchParams.klasse || "KLASSE_2")
  const [schnelleVerbindungen, setSchnelleVerbindungen] = useState(
    searchParams.schnelleVerbindungen === undefined || searchParams.schnelleVerbindungen === "1"
  )
  const [abfahrtAb, setAbfahrtAb] = useState(searchParams.abfahrtAb || "")
  const [abfahrtBis, setAbfahrtBis] = useState(searchParams.abfahrtBis || "")
  const [ankunftAb, setAnkunftAb] = useState(searchParams.ankunftAb || "")
  const [ankunftBis, setAnkunftBis] = useState(searchParams.ankunftBis || "")
  const hasReturnSearchParams = searchParams.rueckfahrt === "1"
  const [rueckfahrtAktiv, setRueckfahrtAktiv] = useState(hasReturnSearchParams)
  const [timeFiltersOpen, setTimeFiltersOpen] = useState(Boolean(
    searchParams.abfahrtAb || searchParams.abfahrtBis || searchParams.ankunftAb || searchParams.ankunftBis ||
    searchParams.returnAbfahrtAb || searchParams.returnAbfahrtBis || searchParams.returnAnkunftAb || searchParams.returnAnkunftBis ||
    searchParams.wochentage || searchParams.returnWochentage
  ))
  const [travelerOpen, setTravelerOpen] = useState(false)
  const [connectionOptionsOpen, setConnectionOptionsOpen] = useState(Boolean(
    (searchParams.maximaleUmstiege && searchParams.maximaleUmstiege !== "0") ||
    searchParams.umstiegszeit ||
    searchParams.schnelleVerbindungen === "0"
  ))
  const [minNaechte, setMinNaechte] = useState(searchParams.minNaechte || "3")
  const [maxNaechte, setMaxNaechte] = useState(searchParams.maxNaechte || "")
  const [returnAbfahrtAb, setReturnAbfahrtAb] = useState(searchParams.returnAbfahrtAb || "")
  const [returnAbfahrtBis, setReturnAbfahrtBis] = useState(searchParams.returnAbfahrtBis || "")
  const [returnAnkunftAb, setReturnAnkunftAb] = useState(searchParams.returnAnkunftAb || "")
  const [returnAnkunftBis, setReturnAnkunftBis] = useState(searchParams.returnAnkunftBis || "")
  
  const [umstiegsOption, setUmstiegsOption] = useState<string>(() => {
    if (searchParams.maximaleUmstiege === "0") return "direkt"
    if (!searchParams.maximaleUmstiege || searchParams.maximaleUmstiege === "alle") return "alle"
    return searchParams.maximaleUmstiege
  })
  
  const [reisezeitraumBis, setReisezeitraumBis] = useState(() => {
    if (searchParams.reisezeitraumBis) return searchParams.reisezeitraumBis
    return addDaysISO(reisezeitraumAb, hasReturnSearchParams ? 6 : 2)
  })

  const switchStations = () => {
    const tempName = start
    const tempId = startId
    setStart(ziel)
    setStartId(zielId)
    setZiel(tempName)
    setZielId(tempId)
  }

  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>(() =>
    parseWeekdaysParam(searchParams.wochentage)
  )
  const [selectedReturnWeekdays, setSelectedReturnWeekdays] = useState<number[]>(() =>
    searchParams.returnWochentage
      ? parseWeekdaysParam(searchParams.returnWochentage)
      : parseWeekdaysParam(searchParams.wochentage)
  )

  const eligibleDates = useMemo(() => {
    const dates: string[] = []
    const start = new Date(reisezeitraumAb)
    const end = new Date(reisezeitraumBis)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (selectedWeekdays.includes(d.getDay())) {
        dates.push(d.toISOString().split("T")[0])
      }
    }
    return dates
  }, [reisezeitraumAb, reisezeitraumBis, selectedWeekdays])

  const eligibleReturnDates = useMemo(() => {
    const dates: string[] = []
    const start = new Date(reisezeitraumAb)
    const end = new Date(reisezeitraumBis)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (selectedReturnWeekdays.includes(d.getDay())) {
        dates.push(d.toISOString().split("T")[0])
      }
    }
    return dates
  }, [reisezeitraumAb, reisezeitraumBis, selectedReturnWeekdays])

  const selectedDates = useMemo(() => eligibleDates.slice(0, 30), [eligibleDates])
  const tooManyOutwardDates = eligibleDates.length > 30
  const tooManyReturnDates = rueckfahrtAktiv && eligibleReturnDates.length > 30
  const hasNoOutwardDates = eligibleDates.length === 0
  const hasNoReturnDates = rueckfahrtAktiv && eligibleReturnDates.length === 0
  const tooManyDates = tooManyOutwardDates || tooManyReturnDates
  const hasNoDates = hasNoOutwardDates || hasNoReturnDates

  // Fetch station suggestions with retry logic
  const fetchStationSuggestions = useCallback(async (query: string, type: 'start' | 'ziel', retryCount = 0) => {
    const maxRetries = 3
    
    if (query.trim().length < 2) {
      if (type === 'start') {
        setStartSuggestions([])
        setShowStartSuggestions(false)
        setStartError(null)
      } else {
        setZielSuggestions([])
        setShowZielSuggestions(false)
        setZielError(null)
      }
      return
    }
    
    try {
      if (type === 'start') {
        setLoadingStart(true)
        setStartError(null)
      } else {
        setLoadingZiel(true)
        setZielError(null)
      }
      
      const response = await fetch(`/api/station-search?q=${encodeURIComponent(query)}`)
      
      // Handle rate limiting
      if (response.status === 429) {
        const data = await response.json()
        const retryAfter = data.retryAfter || 1000
        
        if (retryCount < maxRetries) {
          // Show retry message
          const errorMsg = `Zu viele Anfragen, versuche erneut in ${Math.ceil(retryAfter / 1000)}s...`
          if (type === 'start') {
            setStartError(errorMsg)
          } else {
            setZielError(errorMsg)
          }
          
          // Retry after delay
          await new Promise(resolve => setTimeout(resolve, retryAfter))
          return fetchStationSuggestions(query, type, retryCount + 1)
        } else {
          throw new Error('Rate limit exceeded. Bitte versuche es in einigen Sekunden erneut.')
        }
      }
      
      if (!response.ok) {
        throw new Error('Fehler beim Laden der Bahnhöfe')
      }
      
      const data = await response.json()
      
      if (data.results) {
        if (type === 'start') {
          setStartSuggestions(data.results)
          setShowStartSuggestions(true)
        } else {
          setZielSuggestions(data.results)
          setShowZielSuggestions(true)
        }
      }
    } catch (error) {
      logError(LOG_SCOPE, "Could not fetch station suggestions", error, {
        query,
        field: type,
      })
      const errorMsg = error instanceof Error ? error.message : 'Fehler beim Laden der Bahnhöfe'
      if (type === 'start') {
        setStartError(errorMsg)
      } else {
        setZielError(errorMsg)
      }
    } finally {
      if (type === 'start') {
        setLoadingStart(false)
      } else {
        setLoadingZiel(false)
      }
    }
  }, [])
  
  // Handle input changes with debounce
  const handleStartInput = useCallback((value: string) => {
    setStart(value)
    setStartId("") // Clear ID when manually typing
    
    if (startDebounceRef.current) {
      clearTimeout(startDebounceRef.current)
    }
    
    startDebounceRef.current = setTimeout(() => {
      fetchStationSuggestions(value, 'start')
    }, 300)
  }, [fetchStationSuggestions])
  
  const handleZielInput = useCallback((value: string) => {
    setZiel(value)
    setZielId("") // Clear ID when manually typing
    
    if (zielDebounceRef.current) {
      clearTimeout(zielDebounceRef.current)
    }
    
    zielDebounceRef.current = setTimeout(() => {
      fetchStationSuggestions(value, 'ziel')
    }, 300)
  }, [fetchStationSuggestions])

  const recordStationSelection = useCallback((query: string, suggestion: StationSuggestion) => {
    const trimmedQuery = query.trim()
    if (trimmedQuery.length < 2) {
      return
    }

    void fetch('/api/station-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: trimmedQuery, station: suggestion }),
      keepalive: true,
    }).catch(() => {})
  }, [])
  
  // Handle suggestion selection
  const selectStartSuggestion = useCallback((suggestion: StationSuggestion) => {
    recordStationSelection(start, suggestion)
    setStart(suggestion.name)
    setStartId(suggestion.extId)
    setShowStartSuggestions(false)
  }, [recordStationSelection, start])
  
  const selectZielSuggestion = useCallback((suggestion: StationSuggestion) => {
    recordStationSelection(ziel, suggestion)
    setZiel(suggestion.name)
    setZielId(suggestion.extId)
    setShowZielSuggestions(false)
  }, [recordStationSelection, ziel])
  
  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (startInputRef.current && !startInputRef.current.contains(event.target as Node) &&
          startSuggestionsRef.current && !startSuggestionsRef.current.contains(event.target as Node)) {
        setShowStartSuggestions(false)
      }
      if (zielInputRef.current && !zielInputRef.current.contains(event.target as Node) &&
          zielSuggestionsRef.current && !zielSuggestionsRef.current.contains(event.target as Node)) {
        setShowZielSuggestions(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // Cleanup debounce timers
  useEffect(() => {
    return () => {
      if (startDebounceRef.current) clearTimeout(startDebounceRef.current)
      if (zielDebounceRef.current) clearTimeout(zielDebounceRef.current)
    }
  }, [])

  // Resolve station IDs to names on mount
  useEffect(() => {
    const resolveStationId = async (id: string, type: 'start' | 'ziel') => {
      try {
        // Search for the station by ID - the API will return the station details
        const response = await fetch(`/api/station-search?q=${encodeURIComponent(id)}`)
        const data = await response.json()
        
        if (data.results && data.results.length > 0) {
          // Find exact match by extId
          const station = data.results.find((s: StationSuggestion) => s.extId === id) || data.results[0]
          if (type === 'start') {
            setStart(station.name)
          } else {
            setZiel(station.name)
          }
        }
      } catch (error) {
        logError(LOG_SCOPE, "Could not resolve station ID", error, {
          stationId: id,
          field: type,
        })
        // Fallback: show the ID if resolution fails
        if (type === 'start') {
          setStart(id)
        } else {
          setZiel(id)
        }
      }
    }
    
    // Resolve station IDs from URL params only. A freshly selected suggestion already
    // has the correct label and must not be overwritten by another lookup.
    if (startId && !start.trim()) {
      resolveStationId(startId, 'start')
    }
    
    if (zielId && !ziel.trim()) {
      resolveStationId(zielId, 'ziel')
    }
  }, [startId, zielId, start, ziel])
  
  const returnDetailsInvalid = rueckfahrtAktiv && (
    !minNaechte || (Boolean(maxNaechte) && Number(maxNaechte) < Number(minNaechte))
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (tooManyDates || hasNoDates || returnDetailsInvalid) return
    const params = new URLSearchParams()
    
    // Use station ID if available, otherwise fallback to name
    if (startId) {
      params.set("start", startId)
    } else if (start) {
      params.set("start", start)
    }
    
    if (zielId) {
      params.set("ziel", zielId)
    } else if (ziel) {
      params.set("ziel", ziel)
    }
    
    if (reisezeitraumAb) params.set("reisezeitraumAb", reisezeitraumAb)
    if (reisezeitraumBis) params.set("reisezeitraumBis", reisezeitraumBis)
    if (alter) params.set("alter", alter)
    params.set("ermaessigungArt", ermaessigungArt)
    params.set("ermaessigungKlasse", ermaessigungKlasse)
    params.set("klasse", klasse)
    if (schnelleVerbindungen) params.set("schnelleVerbindungen", "1")
    if (abfahrtAb) params.set("abfahrtAb", abfahrtAb)
    if (abfahrtBis) params.set("abfahrtBis", abfahrtBis)
    if (ankunftAb) params.set("ankunftAb", ankunftAb)
    if (ankunftBis) params.set("ankunftBis", ankunftBis)
    if (umstiegszeit && umstiegszeit !== "normal") {
      params.set("umstiegszeit", umstiegszeit)
    }
    if (rueckfahrtAktiv) {
      params.set("rueckfahrt", "1")
      params.set("minNaechte", minNaechte || "1")
      if (maxNaechte) params.set("maxNaechte", maxNaechte)
      if (returnAbfahrtAb) params.set("returnAbfahrtAb", returnAbfahrtAb)
      if (returnAbfahrtBis) params.set("returnAbfahrtBis", returnAbfahrtBis)
      if (returnAnkunftAb) params.set("returnAnkunftAb", returnAnkunftAb)
      if (returnAnkunftBis) params.set("returnAnkunftBis", returnAnkunftBis)
      params.set("returnWochentage", sortWeekdays(selectedReturnWeekdays).join(","))
    }
    
    // Umstiegs-Logik basierend auf umstiegsOption
    if (umstiegsOption === "direkt") {
      params.set("maximaleUmstiege", "0")
    } else if (umstiegsOption === "alle") {
      // Kein maximaleUmstiege Parameter setzen = alle Verbindungen
    } else {
      // umstiegsOption ist "1", "2", "3", "4", oder "5"
      params.set("maximaleUmstiege", umstiegsOption)
    }
    
    // Only send weekdays if not all days are selected
    const isAllDaysSelected = ALL_WEEKDAYS.every(day => selectedWeekdays.includes(day)) && selectedWeekdays.length === ALL_WEEKDAYS.length
    
    if (!isAllDaysSelected) {
      // Use readable format: "1,2,3,4,5" instead of JSON
      params.set("wochentage", sortWeekdays(selectedWeekdays).join(","))
    }
    
    window.location.href = `/?${params.toString()}`
  }

  const handleReset = () => {
    const resetStart = getTomorrowISO()
    const resetEndDate = new Date(`${resetStart}T12:00:00`)
    resetEndDate.setDate(resetEndDate.getDate() + 2)
    setStart("")
    setStartId("")
    setZiel("")
    setZielId("")
    setReisezeitraumAb(resetStart)
    setReisezeitraumBis(resetEndDate.toISOString().split("T")[0])
    setAlter("ERWACHSENER")
    setErmaessigungArt("KEINE_ERMAESSIGUNG")
    setErmaessigungKlasse("KLASSENLOS")
    setKlasse("KLASSE_2")
    setSchnelleVerbindungen(true)
    setUmstiegsOption("alle")
    setAbfahrtAb("")
    setAbfahrtBis("")
    setAnkunftAb("")
    setAnkunftBis("")
    setRueckfahrtAktiv(false)
    setTimeFiltersOpen(false)
    setTravelerOpen(false)
    setConnectionOptionsOpen(false)
    setMinNaechte("3")
    setMaxNaechte("")
    setReturnAbfahrtAb("")
    setReturnAbfahrtBis("")
    setReturnAnkunftAb("")
    setReturnAnkunftBis("")
    setUmstiegszeit("normal")
    setSelectedWeekdays([...ALL_WEEKDAYS])
    setSelectedReturnWeekdays([...ALL_WEEKDAYS])
    window.history.replaceState({}, document.title, window.location.pathname)
  }

  const handleReisezeitraumAbChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setReisezeitraumAb(e.target.value)
    const ab = new Date(e.target.value)
    const bis = new Date(reisezeitraumBis)
    if (bis < ab) {
      setReisezeitraumBis(e.target.value)
    }
  }

  const [umstiegszeit, setUmstiegszeit] = useState(searchParams.umstiegszeit || "normal")

  const hasTimeRestriction = Boolean(
    abfahrtAb || abfahrtBis || ankunftAb || ankunftBis ||
    (rueckfahrtAktiv && (returnAbfahrtAb || returnAbfahrtBis || returnAnkunftAb || returnAnkunftBis))
  )
  const scheduleSummary = `${
    rueckfahrtAktiv
      ? `Hin: ${formatWeekdaySelection(selectedWeekdays.length)} · Rück: ${formatWeekdaySelection(selectedReturnWeekdays.length)}`
      : formatWeekdaySelection(selectedWeekdays.length)
  } · ${hasTimeRestriction ? "Zeitfilter aktiv" : "ganztägig"}`
  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-5">
      <DateTimeControlStyle />
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Bestpreise finden</h2>
            <a
              href={classicModeHref}
              className="group inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-gradient-to-r from-red-50 via-orange-50 to-amber-50 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm transition hover:-translate-y-0.5 hover:border-red-300 hover:shadow-md"
              aria-label="Zeitreise zum bahn.guru-Klassikmodus"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-500 transition-transform group-hover:rotate-12" />
              <span>Zeitreise: bahn.guru-Klassikmodus</span>
              <span className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">→</span>
            </a>
          </div>
          <p className="mt-1 text-sm text-gray-600">Strecke und Zeitraum wählen – den günstigsten Reisetag finden.</p>
        </div>
        <FAQPopup context="bestpreissuche" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col rounded-xl border border-gray-200 bg-gray-50/60 p-3 sm:p-4">
          <fieldset className="order-1 mb-4">
            <legend className="mb-2 text-sm font-medium text-gray-700">Reiseart</legend>
            <div className="grid grid-cols-2 rounded-lg bg-gray-200/70 p-1" role="group" aria-label="Reiseart wählen">
              <button
                type="button"
                className={`rounded-md px-3 py-2 text-sm font-semibold transition ${!rueckfahrtAktiv ? "bg-white text-blue-700 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
                onClick={() => setRueckfahrtAktiv(false)}
                aria-pressed={!rueckfahrtAktiv}
              >
                Einfache Fahrt
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-2 text-sm font-semibold transition ${rueckfahrtAktiv ? "bg-white text-blue-700 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
                onClick={() => {
                  if (!rueckfahrtAktiv) {
                    setSelectedReturnWeekdays([...selectedWeekdays])
                    const currentDefaultEnd = addDaysISO(reisezeitraumAb, 2)
                    if (!searchParams.reisezeitraumBis && reisezeitraumBis === currentDefaultEnd) {
                      setReisezeitraumBis(addDaysISO(reisezeitraumAb, 6))
                    }
                  }
                  setRueckfahrtAktiv(true)
                }}
                aria-pressed={rueckfahrtAktiv}
              >
                Hin &amp; Rückfahrt
              </button>
            </div>
          </fieldset>

          <div className="order-2 mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end">
            <div className="flex-1 min-w-0 relative">
              <Label htmlFor="start" className="text-sm font-medium text-gray-600 mb-2 block">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-blue-500" />
                  Von
                </span>
              </Label>
              <Input
                ref={startInputRef}
                id="start"
                type="text"
                placeholder="München Hbf"
                value={start}
                onChange={(e) => handleStartInput(e.target.value)}
                onFocus={() => start.length >= 2 && setShowStartSuggestions(true)}
                required
                className={ctrl}
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showStartSuggestions}
                aria-controls="start-suggestions"
              />
              {startError && (
                <div className="absolute z-50 w-full mt-1 bg-amber-50 border border-amber-300 rounded-md shadow-sm p-2">
                  <p className="text-xs text-amber-800 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {startError}
                  </p>
                </div>
              )}
              {showStartSuggestions && (loadingStart || startSuggestions.length > 0) && (
                <div
                  id="start-suggestions"
                  ref={startSuggestionsRef}
                  className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
                  role="listbox"
                >
                  {loadingStart && (
                    <div className="p-2 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      Lädt...
                    </div>
                  )}
                  {startSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.extId}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-100 last:border-b-0"
                      onClick={() => selectStartSuggestion(suggestion)}
                      role="option"
                      aria-selected="false"
                    >
                      <div className="font-medium text-gray-900">{suggestion.name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="-my-1 flex justify-end pr-3 sm:my-0 sm:h-11 sm:items-end sm:pr-0">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={switchStations}
                className="h-11 w-11 rounded-full border-gray-300 bg-white p-0 hover:bg-gray-50 sm:rounded-md"
                aria-label="Bahnhöfe tauschen"
              >
                <ArrowLeftRight className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 min-w-0 relative">
              <Label htmlFor="ziel" className="text-sm font-medium text-gray-600 mb-2 block">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-blue-500" />
                  Nach
                </span>
              </Label>
              <Input
                ref={zielInputRef}
                id="ziel"
                type="text"
                placeholder="Berlin Hbf"
                value={ziel}
                onChange={(e) => handleZielInput(e.target.value)}
                onFocus={() => ziel.length >= 2 && setShowZielSuggestions(true)}
                required
                className={ctrl}
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showZielSuggestions}
                aria-controls="ziel-suggestions"
              />
              {zielError && (
                <div className="absolute z-50 w-full mt-1 bg-amber-50 border border-amber-300 rounded-md shadow-sm p-2">
                  <p className="text-xs text-amber-800 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {zielError}
                  </p>
                </div>
              )}
              {showZielSuggestions && (loadingZiel || zielSuggestions.length > 0) && (
                <div
                  id="ziel-suggestions"
                  ref={zielSuggestionsRef}
                  className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
                  role="listbox"
                >
                  {loadingZiel && (
                    <div className="p-2 text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      Lädt...
                    </div>
                  )}
                  {zielSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.extId}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-100 last:border-b-0"
                      onClick={() => selectZielSuggestion(suggestion)}
                      role="option"
                      aria-selected="false"
                    >
                      <div className="font-medium text-gray-900">{suggestion.name}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className={`order-3 grid gap-4 ${rueckfahrtAktiv ? "sm:grid-cols-2" : ""}`}>
            <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-3">
              <div className="mb-3 flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                  <Calendar className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-gray-900">Reisezeitraum</div>
                  <p className="mt-0.5 text-xs text-gray-500">Wann möchtest du losfahren?</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="reisezeitraumAb" className="mb-1 block text-xs font-medium text-gray-600">
                    Frühestens
                  </Label>
                  <Input
                    id="reisezeitraumAb"
                    type="date"
                    value={reisezeitraumAb}
                    onChange={handleReisezeitraumAbChange}
                    min={getTomorrowISO()}
                    className={dateTimeCtrl}
                  />
                </div>
                <div>
                  <Label htmlFor="reisezeitraumBis" className="mb-1 block text-xs font-medium text-gray-600">
                    Spätestens
                  </Label>
                  <Input
                    id="reisezeitraumBis"
                    type="date"
                    min={reisezeitraumAb}
                    value={reisezeitraumBis}
                    onChange={(event) => setReisezeitraumBis(event.target.value)}
                    className={dateTimeCtrl}
                  />
                </div>
              </div>
            </div>

            {rueckfahrtAktiv && (
              <fieldset className="min-w-0 rounded-lg border border-gray-200 bg-white p-3">
                <legend className="sr-only">Aufenthaltsdauer</legend>
                <div className="mb-3 flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                    <Moon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Aufenthaltsdauer</div>
                    <p className="mt-0.5 text-xs text-gray-500">Wie lange möchtest du am Ziel bleiben?</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="minNaechte" className="mb-1 block text-xs font-medium text-gray-600">
                      Mindestens
                    </Label>
                    <div className="relative">
                      <Input
                        id="minNaechte"
                        type="number"
                        min="1"
                        max="365"
                        value={minNaechte}
                        onChange={(event) => setMinNaechte(event.target.value)}
                        className={`${ctrl} pr-16`}
                        required={rueckfahrtAktiv}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">Nächte</span>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="maxNaechte" className="mb-1 block text-xs font-medium text-gray-600">
                      Höchstens
                    </Label>
                    <div className="relative">
                      <Input
                        id="maxNaechte"
                        type="number"
                        min={minNaechte || "1"}
                        max="365"
                        placeholder="offen"
                        value={maxNaechte}
                        onChange={(event) => setMaxNaechte(event.target.value)}
                        className={`${ctrl} pr-16`}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">Nächte</span>
                    </div>
                  </div>
                </div>
                <p className={`mt-1.5 text-xs ${returnDetailsInvalid ? "text-amber-700" : "text-gray-500"}`}>
                  {returnDetailsInvalid
                    ? (!minNaechte
                        ? "Bitte gib die gewünschte Mindestdauer an."
                        : "Die maximale Dauer muss mindestens der minimalen entsprechen.")
                    : `Rückfahrt nach ${minNaechte}${maxNaechte ? ` bis ${maxNaechte}` : " oder mehr"} Nächten.`}
                </p>
              </fieldset>
            )}
          </div>

          <div
            className={`order-4 mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
              tooManyDates || hasNoDates ? "bg-amber-50 text-amber-900" : "bg-blue-50 text-blue-800"
            }`}
            role={tooManyDates || hasNoDates ? "alert" : "status"}
          >
            {tooManyDates || hasNoDates
              ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              : <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span>
              {tooManyOutwardDates
                ? `Die Hinfahrt enthält ${eligibleDates.length} Reisetage. Bitte auf maximal 30 Tage begrenzen.`
                : tooManyReturnDates
                  ? `Die Rückfahrt enthält ${eligibleReturnDates.length} Reisetage. Bitte auf maximal 30 Tage begrenzen.`
                  : hasNoOutwardDates
                    ? "Für die Hinfahrt liegt kein gewählter Wochentag im Reisezeitraum."
                    : hasNoReturnDates
                      ? "Für die Rückfahrt liegt kein gewählter Wochentag im Reisezeitraum."
                      : rueckfahrtAktiv
                        ? `${eligibleDates.length} Hinfahrts- und ${eligibleReturnDates.length} Rückfahrtstage werden verglichen.`
                        : `${eligibleDates.length} ${eligibleDates.length === 1 ? "Reisetag wird" : "Reisetage werden"} verglichen.`}
            </span>
          </div>

          <div className="order-5 mt-3">
            <DirectionTimeFiltersModule
              open={timeFiltersOpen}
              onOpenChange={setTimeFiltersOpen}
              includeReturn={rueckfahrtAktiv}
              title="Reisezeiten"
              summary={scheduleSummary}
              outboundContext={formatWeekdaySelection(selectedWeekdays.length)}
              returnContext={formatWeekdaySelection(selectedReturnWeekdays.length)}
              outboundValues={{
                departureFrom: abfahrtAb,
                departureUntil: abfahrtBis,
                arrivalFrom: ankunftAb,
                arrivalUntil: ankunftBis,
              }}
              onOutboundChange={(values) => {
                setAbfahrtAb(values.departureFrom)
                setAbfahrtBis(values.departureUntil)
                setAnkunftAb(values.arrivalFrom)
                setAnkunftBis(values.arrivalUntil)
              }}
              returnValues={{
                departureFrom: returnAbfahrtAb,
                departureUntil: returnAbfahrtBis,
                arrivalFrom: returnAnkunftAb,
                arrivalUntil: returnAnkunftBis,
              }}
              onReturnChange={(values) => {
                setReturnAbfahrtAb(values.departureFrom)
                setReturnAbfahrtBis(values.departureUntil)
                setReturnAnkunftAb(values.arrivalFrom)
                setReturnAnkunftBis(values.arrivalUntil)
              }}
              outboundBefore={(
                <WeekdaySelector
                  direction="Hinfahrt"
                  selected={selectedWeekdays}
                  onChange={setSelectedWeekdays}
                />
              )}
              returnBefore={(
                <WeekdaySelector
                  direction="Rückfahrt"
                  selected={selectedReturnWeekdays}
                  onChange={setSelectedReturnWeekdays}
                />
              )}
            />
          </div>
        </div>

        <TravelerOptionsModule
          open={travelerOpen}
          onOpenChange={setTravelerOpen}
          age={alter}
          onAgeChange={setAlter}
          discountType={ermaessigungArt}
          discountClass={ermaessigungKlasse}
          onDiscountChange={(type, discountClass) => {
            setErmaessigungArt(type)
            setErmaessigungKlasse(discountClass)
          }}
          travelClass={klasse}
          onTravelClassChange={setKlasse}
        />

        <ConnectionOptionsModule
          open={connectionOptionsOpen}
          onOpenChange={setConnectionOptionsOpen}
          fastConnections={schnelleVerbindungen}
          onFastConnectionsChange={setSchnelleVerbindungen}
          transferOption={umstiegsOption}
          onTransferOptionChange={setUmstiegsOption}
          transferTime={umstiegszeit}
          onTransferTimeChange={setUmstiegszeit}
        />

        <div className="sticky bottom-2 z-30 rounded-xl border border-gray-200 bg-white/95 p-2 shadow-lg backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          <Button
            type="submit"
            disabled={tooManyDates || hasNoDates || returnDetailsInvalid}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Ticket className="mr-2 h-4 w-4" />
            {rueckfahrtAktiv
              ? "Günstigste Kombinationen suchen"
              : `Bestpreise für ${eligibleDates.length} ${eligibleDates.length === 1 ? "Tag" : "Tage"} suchen`}
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs">
          <button type="button" onClick={handleReset} className="text-gray-500 underline-offset-4 hover:text-gray-800 hover:underline">
            Angaben zurücksetzen
          </button>
        </div>
      </form>
    </div>
  )
}
