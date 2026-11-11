# Signierte Skript-Releases – Vorbereitung

RED LOOP hat bislang eine feste SHA-256-Bindung an die in iPhone-/Android-App eingebettete Skriptdatei. **Dieser Schutz bleibt aktiv.** Die neue Node.js-CLI erlaubt es, künftige Skript-Releases offline zu signieren und zu prüfen. Sie ist **noch nicht mit dem nativen Update-Lader verbunden**; kein App-Update per Server ist durch diesen Commit freigeschaltet.

## Vertrauensmodell und Dateiformat

- Algorithmus: ECDSA P-256 / SHA-256, ASN.1-DER-Signatur als Base64.
- Die Manifestdatei `red-loop-webview.manifest.json` enthält ausschliesslich `format`, `version`, `sequence`, `sha256` und `signature`.
- `format` ist `red-loop-script-v1`. `version` muss dem `// @version x.y.z`-Header des Skripts entsprechen, `sha256` den **exakten UTF-8-Dateibytes**. `sequence` ist eine positive, bei Releases strikt steigende Ganzzahl.
- Die signierten Bytes sind exakt `RED_LOOP_SCRIPT_V1\n<version>\n<sequence>\n<sha256>\n` (ASCII, jede Zeile endet mit LF), **nicht** die JSON-Serialisierung.
- Die Prüffunktion kann Mindestversion und Mindestsequenz erzwingen; **erst die nativen Clients müssen diese Sequenz dauerhaft speichern**, um Rollback nach einem Neustart zu verhindern.
- Ohne einen zuvor in der signierten App verankerten öffentlichen Schlüssel darf kein neues Skript akzeptiert werden. Ein per Server bezogener öffentlicher Schlüssel ist keine Vertrauensbasis.

## Erstellung mit eigenen Schlüsseln

Den privaten P-256-Signierschlüssel **offline und ausserhalb dieses Repositorys** erstellen und sichern; niemals in ChatGPT, Git, Cloudflare Assets oder eine App-Ressource hochladen. Beispiel mit OpenSSL auf einem vertrauenswürdigen Rechner:

```sh
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out /private/red-loop-release-private.pem
openssl pkey -in /private/red-loop-release-private.pem -pubout -out /private/red-loop-release-public.pem
npm run release:sign -- --script userscripts/red-loop.user.js --private-key /private/red-loop-release-private.pem --sequence 1
npm run release:verify -- --script red-loop-signed-release/red-loop-webview.js --manifest red-loop-signed-release/red-loop-webview.manifest.json --public-key /private/red-loop-release-public.pem --min-sequence 1
```

Die Pfade sind Beispiele; unter Windows sind eigene Pfade anzugeben. Die privaten Schlüssel werden **niemals** in der CLI-Ausgabe ausgegeben. Das Standard-Ausgabeverzeichnis ist Git-ignored. Ein fertiges Manifest ohne zugehörigen öffentlichen Vertrauensanker in den nativen Apps darf nicht als funktionsfähiges Fernupdate veröffentlicht werden.

## Grenzen und Abnahme

Der CLI-Test `node --test tests/signed-script.test.mjs` verwendet kurzlebige Testschlüssel und testet gültige und manipulierte Skripte, falsche Schlüssel, Mindestsequenzen und die Signier-/Prüf-Kommandos. Er testet **nicht** eine reale iPhone-/Android-App. Vor der Aktivierung sind nötig: sicher bereitgestellter öffentlicher Produktionsschlüssel im signierten App-Build, native Signaturprüfung mit derselben kanonischen Nachricht, persistente Anti-Rollback-Sequenz, verifiziertes Cache-Paar, Netz-/Update-Rückfalltests und Freigabe durch den Eigentümer. Ein privater Produktionsschlüssel wurde nicht erstellt oder gespeichert.

## Native Signaturprüfer – vorbereitet (11.11.2026)

