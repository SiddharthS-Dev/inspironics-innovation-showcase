/**
 * Initial-payload budget.
 *
 *   node scripts/checkBundle.mjs        (after `vite build`)
 *
 * Reads dist/index.html, takes the entry script plus everything it
 * modulepreloads — the JavaScript a first-time visitor downloads before
 * anything renders — and fails if it exceeds the budget.
 *
 * This exists because of a regression it would have caught immediately: a
 * `manualChunks` entry made Rollup host Vite's dynamic-import preload helper
 * inside the jsPDF chunk, so the entry statically imported it and every visitor
 * fetched 114 KB gzipped of PDF machinery to look at the login page. The eager
 * payload was 209 KB gz and nothing in the build output said so.
 */
import { gzipSync } from 'node:zlib'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')

/** Headroom over the current 58 KB, tight enough that a vendor slip trips it. */
const BUDGET_KB = 90

const html = path.join(DIST, 'index.html')
if (!existsSync(html)) {
  console.error('  no dist/index.html — run `vite build` first')
  process.exit(1)
}

const markup = readFileSync(html, 'utf8')

// the entry <script type="module"> plus every <link rel="modulepreload">
const eager = [...new Set([...markup.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]))]

if (eager.length === 0) {
  console.error('  could not find any entry script in dist/index.html')
  process.exit(1)
}

const kb = (n) => n / 1024
let total = 0
const rows = eager.map((asset) => {
  const size = kb(gzipSync(readFileSync(path.join(DIST, asset.replace(/^\//, '')))).length)
  total += size
  return { asset: path.basename(asset), size }
})

rows.sort((a, b) => b.size - a.size)
for (const r of rows) console.log(`  ${r.asset.padEnd(36)} ${r.size.toFixed(1).padStart(7)} KB gz`)
console.log(`  ${'—'.repeat(36)} ${'—'.repeat(7)}`)
console.log(`  ${'initial payload'.padEnd(36)} ${total.toFixed(1).padStart(7)} KB gz  (budget ${BUDGET_KB})`)

if (total > BUDGET_KB) {
  console.error(
    `\n  Initial payload is ${total.toFixed(1)} KB gz, over the ${BUDGET_KB} KB budget.\n` +
      '  Something large became a static dependency of the entry. Check\n' +
      "  manualChunks in vite.config.js and any barrel that app/routes.jsx imports.\n"
  )
  process.exit(1)
}

console.log(`  ok   initial payload within budget (${eager.length} eager chunk(s))`)
