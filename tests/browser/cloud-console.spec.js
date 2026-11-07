import {test, expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// All API responses in this file are local fixtures. No production job is created.
const token = 'fixture-private-token';
const injection = '<img src=x onerror="window.fixtureAttack=true">';
const baseJob = {
  id: 'fixture-cloud-job', title: 'Dokumentation zusammenfassen', prompt: 'Nur ein lokaler Browser-Test.',
  status: 'running', createdAt: '2026-11-07T10:00:00.000Z', updatedAt: '2026-11-07T10:01:00.000Z',
  stepCount: 1, maxSteps: 8, maxDurationMinutes: 30, summary: 'Eine Zusammenfassung aus lokalen Testdaten.'
};

async function fixture(page, options = {}) {
  const calls = [];
  let job = {...baseJob, ...options.job};
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    calls.push({path: url.pathname, method: request.method(), headers: request.headers(), body: request.postDataJSON()});
    expect(request.headers().authorization).toBe(`Bearer ${token}`);
    expect(url.search).toBe('');
    if (options.unauthorized) return route.fulfill({status: 401, json: {error: 'Fixture: abgelehnt'}});
    if (url.pathname.endsWith('/status')) return route.fulfill({json: {service: 'Lokale Browser-Fixture', version: 'test', provider: 'fixture-only', configured: options.configured !== false, capabilities: ['Text-Artefakte', 'Öffentliche Dokumentation']}});
    if (url.pathname.endsWith('/artifacts/plan.txt')) return route.fulfill({contentType: 'text/plain;charset=utf-8', body: 'Lokales Fixture-Artefakt'});
    if (url.pathname.endsWith('/jobs') && request.method() === 'POST') {
      job = {...job, ...request.postDataJSON(), status: 'queued'};
      return route.fulfill({status: 201, json: {job}});
    }
    if (url.pathname.endsWith('/jobs')) return route.fulfill({json: {jobs: [job]}});
    for (const [action, status] of [['pause', 'paused'], ['resume', 'running'], ['stop', 'stopped']]) {
      if (url.pathname.endsWith(`/${action}`)) { job = {...job, status}; return route.fulfill({json: {job}}); }
    }
    return route.fulfill({json: {job, steps: [{index: 1, createdAt: job.updatedAt, summary: 'Lokaler Prüfschritt', output: options.output || 'Fixture-Ausgabe', status: 'completed'}], artifacts: [{name: 'plan.txt', content: 'Lokales Fixture-Artefakt'}]}});
  });
  await page.goto('/#cloud');
  await page.getByLabel('Privater Zugangstoken', {exact: true}).fill(token);
  await page.getByRole('button', {name: 'Verbinden', exact: true}).click();
  return calls;
}

test('cloud tab connects privately, shows durable jobs and allows explicit controls', async ({page}, testInfo) => {
  const calls = await fixture(page);
  await expect(page.locator('#cloud-job-title')).toHaveText(baseJob.title);
  await expect(page.locator('#cloud-token')).toHaveValue('');
  await expect(page.locator('#cloud-connection')).toContainText('KI bereit');
  if (['windows-chromium', 'iphone-webkit'].includes(testInfo.project.name)) {
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({colorScheme, reducedMotion: 'reduce'});
      await page.screenshot({path: `docs/previews/cloud-console-${testInfo.project.name}-${colorScheme}.png`, fullPage: true, animations: 'disabled'});
    }
    await page.emulateMedia({colorScheme: 'light'});
  }
  await page.getByRole('button', {name: 'Auftrag pausieren', exact: true}).click();
  await expect(page.locator('#cloud-job-status')).toHaveText('Pausiert');
  await page.getByRole('button', {name: 'Auftrag fortsetzen', exact: true}).click();
  await expect(page.locator('#cloud-job-status')).toHaveText('Läuft');
  await page.getByRole('button', {name: 'Auftrag stoppen', exact: true}).click();
  await expect(page.locator('#cloud-job-status')).toHaveText('Gestoppt');
  await expect(page.locator('#cloud-stop')).toBeDisabled();
  expect(calls.filter(call => call.method === 'POST').map(call => call.path.split('/').pop())).toEqual(['pause', 'resume', 'stop']);
  const stored = await page.evaluate(() => JSON.stringify({local: {...localStorage}, session: {...sessionStorage}}));
  expect(stored).not.toContain(token);
  expect(await page.content()).not.toContain(token);
});

