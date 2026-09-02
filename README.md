# Inspironics Innovation Showcase

An immersive, dark-themed digital gallery of **235 innovation infographics** — architecture plates,
command decks and value frameworks from the Inspironics estate.

- **Cinematic hero** over an animated grid backdrop
- **3D smart-city Ecosystem Explorer** (Three.js) — click a zone, product or stack layer and the
  gallery filters to the work behind it
- **Flip-card gallery** with full-screen lightbox (zoom, pan, download, share, related plates)
- **AI copilot** that answers from the whole corpus, including product names printed inside the artwork
- **Monthly report** rendered to a multi-page PDF in the browser
- Email/password + Google OAuth auth with an OTP verification and password-reset flow

## Quick start

On Windows, double-click **`start.bat`** — it installs dependencies on the first run, starts the
dev server on <http://localhost:5173> and opens your browser. Leave that window open while you use
the site. **`stop.bat`** shuts it down (so does Ctrl+C in the server window).

```bat
start.bat          :: dev server on port 5173
start.bat 5174     :: dev server on another port
start.bat prod     :: production build, then serve it on 4173
stop.bat           :: stop the dev (5173) and preview (4173) servers
stop.bat 5174      :: stop a specific port
```

Or drive npm directly:

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/
npm run preview
```

Sign in, register, or use **Continue as guest** on the login screen.

## Stack

React 18 · Vite 5 · Tailwind CSS 3 · Framer Motion · Three.js · jsPDF · React Router 6

## Where things live

```
src/
  App.jsx                          router: / (Home), /report, auth routes
  pages/                           Home · MonthlyReport · Login · Register · VerifyOtp
                                   ForgotPassword · ResetPassword
  context/AuthContext.jsx          session provider + ProtectedRoute gate
  components/inspironics/          Navbar · HeroSection · Ecosystem3DLarge · EcosystemExplorer
                                   Gallery · GalleryFilters · FlipCard · Lightbox · AddImageModal
                                   DailySpotlight · AboutSection · ContactSection · Footer
                                   CopilotPanel · Markdown · IntroSequence · Loader · Logo
                                   AuthShell · GoogleButton
  lib/
    showcaseData.js                fetch + enrich + aggregate; thumb/full URL building
    productEnrichment.js           generated image -> product map (see below)
    ecosystemData.js               ZONES · PRODUCT_NODES · STACK_LAYERS · routes · countMatches
    ecosystemCity.js               Three.js scene builders (sky, landmark, zones, conduits, drones)
    copilotKnowledge.js            getShowcaseKnowledge, retrieval, answers, CopilotNote store
    customItems.js                 locally-added plates (localStorage)
    generateReportPdf.js           jsPDF monthly report
    auth.js                        auth API (localStorage-backed)
scripts/
  buildEnrichment.mjs              regenerates src/lib/productEnrichment.js
  smoke.mjs                        browser smoke test (needs puppeteer-core + local Chrome)
inspironics/                       the 235 plates: thumbs/*.webp and full/*.webp
public/data/showcase.json          the corpus
```

## Images

The plates already live in `inspironics/{thumbs,full}` (~48 MB), so they are **not** duplicated into
`public/`. A small Vite plugin in [`vite.config.js`](vite.config.js) serves that folder at `/images`
in dev and copies it into `dist/images` on build. `showcaseData.js` builds every URL as
`/images` + `item.t` (thumbnail) or `/images` + `item.full` (full view).

To point at a different image source, change `BASE` in `src/lib/showcaseData.js` and the
`IMAGE_SRC` path in `vite.config.js`.

## Product enrichment

Five products are named *inside* the artwork but appear in no text field: **Caleido Xenia**,
**Caleido Domi**, **Caleido Kombos**, **Cielo Epic** and **Caleido Mints**.
`src/lib/productEnrichment.js` maps each image id (`item.f`) to the products it carries;
`showcaseData.js` merges those phrases into the item's `extraKeywords`, so the ecosystem product
nodes and free-text search both resolve them (searching `kombos` returns 64 plates).

The map is produced by `npm run enrich`:

- The four "Operating System for Sustainable Infrastructure" plates (`IMG_0557`–`IMG_0560`) were
  read directly off the artwork — each spells out all five product names — and are hard-coded as
  `CONFIRMED_ALL_FIVE`. Xenia and Domi appear only on these.
- The remaining assignments are **inferred** by scoring each plate's category, tech stack, objective
  and architecture against each product's domain, then taking the top N so the totals match the
  audited counts (Kombos 64, Cielo Epic 22, Mints 6).

If you run a full OCR pass over the plates, drop the results into `CONFIRMED_ALL_FIVE`/`SCORES` in
`scripts/buildEnrichment.mjs` and re-run `npm run enrich`. Nothing else needs to change.

## Auth

There is no server in this build, so accounts, OTP codes and reset tokens live in `localStorage`
behind the async `api` object in `src/lib/auth.js` — the signatures and error shapes are what a REST
auth service would expose, so swapping in a backend means replacing those function bodies. Because
no mail is sent, the OTP and reset codes are shown on screen.

For real Google sign-in, set a client ID:

```bash
cp .env.example .env.local
# VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Without it, the Google button falls back to a clearly-labelled demo identity.

Copilot session notes are stored through `CopilotNote` in `src/lib/copilotKnowledge.js`, which
enforces the same predicate the server RLS policy would: a note is readable and writable by its
owner, and by an admin.

## Testing

`npm run check:routes` needs nothing but Node and runs as part of `npm run build`. It asserts that
every clickable node in the Ecosystem Explorer filters the gallery down to at least one plate — a
node that routes to an empty gallery is a dead end, which is exactly how Smart Agri and Smart Energy
were broken before.

The two browser suites need a local Chrome (set `CHROME_PATH` if it is not in the default Windows
location) and the dev server running:

```bash
npm install -D puppeteer-core
npm run dev            # in one terminal

npm run check:routes   # all 18 ecosystem routes resolve
npm run smoke          # auth gate, 3D, gallery, zone pills, lightbox, copilot, PDF, mobile
npm run test:flows     # register/OTP, sign-in, password reset, add-plate, share links, menus
```

Both suites fail on any console error, page exception or failed network request.
