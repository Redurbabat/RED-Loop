export class Loop {
  constructor(onChange = () => {}, delay = 1600) {
    this.onChange = onChange; this.delay = delay; this.timer = null; this.generation = 0;
    this.state = {status:'ready', count:0, limit:5, scenario:'normal', events:[], messages:[]};
  }
  emit(message) {
    if (message) this.state.events.unshift({time:Date.now(), message});
    this.state.events = this.state.events.slice(0, 80);
    this.onChange(this.state);
  }
  configure(limit, scenario = 'normal') {
    if (this.state.status === 'running') return false;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) { this.fail('Bitte ein ganzzahliges Limit von 1 bis 50 wählen.'); return false; }
    if (!['normal','error','draft'].includes(scenario)) return false;
    this.state.limit = limit; this.state.scenario = scenario; this.emit(); return true;
  }
  start() {
    if (this.state.status === 'running') return false;
    if (this.state.count >= this.state.limit) this.state.count = 0;
    this.state.status = 'running'; const generation = ++this.generation;
    this.emit('Demo gestartet. Keine Verbindung zu ChatGPT.');
    this.schedule(generation); return true;
  }
  schedule(generation) {
    this.timer = setTimeout(() => {
      if (generation !== this.generation || this.state.status !== 'running') return;
      if (this.state.scenario === 'error') return this.fail('Simulierter Antwortfehler. Erneut starten oder zurücksetzen.');
      if (this.state.scenario === 'draft') return this.fail('Simulierter Entwurf erkannt. Vorhandene Eingaben werden geschützt.');
      this.state.count++;
      const n = this.state.count;
      this.state.messages.push({role:'user', text:`Fortsetzung ${n}: Führe den nächsten sinnvollen Schritt aus.`}, {role:'assistant', text:`Demo-Schritt ${n} abgeschlossen. Ergebnis geprüft und Fortschritt gespeichert.`});
      this.state.messages = this.state.messages.slice(-12);
      this.emit(`Fortsetzung ${n} von ${this.state.limit} abgeschlossen.`);
      if (n >= this.state.limit) { this.state.status = 'completed'; this.emit('Limit erreicht. Die Demo ist beendet.'); }
      else this.schedule(generation);
    }, this.delay);
  }
  cancel() { clearTimeout(this.timer); this.timer = null; ++this.generation; }
  stop(reason = 'Manuell gestoppt.') {
    if (this.state.status !== 'running') return false;
    this.cancel(); this.state.status = 'stopped'; this.emit(reason); return true;
  }
  fail(message) { this.cancel(); this.state.status = 'error'; this.emit(message); }
  reset() {
    this.cancel(); this.state.count = 0; this.state.status = 'ready'; this.state.events = []; this.state.messages = [];
    this.emit('Zurückgesetzt. Bereit für einen neuen Test.');
  }
}
