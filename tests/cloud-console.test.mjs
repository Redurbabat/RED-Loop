import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {CloudConsole, downloadName} from '../web/cloud-console.js';

const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
const fixtureJob = {
  id: 'fixture-job', title: 'Fixture-Auftrag', prompt: 'Nur lokale Testdaten.', status: 'running',
  createdAt: '2026-11-07T10:00:00.000Z', updatedAt: '2026-11-07T10:00:01.000Z',
  stepCount: 1, maxSteps: 8, maxDurationMinutes: 30, summary: 'Fixture-Zusammenfassung'
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const json = (data, status = 200) => new Response(JSON.stringify(data), {status, headers: {'Content-Type': 'application/json'}});

function setup(handler) {
  const dom = new JSDOM(html, {url: 'https://red-loop.test/', pretendToBeVisual: true});
  const requests = [];
  const timers = new Map();
  let timerId = 0;
  let hidden = false;
  Object.defineProperty(dom.window.document, 'hidden', {configurable: true, get: () => hidden});
  const console = new CloudConsole(dom.window.document, {
    fetch: async (path, options) => {
      requests.push({path, ...options});
      if (handler) {
        const response = await handler(path, options, requests);
        if (response) return response;
      }
      if (path === '/api/v1/status') return json({service: 'Fixture', version: 'test', provider: 'fixture-only', configured: true, capabilities: ['Text-Artefakte']});
      if (path === '/api/v1/jobs' && options.method === 'GET') return json({jobs: [fixtureJob]});
      if (path === '/api/v1/jobs/fixture-job') return json({job: fixtureJob, steps: [], artifacts: []});
      throw new Error(`Unexpected fixture request: ${path}`);
    },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    makeId: () => 'b2d20c49-1d02-4589-acd0-18d5a6c05fae'
  });
  console.setVisible(true);
  const $ = selector => dom.window.document.querySelector(selector);
  const connect = async () => { $('#cloud-token').value = 'private-fixture-token'; await console.connect(); };
  return {dom, console, $, requests, timers, connect,
    hide(value) { hidden = value; dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange')); },
    close() { console.disconnect(false); dom.window.close(); }
  };
}

test('private token stays in RAM and is sent only in an Authorization header', async () => {
  const app = setup();
  try {
    await app.connect();
    assert.equal(app.$('#cloud-token').type, 'password');
    assert.equal(app.$('#cloud-token').value, '');
    assert.ok(app.requests.length >= 3);
    for (const request of app.requests) {
      assert.equal(request.headers.Authorization, 'Bearer private-fixture-token');
      assert.equal(request.credentials, 'omit');
      assert.equal(request.redirect, 'error');
      assert.equal(request.path.includes('private-fixture-token'), false);
    }
    assert.equal(app.dom.window.localStorage.length, 0);
    assert.equal(app.dom.window.sessionStorage.length, 0);
    assert.equal(app.dom.serialize().includes('private-fixture-token'), false);
    app.console.disconnect();
    const before = app.requests.length;
    await app.console.refresh();
    assert.equal(app.requests.length, before);
    assert.match(app.$('#cloud-message').textContent, /Serveraufträge laufen weiter/);
  } finally { app.close(); }
});

test('server text is rendered as text and never interpreted as markup', async () => {
  const attack = '<img src=x onerror="window.fixtureAttack=true">';
  const app = setup(path => {
    if (path === '/api/v1/jobs') return json({jobs: [{...fixtureJob, title: attack}]});
    if (path === '/api/v1/jobs/fixture-job') return json({job: {...fixtureJob, title: attack, summary: attack, prompt: attack}, steps: [{index: 1, summary: attack, output: attack, status: 'completed', createdAt: fixtureJob.createdAt}], artifacts: [{name: attack, content: attack}]});
  });
  try {
    await app.connect();
    assert.equal(app.$('#cloud-job-title').textContent, attack);
    assert.equal(app.$('#cloud-job-prompt').textContent, attack);
    assert.equal(app.$('#cloud-steps pre').textContent, attack);
    assert.equal(app.$('#cloud').querySelectorAll('img').length, 0);
    assert.equal(app.dom.window.fixtureAttack, undefined);
  } finally { app.close(); }
});

test('polling pauses on hidden views and documents without stopping server jobs', async () => {
  const app = setup();
  try {
    await app.connect();
    assert.equal(app.timers.size, 1);
    app.console.setVisible(false);
    assert.equal(app.timers.size, 0);
    let count = app.requests.length;
    await app.console.refresh(true);
    assert.equal(app.requests.length, count);
    app.console.setVisible(true);
    await tick();
    app.hide(true);
    assert.equal(app.timers.size, 0);
    count = app.requests.length;
    await app.console.refresh(true);
    assert.equal(app.requests.length, count);
    app.hide(false);
    await tick();
    app.console.togglePolling();
    count = app.requests.length;
    assert.equal(app.timers.size, 0);
    await app.console.refresh(true);
    assert.equal(app.requests.length, count);
    assert.match(app.$('#cloud-poll-state').textContent, /Serveraufträge laufen weiter/);
    assert.equal(app.requests.some(request => request.method === 'POST'), false);
  } finally { app.close(); }
});

test('creation validates bounds and retries the same payload with the same UUID key', async () => {
  let attempts = 0;
  const app = setup((path, options) => {
    if (path === '/api/v1/jobs' && options.method === 'POST') {
      attempts++;
      if (attempts === 1) throw new TypeError('Fixture network interruption');
      return json({job: fixtureJob}, 201);
    }
  });
  try {
    await app.connect();
    app.$('#cloud-title').value = 'Begrenzter Fixture-Auftrag';
    app.$('#cloud-prompt').value = 'Erstelle einen kurzen Text.';
    app.$('#cloud-max-steps').value = '51';
    await app.console.create();
    assert.equal(attempts, 0);
    app.$('#cloud-max-steps').value = '8';
    await app.console.create();
    await app.console.create();
    const creations = app.requests.filter(request => request.method === 'POST');
    assert.equal(creations.length, 2);
    assert.equal(creations[0].headers['Idempotency-Key'], creations[1].headers['Idempotency-Key']);
    assert.match(creations[0].headers['Idempotency-Key'], /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
    assert.deepEqual(JSON.parse(creations[1].body), {title: 'Begrenzter Fixture-Auftrag', prompt: 'Erstelle einen kurzen Text.', maxSteps: 8, maxDurationMinutes: 30});
    assert.match(app.$('#cloud-message').textContent, /serverseitig gespeichert/);
  } finally { app.close(); }
});

test('hiding during a pending refresh cannot start a later detail request', async () => {
  let finishStatus;
  const status = new Promise(resolve => { finishStatus = resolve; });
  const app = setup(path => path === '/api/v1/status' ? status : undefined);
  try {
    const connecting = app.connect();
    app.console.setVisible(false);
    finishStatus(json({service: 'Fixture', version: 'test', provider: 'fixture-only', configured: true, capabilities: []}));
    await connecting;
    assert.equal(app.requests.some(request => request.path === '/api/v1/jobs/fixture-job'), false);
    assert.equal(app.timers.size, 0);
  } finally { app.close(); }
});

test('authentication failure clears the token and reports the rejected private access', async () => {
  const app = setup(() => json({error: 'Access denied'}, 401));
  try {
    await app.connect();
    assert.equal(app.$('#cloud-login').hidden, false);
    assert.equal(app.$('#cloud-error').hidden, false);
    assert.match(app.$('#cloud-error').textContent, /Zugang abgelehnt/);
    assert.equal(app.timers.size, 0);
    const count = app.requests.length;
    await app.console.refresh();
    assert.equal(app.requests.length, count);
  } finally { app.close(); }
});

test('unconfigured provider is shown honestly and prevents creating or resuming jobs', async () => {
  const app = setup(path => path === '/api/v1/status'
    ? json({service: 'Fixture', version: 'test', provider: 'none', configured: false, capabilities: []}) : undefined);
  try {
    await app.connect();
    assert.match(app.$('#cloud-configured').textContent, /Keine KI eingerichtet/);
    assert.equal(app.$('#cloud-create-fields').disabled, true);
    assert.equal(app.$('#cloud-resume').disabled, true);
    await app.console.create();
    assert.equal(app.requests.some(request => request.method === 'POST'), false);
  } finally { app.close(); }
});

test('pause, resume and stop call explicit server actions, while download uses an authenticated blob', async () => {
  let job = {...fixtureJob};
  const app = setup((path, options) => {
    if (path === '/api/v1/jobs' && options.method === 'GET') return json({jobs: [job]});
    if (path === '/api/v1/jobs/fixture-job') return json({job, steps: [], artifacts: [{name: 'plan.txt', content: 'Fixture'}]});
    for (const [action, status] of [['pause', 'paused'], ['resume', 'running'], ['stop', 'stopped']]) {
      if (path === `/api/v1/jobs/fixture-job/${action}`) { job = {...job, status}; return json({job}); }
    }
    if (path === '/api/v1/jobs/fixture-job/artifacts/plan.txt') return new Response('Fixture artifact text');
  });
  try {
    await app.connect();
    await app.console.action('pause');
    assert.equal(app.$('#cloud-job-status').textContent, 'Pausiert');
    assert.equal(app.$('#cloud-resume').disabled, false);
    await app.console.action('resume');
    assert.equal(app.$('#cloud-job-status').textContent, 'Läuft');
    await app.console.action('stop');
    assert.equal(app.$('#cloud-stop').disabled, true);
    let created = 0;
    app.dom.window.URL.createObjectURL = () => { created++; return 'blob:https://red-loop.test/local-fixture'; };
    app.dom.window.URL.revokeObjectURL = () => {};
    app.dom.window.HTMLAnchorElement.prototype.click = function () {
      assert.equal(this.download, 'plan.txt');
      assert.equal(this.href.includes('private-fixture-token'), false);
    };
    await app.console.download('fixture-job', 'plan.txt', app.$('#cloud-artifacts button'));
    assert.equal(created, 1);
    assert.ok(app.requests.find(request => request.path.endsWith('/artifacts/plan.txt') && request.headers.Authorization === 'Bearer private-fixture-token'));
  } finally { app.close(); }
});

test('artifact filenames cannot traverse directories or contain platform control characters', () => {
  assert.equal(downloadName('../a\\b:plan?.txt'), '.._a_b_plan_.txt');
  assert.equal(downloadName(''), 'artefakt.txt');
  assert.equal(downloadName('a'.repeat(200)).length, 160);
});
