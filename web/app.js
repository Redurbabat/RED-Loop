import {Loop} from './loop.js';
import {CloudConsole} from './cloud-console.js';
const $ = s => document.querySelector(s);
const labels = {ready:'Bereit für deinen nächsten Schritt', running:'Demo läuft', stopped:'Gestoppt', completed:'Limit erreicht', error:'Sicher gestoppt'};
const empty = $('.empty').cloneNode(true);
function render(state) {
  const active = state.status === 'running';
  $('#count').textContent = String(state.count).padStart(2,'0');
  $('#limit-display').textContent = String(state.limit).padStart(2,'0');
  $('#progress').max = state.limit; $('#progress').value = state.count;
  $('#progress-text').textContent = `${state.count} / ${state.limit}`;
  $('#status').textContent = labels[state.status];
  document.body.dataset.status = state.status;
  $('#start').disabled = active; $('#stop').disabled = !active;
  $('#limit').disabled = active; $('#scenario').disabled = active;
  $('#error').hidden = state.status !== 'error';
  $('#error').textContent = state.status === 'error' ? state.events[0]?.message : '';
  $('#event-count').textContent = `${state.events.length} EREIGNISSE`;
  if (state.events.length) $('#events').replaceChildren(...state.events.map(event => {
    const li = document.createElement('li'); const time = document.createElement('time');
    time.dateTime = new Date(event.time).toISOString(); time.textContent = new Date(event.time).toLocaleTimeString('de-CH');
    const span = document.createElement('span'); span.textContent = event.message; li.append(time,span); return li;
  }));
  if (state.messages.length) $('#messages').replaceChildren(...state.messages.map(message => {
    const article = document.createElement('article'); article.className = `message ${message.role}`;
    const label = document.createElement('small'); label.textContent = message.role === 'user' ? 'DU · SIMULIERT' : 'RED LOOP · DEMO';
    const p = document.createElement('p'); p.textContent = message.text; article.append(label,p); return article;
  }));
  else $('#messages').replaceChildren(empty.cloneNode(true));
}
const loop = new Loop(render);
const cloudConsole = new CloudConsole(document);
$('#start').addEventListener('click', () => { if (loop.configure(Number($('#limit').value), $('#scenario').value)) loop.start(); });
$('#stop').addEventListener('click', () => loop.stop());
$('#reset').addEventListener('click', () => loop.reset());
$('#limit').addEventListener('change', () => loop.configure(Number($('#limit').value), $('#scenario').value));
document.addEventListener('visibilitychange', () => { if (document.hidden) loop.stop('Gestoppt: Tab nicht sichtbar.'); });
window.addEventListener('pagehide', () => loop.stop('Seite verlassen.'));
function navigate() {
  const name = ['dashboard','cloud','integration','privacy'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
  if (name !== 'dashboard') loop.stop('Gestoppt: Dashboard verlassen.');
  document.querySelectorAll('.view').forEach(view => { view.hidden = view.id !== name; });
  cloudConsole.setVisible(name === 'cloud');
  document.querySelectorAll('nav a').forEach(a => { if (a.dataset.view === name) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  if (location.hash) { $('#main').focus({preventScroll:true}); window.scrollTo(0,0); }
}
window.addEventListener('hashchange', navigate); navigate();
let theme = 'system'; try { theme = localStorage.getItem('red-loop-theme') || 'system'; } catch {}
function applyTheme() { if (!['system','light','dark'].includes(theme)) theme='system'; document.documentElement.dataset.theme = theme; $('#theme').textContent = `Darstellung: ${{system:'System',light:'Hell',dark:'Dunkel'}[theme]}`; }
$('#theme').addEventListener('click', () => { theme = {system:'light',light:'dark',dark:'system'}[theme]; try {localStorage.setItem('red-loop-theme',theme);} catch {} applyTheme(); });
applyTheme(); render(loop.state);
