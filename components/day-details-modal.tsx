"use client"

import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { MapPin, ArrowRight, Euro, Calendar, Train, TrendingUp, GraduationCap, User, Percent, Shuffle, Clock, Filter, Info, Star, ChevronLeft, ChevronRight } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { recommendOne } from "@/lib/recommendation-engine"

interface Interval {
  preis: number
  abfahrtsZeitpunkt: string
  ankunftsZeitpunkt: string
  abfahrtsOrt: string
  ankunftsOrt: string
  info: string
  umstiegsAnzahl?: number
}

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

interface DayDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  date: string | null
  data: PriceData | null
  startStation?: { name: string; id: string }
  zielStation?: { name: string; id: string }
  searchParams?: any
  onNavigateDay?: (direction: number) => void // Neue Prop
  dayKeys?: string[] // Alle verfügbaren Tage
}

const weekdays = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"]

function getPersonCode(alter: string) {
  switch (alter) {
    case "ERWACHSENER": return "13"
    case "KIND": return "11"
    case "SENIOR": return "12"
    case "JUGENDLICHER": return "9"
    default: return "13"  // Default to ERWACHSENER if unknown
  }
}

function getDiscountCode(ermaessigungArt: string, ermaessigungKlasse: string) {
  if (ermaessigungArt === "BAHNCARD25" && ermaessigungKlasse === "KLASSE_1") return "17"
  if (ermaessigungArt === "BAHNCARD25" && ermaessigungKlasse === "KLASSE_2") return "17"
  if (ermaessigungArt === "BAHNCARD50" && ermaessigungKlasse === "KLASSE_1") return "23"
  if (ermaessigungArt === "BAHNCARD50" && ermaessigungKlasse === "KLASSE_2") return "23"
  if (ermaessigungArt === "KEINE_ERMAESSIGUNG") return "16"
  return "0"
}

function getRParam(alter: string, ermaessigungArt: string, ermaessigungKlasse: string, klasse: string) {
  // personCode
  let personCode = getPersonCode(alter)
  // discountCode
  let discountCode = getDiscountCode(ermaessigungArt, ermaessigungKlasse)
  // r-Param
  return `${personCode}:${discountCode}:${klasse}:1`
}

function createBookingLink(
  abfahrtsZeitpunkt: string,
  startStationId: string,
  zielStationId: string,
  klasse: string,
  maximaleUmstiege: string,
  alter: string,
  ermaessigungArt: string,
  ermaessigungKlasse: string,
): string {
  if (!abfahrtsZeitpunkt || !startStationId || !zielStationId) {
    return ""
  }

  const klasseParam = klasse === "KLASSE_1" ? "1" : "2"
  const direktverbindung = maximaleUmstiege === "0" ? "true" : "false"
  const departureTime = encodeURIComponent(abfahrtsZeitpunkt)

  const rParam = getRParam(alter, ermaessigungArt, ermaessigungKlasse, klasse)

  return `https://www.bahn.de/buchung/fahrplan/suche#sts=true&kl=${klasseParam}&r=${rParam}&hd=${departureTime}&soid=${encodeURIComponent(startStationId)}&zoid=${encodeURIComponent(zielStationId)}&bp=true&d=${direktverbindung}`
}

function getAlterLabel(alter: string | undefined) {
  switch (alter) {
    case "KIND": return "Kind (6–14 Jahre)"
    case "JUGENDLICHER": return "Jugendlicher (15–26 Jahre)"
    case "ERWACHSENER": return "Erwachsener (27–64 Jahre)"
    case "SENIOR": return "Senior (ab 65 Jahre)"
    default: return alter || "-"
  }
}

