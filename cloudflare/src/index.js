// RED Loop Cloudflare Workers preview.
// This is an informational/test landing page, NOT a ChatGPT automation service.
const page = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#171923"><title>RED Loop · Test Preview</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,sans-serif}*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:radial-gradient(circle at 80% 10%,#573a56,transparent 45%),#171923;color:#f7f4f8;display:grid;place-items:center;padding:24px}
main{max-width:640px;width:100%;padding:clamp(24px,6vw,48px);border:1px solid #ffffff35;border-radius:28px;background:#ffffff0b;box-shadow:0 24px 70px #0004}
small{letter-spacing:.16em;text-transform:uppercase;color:#dfc4d7}h1{font-size:clamp(34px,7vw,58px);margin:12px 0}p,li{line-height:1.65;color:#e1dce4}
code{background:#ffffff17;border-radius:6px;padding:3px 6px}a{color:#ffd1e7}
.note{border-left:3px solid #e5a1c7;padding:10px 16px;background:#ffffff0b;margin:22px 0}
</style></head><body><main><small>BBT RED · Preview</small><h1>RED Loop</h1>
<p>Die Cloudflare-Testseite ist erreichbar. Das eigentliche RED Loop Userscript läuft ausschließlich in Safari mit einer geeigneten Userscripts-Erweiterung.</p>
<div class="note"><strong>Vorschau, keine iPhone-App.</strong><p>Hier werden keine ChatGPT-Nachrichten verarbeitet, keine Zugangsdaten abgefragt und keine Nutzerdaten gespeichert.</p></div>
<h2>Auf dem iPhone testen</h2><ol><li>Userscripts-Safari-Erweiterung installieren und aktivieren.</li><li>Das Script <code>userscripts/red-loop.user.js</code> aus dem Repository importieren.</li><li>ChatGPT in Safari öffnen und RED Loop dort manuell starten.</li></ol>
<p>Für eine installierbare iPhone-App fehlt noch ein natives Xcode-Projekt. Codemagic ist dafür vorbereitet, erstellt aber ohne App-Quellcode und Apple-Signierung keine IPA.</p>
</main></body></html>`;
export default {
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "red-loop-preview", kind: "static-preview" }, {
        headers: { "cache-control": "no-store" }
      });
    }
    if (url.pathname !== "/") return new Response("Not Found", { status: 404 });
    return new Response(page, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
      }
    });
  }
};
