import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { computeUsage, type OpenRouterActivityRow, type OpenRouterGuardrailData, type OpenRouterKeyData } from './usage.js'

// All three fixtures were captured live against the OpenRouter account on
// 2026-09-04 (see plans/2026-09-04-gf104-usage-section-technical-plan.md).
// They carry a UTF-8 BOM from the PowerShell capture step — stripped below.
// No network calls happen in this file.
const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'openrouter')

function loadFixture<T>(name: string): T {
  const raw = readFileSync(path.join(FIXTURES_DIR, name), 'utf8').replace(/^﻿/, '')
  return JSON.parse(raw) as T
}

const keyFixture = loadFixture<{ data: OpenRouterKeyData }>('key.json').data
const guardrailFixture = loadFixture<{ data: OpenRouterGuardrailData }>('guardrail.json').data
const activityFixture = loadFixture<{ data: OpenRouterActivityRow[] }>('activity.json').data

// The fixture's `usage_monthly` (5.11427399) and the guardrail's `limit_usd`
// (100) were captured on the same day, so pinning `now` to that day keeps the
// "current calendar month" activity filter aligned with what the fixture
// actually contains (rows span both 2026-08 and 2026-09).
const CAPTURE_DAY = new Date('2026-09-04T12:00:00Z')

test('computeUsage: percentUsed is key.usage_monthly / guardrail.limit_usd, clamped 0..1', () => {
  const result = computeUsage(keyFixture, guardrailFixture, activityFixture, CAPTURE_DAY)
  assert.equal(result.hasLimit, true)
  const expected = keyFixture.usage_monthly / guardrailFixture.limit_usd
  assert.ok(Math.abs(result.percentUsed - expected) < 1e-9, `expected ~${expected}, got ${result.percentUsed}`)
  assert.ok(result.percentUsed >= 0 && result.percentUsed <= 1)
})

test('computeUsage: never leaks a raw USD field in the returned object', () => {
  const result = computeUsage(keyFixture, guardrailFixture, activityFixture, CAPTURE_DAY)
  const json = JSON.stringify(result)
  assert.ok(!json.includes('usage_monthly'), 'usage_monthly leaked')
  assert.ok(!json.includes('limit_usd'), 'limit_usd leaked')
  assert.ok(!json.includes('"usage"'), 'usage leaked')
})

test('computeUsage: non-monthly reset_interval -> hasLimit false, percentUsed not computed from the mismatched limit', () => {
  const weeklyGuardrail: OpenRouterGuardrailData = { ...guardrailFixture, reset_interval: 'weekly' }
  const result = computeUsage(keyFixture, weeklyGuardrail, activityFixture, CAPTURE_DAY)
  assert.equal(result.hasLimit, false)
  assert.equal(result.percentUsed, 0)
})

test('computeUsage: known models split into writing/image/video via substring match', () => {
  // Categories now cover the last 30 days, so pinning `now` to the fixture's
  // capture day (2026-09-04) pulls in the full 2026-08-04..2026-09-03 span,
  // which includes rows in every non-audio category.
  const result = computeUsage(keyFixture, guardrailFixture, activityFixture, CAPTURE_DAY)
  assert.ok(result.categories.writing > 0, 'kimi-k3 + claude-opus rows should land in writing')
  assert.ok(result.categories.image > 0, 'gemini flash-image rows should land in image')
  assert.ok(result.categories.video > 0, 'seedance rows should land in video')
  assert.equal(result.categories.audio, 0, 'no audio model in the fixture yet')
})

test('computeUsage: unmapped model falls into writing and is never dropped', () => {
  const now = new Date('2026-09-10T00:00:00Z')
  const activity: OpenRouterActivityRow[] = [
    { date: '2026-09-05 00:00:00', model: 'mystery-labs/some-new-model', usage: 10, requests: 1 } as OpenRouterActivityRow,
  ]
  const originalWarn = console.warn
  let warnCount = 0
  console.warn = (..._args: unknown[]) => {
    warnCount += 1
  }
  try {
    const first = computeUsage(keyFixture, guardrailFixture, activity, now)
    assert.equal(first.categories.image, 0)
    assert.equal(first.categories.video, 0)
    assert.ok(first.categories.writing > 0, 'unmapped model usage must not be silently dropped')

    // Second call with the same unmapped model must not warn again (dedupe by Set).
    computeUsage(keyFixture, guardrailFixture, activity, now)
  } finally {
    console.warn = originalWarn
  }
  assert.equal(warnCount, 1, 'unmapped model should log exactly once per process')
})

test('computeUsage: categories sum to 1', () => {
  const result = computeUsage(keyFixture, guardrailFixture, activityFixture, CAPTURE_DAY)
  const categorySum = result.categories.writing + result.categories.image + result.categories.video + result.categories.audio
  assert.ok(Math.abs(categorySum - 1) < 1e-9, `categories should sum to 1, got ${categorySum}`)
})

test('computeUsage: only rows within the last 30 days are counted', () => {
  const now = new Date('2026-09-04T12:00:00Z')
  const activity: OpenRouterActivityRow[] = [
    // More than 30 days before `now` — must be excluded.
    { date: '2026-08-04 00:00:00', model: 'moonshotai/kimi-k3', usage: 999, requests: 1 } as OpenRouterActivityRow,
    // Within the last 30 days — must be counted.
    { date: '2026-09-01 00:00:00', model: 'moonshotai/kimi-k3', usage: 1, requests: 1 } as OpenRouterActivityRow,
  ]
  const guardrail: OpenRouterGuardrailData = { limit_usd: 100, reset_interval: 'monthly' }
  const key: OpenRouterKeyData = { usage_monthly: 1 }
  const result = computeUsage(key, guardrail, activity, now)
  // If the stale row leaked in, writing's share of a 1000-total would be
  // ~99.9% instead of the full 1 it gets once that row is excluded.
  assert.equal(result.categories.writing, 1)
})

test('computeUsage: zero activity in the 30-day window -> all categories 0, no NaN', () => {
  const now = new Date('2026-09-04T12:00:00Z')
  const guardrail: OpenRouterGuardrailData = { limit_usd: 100, reset_interval: 'monthly' }
  const key: OpenRouterKeyData = { usage_monthly: 5 }
  const result = computeUsage(key, guardrail, [], now)
  assert.equal(result.categories.writing, 0)
  assert.equal(result.categories.image, 0)
  assert.equal(result.categories.video, 0)
  assert.equal(result.categories.audio, 0)
  for (const value of Object.values(result.categories)) {
    assert.ok(!Number.isNaN(value), 'category value must not be NaN')
  }
  // percentUsed is still computed independently of the (empty) 30-day window.
  assert.ok(Math.abs(result.percentUsed - 0.05) < 1e-9)
})
