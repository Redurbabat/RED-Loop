# ChatGPT in der iPhone-App (Tab „Chat")

Die App zeigt chatgpt.com in einem `WKWebView` und legt das RED-Loop-Panel darüber. Damit entfällt der Weg über Safari und seine Website-Freigabe. Der Loop erkennt die fertige Antwort selbst und sendet den Folgetext erneut, bis du pausierst.

## Ablauf

1. Tab **Chat** öffnen und bei ChatGPT anmelden. Die Anmeldung liegt im Datenspeicher dieser App, getrennt von Safari.
2. Eine Unterhaltung öffnen oder anlegen und **den Auftrag selbst schreiben**. RED Loop schickt den ersten Auftrag nicht.
3. Erste Antwort abwarten. Im Panel steht der Folgetext für offene Aufgaben bereit, **Endlos bis Pause** ist in der App voreingestellt.
4. **Start** drücken. Nach jeder fertigen Antwort sendet das Panel den Folgetext erneut.
5. **Pause** beendet den Lauf. Der Knopf unten in der App wirkt auf dasselbe Panel und ist auch erreichbar, wenn das Panel minimiert oder weggescrollt ist. Start bleibt bewusst im Panel, damit Folgetext und Limit vorher geprüft werden.

Nach einer Pause setzt Start denselben Lauf mit demselben Zähler fort. Der Zähler gilt pro Unterhaltung und steht im Sitzungsspeicher der Seite; ein Neuladen startet nie von selbst neu.

## Das Panel verschieben

