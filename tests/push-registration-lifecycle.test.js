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
  assert.match(screens, /api\('\/notifications\/'\s*\+\s*activeSession\.role\s*\+\s*'\/push-token'/);
});

test('technician unread notifications replay as deduplicated native alerts after login', () => {
  const screens = fs.readFileSync(path.join(root, 'src/screens/AppScreens.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(root, 'src/screens/technician/TechnicianDashboard.js'), 'utf8');
  assert.match(screens, /api\(\`\/notifications\/\$\{role\}\`/);
  assert.match(screens, /items\.filter\(item => !\(item\.read \|\| item\.readAt\)\)/);
  assert.match(screens, /Notifications\.scheduleNotificationAsync/);
  assert.match(screens, /SecureStore\.getItemAsync\(ledgerKey\)/);
  assert.match(screens, /getPresentedNotificationsAsync/);
  assert.match(screens, /hamzawy_sat_notification_v12_wow_loud\.ogg/);
  assert.match(dashboard, /مطلوب استكمال بيانات حسابك/);
  assert.match(dashboard, /reviewFields\.map/);
  assert.match(dashboard, /reviewImages\.map/);
  assert.match(dashboard, /submitTechnicianResubmission\(reviewDataDraft\)/);
  assert.match(dashboard, /submitTechnicianResubmission/);
});
