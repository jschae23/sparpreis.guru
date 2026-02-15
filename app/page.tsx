import { TrainSearchForm } from "@/components/train-search-form"
import { TrainResults } from "@/components/train-results"
import { FAQPopup } from "@/components/faq-popup"
import { getAppVersion, getCurrentYear } from "@/lib/app-info"
import { Github } from "lucide-react"
import { redirect } from "next/navigation"

interface SearchParams {
  start?: string
  ziel?: string
  reisezeitraumAb?: string
  reisezeitraumBis?: string
  alter?: string
  ermaessigungArt?: string
  ermaessigungKlasse?: string
  abfahrtAb?: string
  ankunftBis?: string
  klasse?: string
  schnelleVerbindungen?: string
  nurDeutschlandTicketVerbindungen?: string
  maximaleUmstiege?: string
  umstiegszeit?: string
  wochentage?: string
}

// Helper function to get tomorrow's date in YYYY-MM-DD format
function getTomorrowISO() {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toISOString().split("T")[0]
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  
  // Validate and correct dates if they're in the past
  if (params.start && params.ziel) {
    const tomorrow = getTomorrowISO()
    let needsRedirect = false
    const correctedParams = new URLSearchParams()
    
    // Copy all existing params
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        correctedParams.set(key, value)
      }
    })
    
    // Check and correct reisezeitraumAb
    if (params.reisezeitraumAb && params.reisezeitraumAb < tomorrow) {
      correctedParams.set('reisezeitraumAb', tomorrow)
      needsRedirect = true
    }
    
    // Check and correct reisezeitraumBis if it's before reisezeitraumAb
    const effectiveAb = params.reisezeitraumAb && params.reisezeitraumAb >= tomorrow 
      ? params.reisezeitraumAb 
      : tomorrow
    
    if (params.reisezeitraumBis && params.reisezeitraumBis < effectiveAb) {
      // Set reisezeitraumBis to 2 days after effectiveAb
      const abDate = new Date(effectiveAb)
      abDate.setDate(abDate.getDate() + 2)
      correctedParams.set('reisezeitraumBis', abDate.toISOString().split("T")[0])
      needsRedirect = true
    }
    
    // Redirect if any corrections were made
    if (needsRedirect) {
      redirect(`/?${correctedParams.toString()}`)
    }
  }
  
  const hasSearch = params.start && params.ziel
  
  const currentYear = getCurrentYear()
  const appVersion = getAppVersion()

  // Footer anzeigen, wenn Domain sparpreis.guru ODER ENV SHOW_FOOTER gesetzt ist
  let showFooter = false
  if (typeof window === "undefined") {
    // Server Side: Prüfe ENV
    showFooter = !!process.env.SHOW_FOOTER
  } else {
    // Client Side: Prüfe Hostname ODER ENV (falls z.B. via next/config oder window.__env)
    showFooter =
      window.location.hostname === "sparpreis.guru" ||
      (typeof process !== "undefined" && !!process.env.SHOW_FOOTER)
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <header className="mb-4">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold mb-2">
                <a href="/" className="text-gray-600 hover:text-retro-gradient">
                  sparpreis.guru
                </a>
              </h1>
            </div>
            <div className="flex-shrink-0">
              <FAQPopup />
            </div>
          </div>
        </header>

        <section className="mb-8">
          <TrainSearchForm searchParams={params} />
        </section>

          <section className="mb-8">
            {hasSearch ? (
                <TrainResults searchParams={params} />
            ) : <></>}
          </section>
        
        {/* Footer */}
        {showFooter && (
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
        )}
      </div>
    </div>
  )
}