Am Kopf des Panels („RED Loop") ziehen. Die Position wird im lokalen Speicher der Seite gehalten, gilt für alle Chats und bleibt nach einem Neuladen erhalten. Beim Drehen oder in einem kleineren Fenster rückt das Panel automatisch zurück in den sichtbaren Bereich. Die Knöpfe im Kopf bleiben Knöpfe; ein Druck darauf verschiebt nichts.

## Mitteilung beim Anhalten

Hält der Loop von selbst an, meldet sich die App mit einer lokalen Mitteilung samt Grund und Zählerstand: „Auftrag abgeschlossen", „ChatGPT hat eine Rückfrage", „Limit erreicht" oder „Loop angehalten" mit der Statuszeile des Panels. Damit musst du das iPhone nicht im Blick behalten, während es auf dem Tisch liegt.

Eine Pause, die du selbst auslöst, und ein Stopp beim Wechsel der Unterhaltung werden **nicht** gemeldet — die hast du verursacht. Die Erlaubnis für Mitteilungen fragt die App erst beim ersten Start eines Laufs, nicht beim Öffnen. Die Mitteilung erscheint auch im Vordergrund, weil der Loop ohnehin nur dort läuft. Abschaltbar unter „Melden, wenn der Loop anhält" im Menü des Chat-Tabs. Nichts wird im Voraus geplant und nichts verlässt das Gerät.

## Wann der Loop von selbst anhält

- `[RED_LOOP_FERTIG]` oder `[RED_LOOP_RUECKFRAGE]` als letzte nichtleere Zeile einer fertigen Antwort. Beides fordert der voreingestellte Folgetext ausdrücklich an. **Das ist die Aussage des Assistenten; RED Loop prüft nicht nach, ob die Arbeit wirklich erledigt ist.**
- Ein erkannter Antwortfehler des Dienstes, ein eigener Entwurf im Eingabefeld, ein Wechsel der Unterhaltung, ein fehlendes Eingabefeld, ein nicht verfügbarer Senden-Knopf und eine ausbleibende neue Antwort.
- Bei gesetztem Zahlenlimit zusätzlich beim Limit. Im Endlos-Modus greift nur eine Zähler-Obergrenze von 100 000.

Vorhandene Entwürfe werden nie überschrieben, und eine unveränderte vorherige Antwort kann keinen zweiten Versand auslösen.

## Grenzen

- **Nur im Vordergrund.** iOS hält die Seite an, sobald die App in den Hintergrund geht oder sich das iPhone sperrt. Während eines Laufs bleibt der Bildschirm an (`isIdleTimerDisabled`). Kehrt die App zurück, startet das Panel seine Wartefristen neu und arbeitet weiter, statt einen Stillstand zu melden, der nie passiert ist. Hat iOS die Seite dabei eingefroren oder entladen, meldet das Panel „Pausiert: Seite verlassen"; ein Start setzt denselben Lauf mit demselben Zähler fort. Welches der beiden Verhalten ein `WKWebView` zeigt, ist hier nicht geprüft.
- Für Arbeit nach dem Schließen der App sind [Cloud-Aufträge](cloud-jobs.md) zuständig. Sie laufen auf dem Server und sind von dieser Ansicht getrennt.
- Automatische Fortsetzungen verbrauchen laufend ChatGPT-Kontingent und unterliegen den Bedingungen des Dienstes.
- ChatGPT kann seine Oberfläche ändern. Dann fällt das Panel aus, bis das Skript angepasst ist.
- Nur chatgpt.com, seine Anmeldedienste und die angebotenen Identitätsanbieter bleiben in der App. Andere Adressen öffnet die App im Systembrowser, damit die angemeldete Ansicht kein allgemeiner Browser wird.
- **Auf einem physischen iPhone ist diese Ansicht nicht verifiziert.** Siehe [Testbericht](test-report.md).

## Woher das Skript kommt

Das Panel ist `userscripts/red-loop.user.js`, dieselbe Datei wie in der Safari- und Chromium-Erweiterung. `npm run build` legt sie zusätzlich als `dist/red-loop-webview.js` (vom Worker ausgeliefert) und `ios/REDLoop/Resources/red-loop-webview.js` (in der App) ab; `npm run check` erzwingt, dass alle drei Fassungen byteweise gleich sind.

Die App bevorzugt die Fassung des Servers, damit eine Anpassung an ChatGPT per `wrangler deploy` ankommt und keinen neuen App-Build braucht. Reihenfolge: Server → letzte erfolgreich geladene Fassung → mitgelieferte Fassung. Die Adresse kommt aus der im Schlüsselbund gespeicherten Verbindung, sonst aus der Voreinstellung; der Zugangstoken wird dabei **nicht** gesendet, denn das Skript ist eine öffentliche Datei.

Geladen wird nur über HTTPS und nur vom Host dieser Verbindung. Eine Inhaltsprüfung verwirft Fehlerseiten und abgeschnittene Downloads (Pflichtmerkmale, vollständiges Dateiende, Größengrenze 256 KiB). **Das ist eine Inhaltsprüfung, keine Vertrauensprüfung:** wer auf diesen Server veröffentlichen kann, bestimmt damit Code, der in deiner angemeldeten ChatGPT-Seite läuft. Im Menü des Chat-Tabs lässt sich „Skript von Cloudflare laden" abschalten; dann verwendet die App die mitgelieferte Fassung.

## Was die App der Seite sagt und was zurückkommt

Vor der Injektion setzt die App `window.__RED_LOOP_HOST__ = {app: 'ios-webview', bottomInset: <px>}`. Daraus wählt das Skript seine App-Voreinstellungen: Auftragstext, Endlos-Modus, Weiterarbeiten ohne Fensterfokus (ein `WKWebView` ist nie so fokussiert wie ein Desktop-Tab) und Platz über der Statuszeile. Die Einstellung enthält keine Zugangsdaten und kann keinen Lauf starten.

Zurück meldet das Panel ausschließlich `{type: 'state', running, count, limit, endless, status}` — Zähler und seine eigene Statuszeile. **Kein Gesprächsinhalt und kein Folgetext verlässt die Seite.** Die App nimmt diese Meldung nur von einem ChatGPT-Origin an und nutzt sie für Statuszeile, Pause-Knopf und Bildschirmsperre.

## Bauen und installieren

`ios/REDLoop.xcodeproj` enthält die neuen Dateien `ChatScript.swift` und `ChatView.swift` sowie die mitgelieferte Skriptfassung als App-Ressource. Das Projekt wird reproduzierbar von `python scripts/generate-ios-project.py` erzeugt. Für die Installation auf einem iPhone sind eine Apple-Signieridentität und passende Profile für App **und** Erweiterung nötig; siehe [Installation und Signierung](deployment.md).
