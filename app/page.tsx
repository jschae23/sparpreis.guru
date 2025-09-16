import { TrainSearchForm } from "@/components/train-search-form"
import { TrainResults } from "@/components/train-results"
import { FAQPopup } from "@/components/faq-popup"
import { getAppVersion, getCurrentYear } from "@/lib/app-info"
import { Github } from "lucide-react"

interface SearchParams {
  start?: string
  ziel?: string
  reisezeitraumAb?: string
  reisezeitraumBis?: string
  alter?: string
  ermaessigungArt?: string
  ermaessigungKlasse?: string
  abfahrtAb?: string // Fixed typo: was "abfahrtab" 
  ankunftBis?: string
  klasse?: string
  schnelleVerbindungen?: string
  nurDeutschlandTicketVerbindungen?: string
  maximaleUmstiege?: string
  tage?: string // JSON-String mit Array der gewünschten Tage
  umstiegszeit?: string // Das hat gefehlt!
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const hasSearch = params.start && params.ziel
  
  const currentYear = getCurrentYear()
  const appVersion = getAppVersion()

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
        <footer className="mt-8 border-t border-gray-200 pt-8">
            <div className="text-xs text-center text-gray-400 mt-0">
            Sollte die Deutsche Bahn dieses Projekt nicht wünschen, genügt eine Info an <a href="mailto:info@sparpreis.guru" className="underline">info@sparpreis.guru</a>.
            <br></br>Diese Seite ist rein privater Natur und verfolgt keinerlei kommerzielle Interessen. Es werden keine personenbezogene Daten gespeichert.
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
      </div>
    </div>
  )
}