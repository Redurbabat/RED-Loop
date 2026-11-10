const STATUS = {
  queued: 'Wartet', running: 'Läuft', paused: 'Pausiert', completed: 'Abgeschlossen',
  needs_input: 'Eingabe erforderlich', stopped: 'Gestoppt', failed: 'Fehlgeschlagen', limit_reached: 'Limit erreicht',
  discarded: 'Verworfen', interrupted: 'Unterbrochen'
};
const TERMINAL = new Set(['completed', 'stopped', 'failed', 'limit_reached']);
const CAPABILITY = {
  persistent_jobs: 'Gespeicherte Aufträge', bounded_steps: 'Schrittlimits', text_artifacts: 'Textdateien',
  public_documentation_read: 'Öffentliche Dokumentation', pause_resume_stop: 'Pause, Fortsetzen und Stopp'
};
const dateLabel = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('de-CH', {dateStyle: 'medium', timeStyle: 'short'});
};
const string = value => typeof value === 'string' ? value : '';

export function downloadName(value) {
  return string(value).replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '_').slice(0, 160) || 'artefakt.txt';
}

export class CloudConsole {
  #token = '';
  #session = 0;
  #selected = null;
  #detailVersion = 0;
  #visible = false;
  #pollPaused = false;
  #pollTimer = null;
  #controllers = new Set();
  #readControllers = new Set();
  #refreshPromise = null;
  #service = null;
  #job = null;
  #detail = null;
  #jobs = [];
  #busy = false;
  #draftKey = null;
  #draftSignature = null;

  constructor(document, options = {}) {
    this.document = document;
    this.window = document.defaultView;
    this.fetch = options.fetch || this.window.fetch.bind(this.window);
    this.schedule = options.setTimeout || this.window.setTimeout.bind(this.window);
    this.cancel = options.clearTimeout || this.window.clearTimeout.bind(this.window);
    this.makeId = options.makeId || (() => this.window.crypto.randomUUID());
    this.pollMs = options.pollMs || 6000;
    this.$ = selector => document.querySelector(selector);
    this.$('#cloud-login').addEventListener('submit', event => { event.preventDefault(); void this.connect(); });
    this.$('#cloud-logout').addEventListener('click', () => this.disconnect());
    this.$('#cloud-create').addEventListener('submit', event => { event.preventDefault(); void this.create(); });
    this.$('#cloud-refresh').addEventListener('click', () => { void this.refresh(); });
    this.$('#cloud-poll').addEventListener('click', () => this.togglePolling());
    this.$('#cloud-export').addEventListener('click', () => this.exportReport());
    for (const action of ['pause', 'resume', 'stop']) {
      this.$(`#cloud-${action}`).addEventListener('click', () => { void this.action(action); });
    }
    document.addEventListener('visibilitychange', () => this.#updatePolling());
    this.window.addEventListener('pagehide', () => this.disconnect(false));
    this.#renderConnection();
  }

  #element(tag, className, text) {
    const element = this.document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  }

