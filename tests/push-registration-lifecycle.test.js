'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('native push registration cleanup keeps device token; logout explicitly unregisters it', () => {
  const hook = fs.readFileSync(path.join(root, 'src/hooks/usePushNotifications.js'), 'utf8');
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  const cleanupStart = hook.indexOf('return () => {');
  const cleanupEnd = hook.indexOf('\n    };', cleanupStart);
  assert.ok(cleanupStart >= 0 && cleanupEnd > cleanupStart, 'push effect cleanup should exist');
  const cleanup = hook.slice(cleanupStart, cleanupEnd);
  assert.match(cleanup, /responseSubscription\.remove\(\)/);
  assert.match(cleanup, /tokenRefreshSubscription\.remove\(\)/);
  assert.doesNotMatch(cleanup, /push-token/);
  assert.match(screens, /performLogout[\s\S]*?\/notifications\/['"]?\s*\+\s*activeSession\.role\s*\+\s*['"]\/push-token/);
});
