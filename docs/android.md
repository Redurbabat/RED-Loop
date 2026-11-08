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

## Woher das Skript kommt

Dasselbe wie bei iOS: `userscripts/red-loop.user.js`, geholt von deinem privaten Worker unter `/red-loop-webview.js`, mit der zuletzt geladenen und der mitgelieferten Fassung als Rückfall. `npm run check` erzwingt, dass die mitgelieferte Android-Fassung byteweise mit der Quelle übereinstimmt. Wer auf diesen Worker veröffentlichen kann, bestimmt damit Code, der in deiner angemeldeten ChatGPT-Seite läuft — siehe [In-App-Chat](iphone-chat.md).

## Grenzen und was nicht geprüft ist

- **Auf keinem Gerät verifiziert.** Weder das Laden von ChatGPT in einem Android-WebView noch der Hintergrundbetrieb bei schwarzem Bildschirm wurde beobachtet. Die JVM-Unit-Tests decken nur die Logik ab, nicht das Verhalten auf dem Tablet.
- Das Auslegen eines WebViews ohne Fenster ist die Stelle, die beim ersten Test am ehesten klemmt. Zeigt das Panel „Eingabefeld nicht gefunden", liegt es daran.
- Jeder geöffnete ChatGPT-WebView braucht spürbar Arbeitsspeicher. Acht ist die Obergrenze der App; realistisch sind auf einem Tablet drei bis fünf, darüber beendet Android den Prozess.
- Automatische Fortsetzungen verbrauchen laufend ChatGPT-Kontingent und unterliegen den Bedingungen des Dienstes.
- Die App ist für Sideloading gedacht. Ein Vordergrund-Dienst vom Typ `specialUse` müsste für den Play Store gesondert begründet werden.
