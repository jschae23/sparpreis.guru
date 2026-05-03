'use client'

import { getAppVersion, getCurrentYear } from "@/lib/shared/app-info"
import { Github } from "lucide-react"
import { useEffect, useState } from "react"

export function Footer() {
  const currentYear = getCurrentYear()
  const appVersion = getAppVersion()
  const [showFooter, setShowFooter] = useState(false)

  useEffect(() => {
    // Footer anzeigen, wenn Domain sparpreis.guru ODER ENV SHOW_FOOTER gesetzt ist
    const shouldShowFooter =
      window.location.hostname === "sparpreis.guru" ||
      (typeof process !== "undefined" && !!process.env.SHOW_FOOTER)
    setShowFooter(shouldShowFooter)
  }, [])

  if (!showFooter) return null

  return (
    <footer className="mt-8 border-t border-gray-200 pt-8">
      <div className="text-xs text-center text-gray-400 mt-0">
        <p>
          Dieses Deployment dient ausschließlich als technische Demonstration des Projekts{" "}
          <a href="https://github.com/XLixl4snSU/sparpreis.guru"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >sparpreis.guru</a>
        </p>

        <p>
          Die Anwendung visualisiert Abfrageergebnisse und speichert keine personenbezogenen Daten.
          Es werden keine kommerziellen Zwecke verfolgt.
        </p>

        <p>
          Bei Einwänden (z. B. von Rechteinhabern oder Plattformbetreibern) wird das
          Deployment auf Hinweis hin umgehend deaktiviert.
          Kontakt:
          {" "}
          <a href="mailto:info@sparpreis.guru" className="underline">
            info@sparpreis.guru
          </a>
          .
        </p>
      </div>
      <div className="flex flex-row justify-between items-center text-sm text-gray-500 mt-4" >
        <div>
          © {currentYear} <span className="font-medium text-gray-600">sparpreis.guru</span>
        </div>
        <div className="mt-2 sm:mt-0 flex flex-row sm:items-end items-center gap-3">
          <span>Version {appVersion}</span>
          <a
            href="https://github.com/XLixl4snSU/sparpreis.guru"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline mt-1 flex items-center"
          >
            <Github className="inline w-4 h-4 mr-1" /> GitHub
          </a>
        </div>
      </div>
    </footer>
  )
}
