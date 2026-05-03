"use client"

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { HelpCircle } from "lucide-react"

export function FAQPopup() {
  const [isOpen, setIsOpen] = useState(false)

  const faqs = [
    {
      question: "Was ist sparpreis.guru?",
      answer: "sparpreis.guru hilft dabei, günstige Bahnverbindungen schneller zu finden. Die Bestpreissuche vergleicht Preise über mehrere Reisetage hinweg, der Urlaubsfinder vergleicht viele mögliche Reiseziele für einen gewählten Zeitraum."
    },
    {
      question: "Was ist der Urlaubsfinder?",
      answer: "Der Urlaubsfinder sucht von deinem Startbahnhof aus gleichzeitig nach günstigen Zielen. Du wählst mögliche Städte aus, legst Hin- und optional Rückfahrt fest und bekommst die günstigsten erreichbaren Ziele sortiert nach Gesamtpreis angezeigt."
    },
    {
      question: "Was zeigen Karte und Ergebnisdetails im Urlaubsfinder?",
      answer: "Die Karte zeigt gefundene Ziele räumlich an. In den Details siehst du Hin- und Rückfahrt, Preisanteile, Umstiege und den Routenverlauf. Die Buchungslinks führen zur Bahn-Suche mit den passenden Parametern."
    },
    {
      question: "Warum werden nur maximal 30 Tage abgefragt?",
      answer: "Unnötige Anfragen an die Bahn-API sollen vermieden werden. In der Bestpreissuche werden deshalb maximal 30 Reisetage betrachtet. Im Urlaubsfinder wird zusätzlich bei sehr vielen ausgewählten Zielen vor dem Start nachgefragt."
    },
    {
      question: "Wie aktuell sind die Preise?",
      answer: "Die Preise werden in der Regel live von der Deutschen Bahn abgerufen. Ergebnisse werden für 60 Minuten zwischengespeichert, um unnötige Mehrfachanfragen zu vermeiden."
    },
    {
      question: "Wie funktioniert die Preishistorie?",
      answer: "Die Preishistorie zeigt an, wie sich die Preise für eine bestimmte Verbindung im Laufe der Zeit verändert haben – sofern für diese Verbindung bereits frühere Preisdaten vorliegen. Sie wird nur angezeigt, wenn die gleiche Suche schon einmal zu einem früheren Zeitpunkt durchgeführt wurde. Ist das nicht der Fall, gibt es keine Preishistorie für diese Verbindung."
    },
    {
      question: "Was passiert mit meinen Daten?",
      answer: "Es werden keine personenbezogenen Daten gespeichert. Such- und Preisabfragen werden technisch verarbeitet und zwischengespeichert. Bei der Bahnhofssuche werden außerdem aggregierte Klickzahlen gespeichert, damit häufig gewählte passende Bahnhöfe künftig weiter oben erscheinen."
    }
  ]

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-600 hover:text-blue-600 hover:bg-blue-50"
        >
          <HelpCircle className="w-4 h-4 mr-2" />
          FAQ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-blue-600" />
            Häufig gestellte Fragen
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 mt-4">
          {faqs.map((faq, index) => (
            <div key={index} className="border-b border-gray-100 pb-4 last:border-b-0">
              <h3 className="font-semibold text-gray-900 mb-2">
                {faq.question}
              </h3>
              <p className="text-gray-700 leading-relaxed">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
