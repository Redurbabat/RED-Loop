// ==UserScript==
// @name         RED Loop — ChatGPT Auto Continue
// @namespace    https://github.com/Redurbabat/RED-Loop
// @version      0.4.0
// @description  Opt-in automatic continuation for one ChatGPT conversation: bounded by a step limit or endless until you pause.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(() => {
  'use strict';
  if (window.top !== window.self || document.getElementById('red-loop-root')) return;
  // The native iOS app injects this same file into its in-app ChatGPT view,
  // where no extension manifest restricts the page. Refuse any other origin.
  if (!['chatgpt.com', 'chat.openai.com'].includes(location.hostname)) return;
  const PREFIX = 'red-loop:v1:';
  const MAX_STEPS = 50;
  const MAX_COUNT = 100000;
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 20000;
  // A used-up quota is not a fault to retry at speed: it is a wait.
  const MAX_WAITS = 12;
  const WAIT_DELAY = 600000;
  const MAX_PROMPT_LENGTH = 4000;
  // Set by the native host immediately before injection; unknown in Safari,
  // Edge and Chrome. It carries no credentials and cannot start a run.
  const hostConfig = window.__RED_LOOP_HOST__;
  const HOSTS = ['ios-webview', 'android-webview'];
  const embedded = !!hostConfig && typeof hostConfig === 'object' && HOSTS.includes(hostConfig.app);
  // WebKit's handler takes an object; the Android interface takes a string.
  const handler = embedded ? window.webkit?.messageHandlers?.redLoop || window.RedLoopHost : null;
  const bridge = handler && typeof handler.postMessage === 'function' ? handler : null;
  const bridgeWantsText = !!bridge && bridge === window.RedLoopHost;
  const PROMPT = 'Fahre mit dem bisherigen Auftrag fort. Prüfe den bisherigen Stand, erledige den nächsten sinnvollen Arbeitsschritt und berichte konkret über das Ergebnis. Wiederhole keine bereits erledigten Schritte.';
  const WORK_PROMPT = 'Arbeite am bisherigen Auftrag weiter. Prüfe zuerst, welche Aufgaben noch offen sind. Führe den nächsten sinnvollen Arbeitsschritt tatsächlich aus, prüfe das Ergebnis und berichte kurz über Fortschritt und verbleibende Aufgaben. Wiederhole keine erledigten Schritte und erfinde keine Ergebnisse. Wenn du eine Rückfrage, Zugangsdaten oder eine Freigabe von mir brauchst, halte an, erkläre konkret was fehlt und beende die Antwort mit [RED_LOOP_RUECKFRAGE] als eigener Zeile. Wenn alle Aufgaben des Auftrags erledigt und überprüft sind, fasse das Ergebnis zusammen und beende die Antwort mit [RED_LOOP_FERTIG] als eigener Zeile. Andernfalls arbeite an den offenen Aufgaben weiter.';
  const DECIDE_PROMPT = 'Arbeite am bisherigen Auftrag weiter. Prüfe zuerst, welche Aufgaben noch offen sind. Führe den nächsten sinnvollen Arbeitsschritt tatsächlich aus, prüfe das Ergebnis und berichte kurz über Fortschritt und verbleibende Aufgaben. Wiederhole keine erledigten Schritte und erfinde keine Ergebnisse. Wenn eine Entscheidung ansteht, triff selbst die sinnvollste Wahl, nenne sie in einem Satz mit Begründung und arbeite weiter; frage nicht nach. Halte nur an, wenn du etwas brauchst, das ausschließlich ich liefern kann: Zugangsdaten, eine Freigabe für etwas Unumkehrbares oder eine Information, die du nicht erschließen kannst. Dann erkläre konkret was fehlt und beende die Antwort mit [RED_LOOP_RUECKFRAGE] als eigener Zeile. Wenn alle Aufgaben des Auftrags erledigt und überprüft sind, fasse das Ergebnis zusammen und beende die Antwort mit [RED_LOOP_FERTIG] als eigener Zeile. Andernfalls arbeite an den offenen Aufgaben weiter.';
  const state = { running: false, count: 0, limit: 10, endless: false, prompt: PROMPT, background: false, autoStart: false, autoRetry: false, autoBlocked: false, retries: 0, waits: 0, retryAt: 0, generatingSeen: 0, lastMessage: '', lastChange: 0, pending: false, lastSubmit: 0, submittedSignature: '', awaiting: false, composing: false, composeStarted: 0, composeSignature: '', composeText: '' };
  const key = () => PREFIX + (location.pathname.match(/(?:^|\/)c\/[^/]+/)?.[0] || location.pathname);
  let currentKey = key();
  const root = document.createElement('aside');
  root.id = 'red-loop-root';
  root.setAttribute('aria-label', 'RED Loop Steuerung');
  root.innerHTML = `<div class="rl-head"><strong>RED <span>Loop</span></strong><button class="rl-collapse" aria-label="Panel minimieren" aria-expanded="true" type="button">−</button></div>
    <div class="rl-body"><p class="rl-status" role="status" aria-live="polite">Bereit</p>
    <label class="rl-prompt-label" for="rl-prompt">Automatischer Folgetext</label>
    <textarea id="rl-prompt" rows="4" maxlength="4000" aria-describedby="rl-prompt-help"></textarea>
    <button class="rl-work" type="button">Text für offene Aufgaben laden</button>
    <button class="rl-decide" type="button">Text: selbst entscheiden</button>
    <p id="rl-prompt-help">Wird nach jeder fertigen Antwort gesendet. Aktivieren mit Start.</p>
    <label class="rl-background-label"><input id="rl-background" type="checkbox" aria-describedby="rl-background-help"> Auch im Hintergrund weiterarbeiten</label>
    <p id="rl-background-help">Browser und Chat offen lassen; PC muss wach bleiben. Mit Auftragstext: Stopp bei Fertigmeldung oder Rückfrage.</p>
    <label class="rl-endless-label"><input id="rl-autostart" type="checkbox" aria-describedby="rl-auto-help"> Automatisch starten</label>
    <label class="rl-endless-label"><input id="rl-retry" type="checkbox" aria-describedby="rl-auto-help"> Fehler selbst überbrücken</label>
    <p id="rl-auto-help">Automatisch starten: beginnt von selbst, sobald eine fertige Antwort da ist. Fehler überbrücken: nach einem Fehler bis zu dreimal erneut versuchen. Beides endet bei Pause, Fertigmeldung oder Rückfrage.</p>
    <label class="rl-endless-label"><input id="rl-endless" type="checkbox" aria-describedby="rl-endless-help"> Endlos bis Pause</label>
    <p id="rl-endless-help">Ohne Zahlenlimit fortsetzen. Ende nur durch Pause, Fertigmeldung, Rückfrage oder Fehler. Verbraucht laufend ChatGPT-Kontingent.</p>
    <div class="rl-row"><label for="rl-limit">Max. Fortsetzungen</label><input id="rl-limit" type="number" min="1" max="50" value="10"></div>
    <div class="rl-row"><button class="rl-start" type="button">Start</button><button class="rl-stop" type="button" disabled>Pause</button><button class="rl-reset" type="button">Reset</button></div>
    <p class="rl-counter" aria-live="polite">0 / 10 Fortsetzungen</p>
    <small>v0.4.0 · Nur dieser Chat · Limit 1–50 oder endlos · Kein automatischer Neustart nach Neuladen</small></div>`;
  const style = document.createElement('style');
  style.textContent = `#red-loop-root{position:fixed;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);z-index:2147483646;width:min(290px,calc(100vw - 24px));font:14px/1.45 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:rgba(24,27,34,.94);color:#f7f7f9;border:1px solid #ffffff50;border-radius:18px;box-shadow:0 12px 40px #0007;backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);padding:12px}#red-loop-root *{box-sizing:border-box}#red-loop-root .rl-head,#red-loop-root .rl-row{display:flex;justify-content:space-between;align-items:center;gap:8px}#red-loop-root .rl-head span{color:#ff7181}#red-loop-root button{cursor:pointer;border:1px solid #ffffff42;background:#ffffff20;color:#fff;border-radius:10px;padding:8px 12px;min-height:36px}#red-loop-root button:disabled{opacity:.4;cursor:default}#red-loop-root .rl-start{background:#9c3349}#red-loop-root .rl-status{margin:12px 0;color:#d6deeb}#red-loop-root input{width:64px;padding:6px;background:#12151b;border:1px solid #ffffff55;border-radius:7px;color:#fff}#red-loop-root small{display:block;margin-top:9px;color:#bac2d0}#red-loop-root.rl-min .rl-body{display:none}#red-loop-root button:focus-visible,#red-loop-root input:focus-visible{outline:2px solid #a7d6ff;outline-offset:2px}`;
  document.documentElement.append(style);
  document.body.append(root);
  const $ = s => root.querySelector(s);
  const report = () => {
    if (!bridge) return;
    // One-way status for the native host: counters and the panel's own status
    // line only. No conversation text and no follow-up text leave the page.
    const payload = { type: 'state', running: state.running, count: state.count, limit: state.limit, endless: state.endless, status: $('.rl-status').textContent };
    try { bridge.postMessage(bridgeWantsText ? JSON.stringify(payload) : payload); } catch {}
  };
  const status = msg => { $('.rl-status').textContent = msg; report(); };
  const ratio = () => state.count + '/' + (state.endless ? '∞' : state.limit);
  const showCounter = () => { $('.rl-counter').textContent = state.count + ' / ' + (state.endless ? '∞' : state.limit) + ' Fortsetzungen'; };
  const persist = () => {
    try { sessionStorage.setItem(currentKey, JSON.stringify({ count: state.count, limit: state.limit, endless: state.endless, prompt: state.prompt, background: state.background, autoStart: state.autoStart, autoRetry: state.autoRetry, autoBlocked: state.autoBlocked })); } catch {}
  };
  // `recoverable` marks a stop that a later attempt could get past. A draft,
  // a completion, a question and the limit are never recoverable.
  const stop = (msg, recoverable, quota) => {
    const wasRunning = state.running;
    state.running = false; state.pending = false; state.composing = false;
    $('.rl-start').disabled = false; $('.rl-stop').disabled = true; $('#rl-limit').disabled = state.endless;
    $('#rl-prompt').disabled = false;
    $('#rl-background').disabled = false; $('.rl-work').disabled = false; $('.rl-decide').disabled = false; $('#rl-endless').disabled = false;
    $('#rl-autostart').disabled = false; $('#rl-retry').disabled = false;
    if (wasRunning && state.autoRetry && quota && state.waits < MAX_WAITS) {
      state.waits += 1;
      state.retryAt = Date.now() + WAIT_DELAY;
      persist();
      return status((msg || 'Gestoppt') + ' · wartet 10 Min (' + state.waits + '/' + MAX_WAITS + ')');
    }
    if (wasRunning && state.autoRetry && recoverable && state.retries < MAX_RETRIES) {
      state.retries += 1;
      state.retryAt = Date.now() + RETRY_DELAY;
      persist();
      return status((msg || 'Gestoppt') + ' · Versuch ' + state.retries + '/' + MAX_RETRIES + ' folgt');
    }
    state.retryAt = 0;
    persist();
    status(msg || 'Gestoppt');
  };
  const load = () => {
    state.running = false; state.pending = false; state.composing = false;
    state.lastMessage = ''; state.submittedSignature = ''; state.awaiting = false; state.lastSubmit = 0;
    // In the app the work preset and endless mode are the defaults, because
    // that is the whole point of the in-app view. Both stay user-editable.
    state.count = 0; state.limit = 10; state.endless = embedded;
    state.prompt = embedded ? WORK_PROMPT : PROMPT; state.background = embedded;
    // The native host may preselect the automatic options per chat; session
    // storage dies with the view, so the host is what survives a restart.
    state.autoStart = embedded && hostConfig.autoStart === true;
    state.autoRetry = embedded && hostConfig.autoRetry === true;
    state.autoBlocked = false; state.retries = 0; state.retryAt = 0;
    try {
      const saved = JSON.parse(sessionStorage.getItem(currentKey) || '{}');
      state.count = Number.isInteger(saved.count) ? Math.max(0, Math.min(MAX_COUNT, saved.count)) : 0;
      state.limit = Number.isInteger(saved.limit) ? Math.max(1, Math.min(MAX_STEPS, saved.limit)) : 10;
      if (typeof saved.endless === 'boolean') state.endless = saved.endless;
      if (typeof saved.autoStart === 'boolean') state.autoStart = saved.autoStart;
      if (typeof saved.autoRetry === 'boolean') state.autoRetry = saved.autoRetry;
      if (typeof saved.autoBlocked === 'boolean') state.autoBlocked = saved.autoBlocked;
      if (typeof saved.prompt === 'string' && saved.prompt.length <= MAX_PROMPT_LENGTH) state.prompt = saved.prompt;
      // A WKWebView is never focused the way a desktop tab is, so the
      // foreground-only mode would stop the run immediately in the app.
      state.background = embedded || saved.background === true;
    } catch {}
    $('#rl-limit').value = String(state.limit);
    $('#rl-prompt').value = state.prompt;
    $('#rl-background').checked = state.background;
    $('#rl-endless').checked = state.endless;
    $('#rl-autostart').checked = state.autoStart;
    $('#rl-retry').checked = state.autoRetry;
    showCounter();
    stop('Bereit');
    status('Bereit · ' + ratio());
  };
  const visible = el => !!el && !el.closest('[hidden],[inert],[aria-hidden="true"]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const conversationId = () => location.pathname.match(/(?:^|\/)c\/([^/]+)/)?.[1];
  const belongsToChat = el => {
    const id = conversationId();
    const message = el.closest('[data-chatgpt-selection-conversation-id]');
    if (message && id && message.getAttribute('data-chatgpt-selection-conversation-id') !== id) return false;
    const form = el.closest('form[data-chatgpt-composer]');
    const owner = form?.querySelector('[data-above-composer-conversation-id]')?.getAttribute('data-above-composer-conversation-id');
    return !owner || !id || owner === 'chatgpt:' + id;
  };
  const isGenerating = () => [...document.querySelectorAll('button[data-testid="stop-button"],button[aria-label*="Stop generating"],button[aria-label*="Generierung stoppen"],form[data-chatgpt-composer] button[aria-label="Antwort stoppen"],form[data-chatgpt-composer] button[aria-label="Stop"],form[data-chatgpt-composer] button[aria-label="Stoppen"]')].some(el => visible(el) && belongsToChat(el));
  const messages = () => {
    const nodes = [...document.querySelectorAll('[data-message-author-role="assistant"],[data-markdown-text-style="assistant-message"]')].filter(el => visible(el) && belongsToChat(el));
    return nodes.filter(node => !nodes.some(parent => parent !== node && parent.contains(node)));
  };
  const lastAssistant = () => messages().at(-1);
  const editor = () => [...document.querySelectorAll('form[data-chatgpt-composer] [data-composer-markdown][contenteditable="true"],#prompt-textarea[contenteditable="true"],[data-testid="composer-input"][contenteditable="true"],textarea#prompt-textarea')].find(el => visible(el) && belongsToChat(el));
  const sendButton = () => [...(editor()?.closest('form[data-chatgpt-composer]') || document).querySelectorAll('button[data-testid="send-button"],button[aria-label="Send prompt"],button[aria-label="Nachricht senden"],button[aria-label="Senden"],button[aria-label="Send"]')].find(visible);
  // A used-up quota reads like a failure but needs patience, not a retry.
  const isQuotaMessage = value => {
    const text = value.replace(/\s+/g, ' ').trim();
    return /^(?:rate limit(?: exceeded| reached)?|too many requests)[.!…]*/i.test(text) ||
      /(?:you(?:'ve| have) (?:reached|hit) (?:your|the)[^.]{0,40}(?:limit|cap)|sent too many messages|du hast (?:zu viele nachrichten|dein limit)|limit für [^.]{0,40}erreicht|kontingent (?:ist )?(?:erschöpft|aufgebraucht))/i.test(text);
  };
  const hasQuotaNotice = () => [...document.querySelectorAll('[data-message-author-role="assistant"],[data-markdown-text-style="assistant-message"],[data-testid="conversation-turn-error"],[data-testid="error-message"]')]
    .filter(el => visible(el) && belongsToChat(el))
    .some(el => isQuotaMessage(el.innerText || ''));
  const isFailureMessage = value => {
    // Match complete service failure messages, not advice or quoted error text
    // inside a normal assistant response.
    const text = value.replace(/\s+/g, ' ').trim();
    return /^(?:diese antwort konnte nicht geladen werden|this response could not be loaded|(?:something went wrong|etwas ist schiefgelaufen)(?: while generating (?:the|a) response)?|rate limit(?: exceeded)?|too many requests)[.!…]*(?:\s+(?:please try again|try again|bitte erneut versuchen|bitte versuche es erneut|erneut versuchen|antwort neu laden|reload response)[.!…]*)?$/i.test(text);
  };
  const hasResponseError = () => {
    if ([...document.querySelectorAll('[data-testid="conversation-turn-error"],[data-testid="error-message"]')].some(el => visible(el) && belongsToChat(el))) return true;
    if (isFailureMessage(lastAssistant()?.innerText || '')) return true;
    const latest = [...document.querySelectorAll('[data-conversation-role="assistant"]')].filter(el => visible(el) && belongsToChat(el)).at(-1);
    const turnText = (latest?.parentElement?.innerText || '').replace(latest?.innerText || '', '');
    return isFailureMessage(turnText);
  };
  const signature = () => {
    const m = lastAssistant();
    const text = (m?.innerText || '').trim();
    return text ? String(messages().length) + ':' + text.slice(-400) : '';
  };
  const insertPrompt = (el, value) => {
    el.focus();
    if ((el.innerText || el.value || '').trim()) return false;
    if (el instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (!setter) return false;
      setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // Avoid hidden React state manipulation: use a real editing command and input event.
      const selection = window.getSelection();
      const range = document.createRange(); range.selectNodeContents(el);
      selection.removeAllRanges(); selection.addRange(range);
      if (!document.execCommand('insertText', false, value)) return false;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    }
    const inserted = (el.innerText || el.value || '').trim();
    if (inserted === value) return true;
    // Rich-text paragraphs add visual spacing in innerText. Serialize their
    // actual line boundaries instead, preserving intentional empty paragraphs.
    const blocks = [...el.childNodes].filter(node => node.nodeType !== 3 || node.textContent.trim());
    if (!blocks.length || !blocks.every(node => node.nodeName === 'P')) return false;
    const inlineText = node => node.nodeType === 3 ? node.textContent : node.nodeName === 'BR'
      ? (node.classList.contains('ProseMirror-trailingBreak') ? '' : '\n')
      : [...node.childNodes].map(inlineText).join('');
    return blocks.map(p => { const text = inlineText(p); return text === '\n' && !p.textContent ? '' : text; }).join('\n').trim() === value;
  };
  const attemptSend = () => {
    const el = editor();
    if (!el || (el.innerText || el.value || '').trim() !== state.composeText) return stop('Entwurf geändert – nicht gesendet');
    if (hasResponseError() || isGenerating() || signature() !== state.composeSignature) return stop('Antwortzustand geändert – bitte prüfen', true);
    const btn = sendButton();
    if (!btn || btn.disabled) {
      if (Date.now() - state.composeStarted >= 6000) return stop('Senden nicht verfügbar – bitte prüfen', true);
      return status('Bereite Fortsetzung vor …');
    }
    btn.click();
    state.composing = false; state.count += 1;
    state.submittedSignature = state.composeSignature; state.awaiting = true;
    state.lastSubmit = Date.now(); state.lastChange = Date.now();
    state.retries = 0; state.waits = 0;
    persist();
    showCounter();
    status('Fortsetzung ' + ratio() + ' gesendet');
  };
  // While nothing runs: wait out a retry, or start by itself when asked to.
  const canAutoStart = () => {
    if (!state.autoStart || state.autoBlocked || state.retryAt) return false;
    if (!/^\/(?:g\/[^/]+\/)?c\/[^/]+/.test(location.pathname)) return false;
    if (!state.background && (document.hidden || !document.hasFocus())) return false;
    if (hasResponseError() || isGenerating()) return false;
    const el = editor();
    if (!el || (el.innerText || el.value || '').trim()) return false;
    const sig = signature();
    if (!sig) return false;
    // Wait for the answer to settle, exactly as a running loop does.
    if (sig !== state.lastMessage) { state.lastMessage = sig; state.lastChange = Date.now(); return false; }
    return Date.now() - state.lastChange >= 6500;
  };
  const idle = () => {
    if (state.retryAt) {
      if (Date.now() >= state.retryAt) { state.retryAt = 0; begin(false); }
      return;
    }
    if (canAutoStart()) begin(false);
  };
  const tick = () => {
    if (key() !== currentKey) { stop('Gestoppt: Konversation gewechselt'); currentKey = key(); load(); return; }
    if (!state.running) return idle();
    if (!state.background && (document.hidden || !document.hasFocus())) return;
    if (state.composing) return attemptSend();
    if (!state.endless && state.count >= state.limit) { state.autoBlocked = true; return stop('Limit erreicht'); }
    if (state.count >= MAX_COUNT) return stop('Zähler-Obergrenze erreicht');
    const draft = editor();
    if (draft && (draft.innerText || draft.value || '').trim()) return stop('Entwurf erkannt – nicht überschrieben');
    if (hasQuotaNotice()) return stop('Kontingent erschöpft', false, true);
    if (hasResponseError()) return stop('Antwortfehler erkannt', true);
    // Generation counts as progress, so a long answer is not a stall.
    if (isGenerating()) { state.generatingSeen = Date.now(); status('ChatGPT antwortet …'); return; }
    const sig = signature();
    if (!sig) return status('Warte auf eine ChatGPT-Antwort …');
    if (state.awaiting) {
      if (sig === state.submittedSignature) {
        if (Date.now() - Math.max(state.lastSubmit, state.generatingSeen) > 90000) return stop('Keine neue Antwort – bitte ChatGPT prüfen', true);
        return status('Warte auf neue Antwort …');
      }
      state.awaiting = false; state.pending = false;
    }
    if (sig !== state.lastMessage) { state.lastMessage = sig; state.lastChange = Date.now(); state.pending = false; return; }
    if (Date.now() - state.lastChange < 6500 || Date.now() - state.lastSubmit < 12000) return;
    const m = lastAssistant();
    if (!m) return stop('Antwortfehler erkannt', true);
    const finalLine = (m.innerText || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).at(-1);
    if (state.prompt.includes('[RED_LOOP_RUECKFRAGE]') && finalLine === '[RED_LOOP_RUECKFRAGE]') { state.autoBlocked = true; return stop('Rückfrage – bitte Chat prüfen'); }
    if (state.prompt.includes('[RED_LOOP_FERTIG]') && finalLine === '[RED_LOOP_FERTIG]') { state.autoBlocked = true; return stop('Auftrag abgeschlossen'); }
    const el = editor();
    if (!el) return stop('Eingabefeld nicht gefunden – bitte Oberfläche prüfen', true);
    if ((el.innerText || el.value || '').trim()) return stop('Entwurf erkannt – nicht überschrieben');
    if (state.pending) return;
    state.pending = true;
    if (!insertPrompt(el, state.prompt)) return stop('Eingabe fehlgeschlagen – ChatGPT-Oberfläche prüfen', true);
    state.composeText = (el.innerText || el.value || '').trim();
    state.composing = true; state.composeStarted = Date.now(); state.composeSignature = sig;
    attemptSend();
  };
  const begin = manual => {
    if (state.running) return;
    if (!/^\/(?:g\/[^/]+\/)?c\/[^/]+/.test(location.pathname)) return status('Bitte eine bestehende Konversation öffnen');
    if (!$('#rl-background').checked && (document.hidden || !document.hasFocus())) return status('Bitte diesen Tab aktivieren');
    const el = editor();
    if (el && (el.innerText || el.value || '').trim()) return status('Entwurf erkannt – nicht überschrieben');
    const endless = $('#rl-endless').checked;
    const n = Number($('#rl-limit').value);
    if (!endless && (!Number.isInteger(n) || n < 1 || n > MAX_STEPS)) return status('Bitte Limit von 1 bis 50 wählen');
    const prompt = $('#rl-prompt').value.trim();
    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) return status('Bitte einen Folgetext mit 1 bis 4000 Zeichen eingeben');
    if (state.count >= MAX_COUNT) return status('Zähler-Obergrenze erreicht – bitte Reset drücken');
    // Pause keeps the counter, so Start after a pause resumes the same run.
    if (!endless && state.count >= n) state.count = 0;
    state.endless = endless;
    if (!endless) state.limit = n;
    state.prompt = prompt; state.running = true; state.pending = false;
    state.background = $('#rl-background').checked;
    $('#rl-prompt').value = prompt; $('#rl-prompt').disabled = true;
    $('#rl-background').disabled = true; $('.rl-work').disabled = true; $('.rl-decide').disabled = true; $('#rl-endless').disabled = true;
    showCounter();
    state.lastMessage = signature(); state.lastChange = Date.now();
    $('.rl-start').disabled = true; $('.rl-stop').disabled = false; $('#rl-limit').disabled = true;
    $('#rl-autostart').disabled = true; $('#rl-retry').disabled = true;
    // A fresh attempt gets the full waiting window again; the duplicate guard
    // stays, so an unchanged answer still cannot trigger a second send.
    if (state.awaiting) state.lastSubmit = Date.now();
    if (manual) { state.autoBlocked = false; state.retries = 0; state.waits = 0; }
    state.retryAt = 0;
    persist(); status((state.endless ? 'Endlos aktiv · ' : state.background ? 'Hintergrund aktiv · ' : 'Aktiv · ') + ratio());
  };
  $('.rl-start').addEventListener('click', () => begin(true));
  $('.rl-work').addEventListener('click', () => {
    if (state.running) return;
    state.prompt = WORK_PROMPT; $('#rl-prompt').value = WORK_PROMPT; persist();
    status('Auftragstext geladen · Limit wählen und Start');
  });
  $('.rl-decide').addEventListener('click', () => {
    if (state.running) return;
    state.prompt = DECIDE_PROMPT; $('#rl-prompt').value = DECIDE_PROMPT; persist();
    status('Selbstständig-Text geladen · hält nur bei echten Hindernissen');
  });
  $('#rl-background').addEventListener('change', () => {
    if (state.running) return;
    state.background = $('#rl-background').checked; persist();
    status(state.background ? 'Bereit für Hintergrundlauf · Start erforderlich' : 'Bereit · Nur im aktiven Tab');
  });
  $('#rl-prompt').addEventListener('input', () => {
    if (state.running) return;
    state.prompt = $('#rl-prompt').value; persist();
  });
  $('#rl-autostart').addEventListener('change', () => {
    if (state.running) return;
    state.autoStart = $('#rl-autostart').checked;
    // Ticking the box is a fresh decision, so a previous stop stops blocking.
    if (state.autoStart) state.autoBlocked = false;
    persist();
    status(state.autoStart ? 'Startet selbst, sobald eine Antwort fertig ist' : 'Bereit · ' + ratio());
  });
  $('#rl-retry').addEventListener('change', () => {
    if (state.running) return;
    state.autoRetry = $('#rl-retry').checked; state.retries = 0; state.waits = 0; persist();
    status(state.autoRetry ? 'Überbrückt Fehler bis zu dreimal' : 'Bereit · ' + ratio());
  });
  $('#rl-endless').addEventListener('change', () => {
    if (state.running) return;
    state.endless = $('#rl-endless').checked; persist();
    $('#rl-limit').disabled = state.endless;
    showCounter();
    status(state.endless ? 'Endlos vorbereitet · Ende nur durch Pause oder Fertigmeldung' : 'Bereit · ' + ratio());
  });
  $('#rl-limit').addEventListener('change', () => {
    if (state.running) return;
    const n = Number($('#rl-limit').value);
    if (!Number.isInteger(n) || n < 1 || n > MAX_STEPS) return status('Bitte Limit von 1 bis 50 wählen');
    state.limit = n; persist();
    showCounter();
    status('Bereit · ' + ratio());
  });
  $('.rl-stop').addEventListener('click', () => {
    // A pause the user asked for stays a pause; nothing restarts it by itself.
    state.autoBlocked = true; state.retries = 0; state.waits = 0; state.retryAt = 0;
    stop('Pausiert · Start setzt fort');
  });
  $('.rl-reset').addEventListener('click', () => {
    state.autoBlocked = true; state.retries = 0; state.retryAt = 0;
    stop('Zurückgesetzt'); state.count = 0; state.awaiting = false; state.submittedSignature = ''; state.lastSubmit = 0;
    persist(); showCounter();
  });
  $('.rl-collapse').addEventListener('click', () => {
    const collapsed = root.classList.toggle('rl-min');
    $('.rl-collapse').textContent = collapsed ? '+' : '−';
    $('.rl-collapse').setAttribute('aria-label', collapsed ? 'Panel öffnen' : 'Panel minimieren');
    $('.rl-collapse').setAttribute('aria-expanded', String(!collapsed));
  });
  // Dragging the panel out of the way. The position is one setting for every
  // chat, kept in local storage so it survives reloads; everything else stays
  // in per-chat session storage.
  const POSITION_KEY = PREFIX + 'panel-position';
  const place = (left, top) => {
    const box = root.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - box.width);
    const maxTop = Math.max(0, window.innerHeight - box.height);
    root.style.left = Math.round(Math.max(0, Math.min(maxLeft, left))) + 'px';
    root.style.top = Math.round(Math.max(0, Math.min(maxTop, top))) + 'px';
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  };
  const restorePosition = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
      if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) place(saved.left, saved.top);
    } catch {}
  };
  const head = root.querySelector('.rl-head');
  head.title = 'Zum Verschieben ziehen';
  let drag = null;
  head.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    const box = root.getBoundingClientRect();
    drag = { id: event.pointerId, dx: event.clientX - box.left, dy: event.clientY - box.top, moved: false };
    head.setPointerCapture(event.pointerId);
  });
  head.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.moved = true;
    event.preventDefault();
    place(event.clientX - drag.dx, event.clientY - drag.dy);
  });
  const endDrag = event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.moved) {
      try {
        localStorage.setItem(POSITION_KEY, JSON.stringify({ left: parseFloat(root.style.left) || 0, top: parseFloat(root.style.top) || 0 }));
      } catch {}
    }
    drag = null;
  };
  head.addEventListener('pointerup', endDrag);
  head.addEventListener('pointercancel', endDrag);
  // A rotation or a smaller window must not leave the panel off screen.
  window.addEventListener('resize', () => {
    if (!root.style.left) return;
    place(parseFloat(root.style.left) || 0, parseFloat(root.style.top) || 0);
  });
  restorePosition();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.running && !state.background) return stop('Pausiert: Browser-Tab nicht aktiv');
    // Timers freeze while an app or tab is suspended. Restart the waiting
    // windows on return instead of reporting a stall that never happened.
    if (!document.hidden && state.running) {
      state.lastChange = Date.now();
      if (state.awaiting) state.lastSubmit = Date.now();
      if (state.composing) state.composeStarted = Date.now();
    }
  });
  window.addEventListener('pagehide', () => { if (state.running) stop('Pausiert: Seite verlassen'); });
  window.addEventListener('blur', () => { if (state.running && !state.background) stop('Gestoppt: Tab nicht im Fokus'); });
  load();
  style.textContent += '#red-loop-root{max-height:calc(100dvh - 32px);overflow-y:auto}#red-loop-root .rl-prompt-label{display:block;margin-bottom:5px}#red-loop-root #rl-prompt{display:block;width:100%;resize:vertical;min-height:76px;max-height:160px;padding:8px;border:1px solid #ffffff55;border-radius:8px;background:#12151b;color:#fff;font:inherit;font-size:12px;line-height:1.45}#red-loop-root #rl-prompt:disabled{opacity:.6;resize:none}#red-loop-root #rl-prompt:focus-visible{outline:2px solid #a7d6ff;outline-offset:2px}#red-loop-root #rl-prompt-help{font-size:12px;color:#bac2d0;margin:5px 0 12px}@media(prefers-color-scheme:light){#red-loop-root #rl-prompt{background:#fff;color:#27282d;border-color:#bfb6ba}#red-loop-root #rl-prompt-help{color:#65646c}#red-loop-root #rl-prompt:focus-visible{outline-color:#a9233b}}';
  style.textContent += '#red-loop-root button{min-height:44px}#red-loop-root .rl-counter{font-size:12px;color:#d6deeb}#red-loop-root.rl-min .rl-stop{display:block}#red-loop-root.rl-min .rl-body{display:block}#red-loop-root.rl-min .rl-body>*:not(.rl-row){display:none}#red-loop-root.rl-min .rl-row>label,#red-loop-root.rl-min .rl-row>input{display:none}@media(prefers-reduced-motion:reduce){#red-loop-root *{animation:none!important;transition:none!important}}';
  style.textContent += '@media(prefers-color-scheme:light){#red-loop-root{background:rgba(250,249,247,.97);color:#27282d;border-color:#bfb6ba;box-shadow:0 12px 40px #38312a18;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}#red-loop-root .rl-head span{color:#a9233b}#red-loop-root button{background:#f4f2ee;color:#27282d;border-color:#c7bfc2}#red-loop-root .rl-start{background:#a9233b;color:#fff;border-color:#a9233b}#red-loop-root input{background:#fff;color:#27282d;border-color:#bfb6ba}#red-loop-root .rl-status,#red-loop-root .rl-counter{color:#45434b}#red-loop-root small{color:#65646c}#red-loop-root button:focus-visible,#red-loop-root input:focus-visible{outline-color:#a9233b}}';
  window.setInterval(tick, 1500);
  style.textContent += '#red-loop-root.rl-min #rl-prompt{display:none}';
  // touch-action keeps a drag from scrolling the page underneath.
  style.textContent += '#red-loop-root .rl-head{cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none}#red-loop-root .rl-head:active{cursor:grabbing}#red-loop-root .rl-head button{cursor:pointer;touch-action:auto}';
  style.textContent += '#red-loop-root .rl-work,#red-loop-root .rl-decide{width:100%;margin-top:6px;font-size:12px}#red-loop-root .rl-background-label,#red-loop-root .rl-endless-label{display:flex;align-items:flex-start;gap:8px;font-size:12px}#red-loop-root #rl-background,#red-loop-root #rl-endless{width:18px;height:18px;flex-shrink:0;margin:0;accent-color:#b83c56}#red-loop-root #rl-background-help,#red-loop-root #rl-endless-help{font-size:11px;color:#bac2d0;margin:5px 0 12px}@media(prefers-color-scheme:light){#red-loop-root #rl-background-help,#red-loop-root #rl-endless-help{color:#65646c}}';
  if (embedded) {
    // In the app the page is always the active view, so the foreground option
    // is meaningless there. The inset keeps the panel above the app toolbar.
    root.classList.add('rl-embedded');
    const requested = Number(hostConfig.bottomInset);
    const inset = Number.isFinite(requested) ? Math.max(0, Math.min(240, Math.round(requested))) : 0;
    style.textContent += '#red-loop-root.rl-embedded{right:10px;bottom:calc(env(safe-area-inset-bottom,0px) + ' + inset + 'px);width:min(290px,calc(100vw - 20px))}#red-loop-root.rl-embedded .rl-background-label,#red-loop-root.rl-embedded #rl-background-help{display:none}';
  }
  report();
})();
