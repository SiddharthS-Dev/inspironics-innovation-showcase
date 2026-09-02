import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Logo from './Logo'
import { useAuth } from '../../context/AuthContext'

const LINKS = [
  { id: 'ecosystem', label: 'Ecosystem' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'spotlight', label: 'Spotlight' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const { user, isGuest, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  const go = (id) => {
    setOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled ? 'border-b border-white/10 bg-[#08080c]/80 backdrop-blur-xl' : 'border-b border-transparent'
        }`}
      >
        <nav className="mx-auto flex h-[68px] max-w-[1600px] items-center gap-4 px-5 sm:px-8 lg:px-12">
          <button onClick={() => go('hero')} className="flex min-w-0 items-center gap-3 text-left">
            <Logo size={30} />
            <span className="min-w-0 truncate font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-chalk sm:text-xs">
              <span className="hidden sm:inline">Inspironics Innovation Showcase</span>
              <span className="sm:hidden">Inspironics</span>
            </span>
          </button>

          <div className="ml-auto hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <button
                key={l.id}
                onClick={() => go(l.id)}
                className="rounded-lg px-3.5 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-chalk"
              >
                {l.label}
              </button>
            ))}
            <Link
              to="/report"
              className="rounded-lg px-3.5 py-2 text-sm text-muted transition hover:bg-white/5 hover:text-chalk"
            >
              Report
            </Link>
          </div>

          <div className="ml-auto flex items-center gap-2 lg:ml-3">
            <button onClick={() => go('gallery')} className="btn-primary hidden !px-4 !py-2.5 text-[13px] sm:inline-flex">
              Explore Gallery
            </button>

            <div className="group relative hidden lg:block">
              <button className="flex h-9 items-center gap-2 rounded-full border border-white/12 bg-white/5 pl-1 pr-3 transition hover:border-cyan-glow/40">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-cyan-glow/15 font-mono text-[11px] font-bold text-cyan-glow">
                  {(user?.name || 'U').slice(0, 1).toUpperCase()}
                </span>
                <span className="max-w-[110px] truncate text-xs text-muted">{user?.name}</span>
              </button>
              <div className="invisible absolute right-0 top-full w-56 translate-y-1 pt-2 opacity-0 transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                <div className="glass-strong rounded-xl p-3 shadow-lift">
                  <p className="truncate text-xs text-chalk">{user?.email}</p>
                  <p className="label-mono mt-1">{isGuest ? 'Guest session' : `Role · ${user?.role}`}</p>
                  <button
                    onClick={() => {
                      logout()
                      navigate('/login')
                    }}
                    className="mt-3 w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-muted transition hover:border-rose-400/40 hover:text-rose-300"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={() => setOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-lg border border-white/12 bg-white/5 lg:hidden"
              aria-label="Open menu"
            >
              <span className="flex flex-col gap-1.5">
                <i className="block h-px w-5 bg-chalk" />
                <i className="block h-px w-5 bg-chalk" />
                <i className="block h-px w-5 bg-chalk" />
              </span>
            </button>
          </div>
        </nav>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[60] flex flex-col bg-[#06060a]/97 backdrop-blur-2xl lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex h-[68px] items-center justify-between px-5">
              <Logo size={28} />
              <button onClick={() => setOpen(false)} className="text-2xl text-muted" aria-label="Close menu">
                ✕
              </button>
            </div>
            <div className="flex flex-1 flex-col justify-center gap-1 px-8 pb-24">
              {LINKS.map((l, i) => (
                <motion.button
                  key={l.id}
                  onClick={() => go(l.id)}
                  className="border-b border-white/8 py-5 text-left text-3xl font-bold text-chalk"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i }}
                >
                  {l.label}
                </motion.button>
              ))}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-8 space-y-3">
                <Link to="/report" className="btn-ghost w-full" onClick={() => setOpen(false)}>
                  Monthly Report
                </Link>
                <button onClick={() => go('gallery')} className="btn-primary w-full">
                  Explore Gallery
                </button>
                <button
                  onClick={() => {
                    logout()
                    navigate('/login')
                  }}
                  className="w-full py-3 text-center text-xs text-muted"
                >
                  Sign out · {user?.email}
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
