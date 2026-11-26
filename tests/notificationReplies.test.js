'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('client and technician dashboards expose one-reply notification controls', () => {
  const client = fs.readFileSync(path.join(__dirname, '../src/screens/client/ClientDashboard.js'), 'utf8');
  const technician = fs.readFileSync(path.join(__dirname, '../src/screens/technician/TechnicianDashboard.js'), 'utf8');
  assert.match(client, /openClientNotification/);
  assert.match(client, /submitClientNotificationReply/);
  assert.match(client, /notifications\/client\/[\s\S]*?\/reply/);
  assert.match(technician, /openTechnicianNotification/);
  assert.match(technician, /submitTechnicianNotificationReply/);
  assert.match(technician, /notifications\/fanni\/[\s\S]*?\/reply/);
  assert.match(client, /item\.replyEnabled/);
  assert.match(technician, /item\.replyEnabled/);
  assert.match(client, /notificationsOpen\)[\s\S]*?item\.replyEnabled && !item\.reply/);
  assert.match(technician, /notificationsOpen\)[\s\S]*?item\.replyEnabled && !item\.reply/);
  const clientAutoOpenEffect = client.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[notificationsOpen, notifications\?\.items\]\);/)?.[0] || '';
  const technicianAutoOpenEffect = technician.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[notificationsOpen, notifications\?\.items\]\);/)?.[0] || '';
  assert.ok(clientAutoOpenEffect, 'client pending reply auto-open effect exists');
  assert.ok(technicianAutoOpenEffect, 'technician pending reply auto-open effect exists');
  assert.doesNotMatch(clientAutoOpenEffect, /setNotificationReplyDraft\(['\"]{2}\)/, 'client refresh must not clear typed reply');
  assert.doesNotMatch(technicianAutoOpenEffect, /setNotificationReplyDraft\(['\"]{2}\)/, 'technician refresh must not clear typed reply');
  assert.ok(!client.includes('رد واحد للإدارة'));
  assert.ok(!technician.includes('رد واحد للإدارة'));
});
