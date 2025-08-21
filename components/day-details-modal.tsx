"use client"

import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { MapPin, ArrowRight, Euro, Calendar, Train, TrendingUp, GraduationCap, User, Percent, Shuffle, Clock, Filter, Info } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

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
}: DayDetailsModalProps) {
  const [showOnlyCheapest, setShowOnlyCheapest] = useState(true)
  // Sortier-Logik für die Tabelle
  type SortKey = 'abfahrt' | 'ankunft' | 'umstiege' | 'dauer' | 'preis'
  const [sortKey, setSortKey] = useState<SortKey>('preis')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

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
          valA = a.preis; valB = b.preis; break
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

  const getIntervalPriceColor = (price: number) => {
    const minIntervalPrice = Math.min(...intervals.map((i) => i.preis))
    const maxIntervalPrice = Math.max(...intervals.map((i) => i.preis))

    if (price === minIntervalPrice) return "text-green-600 bg-green-50"
    if (price === maxIntervalPrice) return "text-red-600 bg-red-50"
    return "text-orange-600 bg-orange-50"
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Calendar className="h-5 w-5 text-blue-600" />
            {formattedDate}
            {isWeekend && <Badge variant="secondary">Wochenende</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Best Price Overview */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-semibold text-gray-800 mb-3">Bestpreis für diesen Tag</div>
            <div className="flex flex-col md:flex-row md:items-stretch gap-6">
              {/* Links: Preis und Button */}
              <div className="flex flex-col items-start justify-between min-w-[160px] md:border-r md:pr-6 gap-2">
                <div className="flex items-center gap-2 mb-1">
                  <Euro className="h-5 w-5 text-green-600" />
                  <span className="text-3xl font-bold text-green-600">{data.preis}€</span>
                </div>
                {/* Abfahrt → Ankunft Zeit unter dem Bestpreis anzeigen */}
                {data.abfahrtsZeitpunkt && data.ankunftsZeitpunkt && (
                  <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                    {new Date(data.abfahrtsZeitpunkt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    <span className="mx-1">→</span>
                    {new Date(data.ankunftsZeitpunkt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                )}
                {data.abfahrtsZeitpunkt && startStation && zielStation && (
                  <Button
                    size="sm"
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
                    className="bg-green-600 hover:bg-green-700 mt-1"
                  >
                    <Train className="h-4 w-4 mr-1" />
                    Bestpreis buchen
                  </Button>
                )}
              </div>
              {/* Rechts: Strecke und Details */}
              <div className="flex-1 flex flex-col gap-2 justify-between">
                {/* Strecke */}
                {startStation && zielStation && (
                  <div className="flex items-center gap-2 text-blue-700 text-base font-medium mb-1">
                    <MapPin className="h-4 w-4" />
                    <span>{startStation.name}</span>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                    <span>{zielStation.name}</span>
                  </div>
                )}
                {/* Fahrgast- und Filterinfos */}
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
            </div>
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
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-blue-800 flex items-center gap-2">
                  <Train className="h-4 w-4" />
                  Alle verfügbaren Verbindungen ({intervals.length})
                </h3>
                <div className="flex items-center gap-2">
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
                        0–7 Uhr, 10–13 Uhr, 13–16 Uhr, 16–19 Uhr, 19–24 Uhr.<br />
                        Pro Zeitfenster wird jeweils die günstigste Verbindung angezeigt.<br />
                        Dies entspricht der offiziellen Bestpreis-Suche der Bahn.
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-3">
                {/* Sortierbare Tabellen-Header */}
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 text-xs font-semibold mb-2 select-none sticky top-0 bg-blue-50 z-10 border-b border-blue-200">
                  {[
                    { key: 'abfahrt', label: 'Abfahrt' },
                    { key: 'ankunft', label: 'Ankunft' },
                    { key: 'umstiege', label: 'Umstiege' },
                    { key: 'dauer', label: 'Reisedauer' },
                    { key: 'preis', label: 'Preis' },
                  ].map(col => (
                    <button
                      key={col.key}
                      className={`text-left flex items-center gap-1 px-1 py-1 rounded transition-colors ${sortKey === col.key ? 'bg-blue-100 text-blue-900' : 'hover:bg-blue-100 text-blue-700'}`}
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
                  <div />
                </div>
                {/* Verbindungen */}
                <div className="space-y-3">
                  {displayedIntervals.map((interval: any, index: number) => {
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
                        : null

                    return (
                      <div
                        key={index}
                        className={`grid grid-cols-1 md:grid-cols-6 gap-3 items-center p-3 rounded border-l-4 relative text-sm ${
                          interval.preis === data.preis ? "border-green-500 bg-green-50" : "border-gray-300 bg-white"
                        }`}
                      >
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
                        </div>
                        <div>
                          <div className="text-gray-600 mb-1">Preis</div>
                          <div className={`font-bold text-lg px-2 py-1 rounded ${getIntervalPriceColor(interval.preis)}`}>{interval.preis}€</div>
                          {interval.preis === data.preis && (
                            <Badge className="bg-green-100 text-green-800">Bestpreis</Badge>
                          )}
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