test('creates a bounded fixture job with an idempotency UUID and downloads through authenticated fetch', async ({page}) => {
  const calls = await fixture(page);
  await expect(page.locator('#cloud-create-fields')).toBeEnabled();
  await page.getByLabel('Titel', {exact: true}).fill('Neuer Fixture-Auftrag');
  await page.getByLabel('Was soll die KI erarbeiten?').fill('Schreibe eine kurze Aufgabenliste.');
  await page.getByLabel('Max. Schritte').fill('3');
  await page.getByLabel('Max. Minuten').fill('10');
  await page.getByRole('button', {name: 'Cloud-Auftrag starten', exact: true}).click();
  await expect(page.locator('#cloud-job-title')).toHaveText('Neuer Fixture-Auftrag');
  const creation = calls.find(call => call.method === 'POST' && call.path.endsWith('/jobs'));
  expect(creation.body).toEqual({title: 'Neuer Fixture-Auftrag', prompt: 'Schreibe eine kurze Aufgabenliste.', maxSteps: 3, maxDurationMinutes: 10});
  expect(creation.headers['idempotency-key']).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', {name: 'plan.txt herunterladen', exact: true}).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe('plan.txt');
  expect(calls.some(call => call.path.endsWith('/artifacts/plan.txt'))).toBe(true);
});

test('pausing the display and navigating away never send a server stop', async ({page}) => {
  const calls = await fixture(page);
  await expect(page.locator('#cloud-job-title')).toHaveText(baseJob.title);
  await page.getByRole('button', {name: 'Anzeigeaktualisierung pausieren', exact: true}).click();
  await expect(page.locator('#cloud-poll-state')).toContainText('Serveraufträge laufen weiter');
  let count = calls.length;
  await page.waitForTimeout(6400);
  expect(calls.length).toBe(count);
  await page.getByRole('button', {name: 'Anzeigeaktualisierung fortsetzen', exact: true}).click();
  await expect.poll(() => calls.length).toBeGreaterThan(count);
  await page.getByRole('link', {name: 'Dashboard', exact: true}).click();
  await page.waitForTimeout(100);
  count = calls.length;
  await page.waitForTimeout(6400);
  expect(calls.length).toBe(count);
  expect(calls.some(call => call.method === 'POST')).toBe(false);
});

test('hostile server text is inert, mobile layout and both color schemes are accessible', async ({page}) => {
  await fixture(page, {job: {title: injection, summary: injection}, output: injection});
  await expect(page.locator('#cloud-job-title')).toHaveText(injection);
  await expect(page.locator('#cloud-steps pre')).toHaveText(injection);
  await expect(page.locator('#cloud img')).toHaveCount(0);
  expect(await page.evaluate(() => window.fixtureAttack)).toBeUndefined();
  await page.setViewportSize({width: 320, height: 900});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({colorScheme, reducedMotion: 'reduce'});
    const results = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations).toEqual([]);
  }
});

test('missing AI and denied private access are reported without claiming a job succeeded', async ({page}) => {
  await fixture(page, {configured: false});
  await expect(page.locator('#cloud-configured')).toContainText('Keine KI eingerichtet');
  await expect(page.getByRole('button', {name: 'Cloud-Auftrag starten', exact: true})).toBeDisabled();
  await page.getByRole('button', {name: 'Abmelden', exact: true}).click();
  await page.unroute('**/api/v1/**');
  await page.route('**/api/v1/**', route => route.fulfill({status: 401, json: {error: 'Fixture: abgelehnt'}}));
  await page.getByLabel('Privater Zugangstoken', {exact: true}).fill(token);
  await page.getByRole('button', {name: 'Verbinden', exact: true}).click();
  await expect(page.locator('#cloud-error')).toContainText('Zugang abgelehnt');
  await expect(page.locator('#cloud-login')).toBeVisible();
  await expect(page.locator('#cloud-token')).toHaveValue('');
});