  #message(text = '') {
    this.$('#cloud-message').textContent = text;
  }

  #error(error) {
    if (error?.name === 'AbortError') return;
    const raw = error instanceof Error ? error.message : 'Die Cloud-Anfrage ist fehlgeschlagen.';
    const message = this.#token ? raw.split(this.#token).join('[entfernt]') : raw;
    this.$('#cloud-error').textContent = message.slice(0, 1000);
    this.$('#cloud-error').hidden = false;
  }

  #clearError() {
    this.$('#cloud-error').hidden = true;
    this.$('#cloud-error').textContent = '';
  }

  #canPoll() {
    return Boolean(this.#token) && this.#visible && !this.document.hidden && !this.#pollPaused;
  }

  #clearPoll() {
    if (this.#pollTimer !== null) this.cancel(this.#pollTimer);
    this.#pollTimer = null;
  }

  #queuePoll() {
    this.#clearPoll();
    if (this.#canPoll()) this.#pollTimer = this.schedule(() => { this.#pollTimer = null; void this.refresh(true); }, this.pollMs);
  }

  #updatePolling() {
    this.#clearPoll();
    if (!this.#visible || this.document.hidden) {
      for (const controller of this.#readControllers) controller.abort();
    } else if (this.#canPoll()) {
      void this.refresh(true);
    }
    this.#renderPolling();
  }

  setVisible(visible) {
    this.#visible = visible;
    this.#updatePolling();
  }

  togglePolling() {
    this.#pollPaused = !this.#pollPaused;
    this.#updatePolling();
    this.#message(this.#pollPaused
      ? 'Anzeigeaktualisierung pausiert. Deine Cloud-Aufträge laufen serverseitig weiter.'
      : 'Anzeigeaktualisierung wieder aktiv.');
  }

  #renderPolling() {
    this.$('#cloud-poll').textContent = this.#pollPaused ? 'Anzeigeaktualisierung fortsetzen' : 'Anzeigeaktualisierung pausieren';
    this.$('#cloud-poll').setAttribute('aria-pressed', String(this.#pollPaused));
    this.$('#cloud-poll-state').textContent = !this.#token ? 'Noch nicht verbunden.' : this.#pollPaused
      ? 'Anzeige pausiert · Serveraufträge laufen weiter.'
      : this.#visible && !this.document.hidden ? 'Anzeige wird alle 6 Sekunden aktualisiert.' : 'Anzeige ruht, solange dieser Tab nicht sichtbar ist.';
  }

  #renderConnection() {
    const connected = Boolean(this.#token);
    this.$('#cloud-login').hidden = connected;
    this.$('#cloud-logout').hidden = !connected;
    this.$('#cloud-refresh').hidden = !connected;
    this.$('#cloud-poll').hidden = !connected;
    this.$('#cloud-connected').hidden = !connected;
    this.$('#cloud-create-fields').disabled = !connected || this.#service?.configured !== true || this.#busy;
    this.$('#cloud-connection').textContent = !connected ? 'Privater Zugang' : this.#service
      ? this.#service.configured ? 'Verbunden · KI bereit' : 'Verbunden · KI nicht eingerichtet'
      : 'Verbindung wird geprüft …';
    this.#renderPolling();
    this.#renderActions();
  }

  #renderService(service) {
    this.#service = service;
    this.$('#cloud-service').textContent = [string(service.service), service.version ? `v${service.version}` : ''].filter(Boolean).join(' · ') || 'Cloud-Dienst';
    this.$('#cloud-provider').textContent = service.provider ? String(service.provider) : 'Nicht angegeben';
    this.$('#cloud-configured').textContent = service.configured === true ? 'KI ist eingerichtet.' : 'Keine KI eingerichtet. Neue Aufträge und Fortsetzungen sind derzeit nicht verfügbar.';
    const capabilities = Array.isArray(service.capabilities) ? service.capabilities.filter(value => typeof value === 'string') : [];
    this.$('#cloud-capabilities').textContent = capabilities.length ? capabilities.map(value => CAPABILITY[value] || value).join(' · ') : 'Der Dienst meldet keine zusätzlichen Fähigkeiten.';
    this.#renderConnection();
  }

  async #request(path, {method = 'GET', body, idempotencyKey, text = false} = {}) {
    if (!this.#token) throw new Error('Bitte zuerst mit deinem privaten Zugangstoken verbinden.');
    const session = this.#session;
    const controller = new AbortController();
    this.#controllers.add(controller);
    if (method === 'GET') this.#readControllers.add(controller);
    try {
      const headers = {Authorization: `Bearer ${this.#token}`, Accept: text ? 'text/plain' : 'application/json'};
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
      const response = await this.fetch(`/api/v1/${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error'
      });
      if (session !== this.#session) throw new DOMException('Sitzung beendet.', 'AbortError');
      if (response.status === 401 || response.status === 403) {
        this.disconnect(false);
        throw new Error('Zugang abgelehnt. Bitte den privaten Zugangstoken erneut eingeben.');
      }
      if (!response.ok) {
        let message = `Cloud-Anfrage fehlgeschlagen (HTTP ${response.status}).`;
        try {
          const data = await response.json();
          const detail = typeof data.error === 'object' ? data.error?.message : data.message || data.error;
          if (typeof detail === 'string' && detail) message = detail;
        } catch { /* Keep the HTTP status when the server does not return JSON. */ }
        throw new Error(message);
      }
      return text ? response.text() : response.json();
    } finally {
      this.#controllers.delete(controller);
      this.#readControllers.delete(controller);
    }
  }

  async connect() {
    const field = this.$('#cloud-token');
    const token = field.value.trim();
    field.value = '';
    this.#clearError();
    if (!token) { this.#error(new Error('Bitte deinen privaten Zugangstoken eingeben.')); return; }
    this.disconnect(false);
    this.#token = token;
    this.#pollPaused = false;
    this.#renderConnection();
    this.#message('Verbindung wird geprüft …');
    await this.refresh();
  }

  disconnect(announce = true) {
    this.#session += 1;
    this.#token = '';
    this.#service = null;
    this.#selected = null;
    this.#job = null;
    this.#detail = null;
    this.#jobs = [];
    this.#busy = false;
    this.#detailVersion += 1;
    this.#refreshPromise = null;
    this.#draftKey = null;
    this.#draftSignature = null;
    this.#clearPoll();
    for (const controller of this.#controllers) controller.abort();
    this.$('#cloud-token').value = '';
    this.$('#cloud-jobs').replaceChildren();
    this.$('#cloud-job-count').textContent = '0 AUFTRÄGE';
    this.$('#cloud-details').hidden = true;
    this.$('#cloud-selection-empty').hidden = false;
    this.$('#cloud-empty-jobs').hidden = false;
    this.#renderConnection();
    if (announce) {
      this.#clearError();
      this.#message('Abgemeldet. Der Token wurde aus dem Arbeitsspeicher entfernt. Serveraufträge laufen weiter.');
      this.$('#cloud-token').focus();
    }
  }

  async refresh(automatic = false) {
    if (!this.#token || !this.#visible || this.document.hidden || (automatic && this.#pollPaused)) return;
    if (this.#refreshPromise) return this.#refreshPromise;
    const session = this.#session;
    if (!automatic) this.#clearError();
    const work = (async () => {
      try {
        const [service, result] = await Promise.all([this.#request('status'), this.#request('jobs')]);
        if (session !== this.#session) return;
        if (!this.#visible || this.document.hidden || (automatic && this.#pollPaused)) return;
        if (!service || !Array.isArray(result.jobs)) throw new Error('Der Cloud-Dienst hat ein unerwartetes Antwortformat geliefert.');
        this.#renderService(service);
        this.#jobs = result.jobs.filter(job => job && typeof job.id === 'string');
        this.#renderJobs();
        if (!this.#selected && this.#jobs.length) this.#selected = this.#jobs[0].id;
        if (this.#selected) await this.select(this.#selected, false);
        if (session !== this.#session) return;
        this.$('#cloud-last-update').textContent = `Zuletzt aktualisiert: ${dateLabel(new Date().toISOString())}`;
        if (!automatic) this.#message('Cloud-Daten aktualisiert.');
      } catch (error) {
        if (session === this.#session || error?.name !== 'AbortError' && !this.#token) this.#error(error);
      } finally {
        if (session === this.#session) this.#queuePoll();
      }
    })();
    this.#refreshPromise = work;
    try { await work; } finally { if (this.#refreshPromise === work) this.#refreshPromise = null; }
  }

  #renderJobs() {
    const focused = this.document.activeElement?.dataset.cloudJob;
    this.$('#cloud-job-count').textContent = `${this.#jobs.length} ${this.#jobs.length === 1 ? 'AUFTRAG' : 'AUFTRÄGE'}`;
    this.$('#cloud-empty-jobs').hidden = this.#jobs.length !== 0;
    this.$('#cloud-jobs').replaceChildren(...this.#jobs.map(job => {
      const item = this.#element('li');
      const button = this.#element('button', 'cloud-job');
      button.type = 'button';
      button.dataset.cloudJob = job.id;
      button.setAttribute('aria-pressed', String(job.id === this.#selected));
      button.append(this.#element('strong', '', job.title || 'Ohne Titel'), this.#element('span', 'cloud-job-meta', `${STATUS[job.status] || job.status || 'Unbekannt'} · ${job.stepCount ?? 0} / ${job.maxSteps ?? '—'} Schritte`), this.#element('time', '', dateLabel(job.updatedAt)));
      button.addEventListener('click', () => { void this.select(job.id); });
      item.append(button);
      return item;
    }));
    if (focused) Array.from(this.$('#cloud-jobs').querySelectorAll('button')).find(button => button.dataset.cloudJob === focused)?.focus({preventScroll: true});
  }

  async select(id, announce = true) {
    if (!this.#token || !this.#visible || this.document.hidden) return;
    if (id !== this.#selected || this.#job?.id !== id) {
      this.#job = null;
    this.#detail = null;
      this.$('#cloud-details').hidden = true;
      this.$('#cloud-selection-empty').hidden = false;
      this.#renderActions();
    }
    this.#selected = id;
    const version = ++this.#detailVersion;
    const session = this.#session;
    this.#renderJobs();
    if (announce) this.#clearError();
    try {
      const result = await this.#request(`jobs/${encodeURIComponent(id)}`);
      if (version !== this.#detailVersion || session !== this.#session) return;
      if (!result.job || result.job.id !== id) throw new Error('Die Auftragsdetails konnten nicht gelesen werden.');
      this.#renderDetails(result);
      if (announce) this.#message('Auftragsdetails geladen.');
    } catch (error) { if (session === this.#session || !this.#token && error?.name !== 'AbortError') this.#error(error); }
  }

  #renderDetails({job, steps, artifacts, usage}) {
    this.#job = job;
    this.#detail = {job, steps, artifacts, usage};
    this.$('#cloud-selection-empty').hidden = true;
    this.$('#cloud-details').hidden = false;
    this.$('#cloud-job-title').textContent = job.title || 'Ohne Titel';
    this.$('#cloud-job-id').textContent = job.id;
    this.$('#cloud-job-status').textContent = job.status === 'completed' ? 'Abgeschlossen · KI-Meldung (ungeprüft)' : STATUS[job.status] || job.status || 'Unbekannt';
    this.$('#cloud-job-summary').textContent = job.summary || 'Noch keine Zusammenfassung vorhanden.';
    this.$('#cloud-job-prompt').textContent = job.prompt || '';
    this.$('#cloud-job-progress').max = Math.max(1, Number(job.maxSteps) || 1);
    this.$('#cloud-job-progress').value = Number(job.stepCount) || 0;
    this.$('#cloud-job-limits').textContent = `${job.stepCount ?? 0} / ${job.maxSteps ?? '—'} Schritte · maximal ${job.maxDurationMinutes ?? '—'} Minuten` + (usage?.totalTokens == null ? ' · Tokenverbrauch nicht gemeldet' : ` · ${usage.totalTokens.toLocaleString('de-CH')} Token gemeldet (${usage.reportedSteps ?? 0}/${job.stepCount ?? 0} Schritte)`) + (job.maxTotalTokens ? ` · Budget ${job.maxTotalTokens.toLocaleString('de-CH')} Token (nur gemessene Schritte)` : '');
    this.$('#cloud-job-dates').textContent = `Erstellt ${dateLabel(job.createdAt)} · Aktualisiert ${dateLabel(job.updatedAt)}`;
    this.$('#cloud-job-error').hidden = !job.error;
    this.$('#cloud-job-error').textContent = job.error ? String(job.error).slice(0, 3000) : '';
    const stepList = Array.isArray(steps) ? steps : [];
    this.$('#cloud-steps-empty').hidden = stepList.length !== 0;
    this.$('#cloud-steps').replaceChildren(...stepList.map(step => {
      const item = this.#element('li', 'cloud-step');
      item.append(this.#element('h4', '', `Schritt ${step.index} · ${step.summary || 'Ohne Zusammenfassung'}`), this.#element('p', 'cloud-step-meta', `${dateLabel(step.createdAt)} · ${STATUS[step.status] || step.status || '—'}`), this.#element('pre', 'cloud-output', step.output || ''));
      return item;
    }));
    const artifactList = Array.isArray(artifacts) ? artifacts.filter(artifact => typeof artifact?.name === 'string') : [];
    this.$('#cloud-artifacts-empty').hidden = artifactList.length !== 0;
    this.$('#cloud-artifacts').replaceChildren(...artifactList.map(artifact => {
      const item = this.#element('li', 'cloud-artifact');
      const button = this.#element('button', '', 'Herunterladen ↓');
      button.type = 'button';
      button.setAttribute('aria-label', `${artifact.name} herunterladen`);
      button.addEventListener('click', () => { void this.download(job.id, artifact.name, button); });
      item.append(this.#element('span', '', artifact.name), button);
      return item;
    }));
    this.#renderActions();
  }

  #renderActions() {
    const status = this.#job?.status;
    const unavailable = !this.#token || !this.#job || this.#busy;
    this.$('#cloud-pause').disabled = unavailable || !['queued', 'running'].includes(status);
    this.$('#cloud-resume').disabled = unavailable || !['paused', 'needs_input'].includes(status) || this.#service?.configured !== true;
    this.$('#cloud-stop').disabled = unavailable || TERMINAL.has(status);
    this.$('#cloud-export').disabled = unavailable || !this.#detail;
  }

  async create() {
    if (this.#busy || !this.#token || this.#service?.configured !== true) return;
    this.#clearError();
    const title = this.$('#cloud-title').value.trim();
    const prompt = this.$('#cloud-prompt').value.trim();
    const maxSteps = Number(this.$('#cloud-max-steps').value);
    const maxDurationMinutes = Number(this.$('#cloud-max-minutes').value);
    const tokenBudgetText = this.$('#cloud-max-tokens').value.trim();
    const maxTotalTokens = Number(tokenBudgetText);
    if (!title || !prompt || !Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 50 || !Number.isInteger(maxDurationMinutes) || maxDurationMinutes < 1 || maxDurationMinutes > 480 || (tokenBudgetText && (!Number.isSafeInteger(maxTotalTokens) || maxTotalTokens < 1 || maxTotalTokens > 1000000))) {
      this.#error(new Error('Bitte Titel, Auftrag, 1–50 Schritte, 1–480 Minuten und ein gültiges optionales Tokenbudget angeben.')); return;
    }
    const body = {title, prompt, maxSteps, maxDurationMinutes, ...(tokenBudgetText ? {maxTotalTokens} : {})};
    const signature = JSON.stringify(body);
    const session = this.#session;
    this.#busy = true;
    this.#renderConnection();
    try {
      if (this.#draftSignature !== signature) { this.#draftKey = this.makeId(); this.#draftSignature = signature; }
      const result = await this.#request('jobs', {method: 'POST', body, idempotencyKey: this.#draftKey});
      if (session !== this.#session) return;
      if (!result.job?.id) throw new Error('Der Dienst hat keine Auftragskennung zurückgegeben. Bitte Anzeige aktualisieren.');
      this.#selected = result.job.id;
      this.#draftKey = null;
      this.#draftSignature = null;
      this.$('#cloud-title').value = '';
      this.$('#cloud-prompt').value = '';
      await this.select(result.job.id, false);
      await this.refresh();
      if (session === this.#session) this.#message('Auftrag serverseitig gespeichert. Er kann bei geschlossenem Browser weiterlaufen.');
    } catch (error) { if (session === this.#session || !this.#token && error?.name !== 'AbortError') this.#error(error); }
    finally { if (session === this.#session) { this.#busy = false; this.#renderConnection(); } }
  }

  async action(action) {
    if (this.#busy || !this.#selected || !['pause', 'resume', 'stop'].includes(action)) return;
    const id = this.#selected;
    const session = this.#session;
    this.#busy = true;
    this.#clearError();
    this.#renderConnection();
    try {
      const result = await this.#request(`jobs/${encodeURIComponent(id)}/${action}`, {method: 'POST'});
      if (session !== this.#session) return;
      if (!result.job) throw new Error('Die Auftragsänderung konnte nicht bestätigt werden. Bitte Anzeige aktualisieren.');
      if (this.#selected === id) { this.#job = result.job; await this.select(id, false); }
      await this.refresh();
      if (session === this.#session) this.#message({pause: 'Auftrag pausiert.', resume: 'Auftrag fortgesetzt.', stop: 'Auftrag gestoppt.'}[action]);
    } catch (error) { if (session === this.#session || !this.#token && error?.name !== 'AbortError') this.#error(error); }
    finally { if (session === this.#session) { this.#busy = false; this.#renderConnection(); } }
  }

  exportReport() {
    if (!this.#detail || !this.#token || this.#busy) return;
    const {job, steps, artifacts, usage} = this.#detail;
    // Export is local and opt-in. It contains the full private assignment and
    // artifacts, but never the authorization token or browser login.
    const report = {format:'red-loop-job-report',version:1,exportedAt:new Date().toISOString(),
      verification:job.verification || 'not_independently_verified',
      job,usage:usage || null,steps:Array.isArray(steps)?steps:[],artifacts:Array.isArray(artifacts)?artifacts:[]};
    const blob = new this.window.Blob([JSON.stringify(report,null,2)], {type:'application/json;charset=utf-8'});
    const url = this.window.URL.createObjectURL(blob);
    const anchor = this.#element('a');
    anchor.href=url;
    anchor.download=downloadName('red-loop-'+job.id+'.json');
    this.document.body.append(anchor);
    try { anchor.click(); this.#message('Privaten Auftragsbericht lokal exportiert. Datei sicher aufbewahren.'); }
    finally { anchor.remove(); this.schedule(()=>this.window.URL.revokeObjectURL(url),1000); }
  }

  async download(id, name, button) {
    const session = this.#session;
    button.disabled = true;
    this.#clearError();
    try {
      const content = await this.#request(`jobs/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(name)}`, {text: true});
      if (session !== this.#session) return;
      const url = this.window.URL.createObjectURL(new this.window.Blob([content], {type: 'text/plain;charset=utf-8'}));
      const anchor = this.#element('a');
      anchor.href = url;
      anchor.download = downloadName(name);
      this.document.body.append(anchor);
      anchor.click();
      anchor.remove();
      this.schedule(() => this.window.URL.revokeObjectURL(url), 1000);
      this.#message(`Artefakt „${name}“ heruntergeladen.`);
    } catch (error) { if (session === this.#session || !this.#token && error?.name !== 'AbortError') this.#error(error); }
    finally { button.disabled = false; }
  }
}
