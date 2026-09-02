import { useCallback, useEffect, useMemo, useState } from 'react'
import Navbar from '../components/inspironics/Navbar'
import HeroSection from '../components/inspironics/HeroSection'
import EcosystemExplorer from '../components/inspironics/EcosystemExplorer'
import Gallery from '../components/inspironics/Gallery'
import DailySpotlight from '../components/inspironics/DailySpotlight'
import AboutSection from '../components/inspironics/AboutSection'
import ContactSection from '../components/inspironics/ContactSection'
import Footer from '../components/inspironics/Footer'
import CopilotPanel from '../components/inspironics/CopilotPanel'
import IntroSequence from '../components/inspironics/IntroSequence'
import Loader from '../components/inspironics/Loader'
import Lightbox from '../components/inspironics/Lightbox'
import { loadShowcase, rebuildWithCustom, spotlightFor } from '../lib/showcaseData'

export default function Home() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [introDone, setIntroDone] = useState(false)
  const [activeFilter, setActiveFilter] = useState(null)
  // A plate opened outside the gallery's own filters: by the copilot, or by the
  // #<id> deep link that the lightbox's Share button produces.
  const [focusItem, setFocusItem] = useState(null)

  useEffect(() => {
    loadShowcase()
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  // keep the dataset in step with locally-added plates
  useEffect(() => {
    const onChange = () => {
      const next = rebuildWithCustom()
      if (next) setData({ ...next })
    }
    window.addEventListener('inspironics:custom-items', onChange)
    return () => window.removeEventListener('inspironics:custom-items', onChange)
  }, [])

  // Share links look like /#<item.f>; open that plate on load and on hashchange.
  useEffect(() => {
    if (!data) return
    const openFromHash = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ''))
      if (!id) return
      const it = data.items.find((x) => x.f === id)
      if (it) setFocusItem(it)
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [data])

  const closeFocus = useCallback(() => {
    setFocusItem(null)
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [])

  const route = useCallback((r, node) => {
    setActiveFilter(r ? { ...r, sourceName: node?.name || 'Ecosystem', at: Date.now() } : null)
  }, [])

  const spotlight = useMemo(() => (data ? spotlightFor(data.items) : null), [data])

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <p className="eyebrow">Data error</p>
          <h1 className="mt-3 text-2xl font-bold text-chalk">The showcase corpus could not be loaded.</h1>
          <p className="mt-3 text-sm text-muted">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return <Loader label="Indexing 235 innovations" />

  return (
    <>
      {!introDone && <IntroSequence onDone={() => setIntroDone(true)} />}

      <Navbar />

      <main className="relative">
        <HeroSection stats={data} />
        <EcosystemExplorer items={data.items} onRoute={route} />
        <Gallery
          data={data}
          activeFilter={activeFilter}
          onClearActive={() => setActiveFilter(null)}
          onAdded={() => setActiveFilter(null)}
        />
        <DailySpotlight item={spotlight} items={data.items} />
        <AboutSection stats={data} heroItem={spotlight} />
        <ContactSection />
      </main>

      <Footer cats={data.cats} techs={data.techs} onRoute={route} />

      <CopilotPanel onOpenItem={setFocusItem} />

      {/* Opened by the copilot or a share link, so it spans the full corpus
          rather than whatever the gallery is currently filtered to. */}
      <Lightbox
        items={data.items}
        index={focusItem ? data.items.findIndex((x) => x.f === focusItem.f) : null}
        onIndex={(i) => setFocusItem(data.items[i])}
        onClose={closeFocus}
      />
    </>
  )
}
