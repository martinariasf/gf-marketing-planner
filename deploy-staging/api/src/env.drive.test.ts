import { test } from 'node:test'
import assert from 'node:assert/strict'

// GF-80. env.ts reads process.env once at module-evaluation time, so set the var
// BEFORE the dynamic import (a static import would hoist and evaluate env.ts
// first). This lives in its own file so it gets a fresh process / module cache,
// independent of env.test.ts (which imports env.js with a different env).

test('resolveDriveShareEmail: mapped slug wins; absent/garbage → null', async () => {
  process.env.DRIVE_SHARE_EMAILS_JSON = JSON.stringify({
    'gf-internal': 'viktor-staging-demo@gf-agents-drive.iam.gserviceaccount.com',
    blank: '', // empty string is dropped → resolves to null
    bad: 123, // non-string is dropped → resolves to null
  })
  const { resolveDriveShareEmail } = await import('./env.js')

  assert.equal(
    resolveDriveShareEmail('gf-internal'),
    'viktor-staging-demo@gf-agents-drive.iam.gserviceaccount.com',
  )
  assert.equal(resolveDriveShareEmail('blank'), null) // present-but-empty → null
  assert.equal(resolveDriveShareEmail('bad'), null) // present-but-non-string → null
  assert.equal(resolveDriveShareEmail('absent'), null) // absent → null
})
