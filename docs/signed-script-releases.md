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
