// ==UserScript==
// @name         RED Loop — ChatGPT Auto Continue
// @namespace    https://github.com/Redurbabat/RED-Loop
// @version      0.1.0
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
  const PROMPT = 'Fahre mit dem bisherigen Auftrag fort. Prüfe den bisherigen Stand, erledige den nächsten sinnvollen Arbeitsschritt und berichte konkret über das Ergebnis. Wiederhole keine bereits erledigten Schritte.';
  const state = { running: false, count: 0, limit: 10, lastMessage: '', lastChange: 0, pending: false, lastSubmit: 0 };
  const key = () => PREFIX + (location.pathname.match(/^\/c\/[^/]+/)?.[0] || location.pathname);
  let currentKey = key();
  const root = document.createElement('aside');
  root.id = 'red-loop-root';
  root.setAttribute('aria-label', 'RED Loop Steuerung');
  root.innerHTML = `<div class="rl-head"><strong>RED <span>Loop</span></strong><button class="rl-collapse" aria-label="Panel minimieren" type="button">−</button></div>
    <div class="rl-body"><p class="rl-status" role="status" aria-live="polite">Bereit</p>
    <div class="rl-row"><label for="rl-limit">Max. Fortsetzungen</label><input id="rl-limit" type="number" min="1" max="50" value="10"></div>
    <div class="rl-row"><button class="rl-start" type="button">Start</button><button class="rl-stop" type="button" disabled>Stopp</button></div>
    <small>Nur dieser Chat · Safari muss aktiv bleiben · Keine unbegrenzte Ausführung</small></div>`;
  const style = document.createElement('style');
  style.textContent = `#red-loop-root{position:fixed;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 16px);z-index:2147483646;width:min(290px,calc(100vw - 24px));font:14px/1.45 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:rgba(24,27,34,.94);color:#f7f7f9;border:1px solid #ffffff50;border-radius:18px;box-shadow:0 12px 40px #0007;backdrop-filter:blur(22px);-webkit-backdrop-filter:blur(22px);padding:12px}#red-loop-root *{box-sizing:border-box}#red-loop-root .rl-head,#red-loop-root .rl-row{display:flex;justify-content:space-between;align-items:center;gap:8px}#red-loop-root .rl-head span{color:#ff7181}#red-loop-root button{cursor:pointer;border:1px solid #ffffff42;background:#ffffff20;color:#fff;border-radius:10px;padding:8px 12px;min-height:36px}#red-loop-root button:disabled{opacity:.4;cursor:default}#red-loop-root .rl-start{background:#9c3349}#red-loop-root .rl-status{margin:12px 0;color:#d6deeb}#red-loop-root input{width:64px;padding:6px;background:#12151b;border:1px solid #ffffff55;border-radius:7px;color:#fff}#red-loop-root small{display:block;margin-top:9px;color:#bac2d0}#red-loop-root.rl-min .rl-body{display:none}#red-loop-root button:focus-visible,#red-loop-root input:focus-visible{outline:2px solid #a7d6ff;outline-offset:2px}`;
  document.documentElement.append(style);
  document.body.append(root);
  const $ = s => root.querySelector(s);
  const status = msg => { $('.rl-status').textContent = msg; };
  const persist = () => {
    try { sessionStorage.setItem(currentKey, JSON.stringify({ running: state.running, count: state.count, limit: state.limit })); } catch {}
  };
  const stop = msg => {
    state.running = false; state.pending = false; persist();
    $('.rl-start').disabled = false; $('.rl-stop').disabled = true; $('#rl-limit').disabled = false;
    status(msg || 'Gestoppt');
  };
  const load = () => {
    stop('Bereit');
    state.count = 0; state.limit = 10;
    try {
      const saved = JSON.parse(sessionStorage.getItem(currentKey) || '{}');
      state.count = Number.isInteger(saved.count) ? Math.max(0, Math.min(MAX_STEPS, saved.count)) : 0;
      state.limit = Number.isInteger(saved.limit) ? Math.max(1, Math.min(MAX_STEPS, saved.limit)) : 10;
    } catch {}
    $('#rl-limit').value = String(state.limit);
    status('Bereit · ' + state.count + '/' + state.limit);
  };
  const isGenerating = () => !!document.querySelector('button[data-testid="stop-button"],button[aria-label*="Stop generating"],button[aria-label*="Generierung stoppen"]');
  const messages = () => [...document.querySelectorAll('[data-message-author-role="assistant"]')];
  const lastAssistant = () => messages().at(-1);
  const editor = () => document.querySelector('#prompt-textarea[contenteditable="true"],[data-testid="composer-input"][contenteditable="true"],textarea#prompt-textarea');
  const sendButton = () => document.querySelector('button[data-testid="send-button"],button[aria-label="Send prompt"],button[aria-label="Nachricht senden"]');
  const signature = () => {
    const m = lastAssistant();
    return m ? String(messages().length) + ':' + (m.innerText || '').trim().slice(-400) : '';
  };
  const insertPrompt = (el, value) => {
    el.focus();
    if (el instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (!setter) return false;
      setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // Avoid hidden React state manipulation: use a real editing command and input event.
      document.execCommand('selectAll', false);
      if (!document.execCommand('insertText', false, value)) return false;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    }
    return (el.innerText || el.value || '').trim() === value;
  };
  const tick = () => {
    if (key() !== currentKey) { currentKey = key(); load(); return; }
    if (!state.running || document.hidden || !document.hasFocus()) return;
    if (state.count >= state.limit) return stop('Limit erreicht');
    if (isGenerating()) { state.pending = false; status('ChatGPT antwortet …'); return; }
    const sig = signature();
    if (!sig) return status('Warte auf eine ChatGPT-Antwort …');
    if (sig !== state.lastMessage) { state.lastMessage = sig; state.lastChange = Date.now(); state.pending = false; return; }
    if (Date.now() - state.lastChange < 6500 || Date.now() - state.lastSubmit < 12000) return;
    const m = lastAssistant();
    if (!m || /(?:something went wrong|etwas ist schiefgelaufen|rate limit|try again|erneut versuchen)/i.test(m.innerText || '')) return stop('Antwortfehler erkannt');
    const el = editor();
    if (!el) return status('Eingabefeld nicht gefunden');
    if ((el.innerText || el.value || '').trim()) return stop('Entwurf erkannt – nicht überschrieben');
    if (state.pending) return;
    state.pending = true;
    if (!insertPrompt(el, PROMPT)) return stop('Eingabe fehlgeschlagen – ChatGPT-Oberfläche prüfen');
    const btn = sendButton();
    if (!btn || btn.disabled) return stop('Senden nicht verfügbar – bitte prüfen');
    btn.click();
    state.count += 1;
    state.lastSubmit = Date.now();
    state.lastChange = Date.now();
    persist();
    status('Fortsetzung ' + state.count + '/' + state.limit + ' gesendet');
  };
  $('.rl-start').addEventListener('click', () => {
    const n = Number($('#rl-limit').value);
    if (!Number.isInteger(n) || n < 1 || n > MAX_STEPS) return status('Bitte Limit von 1 bis 50 wählen');
    if (state.count >= n) state.count = 0;
    state.limit = n; state.running = true; state.pending = false;
    state.lastMessage = signature(); state.lastChange = Date.now();
    $('.rl-start').disabled = true; $('.rl-stop').disabled = false; $('#rl-limit').disabled = true;
    persist(); status('Aktiv · ' + state.count + '/' + state.limit);
  });
  $('.rl-stop').addEventListener('click', () => stop('Manuell gestoppt'));
  $('.rl-collapse').addEventListener('click', () => {
    const collapsed = root.classList.toggle('rl-min');
    $('.rl-collapse').textContent = collapsed ? '+' : '−';
    $('.rl-collapse').setAttribute('aria-label', collapsed ? 'Panel öffnen' : 'Panel minimieren');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.running) stop('Pausiert: Safari-Tab nicht aktiv');
  });
  window.addEventListener('pagehide', () => { if (state.running) stop('Pausiert: Seite verlassen'); });
  load();
  window.setInterval(tick, 1500);
})();
