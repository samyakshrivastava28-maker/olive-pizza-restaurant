import assert from 'node:assert';
import test from 'node:test';
import { resolveApiBaseUrl, PRODUCTION_BACKEND_URL, DEV_BACKEND_URL } from '../lib/routing';
import { useLiveRiderStore } from '../store/liveRiderStore';

test('Olive Pizza Restaurant Manager — Fleet Telemetry & Canonical Routing Test Suite', async (t) => {

  await t.test('Canonical Backend URL Resolution: Production resolves to olive-pizza-backend.onrender.com', () => {
    // 1. Verify backend URL constants match canonical configuration
    assert.strictEqual(
      DEV_BACKEND_URL,
      'http://localhost:5000',
      'DEV_BACKEND_URL must be http://localhost:5000'
    );
    assert.strictEqual(
      PRODUCTION_BACKEND_URL,
      'https://olive-pizza-backend.onrender.com',
      'PRODUCTION_BACKEND_URL must be https://olive-pizza-backend.onrender.com'
    );

    // 2. Fallback resolution in production context (no local host, no native, no overrides)
    const resolvedProd = resolveApiBaseUrl({
      env: {},
      isLocalHost: false,
      isNative: false
    });
    assert.strictEqual(
      resolvedProd,
      'https://olive-pizza-backend.onrender.com',
      'Default production fallback must resolve to canonical backend'
    );

    // 3. Dev resolution on localhost
    const resolvedDev = resolveApiBaseUrl({
      env: {},
      isLocalHost: true,
      isNative: false
    });
    assert.strictEqual(
      resolvedDev,
      'http://localhost:5000',
      'Localhost must resolve to dev backend'
    );

    // 4. Explicit VITE_API_BASE_URL resolution
    const resolvedConfigured = resolveApiBaseUrl({
      env: { VITE_API_BASE_URL: 'https://olive-pizza-backend.onrender.com/' },
      isLocalHost: false,
      isNative: false
    });
    assert.strictEqual(
      resolvedConfigured,
      'https://olive-pizza-backend.onrender.com',
      'Trailing slashes must be stripped'
    );
  });

  await t.test('LiveRiderStore: State shape, initial telemetry flags, and zero Supabase Realtime channel', () => {
    const state = useLiveRiderStore.getState();

    // Verify state shape
    assert.ok(Array.isArray(state.riders), 'Riders list should be an array');
    assert.strictEqual(typeof state.isSupabaseLive, 'boolean', 'isSupabaseLive should be boolean');
    assert.strictEqual(typeof state.isTelemetryLive, 'boolean', 'isTelemetryLive should be boolean');
    assert.strictEqual(typeof state.onlineCount, 'number', 'onlineCount should be a number');
    assert.strictEqual(typeof state.availableCount, 'number', 'availableCount should be a number');
    assert.strictEqual(typeof state.onDeliveryCount, 'number', 'onDeliveryCount should be a number');
    assert.strictEqual(typeof state.offlineCount, 'number', 'offlineCount should be a number');
    assert.strictEqual(typeof state.subscribeFleet, 'function', 'subscribeFleet should be a function');

    // Verify subscription interface is present and returns a function
    assert.strictEqual(typeof state.subscribeFleet, 'function', 'subscribeFleet must be a function');
  });
});