Die Quellmodule `ios/REDLoop/ChatScript.swift` (`SignedScriptReleaseVerifier`) und `android/app/src/main/java/com/bbtred/redloop/SignedScriptRelease.kt` (`SignedScriptRelease`) prüfen kanonische P-256/DER-Signaturen, die exacten Skriptbytes (SHA-256), Versionsnummern, Format und Mindestsequenzen. Beide nehmen den öffentlichen Schlüssel **als Parameter** entgegen, nicht vom Server. Das Android-Modul kann ohne Android-Laufzeit als reine Kotlin/JVM-Klasse getestet werden. Neue Swift-XCTest- und Kotlin-Tests enthalten einen gemeinsam mit Node.js signierten Referenzvektor (nur öffentlicher Testschlüssel und Signatur), zusätzlich negative Manipulationsprüfungen. Die nativen Loader rufen diese Prüfer **noch nicht auf**, solange kein öffentlicher Produktionsschlüssel im App-Build verankert ist. JSON-Parsing/Manifest-Download, dauerhafter Rollback-Schutz, atomare Paar-Speicherung und Geräteprüfung bleiben offen. Der SHA-256-Bundle-Pin bleibt unverändert wirksam.


## Automatische Release-Vorbereitung (weniger Handarbeit)

Auf dem **eigenen Entwicklungsrechner** ist nur noch ein Befehl für den ersten Setup- und Signiervorgang erforderlich:

```sh
npm run release:auto
```

Der Befehl generiert bei der ersten Ausführung ein lokales P-256-Schlüsselpaar und signiert die aktuelle `userscripts/red-loop.user.js`. Er schreibt den **privaten** Schlüssel und den monotonen Zähler nach `release-secrets/` (beide durch `.gitignore` ausgeschlossen). Der **öffentliche** Schlüssel wird nach `release/release-public.pem` geschrieben; dieser darf zur späteren Einbettung ins signierte App-Bundle versioniert werden. Die Vorbereitung legt auch das signierte Manifest unter `release/red-loop-webview.manifest.json` ab. Beide öffentlichen Dateien können nach Git übernommen werden.

Wird der Befehl erneut ausgeführt, so bleibt ein unverändertes Skript unangetastet. Nach einer Skriptänderung wird die nächste Release-Sequenz automatisch **vor** dem Schreiben der neuen signierten Dateien reserviert. Ein beschädigter Zustand, ausgetauschter öffentlicher Schlüssel oder unvollständiges Release führt zum Fehler statt zu automatischem Schlüsseltausch. **Ein Backup von `release-secrets/` ist wichtig**: Bei Geräteverlust lässt sich die alte Vertrauensidentität nicht durch ein neu erzeugtes Schlüsselpaar ersetzen. Private PEM-Daten dürfen nicht hochgeladen oder im Chat geteilt werden. Auf dem Rechner sollten Festplattenverschlüsselung und restriktive Zugriffsrechte aktiviert sein.

Bei `npm run build` wird das **versionierbare** Manifest `release/red-loop-webview.manifest.json` gegen `release/release-public.pem` und die kanonischen Skriptbytes verifiziert. Nur wenn die Signatur gültig ist und der Hash exakt zur aktuellen Skriptdatei passt, wird es nach `dist/red-loop-webview.manifest.json` kopiert; alte Manifestdateien aus vorherigen Builds werden vorher entfernt. Ungültige oder veraltete Signaturen brechen den Build ab, statt ein falsches Manifest zu veröffentlichen. Ohne Release-Dateien baut die App weiterhin mit dem bisherigen Bundle-Pin. **Diese Vorbereitung deployt nicht von selbst**; vorhandene Cloudflare-Zugangsdaten und die normale Deployment-Freigabe bleiben erforderlich.

`npm run release:status` zeigt den Stand des lokalen Zählers. `node --test tests/release-auto.test.mjs` testet Schlüsselerzeugung, automatische Sequenz, Schutz vor Vertrauensankerwechsel und beschädigten Zustand.

`npm run release:deploy` verbindet Signieren und das gewöhnliche Cloudflare-Deployment in einem Befehl, **sofern Wrangler bereits auf dem eigenen Entwicklungsrechner angemeldet ist**. Der Befehl wird hier nicht ausgeführt. Auf CI genügt später der normale Build, nachdem der öffentliche Schlüssel und das signierte Manifest zusammen mit dem Skript eingecheckt wurden. Die nativen Apps behalten bis zur produktiven Schlüsselverankerung den bisherigen Bundle-Pin.
