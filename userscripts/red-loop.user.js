// ==UserScript==
// @name         RED Loop — ChatGPT Auto Continue
// @namespace    https://github.com/Redurbabat/RED-Loop
// @version      0.3.0
// @description  Opt-in, bounded automatic continuation for one ChatGPT conversation.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(() => {
  'use strict';
  if (window.top !== window.self || document.getElementById('red-loop-root')) return;
  const PREFIX = 'red-loop:v1:';
  const MAX_STEPS = 50;
  const MAX_PROMPT_LENGTH = 4000;
  const PROMPT = 'Fahre mit dem bisherigen Auftrag fort. Prüfe den bisherigen Stand, erledige den nächsten sinnvollen Arbeitsschritt und berichte konkret über das Ergebnis. Wiederhole keine bereits erledigten Schritte.';
  const WORK_PROMPT = 'Arbeite am bisherigen Auftrag weiter. Prüfe zuerst, welche Aufgaben noch offen sind. Führe den nächsten sinnvollen Arbeitsschritt tatsächlich aus, prüfe das Ergebnis und berichte kurz über Fortschritt und verbleibende Aufgaben. Wiederhole keine erledigten Schritte und erfinde keine Ergebnisse. Wenn du eine Rückfrage, Zugangsdaten oder eine Freigabe von mir brauchst, halte an, erkläre konkret was fehlt und beende die Antwort mit [RED_LOOP_RUECKFRAGE] als eigener Zeile. Wenn alle Aufgaben des Auftrags erledigt und überprüft sind, fasse das Ergebnis zusammen und beende die Antwort mit [RED_LOOP_FERTIG] als eigener Zeile. Andernfalls arbeite an den offenen Aufgaben weiter.';
  const state = { running: false, count: 0, limit: 10, prompt: PROMPT, background: false, lastMessage: '', lastChange: 0, pending: false, lastSubmit: 0, submittedSignature: '', awaiting: false, composing: false, composeStarted: 0, composeSignature: '', composeText: '' };
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
    <p id="rl-prompt-help">Wird nach jeder fertigen Antwort gesendet. Aktivieren mit Start.</p>
    <label class="rl-background-label"><input id="rl-background" type="checkbox" aria-describedby="rl-background-help"> Auch im Hintergrund weiterarbeiten</label>
    <p id="rl-background-help">Browser und Chat offen lassen; PC muss wach bleiben. Mit Auftragstext: Stopp bei Fertigmeldung oder Rückfrage.</p>
    <div class="rl-row"><label for="rl-limit">Max. Fortsetzungen</label><input id="rl-limit" type="number" min="1" max="50" value="10"></div>
    <div class="rl-row"><button class="rl-start" type="button">Start</button><button class="rl-stop" type="button" disabled>Stopp</button><button class="rl-reset" type="button">Reset</button></div>
    <p class="rl-counter" aria-live="polite">0 / 10 Fortsetzungen</p>
    <small>v0.3.0 · Nur dieser Chat · Limit 1–50 · Kein automatischer Neustart nach Neuladen</small></div>`;
  const style = document.createElement('style');
  style.textContent = `#red-loop-root{position:fixed;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);z-index:2147483646;width:min(290px,calc(100vw - 24px));font:14px/1.45 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:rgba(24,27,34,.94);color:#f7f7f9;border:1px solid #ffffff50;border-radius:18px;box-shadow:0 12px 40px #0007;backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);padding:12px}#red-loop-root *{box-sizing:border-box}#red-loop-root .rl-head,#red-loop-root .rl-row{display:flex;justify-content:space-between;align-items:center;gap:8px}#red-loop-root .rl-head span{color:#ff7181}#red-loop-root button{cursor:pointer;border:1px solid #ffffff42;background:#ffffff20;color:#fff;border-radius:10px;padding:8px 12px;min-height:36px}#red-loop-root button:disabled{opacity:.4;cursor:default}#red-loop-root .rl-start{background:#9c3349}#red-loop-root .rl-status{margin:12px 0;color:#d6deeb}#red-loop-root input{width:64px;padding:6px;background:#12151b;border:1px solid #ffffff55;border-radius:7px;color:#fff}#red-loop-root small{display:block;margin-top:9px;color:#bac2d0}#red-loop-root.rl-min .rl-body{display:none}#red-loop-root button:focus-visible,#red-loop-root input:focus-visible{outline:2px solid #a7d6ff;outline-offset:2px}`;
  document.documentElement.append(style);
  document.body.append(root);
  const $ = s => root.querySelector(s);
  const status = msg => { $('.rl-status').textContent = msg; };
  const persist = () => {
    try { sessionStorage.setItem(currentKey, JSON.stringify({ count: state.count, limit: state.limit, prompt: state.prompt, background: state.background })); } catch {}
  };
  const stop = msg => {
    state.running = false; state.pending = false; state.composing = false; persist();
    $('.rl-start').disabled = false; $('.rl-stop').disabled = true; $('#rl-limit').disabled = false;
    $('#rl-prompt').disabled = false;
    $('#rl-background').disabled = false; $('.rl-work').disabled = false;
    status(msg || 'Gestoppt');
  };
  const load = () => {
    state.running = false; state.pending = false; state.composing = false;
    state.lastMessage = ''; state.submittedSignature = ''; state.awaiting = false; state.lastSubmit = 0;
    state.count = 0; state.limit = 10; state.prompt = PROMPT; state.background = false;
    try {
      const saved = JSON.parse(sessionStorage.getItem(currentKey) || '{}');
      state.count = Number.isInteger(saved.count) ? Math.max(0, Math.min(MAX_STEPS, saved.count)) : 0;
      state.limit = Number.isInteger(saved.limit) ? Math.max(1, Math.min(MAX_STEPS, saved.limit)) : 10;
      if (typeof saved.prompt === 'string' && saved.prompt.length <= MAX_PROMPT_LENGTH) state.prompt = saved.prompt;
      state.background = saved.background === true;
    } catch {}
    $('#rl-limit').value = String(state.limit);
    $('#rl-prompt').value = state.prompt;
    $('#rl-background').checked = state.background;
    $('.rl-counter').textContent = state.count + ' / ' + state.limit + ' Fortsetzungen';
    stop('Bereit');
    status('Bereit · ' + state.count + '/' + state.limit);
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
  const hasResponseError = () => {
    if ([...document.querySelectorAll('[data-testid="conversation-turn-error"],[data-testid="error-message"]')].some(visible)) return true;
    if (/(?:diese antwort konnte nicht geladen werden|this response could not be loaded)/i.test(lastAssistant()?.innerText || '')) return true;
    const latest = [...document.querySelectorAll('[data-conversation-role="assistant"]')].filter(visible).at(-1);
    return /(?:diese antwort konnte nicht geladen werden|this response could not be loaded)/i.test(latest?.parentElement?.innerText || '');
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
    if (hasResponseError() || isGenerating() || signature() !== state.composeSignature) return stop('Antwortzustand geändert – bitte prüfen');
    const btn = sendButton();
    if (!btn || btn.disabled) {
      if (Date.now() - state.composeStarted >= 6000) return stop('Senden nicht verfügbar – bitte prüfen');
      return status('Bereite Fortsetzung vor …');
    }
    btn.click();
    state.composing = false; state.count += 1;
    state.submittedSignature = state.composeSignature; state.awaiting = true;
    state.lastSubmit = Date.now(); state.lastChange = Date.now();
    persist();
    $('.rl-counter').textContent = state.count + ' / ' + state.limit + ' Fortsetzungen';
    status('Fortsetzung ' + state.count + '/' + state.limit + ' gesendet');
  };
  const tick = () => {
    if (key() !== currentKey) { stop('Gestoppt: Konversation gewechselt'); currentKey = key(); load(); return; }
    if (!state.running || (!state.background && (document.hidden || !document.hasFocus()))) return;
    if (state.composing) return attemptSend();
    if (state.count >= state.limit) return stop('Limit erreicht');
    const draft = editor();
    if (draft && (draft.innerText || draft.value || '').trim()) return stop('Entwurf erkannt – nicht überschrieben');
    if (hasResponseError()) return stop('Antwortfehler erkannt');
    if (isGenerating()) { status('ChatGPT antwortet …'); return; }
    const sig = signature();
    if (!sig) return status('Warte auf eine ChatGPT-Antwort …');
    if (state.awaiting) {
      if (sig === state.submittedSignature) {
        if (Date.now() - state.lastSubmit > 90000) return stop('Keine neue Antwort – bitte ChatGPT prüfen');
        return status('Warte auf neue Antwort …');
      }
      state.awaiting = false; state.pending = false;
    }
    if (sig !== state.lastMessage) { state.lastMessage = sig; state.lastChange = Date.now(); state.pending = false; return; }
    if (Date.now() - state.lastChange < 6500 || Date.now() - state.lastSubmit < 12000) return;
    const m = lastAssistant();
    if (!m || /(?:something went wrong|etwas ist schiefgelaufen|rate limit|try again|erneut versuchen)/i.test(m.innerText || '')) return stop('Antwortfehler erkannt');
    const answerLines = (m.innerText || '').split(/\r?\n/).map(line => line.trim());
    if (state.prompt.includes('[RED_LOOP_RUECKFRAGE]') && answerLines.includes('[RED_LOOP_RUECKFRAGE]')) return stop('Rückfrage – bitte Chat prüfen');
    if (state.prompt.includes('[RED_LOOP_FERTIG]') && answerLines.includes('[RED_LOOP_FERTIG]')) return stop('Auftrag abgeschlossen');
    const el = editor();
    if (!el) return stop('Eingabefeld nicht gefunden – bitte Oberfläche prüfen');
    if ((el.innerText || el.value || '').trim()) return stop('Entwurf erkannt – nicht überschrieben');
    if (state.pending) return;
    state.pending = true;
    if (!insertPrompt(el, state.prompt)) return stop('Eingabe fehlgeschlagen – ChatGPT-Oberfläche prüfen');
    state.composeText = (el.innerText || el.value || '').trim();
    state.composing = true; state.composeStarted = Date.now(); state.composeSignature = sig;
    attemptSend();
  };
  $('.rl-start').addEventListener('click', () => {
    if (state.running) return;
    if (!/^\/(?:g\/[^/]+\/)?c\/[^/]+/.test(location.pathname)) return status('Bitte eine bestehende Konversation öffnen');
    if (!$('#rl-background').checked && (document.hidden || !document.hasFocus())) return status('Bitte diesen Tab aktivieren');
    const el = editor();
    if (el && (el.innerText || el.value || '').trim()) return status('Entwurf erkannt – nicht überschrieben');
    const n = Number($('#rl-limit').value);
    if (!Number.isInteger(n) || n < 1 || n > MAX_STEPS) return status('Bitte Limit von 1 bis 50 wählen');
    const prompt = $('#rl-prompt').value.trim();
    if (!prompt || prompt.length > MAX_PROMPT_LENGTH) return status('Bitte einen Folgetext mit 1 bis 4000 Zeichen eingeben');
    if (state.count >= n) state.count = 0;
    state.limit = n; state.prompt = prompt; state.running = true; state.pending = false;
    state.background = $('#rl-background').checked;
    $('#rl-prompt').value = prompt; $('#rl-prompt').disabled = true;
    $('#rl-background').disabled = true; $('.rl-work').disabled = true;
    $('.rl-counter').textContent = state.count + ' / ' + state.limit + ' Fortsetzungen';
    state.lastMessage = signature(); state.lastChange = Date.now();
    $('.rl-start').disabled = true; $('.rl-stop').disabled = false; $('#rl-limit').disabled = true;
    persist(); status((state.background ? 'Hintergrund aktiv · ' : 'Aktiv · ') + state.count + '/' + state.limit);
  });
  $('.rl-work').addEventListener('click', () => {
    if (state.running) return;
    state.prompt = WORK_PROMPT; $('#rl-prompt').value = WORK_PROMPT; persist();
    status('Auftragstext geladen · Limit wählen und Start');
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
  $('#rl-limit').addEventListener('change', () => {
    if (state.running) return;
    const n = Number($('#rl-limit').value);
    if (!Number.isInteger(n) || n < 1 || n > MAX_STEPS) return status('Bitte Limit von 1 bis 50 wählen');
    state.limit = n; persist();
    $('.rl-counter').textContent = state.count + ' / ' + state.limit + ' Fortsetzungen';
    status('Bereit · ' + state.count + '/' + state.limit);
  });
  $('.rl-stop').addEventListener('click', () => stop('Manuell gestoppt'));
  $('.rl-reset').addEventListener('click', () => {
    stop('Zurückgesetzt'); state.count = 0; state.awaiting = false; state.submittedSignature = ''; state.lastSubmit = 0;
    persist(); $('.rl-counter').textContent = '0 / ' + state.limit + ' Fortsetzungen';
  });
  $('.rl-collapse').addEventListener('click', () => {
    const collapsed = root.classList.toggle('rl-min');
    $('.rl-collapse').textContent = collapsed ? '+' : '−';
    $('.rl-collapse').setAttribute('aria-label', collapsed ? 'Panel öffnen' : 'Panel minimieren');
    $('.rl-collapse').setAttribute('aria-expanded', String(!collapsed));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.running && !state.background) stop('Pausiert: Browser-Tab nicht aktiv');
  });
  window.addEventListener('pagehide', () => { if (state.running) stop('Pausiert: Seite verlassen'); });
  window.addEventListener('blur', () => { if (state.running && !state.background) stop('Gestoppt: Tab nicht im Fokus'); });
  load();
  style.textContent += '#red-loop-root{max-height:calc(100dvh - 32px);overflow-y:auto}#red-loop-root .rl-prompt-label{display:block;margin-bottom:5px}#red-loop-root #rl-prompt{display:block;width:100%;resize:vertical;min-height:76px;max-height:160px;padding:8px;border:1px solid #ffffff55;border-radius:8px;background:#12151b;color:#fff;font:inherit;font-size:12px;line-height:1.45}#red-loop-root #rl-prompt:disabled{opacity:.6;resize:none}#red-loop-root #rl-prompt:focus-visible{outline:2px solid #a7d6ff;outline-offset:2px}#red-loop-root #rl-prompt-help{font-size:12px;color:#bac2d0;margin:5px 0 12px}@media(prefers-color-scheme:light){#red-loop-root #rl-prompt{background:#fff;color:#27282d;border-color:#bfb6ba}#red-loop-root #rl-prompt-help{color:#65646c}#red-loop-root #rl-prompt:focus-visible{outline-color:#a9233b}}';
  style.textContent += '#red-loop-root button{min-height:44px}#red-loop-root .rl-counter{font-size:12px;color:#d6deeb}#red-loop-root.rl-min .rl-stop{display:block}#red-loop-root.rl-min .rl-body{display:block}#red-loop-root.rl-min .rl-body>*:not(.rl-row){display:none}#red-loop-root.rl-min .rl-row>label,#red-loop-root.rl-min .rl-row>input{display:none}@media(prefers-reduced-motion:reduce){#red-loop-root *{animation:none!important;transition:none!important}}';
  style.textContent += '@media(prefers-color-scheme:light){#red-loop-root{background:rgba(250,249,247,.97);color:#27282d;border-color:#bfb6ba;box-shadow:0 12px 40px #38312a18;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}#red-loop-root .rl-head span{color:#a9233b}#red-loop-root button{background:#f4f2ee;color:#27282d;border-color:#c7bfc2}#red-loop-root .rl-start{background:#a9233b;color:#fff;border-color:#a9233b}#red-loop-root input{background:#fff;color:#27282d;border-color:#bfb6ba}#red-loop-root .rl-status,#red-loop-root .rl-counter{color:#45434b}#red-loop-root small{color:#65646c}#red-loop-root button:focus-visible,#red-loop-root input:focus-visible{outline-color:#a9233b}}';
  window.setInterval(tick, 1500);
  style.textContent += '#red-loop-root.rl-min #rl-prompt{display:none}';
  style.textContent += '#red-loop-root .rl-work{width:100%;margin-top:6px;font-size:12px}#red-loop-root .rl-background-label{display:flex;align-items:flex-start;gap:8px;font-size:12px}#red-loop-root #rl-background{width:18px;height:18px;flex-shrink:0;margin:0;accent-color:#b83c56}#red-loop-root #rl-background-help{font-size:11px;color:#bac2d0;margin:5px 0 12px}@media(prefers-color-scheme:light){#red-loop-root #rl-background-help{color:#65646c}}';
})();
