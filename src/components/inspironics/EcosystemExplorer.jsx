import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Ecosystem3DLarge from './Ecosystem3DLarge'
import { PRODUCT_NODES, STACK_LAYERS, ZONES, countMatches, routeLabel } from '../../lib/ecosystemData'

export default function EcosystemExplorer({ items, onRoute }) {
  const [hover, setHover] = useState(null)
  const [selected, setSelected] = useState(null)

  const counts = useMemo(() => {
    const of = (n) => [n.id, countMatches(items, n.route)]
    return Object.fromEntries([...ZONES, ...PRODUCT_NODES, ...STACK_LAYERS].map(of))
  }, [items])

  const open = useCallback((node) => setSelected(node), [])

  const send = (node) => {
    onRoute?.(node.route, node)
    document.getElementById('gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section id="ecosystem" className="section-pad relative z-10">
      <SectionHead
        eyebrow="Ecosystem Explorer"
        title="One city. Every system."
        sub="A live model of the Inspironics estate — zones, products and the intelligence stack that binds them. Click any node to filter the gallery to the work behind it."
      />

      <div className="relative mt-12 overflow-hidden rounded-3xl border border-white/10 bg-[#070810] shadow-lift">
        <div className="relative h-[520px] sm:h-[640px] lg:h-[860px]">
          <Ecosystem3DLarge onHover={setHover} onSelect={open} focusId={selected?.id} />

          {/* hover tooltip */}
          <AnimatePresence>
            {hover && !selected && (
              <motion.div
                key="tip"
                className="pointer-events-none fixed z-20 -translate-x-1/2 -translate-y-[calc(100%+16px)]"
                style={{ left: hover.screen?.x ?? 0, top: hover.screen?.y ?? 0 }}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ duration: 0.14 }}
              >
                <div
                  className="rounded-xl border bg-[#08090e]/95 px-3.5 py-2.5 backdrop-blur-xl"
                  style={{ borderColor: `${hover.color}66` }}
                >
                  <p className="text-sm font-semibold text-chalk">{hover.name}</p>
                  <p className="label-mono mt-0.5" style={{ color: hover.color }}>
                    {hover.category} · {counts[hover.id] ?? items.length} plates
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* side info panel */}
          <AnimatePresence>
            {selected && (
              <motion.aside
                key={selected.id}
                className="absolute inset-y-0 right-0 z-20 w-full max-w-[380px] border-l border-white/10 bg-[#08090e]/94 p-6 backdrop-blur-2xl sm:p-7"
                initial={{ x: '100%', opacity: 0.4 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 30 }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="label-mono" style={{ color: selected.color }}>
                      {selected.category}
                    </p>
                    <h3 className="mt-2 text-2xl font-bold leading-tight text-chalk">{selected.name}</h3>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 text-muted transition hover:border-white/25 hover:text-chalk"
                    aria-label="Close panel"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-5 h-px w-full" style={{ background: `linear-gradient(90deg, ${selected.color}, transparent)` }} />

                <p className="mt-5 text-sm leading-relaxed text-muted">{selected.blurb}</p>

                <div className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <p className="label-mono">Gallery matches</p>
                  <p className="mt-2 font-mono text-4xl font-bold" style={{ color: selected.color }}>
                    {counts[selected.id] ?? items.length}
                  </p>
                  <p className="mt-2 text-xs text-muted">{routeLabel(selected.route)}</p>
                </div>

                <button
                  onClick={() => send(selected)}
                  className="btn-primary mt-6 w-full"
                  style={{ backgroundColor: selected.color, boxShadow: `0 0 32px -6px ${selected.color}` }}
                >
                  Open in Gallery →
                </button>

                <p className="mt-4 text-[11px] leading-relaxed text-muted/70">
                  Filters the gallery below and scrolls you to it. Clear filters there to return to all {items.length} plates.
                </p>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* hint bar */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-4">
            <div className="rounded-full border border-white/10 bg-[#08090e]/85 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted backdrop-blur">
              Drag to orbit · Scroll to zoom · Right-drag to pan · Click any node
            </div>
          </div>
        </div>
      </div>

      {/* zone quick-filter pills */}
      <div className="mt-6 flex flex-wrap gap-2.5">
        {[...ZONES, ...PRODUCT_NODES].map((n) => (
          <button
            key={n.id}
            onClick={() => {
              setSelected(n)
              send(n)
            }}
            className="group flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] py-2 pl-3 pr-3.5 text-xs text-muted transition hover:bg-white/[0.07] hover:text-chalk"
            style={{ borderColor: `${n.color}2e` }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: n.color, boxShadow: `0 0 10px ${n.color}` }} />
            {n.name}
            <span className="font-mono text-[10px] text-muted/60 group-hover:text-muted">{counts[n.id]}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function SectionHead({ eyebrow, title, sub, right }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6">
      <motion.div
        className="max-w-3xl"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-4 text-[clamp(2rem,4.4vw,3.4rem)] font-black leading-[1.05] tracking-[-0.025em] text-chalk">
          {title}
        </h2>
        {sub && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">{sub}</p>}
      </motion.div>
      {right}
    </div>
  )
}
