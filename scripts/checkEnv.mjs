import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, '.env.local')

const messages = []

if (!fs.existsSync(envPath)) {
  messages.push('Missing .env.local. Copy .env.example to .env.local before deploying.')
} else {
  const content = fs.readFileSync(envPath, 'utf8')
  const vars = Object.fromEntries(
    content.split(/\r?\n/)
      .filter((line) => line.includes('='))
      .filter((line) => !line.trimStart().startsWith('#'))
      .map((line) => {
        const [key, ...rest] = line.split('=')
        return [key.trim(), rest.join('=').trim()]
      })
  )

  if (!vars.VITE_GOOGLE_CLIENT_ID) {
    messages.push('VITE_GOOGLE_CLIENT_ID is not set. Google sign-in will remain in demo mode.')
  }

  if (vars.VITE_ERROR_ENDPOINT && !/^https?:\/\//i.test(vars.VITE_ERROR_ENDPOINT)) {
    messages.push('VITE_ERROR_ENDPOINT should be an absolute http(s) URL when configured.')
  }
}

if (messages.length) {
  console.warn('\nDeployment check warnings:')
  for (const message of messages) console.warn(`- ${message}`)
  process.exitCode = 0
} else {
  console.log('Deployment config looks ready.')
}