export function DayDetailsModal({
  isOpen,
  onClose,
  date,
  data,
  startStation,
  zielStation,
  searchParams,
  onNavigateDay,
  dayKeys = [],
}: DayDetailsModalProps) {
  const [showOnlyCheapest, setShowOnlyCheapest] = useState(true)
  // Sortier-Logik für die Tabelle
  type SortKey = 'abfahrt' | 'ankunft' | 'umstiege' | 'dauer' | 'preis'
  const [sortKey, setSortKey] = useState<SortKey>('preis')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Swipe-Handling für Tag-Navigation im Modal - Hooks IMMER oben
  const touchStartX = React.useRef<number | null>(null)
  
  // Keyboard-Handling für Tag-Navigation im Modal - Hooks IMMER oben
  React.useEffect(() => {
    if (!isOpen) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && onNavigateDay) {
        onNavigateDay(-1)
      } else if (e.key === 'ArrowRight' && onNavigateDay) {
        onNavigateDay(1)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onNavigateDay])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || !onNavigateDay) return
    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(deltaX) > 50) {
      if (deltaX < 0) {
        // Swipe nach links → nächster Tag
        onNavigateDay(1)
      } else {
        // Swipe nach rechts → vorheriger Tag
        onNavigateDay(-1)
      }
    }
    touchStartX.current = null
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function sortIntervals(list: IntervalData[]): IntervalData[] {
    return [...list].sort((a, b) => {
      let valA: number = 0
      let valB: number = 0
      switch (sortKey) {
        case 'abfahrt':
          valA = new Date(a.abfahrtsZeitpunkt).getTime(); valB = new Date(b.abfahrtsZeitpunkt).getTime(); break
        case 'ankunft':
          valA = new Date(a.ankunftsZeitpunkt).getTime(); valB = new Date(b.ankunftsZeitpunkt).getTime(); break
        case 'umstiege':
          valA = a.umstiegsAnzahl || 0; valB = b.umstiegsAnzahl || 0; break
        case 'dauer':
          valA = new Date(a.ankunftsZeitpunkt).getTime() - new Date(a.abfahrtsZeitpunkt).getTime();
          valB = new Date(b.ankunftsZeitpunkt).getTime() - new Date(b.abfahrtsZeitpunkt).getTime();
          break
        case 'preis':
        default:
          // Erst nach Preis, dann nach Reisedauer sortieren
          const priceDiff = sortDir === 'asc' ? a.preis - b.preis : b.preis - a.preis
          if (priceDiff !== 0) return priceDiff
          
          // Bei gleichem Preis: nach Reisedauer sortieren (kürzere Dauer zuerst)
          const durationA = new Date(a.ankunftsZeitpunkt).getTime() - new Date(a.abfahrtsZeitpunkt).getTime()
          const durationB = new Date(b.ankunftsZeitpunkt).getTime() - new Date(b.abfahrtsZeitpunkt).getTime()
          return durationA - durationB
      }
      return sortDir === 'asc' ? valA - valB : valB - valA
    })
  }

  if (!date || !data) return null

  const dateObj = new Date(date)
  const formattedDate = dateObj.toLocaleDateString("de-DE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const intervals = data.allIntervals || []
  
  // Filter intervals based on toggle state
  const displayedIntervals = showOnlyCheapest 
    ? (() => {
        // First try to filter by isCheapestPerInterval flag
        const markedCheapest = intervals.filter(interval => interval.isCheapestPerInterval === true)
        // If no intervals are marked as cheapest, fall back to showing the actual cheapest price intervals
        let result: IntervalData[] = []
        if (markedCheapest.length === 0 && intervals.length > 0) {
          const minPrice = Math.min(...intervals.map(i => i.preis))
          result = intervals.filter(interval => interval.preis === minPrice)
        } else {
          result = markedCheapest
        }
        // Immer nach Preis sortieren
        return sortIntervals(result)
      })()
    : sortIntervals(intervals)

  // Check if this is a weekend
  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6
  
  // Check if there are multiple intervals
  const hasMultipleIntervals = intervals.length > 1
  const hasMultipleCheapestIntervals = intervals.filter(i => i.isCheapestPerInterval === true).length > 1

  const calculateDuration = (departure: string, arrival: string) => {
    const dep = new Date(departure)
    const arr = new Date(arrival)
    const duration = arr.getTime() - dep.getTime()
    const hours = Math.floor(duration / (1000 * 60 * 60))
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}h ${minutes}min`
  }

  // Hilfsfunktion für Vergleich: Dauer in Minuten
  const getDurationMinutes = (departure: string, arrival: string) => {
    const dep = new Date(departure)
    const arr = new Date(arrival)
    return Math.round((arr.getTime() - dep.getTime()) / 60000)
  }

  // Kürzeste Reisedauer aller Verbindungen (in Minuten)
  const minDuration = intervals.length > 0 ? Math.min(...intervals.map(i => getDurationMinutes(i.abfahrtsZeitpunkt, i.ankunftsZeitpunkt))) : null

  // Empfehlungsalgorithmus - IMMER eine Empfehlung, auch bei nur einer Verbindung
  const recommendation = intervals.length > 0 ? recommendOne(intervals) : null
  const recommendedTrip = recommendation?.trip

  const getIntervalPriceColor = (price: number) => {
    const minIntervalPrice = Math.min(...intervals.map((i) => i.preis))
    const maxIntervalPrice = Math.max(...intervals.map((i) => i.preis))

    if (price === minIntervalPrice) return "text-green-600 bg-green-50"
    if (price === maxIntervalPrice) return "text-red-600 bg-red-50"
    return "text-orange-600 bg-orange-50"
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Calendar className="h-5 w-5 text-blue-600" />
            {formattedDate}
            {isWeekend && <Badge variant="secondary">Wochenende</Badge>}
          </DialogTitle>
        </DialogHeader>

        {/* Desktop: Tag-Navigation Pfeile unterhalb des Headers */}
        {onNavigateDay && dayKeys.length > 1 && (
          <>
            {/* Desktop */}
            <div className="hidden md:flex items-center justify-center gap-2 pb-2 border-b">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onNavigateDay(-1)}
                disabled={!date || dayKeys.indexOf(date) <= 0}
                className="h-8 px-3"
                title="Vorheriger Tag (Pfeil links)"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Vorheriger Tag
              </Button>
              <span className="text-sm text-gray-500 mx-4 bg-gray-100 px-3 py-1 rounded">
                Tag {date && dayKeys.indexOf(date) + 1} von {dayKeys.length}
              </span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => onNavigateDay(1)}
                disabled={!date || dayKeys.indexOf(date) >= dayKeys.length - 1}
                className="h-8 px-3"
                title="Nächster Tag (Pfeil rechts)"
              >
                Nächster Tag
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            {/* Mobile: Kompaktere, kleinere Pfeile unter dem Datum */}
            <div className="flex md:hidden items-center justify-center gap-2 py-0 mt-1 mb-1">
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => onNavigateDay(-1)}
                disabled={!date || dayKeys.indexOf(date) <= 0}
                className="h-8 w-8"
                title="Vorheriger Tag"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <span className="text-sm text-gray-700 font-medium">
                {date && dayKeys.indexOf(date) + 1}/{dayKeys.length}
              </span>
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => onNavigateDay(1)}
                disabled={!date || dayKeys.indexOf(date) >= dayKeys.length - 1}
                className="h-8 w-8"
                title="Nächster Tag"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </>
        )}

        {/* Swipe-Hinweis für Mobile */}
        {onNavigateDay && dayKeys.length > 1 && (
          <div className="md:hidden text-center text-xs text-gray-400 pb-2">
            💡 Wische nach links/rechts um zwischen Tagen zu wechseln
          </div>
        )}

        <div className="space-y-4">
          {/* Strecken-Info Header */}
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
            <div className="flex items-center gap-2 text-blue-700 text-lg font-semibold mb-3">
              <MapPin className="h-5 w-5" />
              <span>{startStation?.name}</span>
              <ArrowRight className="h-5 w-5 text-gray-400" />
              <span>{zielStation?.name}</span>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-700">
              <div className="flex items-center gap-1">
                <User className="w-4 h-4" />
                <span>{getAlterLabel(searchParams.alter)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Train className="w-4 h-4" />
                <span>{searchParams.klasse === "KLASSE_1" ? "1. Klasse" : "2. Klasse"}</span>
              </div>
              <div className="flex items-center gap-1">
                <Percent className="w-4 h-4" />
                <span>{searchParams.ermaessigungArt === "KEINE_ERMAESSIGUNG" ? "Keine Ermäßigung" : `${searchParams.ermaessigungArt === "BAHNCARD25" ? "BahnCard 25" : searchParams.ermaessigungArt === "BAHNCARD50" ? "BahnCard 50" : searchParams.ermaessigungArt}, ${searchParams.ermaessigungKlasse === "KLASSE_1" ? "1. Klasse" : "2. Klasse"}`}</span>
              </div>
              <div className="flex items-center gap-1">
                <Shuffle className="w-4 h-4" />
                <span>Max. Umstiege: {searchParams.maximaleUmstiege || "0"}</span>
              </div>
              {searchParams.abfahrtAb && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>Abfahrt ab: {searchParams.abfahrtAb} Uhr</span>
                </div>
              )}
              {searchParams.ankunftBis && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>Ankunft bis: {searchParams.ankunftBis} Uhr</span>
                </div>
              )}
            </div>
          </div>

          {/* Top-Optionen: Bestpreis vs. KI-Empfehlung */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Bestpreis */}
            <div className="bg-green-50 border-2 border-green-200 p-4 rounded-lg relative flex flex-col justify-between h-full">
              <div className="absolute -top-3 left-4 flex gap-2">
                <Badge className="bg-green-600 text-white px-3 py-1">
                  <Euro className="h-3 w-3 mr-1" />
                  Bestpreis
                </Badge>
                {recommendation && recommendedTrip && recommendedTrip.preis === data.preis && (
                  <Badge className="bg-amber-100 text-amber-800 border border-amber-400 px-3 py-1">
                    <Star className="h-3 w-3 mr-1" />
                    Empfohlen
                  </Badge>
                )}
              </div>
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <div className="text-4xl font-bold text-green-700 mb-2">{data.preis}€</div>
                  {/* Gemeinsame Zeile für Reisedaten */}
                  {data.abfahrtsZeitpunkt && data.ankunftsZeitpunkt && (() => {
                    // Nutze recommendBestPrice für die Anzeige
                    const bestPriceTrip = intervals.length > 0 ? require('@/lib/recommendation-engine').recommendBestPrice(intervals) : null
                    return bestPriceTrip ? (
                      <div className="flex flex-wrap items-center gap-2 md:gap-4 text-sm text-gray-600 mb-3">
                        <span>
                          {new Date(bestPriceTrip.abfahrtsZeitpunkt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                          <ArrowRight className="inline h-3 w-3 mx-1" />
                          {new Date(bestPriceTrip.ankunftsZeitpunkt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span>({calculateDuration(bestPriceTrip.abfahrtsZeitpunkt, bestPriceTrip.ankunftsZeitpunkt)})</span>
                        <span className="flex items-center gap-1">
                          <Shuffle className="h-4 w-4 text-gray-500" />
                          <span className="hidden md:inline">Umstiege:</span>
                          {bestPriceTrip.umstiegsAnzahl || 0}
                        </span>
                        {(bestPriceTrip.umstiegsAnzahl || 0) === 0 && (
                          <span className="block md:inline w-full md:w-auto text-center md:text-left mt-2 md:mt-0">
                            <Badge variant="outline" className="text-green-700 border-green-300 text-xs ml-0.5 mx-auto md:mx-0">Direktverbindung</Badge>
                          </span>
                        )}
                      </div>
                    ) : null
                  })()}
                </div>
                {data.abfahrtsZeitpunkt && startStation && zielStation && (
                  <Button
                    onClick={() => {
                      const bookingLink = createBookingLink(
                        data.abfahrtsZeitpunkt,
                        startStation.id,
                        zielStation.id,
                        searchParams.klasse || "KLASSE_2",
                        searchParams.maximaleUmstiege || "0",
                        searchParams.alter || "ERWACHSENER",
                        searchParams.ermaessigungArt || "KEINE_ERMAESSIGUNG",
                        searchParams.ermaessigungKlasse || "KLASSENLOS",
                      )
                      if (bookingLink) {
                        window.open(bookingLink, "_blank")
                      }
                    }}
                    className="bg-green-600 hover:bg-green-700 w-full mt-auto"
                  >
                    <Train className="h-4 w-4 mr-2" />
                    Bestpreis buchen
                  </Button>
                )}
              </div>
            </div>

            {/* KI-Empfehlung */}
            {recommendation && recommendedTrip && recommendedTrip.preis !== data.preis ? (
              <div className="bg-amber-50 border-2 border-amber-200 p-4 rounded-lg relative flex flex-col justify-between h-full">
                <div className="absolute -top-3 left-4">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Badge className="bg-amber-600 text-white px-3 py-1 cursor-help">
                        <Star className="h-3 w-3 mr-1" />
                        Empfohlen
                      </Badge>
                    </PopoverTrigger>
                    <PopoverContent className="max-w-sm text-sm">
                      <div className="font-semibold mb-2 text-amber-800">🧠 Intelligente Empfehlung</div>
                      <div className="space-y-2">
                        <div>Unser Algorithmus bewertet alle Verbindungen nach:</div>
                        <ul className="list-disc list-inside space-y-1 text-xs text-gray-600">
                          <li><strong>45%</strong> Preis</li>
                          <li><strong>30%</strong> Reisezeit</li>
                          <li><strong>25%</strong> Anzahl Umstiege (Komfort)</li>
                          <li><strong>Direktverbindung</strong> wird bis zu 40% Aufpreis bevorzugt</li>
                        </ul>
                        <div className="text-xs mt-2 p-2 bg-amber-100 rounded">
                          <strong>Diese Verbindung:</strong> {recommendation.explanation.reason}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-4xl font-bold text-amber-700">{recommendedTrip.preis.toFixed(2)}€</span>
                      <span className="text-lg text-gray-500">+{(recommendedTrip.preis - data.preis).toFixed(2)}€</span>
                    </div>
                    {/* Gemeinsame Zeile für Reisedaten */}
                    <div className="flex flex-wrap items-center gap-2 md:gap-4 text-sm text-gray-600 mb-1">
                      <span>
                        {new Date(recommendedTrip.abfahrtsZeitpunkt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        <ArrowRight className="inline h-3 w-3 mx-1" />
                        {new Date(recommendedTrip.ankunftsZeitpunkt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span>({calculateDuration(recommendedTrip.abfahrtsZeitpunkt, recommendedTrip.ankunftsZeitpunkt)})</span>
                      <span className="flex items-center gap-1">
                        <Shuffle className="h-4 w-4 text-gray-500" />
                        <span className="hidden md:inline">Umstiege:</span>
                        {recommendedTrip.umstiegsAnzahl || 0}
                      </span>
                      {(recommendedTrip.umstiegsAnzahl || 0) === 0 && (
                        <Badge variant="outline" className="text-green-700 border-green-300 text-xs ml-1">Direktverbindung</Badge>
                      )}
                    </div>
                    {/* Begründung für die KI-Analyse */}
                    <div className="text-sm text-amber-700 font-medium mb-3">
                      {recommendation.explanation.reason}
                    </div>
                  </div>
                  {startStation && zielStation && (
                    <Button
                      onClick={() => {
                        const bookingLink = createBookingLink(
                          recommendedTrip.abfahrtsZeitpunkt,
                          startStation.id,
                          zielStation.id,
                          searchParams.klasse || "KLASSE_2",
                          searchParams.maximaleUmstiege || "0",
                          searchParams.alter || "ERWACHSENER",
                          searchParams.ermaessigungArt || "KEINE_ERMAESSIGUNG",
                          searchParams.ermaessigungKlasse || "KLASSENLOS",
                        )
                        if (bookingLink) {
                          window.open(bookingLink, "_blank")
                        }
                      }}
                      className="bg-amber-600 hover:bg-amber-700 w-full mt-auto"
                    >
                      <Star className="h-4 w-4 mr-2" />
                      Empfehlung buchen
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="hidden md:flex bg-amber-50 border-2 border-amber-200 p-4 rounded-lg shadow-sm items-center justify-center">
                <div className="text-center">
                  <Star className="h-8 w-8 mx-auto mb-2 text-amber-400" />
                  <div className="font-semibold text-amber-800">Bestpreis ist bereits optimal!</div>
                  <div className="text-sm mt-1 text-amber-700">Die KI-Analyse bestätigt: Diese Verbindung bietet die beste Balance aus Preis, Zeit und Komfort.<br/>Keine bessere Empfehlung möglich.</div>
                </div>
              </div>
            )}
          </div>

          {/* Kompakte Preisstatistik über der Tabelle */}
          {hasMultipleIntervals && (
            <div className="bg-yellow-50 border border-yellow-200 rounded px-3 py-2 mb-2 text-xs flex flex-wrap gap-4 justify-center">
              <div className="flex items-center gap-1">
                <span className="text-gray-600">Günstigste:</span>
                <span className="font-bold text-green-600">{Math.min(...intervals.map((i: any) => i.preis))}€</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-600">Durchschnitt:</span>
                <span className="font-bold text-blue-600">{Math.round(intervals.reduce((sum: number, i: any) => sum + i.preis, 0) / intervals.length)}€</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-600">Teuerste:</span>
                <span className="font-bold text-red-600">{Math.max(...intervals.map((i: any) => i.preis))}€</span>
              </div>
            </div>
          )}

          {/* All Available Connections */}
          {hasMultipleIntervals && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2 md:gap-0">
                <h3 className="font-semibold text-blue-800 flex items-center gap-2">
                  <Train className="h-4 w-4" />
                  Alle verfügbaren Verbindungen ({intervals.length})
                </h3>
                <div className="flex flex-col md:flex-row md:items-center gap-1 mt-2 md:mt-0">
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-blue-700">Nur günstigste Fahrt im Bestpreis-Zeitfenster</span>
                    <Switch
                      checked={showOnlyCheapest}
                      onCheckedChange={setShowOnlyCheapest}
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 p-0 text-blue-600" aria-label="Info zu Zeitfenstern">
                          <Info className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="max-w-xs text-sm text-gray-700">
                        <div className="font-semibold mb-1 text-blue-800">Bestpreis-Zeitfenster</div>
                        <div>
                          Die Bahn gruppiert Bestpreis-Verbindungen in folgende Zeitfenster:<br />
                          0–7 Uhr, 7-10 Uhr, 10–13 Uhr, 13–16 Uhr, 16–19 Uhr, 19–24 Uhr.<br />
                          Pro Zeitfenster wird jeweils die günstigste Verbindung angezeigt.<br />
                          Dies entspricht der offiziellen Bestpreis-Suche der Bahn.
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {/* Sortierbare Tabellen-Header */}
                {hasMultipleIntervals && (
                  <div className="mb-2">
                    <div className="flex flex-wrap md:grid md:grid-cols-6 gap-2 md:gap-3 text-xs font-semibold select-none sticky top-0 bg-blue-50 z-10 border-b border-blue-200 w-full">
                      {[
                        { key: 'abfahrt', label: 'Abfahrt' },
                        { key: 'ankunft', label: 'Ankunft' },
                        { key: 'umstiege', label: 'Umstiege' },
                        { key: 'dauer', label: 'Reisedauer' },
                        { key: 'preis', label: 'Preis' },
                      ].map(col => (
                        <button
                          key={col.key}
                          className={`flex-1 min-w-[90px] text-left flex items-center gap-1 px-2 py-1 rounded transition-colors whitespace-nowrap ${sortKey === col.key ? 'bg-blue-100 text-blue-900' : 'hover:bg-blue-100 text-blue-700'}`}
                          onClick={() => handleSort(col.key as SortKey)}
                          title="Sortieren"
                          type="button"
                        >
                          {col.label}
                          {sortKey === col.key && (
                            <span className="inline-block">
                              {sortDir === 'asc' ? (
                                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="chevron-up"><path fillRule="evenodd" d="M10 6a1 1 0 01.7.3l4 4a1 1 0 01-1.4 1.4L10 8.42l-3.3 3.3a1 1 0 01-1.4-1.42l4-4A1 1 0 0110 6z" clipRule="evenodd" /></svg>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="chevron-down"><path fillRule="evenodd" d="M10 14a1 1 0 01-.7-.3l-4-4a1 1 0 011.4-1.4L10 11.58l3.3-3.3a1 1 0 111.4 1.42l-4 4A1 1 0 0110 14z" clipRule="evenodd" /></svg>
                              )}
                            </span>
                          )}
                        </button>
                      ))}
                      <div className="hidden md:block" />
                    </div>
                  </div>
                )}
                {/* Verbindungen */}
                <div className="space-y-3">
                  {displayedIntervals.map((interval: any, index: number) => {
                    const isFastest = minDuration !== null && getDurationMinutes(interval.abfahrtsZeitpunkt, interval.ankunftsZeitpunkt) === minDuration;
                    const isBestPrice = interval.preis === data.preis;
                    const isRecommended = recommendedTrip && 
                      interval.abfahrtsZeitpunkt === recommendedTrip.abfahrtsZeitpunkt && 
                      interval.ankunftsZeitpunkt === recommendedTrip.ankunftsZeitpunkt &&
                      interval.preis === recommendedTrip.preis;
                    const bookingLink =
                      startStation && zielStation
                        ? createBookingLink(
                            interval.abfahrtsZeitpunkt,
                            startStation.id,
                            zielStation.id,
                            searchParams.klasse || "KLASSE_2",
                            searchParams.maximaleUmstiege || "0",
                            searchParams.alter || "ERWACHSENER",
                            searchParams.ermaessigungArt || "KEINE_ERMAESSIGUNG",
                            searchParams.ermaessigungKlasse || "KLASSENLOS",
                          )
                        : null;

                    // Style: Nur dicker linker Rand, keine weiteren Borders  
                    const cardBg = isBestPrice ? 'bg-green-50' : 
                                  isRecommended ? 'bg-amber-50' : 
                                  isFastest ? 'bg-purple-50' : 'bg-white';
                    const leftBorder = isBestPrice ? 'border-l-8 border-l-green-500' : 
                                      isRecommended ? 'border-l-8 border-l-amber-500' :
                                      isFastest ? 'border-l-8 border-l-purple-500' : 'border-l-8 border-l-gray-200';

                    return (
                      <React.Fragment key={index}>
                        {/* Mobile */}
                        <div className={`md:hidden rounded-lg shadow-sm p-2 mb-2 relative ${cardBg} ${leftBorder}`}
                          style={isRecommended || isBestPrice ? { paddingTop: 32 } : {}}>
                          {/* Prominente Badges oben */}
                          {(isRecommended || isBestPrice) && (
                            <div className="absolute top-2 left-2 z-10 flex gap-2">
                              {isRecommended && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Badge className="bg-amber-100 text-amber-800 border border-amber-400 rounded-full cursor-help flex items-center gap-1 px-2 py-1 font-semibold shadow-sm">
                                      <Star className="h-3 w-3" />
                                      Empfohlen
                                    </Badge>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-64 text-sm">
                                    <div className="font-semibold mb-2 text-amber-800">🧠 Intelligente Empfehlung</div>
                                    <div className="space-y-2">
                                      <div className="text-xs">Basiert auf einer gewichteten Bewertung von:</div>
                                      <ul className="list-disc list-inside space-y-1 text-xs text-gray-600">
                                        <li><strong>45%</strong> Preis</li>
                                        <li><strong>30%</strong> Reisezeit</li>
                                        <li><strong>25%</strong> Anzahl Umstiege (Komfort)</li>
                                        <li><strong>Direktverbindung</strong> wird bis zu 40% Aufpreis bevorzugt</li>
                                      </ul>
                                      <div className="text-xs mt-2 p-2 bg-amber-100 rounded font-medium">
                                        {recommendation?.explanation.reason}
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                              {isBestPrice && (
                                <Badge className="bg-green-100 text-green-800 border border-green-400 rounded-full flex items-center gap-1 px-2 py-1 font-semibold shadow-sm">
                                  <Euro className="h-3 w-3" />
                                  Bestpreis
                                </Badge>
                              )}
                            </div>
                          )}
                          <div className="flex flex-row items-stretch justify-between gap-2">
                            {/* Links: Abfahrt/Ankunft */}
                            <div className="flex flex-col justify-between min-w-[70px] flex-1">
                              <div>
                                <span className="text-xs text-gray-500 font-semibold">Abfahrt</span><br />
                                <span className="font-medium text-sm">{new Date(interval.abfahrtsZeitpunkt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                              <div className="mt-2">
                                <span className="text-xs text-gray-500 font-semibold">Ankunft</span><br />
                                <span className="font-medium text-sm">{new Date(interval.ankunftsZeitpunkt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
                              </div>
                            </div>
                            {/* Mitte: Umstiege/Dauer */}
                            <div className="flex flex-col justify-between min-w-[70px] flex-1">
                              <div>
                                <span className="text-xs text-gray-500 font-semibold">Umstiege</span><br />
                                <span className="font-medium text-sm">{interval.umstiegsAnzahl || 0}</span>
                              </div>
                              <div className="mt-2">
                                <span className="text-xs text-gray-500 font-semibold">Reisedauer</span><br />
                                <span className="font-medium text-sm">{calculateDuration(interval.abfahrtsZeitpunkt, interval.ankunftsZeitpunkt)}</span>
                                {isFastest && (
                                  <div className="mt-0.5">
                                    <span title="Schnellste Verbindung" className="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-semibold">
                                      <TrendingUp className="h-3 w-3 mr-0.5" />
                                      Schnellste
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* Rechts: Preis/Buchen */}
                            <div className="flex flex-col items-end min-w-[90px] flex-shrink-0 justify-between ml-2 relative">
                              <div>
                                <span className="text-xs text-gray-500 font-semibold">Preis</span><br />
                                <span className={`font-bold text-base px-2 py-1 rounded ${getIntervalPriceColor(interval.preis)}`}>{interval.preis}€</span>
                              </div>
                              <div className="mt-2">
                                {bookingLink && (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 whitespace-nowrap"
                                    title="Buchen"
                                    onClick={() => window.open(bookingLink, "_blank")}
                                  >
                                    <Train className="h-4 w-4" />
                                    Buchen
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Desktop-Grid */}
                        <div
                          className={`hidden md:grid grid-cols-6 gap-3 items-center p-3 rounded relative text-sm ${leftBorder} ${cardBg}`}
                          style={isRecommended || isBestPrice ? { paddingTop: 40 } : {}}>
                          {/* Prominente Badges oben für Desktop */}
                          {(isRecommended || isBestPrice) && (
                            <div className="absolute top-2 left-2 z-10 flex gap-2">
                              {isRecommended && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Badge className="bg-amber-100 text-amber-800 border border-amber-400 rounded-full cursor-help flex items-center gap-1 px-2 py-1 font-semibold shadow-sm">
                                      <Star className="h-3 w-3" />
                                      Empfohlen
                                    </Badge>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-64 text-sm">
                                    <div className="font-semibold mb-2 text-amber-800">🧠 Intelligente Empfehlung</div>
                                    <div className="space-y-2">
                                      <div className="text-xs">Basiert auf einer gewichteten Bewertung von:</div>
                                      <ul className="list-disc list-inside space-y-1 text-xs text-gray-600">
                                        <li><strong>45%</strong> Preis</li>
                                        <li><strong>30%</strong> Reisezeit</li>
                                        <li><strong>25%</strong> Anzahl Umstiege (Komfort)</li>
                                        <li><strong>Direktverbindung</strong> wird bis zu 40% Aufpreis bevorzugt</li>
                                      </ul>
                                      <div className="text-xs mt-2 p-2 bg-amber-100 rounded font-medium">
                                        {recommendation?.explanation.reason}
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                              {isBestPrice && (
                                <Badge className="bg-green-100 text-green-800 border border-green-400 rounded-full flex items-center gap-1 px-2 py-1 font-semibold shadow-sm">
                                  <Euro className="h-3 w-3" />
                                  Bestpreis
                                </Badge>
                              )}
                            </div>
                          )}
                          
                          <div>
                            <div className="text-gray-600 mb-1">Abfahrt</div>
                            <div className="font-medium">
                              {new Date(interval.abfahrtsZeitpunkt).toLocaleTimeString("de-DE", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                            <div className="text-xs text-gray-500">{interval.abfahrtsOrt}</div>
                          </div>
                          <div>
                            <div className="text-gray-600 mb-1">Ankunft</div>
                            <div className="font-medium">
                              {new Date(interval.ankunftsZeitpunkt).toLocaleTimeString("de-DE", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                            <div className="text-xs text-gray-500">{interval.ankunftsOrt}</div>
                          </div>
                          <div>
                            <div className="text-gray-600 mb-1">Umstiege</div>
                            <div className="font-medium flex items-center gap-1">
                              <Shuffle className="h-4 w-4 text-gray-500" />
                              {interval.umstiegsAnzahl || 0}
                              {(interval.umstiegsAnzahl || 0) === 0 && (
                                <span className="text-xs text-green-600 -1">(Direkt)</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-600 mb-1">Reisedauer</div>
                            <div className="font-medium">
                              {calculateDuration(interval.abfahrtsZeitpunkt, interval.ankunftsZeitpunkt)}
                            </div>
                            {isFastest && (
                              <div className="mt-0.5">
                                <span title="Schnellste Verbindung" className="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-semibold">
                                  <TrendingUp className="h-3 w-3 mr-0.5" />
                                  Schnellste
                                </span>
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-gray-600 mb-1">Preis</div>
                            <div className={`font-bold text-lg px-2 py-1 rounded ${getIntervalPriceColor(interval.preis)}`}>{interval.preis}€</div>
                          </div>
                          {/* Buchen-Button */}
                          {bookingLink && (
                            <Button
                              size="sm"
                              variant="default"
                              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 whitespace-nowrap"
                              title="Buchen"
                              onClick={() => window.open(bookingLink, "_blank")}
                            >
                              <Train className="h-4 w-4" />
                              Buchen
                            </Button>
                          )}
                        </div>
                      </React.Fragment>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}