# RED Loop auf Android: mehrere Chats, Bildschirm aus

Die Android-App ist der einzige RED-Loop-Weg, auf dem Fortsetzungen weiterlaufen, während der Bildschirm aus ist und du etwas anderes tust. iOS verbietet das; Android erlaubt es über einen **Vordergrund-Dienst**.

## Was sie kann

- **Mehrere Chats gleichzeitig**, bis zu acht. Jeder Chat ist ein eigener WebView mit eigenem Panel, eigenem Zähler und eigenem Limit.
- **Weiterarbeiten bei schwarzem Bildschirm.** Ein Vordergrund-Dienst hält den Prozess am Leben, ein Partial-Wake-Lock hält die CPU wach, solange mindestens ein Lauf aktiv ist.
- **Die WebViews gehören dem Dienst, nicht der Oberfläche.** Du kannst die App verlassen oder zwischen Chats wechseln, ohne einen Lauf zu beenden.
- **Chatnamen aus ChatGPT.** Jeder Tab übernimmt den Titel der Unterhaltung. Langes Drücken auf einen Tab öffnet *Umbenennen* und *Schließen*; ein selbst vergebener Name gewinnt, ein leerer Name schaltet zurück auf den ChatGPT-Titel.
- **Die Tabs merken sich ihre Unterhaltung.** Adresse und Name jedes Chats liegen in den App-Einstellungen; nach einem Neustart öffnet jeder Tab wieder genau seine Unterhaltung. Gespeichert wird nur eine echte `/c/...`-Adresse bei ChatGPT, nichts aus dem Anmeldeverlauf.
- **Übersicht.** Der Knopf *Übersicht* unten zeigt alle Chats auf einer Seite: Name, Status, Zählerstand, ein Pause-Knopf je Chat und *Alle pausieren*. Ein Tippen auf eine Zeile öffnet diesen Chat.
- **Das Panel lässt sich verschieben.** Am Kopf des Panels ziehen; die Position gilt für alle Chats und bleibt erhalten. Es bleibt immer im sichtbaren Bereich, auch nach dem Drehen.
- **Dauerhafte Mitteilung** mit Stand („3 von 5 Chats aktiv · 41 Fortsetzungen") und einer Aktion **Alle pausieren**. Android verlangt diese Mitteilung als Gegenleistung für den Hintergrundbetrieb.
- **Eigene Mitteilung je Chat**, wenn ein Lauf von selbst anhält — mit Chatname, Grund und Zählerstand. Eine Pause, die du auslöst, meldet sich nicht.

## Installieren

1. In Codemagic den Workflow **„RED Loop - Android APK (Debug, direkt installierbar)"** bauen. Er läuft auf einer Linux-Maschine, führt zuerst die JVM-Unit-Tests aus und baut dann das APK.
2. Artefakt `app-debug.apk` herunterladen und auf das Tablet kopieren.
3. Auf dem Tablet öffnen und die Installation aus unbekannter Quelle erlauben.

Ein Debug-APK ist mit dem Standard-Debug-Schlüssel signiert und installiert sich direkt. Kein Entwicklerkonto, kein Store, keine Profile.

## Warum ein unsichtbares Fenster nötig ist

Ein WebView ohne Fenster bekommt von Android kein verlässliches Layout. Die Seite hat dann keine sichtbare Eingabezeile, und das Panel meldet „Eingabefeld nicht gefunden" oder wartet ewig auf eine Antwort — genau das passierte in der ersten Fassung mit Chats, die man nicht ansah.

Deshalb parkt der Dienst die nicht angezeigten WebViews in einem eigenen Fenster: vollständig durchsichtig, nicht berührbar, ohne Fokus. Dafür braucht die App die Berechtigung **„Über anderen Apps anzeigen"**. Ohne sie fällt die App auf manuelles Auslegen zurück — dann arbeitet nur der Chat zuverlässig weiter, den du gerade ansiehst. Die Übersicht sagt dir, welcher Zustand gerade gilt.

## Hintergrundbetrieb einrichten

Die **Übersicht** in der App prüft selbst, was Android noch erlauben muss, und bietet für jeden Punkt einen Knopf, der direkt die passende Systemseite öffnet: Mitteilungen, „Über anderen Apps anzeigen", Akku-Optimierung und die Herstellereinstellungen. Das ersetzt das Abarbeiten der folgenden Liste von Hand — die bleibt als Nachschlagewerk.

## Xiaomi: ohne diese vier Schritte läuft nichts

MIUI und HyperOS beenden Hintergrund-Apps aggressiver als jedes andere Android. Das trifft jede App gleichermaßen, unabhängig davon, wie sauber sie gebaut ist:

1. **Mitteilungen erlauben.** Ohne sie gibt es keinen Vordergrund-Dienst und damit keinen Hintergrundbetrieb. Die App fragt beim ersten Start.
2. **Autostart aktivieren:** Einstellungen → Apps → Apps verwalten → RED Loop → *Autostart*.
3. **Energiesparen abschalten:** in derselben Ansicht → *Energiesparen* bzw. *Batteriesparfunktion* → **Keine Einschränkungen**.
4. **In den zuletzt verwendeten Apps fixieren:** App-Übersicht öffnen, die RED-Loop-Karte nach unten ziehen oder lange drücken, **Schloss** antippen.

Zusätzlich hilft es, das Tablet am Ladegerät zu lassen. Fehlt einer dieser Schritte, beendet das System die App nach Minuten bis Stunden — der Loop hält dann einfach an, ohne Fehlermeldung.

## So funktioniert es technisch

`LoopService` ist ein Vordergrund-Dienst vom Typ `specialUse`. Er besitzt alle `ChatSession`-Objekte; jedes hält einen eigenen `WebView`, der mit dem Anwendungskontext erzeugt wird und deshalb das Ende der Activity überlebt. Solange keine Oberfläche einen WebView anzeigt, wird er von Hand vermessen und ausgelegt (1080 × 1920), denn eine Seite ohne Layout hat keine sichtbare Eingabezeile, die das Panel bedienen könnte.

Injiziert wird beim `onPageFinished` der Hauptseite — das Android-Gegenstück zu „document end". Das Skript selbst verweigert eine zweite Instanz und jeden Origin außer ChatGPT.

Die Rückmeldung läuft über eine `@JavascriptInterface`-Brücke namens `RedLoopHost`, die einen JSON-String entgegennimmt. Sie wird nur angenommen, wenn die Seite gerade auf einem ChatGPT-Origin steht, und enthält ausschließlich `running`, `count`, `limit`, `endless` und die Statuszeile des Panels. **Kein Gesprächsinhalt und kein Folgetext verlässt die Seite.**

Navigationen im Hauptrahmen bleiben nur auf ChatGPT, seinen Anmeldediensten und den angebotenen Identitätsanbietern; alles andere geht an den Systembrowser.

## So wenig Handarbeit wie möglich

Drei Schalter nehmen dir die wiederkehrenden Handgriffe ab. Alle sind **aus**, bis du sie einschaltest.

**Automatisch starten** (pro Chat, langes Drücken auf den Tab → *Automatik*). Der Chat beginnt von selbst, sobald eine fertige Antwort dasteht und sich nichts mehr ändert. Du schreibst nur noch den Auftrag und lässt ihn liegen. Eine Pause, die du drückst, eine Fertigmeldung, eine Rückfrage und ein erreichtes Limit **blockieren den automatischen Start** — nichts davon startet sich selbst wieder. Erst Start oder das erneute Ankreuzen hebt die Blockade auf.

**Fehler selbst überbrücken** (pro Chat, dieselbe Stelle). Nach einem Antwortfehler, einer ausbleibenden Antwort oder einem nicht verfügbaren Senden-Knopf versucht es der Loop nach 20 Sekunden erneut, bis zu dreimal. Danach bleibt er stehen. Ein erkannter **Entwurf wird nie überbrückt** — dein eigener Text bleibt unangetastet, und eine Fertigmeldung oder Rückfrage ist kein Fehler.

**Nach Systemstopp fortsetzen** (in der Übersicht, **von Anfang an an**). Beendet Android die App, während Chats arbeiten, nehmen genau diese Chats ihre Arbeit beim nächsten Start von selbst wieder auf — unabhängig davon, ob für sie *Automatisch starten* gesetzt ist. Ein Chat, den **du** pausiert hattest, bleibt pausiert; ein Beenden der App über den Dienst gilt als Absicht und setzt nichts fort. Die Meldung sagt dir, dass fortgesetzt wird.

**Beim Einschalten starten** (in der Übersicht). Nach einem Neustart des Tablets fährt der Dienst von allein hoch und öffnet die Chats wieder auf ihren Unterhaltungen. Zusammen mit *Automatisch starten* nimmt ein Chat seine Arbeit ohne einen einzigen Handgriff wieder auf. Hersteller-Autostart muss dafür trotzdem erlaubt sein.

In der Übersicht steht hinter jedem Chat, was für ihn gilt: **[A]** automatisch starten, **[F]** Fehler überbrücken.

### Zwei Vorlagentexte

Neben *Text für offene Aufgaben laden* gibt es **Text: selbst entscheiden**. Der verlangt, dass der Assistent an Entscheidungspunkten selbst die sinnvollste Wahl trifft, sie in einem Satz begründet und weiterarbeitet, statt zurückzufragen. Angehalten wird nur noch für Dinge, die wirklich nur du liefern kannst: Zugangsdaten, eine Freigabe für etwas Unumkehrbares, eine nicht erschließbare Information. Beide Texte lassen sich frei überschreiben — wenn du deine Anweisungen ohnehin in die erste Nachricht schreibst, brauchst du keinen von beiden.

Die Einstellungen pro Chat überleben einen Neustart, weil die App sie neben Adresse und Namen sichert — der Sitzungsspeicher der Seite überlebt das Schließen des WebViews nicht.

### Wenn ChatGPT dichtmacht

Ein erschöpftes Kontingent ist kein Fehler, sondern eine Wartezeit. Der Loop erkennt die entsprechende Meldung, hält an und versucht es — wenn *Fehler überbrücken* an ist — alle zehn Minuten erneut, bis zu zwölfmal. Das deckt rund zwei Stunden ab und verbraucht nicht das Fehler-Budget von drei schnellen Versuchen. Im Panel steht „Kontingent erschöpft · wartet 10 Min (1/12)".

Ebenso zählt eine lange Antwort nicht mehr als Stillstand: solange ChatGPT sichtbar schreibt, läuft die 90-Sekunden-Frist für „keine neue Antwort" nicht.

## Wenn das System die App beendet

Android kann einen Hintergrundprozess jederzeit beenden, und bisher merktest du das nur daran, dass nichts mehr passierte. Der Dienst hinterlegt jetzt beim Start eine Markierung und löscht sie beim ordentlichen Beenden. Fehlt sie beim nächsten Start und waren Läufe aktiv, meldet die App: **„Läufe wurden vom System gestoppt"** mit der Anzahl und dem Hinweis auf die Freigaben in der Übersicht. Die Meldung zählt mit, zum wievielten Mal das passiert ist, und sagt es ab dem dritten Mal deutlich — ein Tablet, das die App ständig abschießt, erkennst du daran sofort. Die Übersicht zeigt den Zähler und lässt ihn zurücksetzen. Die Chats selbst kommen mit ihrer Unterhaltung zurück; fortgesetzt wird nichts von allein — Start bleibt deine Entscheidung.

## Chat-Menü und Skriptquelle

Langes Drücken auf einen Tab öffnet: *Umbenennen*, *Panel einblenden* (holt ein verschobenes oder minimiertes Panel zurück in die Ecke), *Seite neu laden*, *Zur Chatliste* und *Schließen*.

In der Übersicht lässt sich außerdem das Laden des Skripts von Cloudflare ein- und ausschalten und das Skript neu holen. Neu geladen werden dabei nur Chats, die gerade **nicht** laufen — ein Neuladen würde deren Lauf beenden. Laufende Chats behalten ihr Skript, bis du sie selbst neu lädst.

## Woher das Skript kommt

Dasselbe wie bei iOS: `userscripts/red-loop.user.js`, geholt von deinem privaten Worker unter `/red-loop-webview.js`, mit der zuletzt geladenen und der mitgelieferten Fassung als Rückfall. `npm run check` erzwingt, dass die mitgelieferte Android-Fassung byteweise mit der Quelle übereinstimmt. Wer auf diesen Worker veröffentlichen kann, bestimmt damit Code, der in deiner angemeldeten ChatGPT-Seite läuft — siehe [In-App-Chat](iphone-chat.md).

## Grenzen und was nicht geprüft ist

- **Auf keinem Gerät verifiziert.** Weder das Laden von ChatGPT in einem Android-WebView noch der Hintergrundbetrieb bei schwarzem Bildschirm wurde beobachtet. Die JVM-Unit-Tests decken nur die Logik ab, nicht das Verhalten auf dem Tablet.
- Das Auslegen eines WebViews ohne Fenster ist die Stelle, die beim ersten Test am ehesten klemmt. Zeigt das Panel „Eingabefeld nicht gefunden", liegt es daran.
- Jeder geöffnete ChatGPT-WebView braucht spürbar Arbeitsspeicher. Acht ist die Obergrenze der App; realistisch sind auf einem Tablet drei bis fünf, darüber beendet Android den Prozess.
- Automatische Fortsetzungen verbrauchen laufend ChatGPT-Kontingent und unterliegen den Bedingungen des Dienstes.
- Die App ist für Sideloading gedacht. Ein Vordergrund-Dienst vom Typ `specialUse` müsste für den Play Store gesondert begründet werden.
