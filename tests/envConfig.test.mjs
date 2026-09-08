import { strict as assert } from 'node:assert'
import test from 'node:test'

const { parseEnvFile } = await import('../scripts/checkEnv.mjs')

test('parseEnvFile accepts env values with comments and preserves URL values', () => {
  const result = parseEnvFile(`
# comment
VITE_GOOGLE_CLIENT_ID=abc.apps.googleusercontent.com
VITE_ERROR_ENDPOINT=https://example.com/api/errors
OTHER=ignored
`)

  assert.equal(result.VITE_GOOGLE_CLIENT_ID, 'abc.apps.googleusercontent.com')
  assert.equal(result.VITE_ERROR_ENDPOINT, 'https://example.com/api/errors')
})

test('parseEnvFile ignores blank and commented values', () => {
  const result = parseEnvFile(`
# comment
VITE_GOOGLE_CLIENT_ID=
VITE_ERROR_ENDPOINT=
`)

  assert.equal(result.VITE_GOOGLE_CLIENT_ID, '')
  assert.equal(result.VITE_ERROR_ENDPOINT, '')
})
