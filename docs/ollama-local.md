# RED Loop – lokale Ollama-Ausführung (Windows/macOS/Linux)

This is a **separate local CLI**, not a Cloudflare model provider and not a background service. It reads a local prompt file, calls only an Ollama service on the loopback address of the **same machine** and creates a private JSON report. It requires Node.js 22+ and a running compatible Ollama model. No OpenAI key, Cloudflare token, or GitHub token is needed.

## Windows PowerShell

1. Install and start Ollama on this computer; use `ollama list` to find your installed model names.
2. In the RED-Loop repository, create `auftrag.txt` containing the assignment (do not commit the file).
3. Run:

```powershell
npm ci
npm run local:ollama -- --model qwen3:8b --prompt-file auftrag.txt --steps 8 --out .\red-loop-results
```

Replace `qwen3:8b` with an actual model returned by `ollama list`. Output reports contain the **full private prompt and AI results**. The default `red-loop-results/`, `red-loop-local-results/`, and example `auftrag.txt` are ignored by Git; custom output paths must be excluded separately. Keep reports private and outside commits. Maximum 50 steps, bounded response size and an explicit stop after repeated identical results. There is no automatic retry of an uncertain request.

The report records a **model-generated plan**, step outputs, Ollama's reported input/output token counters and the final status. A `completed` state is marked `model_reported`: this program does not compile projects, run scripts or independently verify the model's statements.

The runner accepts only HTTP loopback endpoints `127.0.0.1` or `[::1]`, disallows credentials/URL paths and rejects redirects. It never executes model-proposed commands or invokes GitHub. The process runs only while this computer stays on. If Ollama is unavailable, the selected model rejects structured JSON, or a response times out, the run stops for inspection.

## Tests

```sh
node --test tests/ollama-local.test.mjs
```

The tests use stubbed HTTP replies. A genuine local run with the user's installed model is still required; the model may fail to follow the requested JSON schema.

Official Ollama reference: https://github.com/ollama/ollama/blob/main/docs/api.md

## Crash-sichere lokale Berichte

Vor **jeder** Modellanfrage legt die CLI eine Datei im Ergebnisordner an bzw. aktualisiert diese mit `inflight` (Schrittnummer und Startzeit). Nach jedem vollständigen Ergebnis wird der neue Stand ebenfalls auf die Festplatte geschrieben. Dazu wird eine temporäre JSON-Datei im selben Ordner geschrieben und anschliessend atomar umbenannt. Der Ergebnisordner wird beim Erstellen auf private Verzeichnisrechte gesetzt, die Berichtsdatei auf private Dateirechte (soweit das Betriebssystem dies unterstützt).

Bei Stromausfall, hartem Prozessende oder abgebrochener Verbindung bleibt der letzte gespeicherte Bericht erhalten. Ein `inflight`-Eintrag bedeutet **möglicherweise bereits ausgeführter** Modellaufruf. RED LOOP startet nach einem Neustart keinen automatischen Wiederholungsversuch. Bitte den bestehenden JSON-Bericht zuerst prüfen. Die CLI bietet bewusst noch keinen `--resume`-Schalter.

Kontrolltest: `node --test tests/ollama-local.test.mjs`; das ist eine simulierte Unterbrechung, kein echter Stromausfall-/Windows-Dauertest.
