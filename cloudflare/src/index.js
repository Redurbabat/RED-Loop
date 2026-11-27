import {handleCloudAPI} from './jobs-api.js';
import {SERVICE_VERSION} from './cloud-common.js';
const headers = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'cache-control': 'no-store'
};
function redIdOrigin(raw) {
  if(typeof raw!=='string'||!raw||/[\s'";]/.test(raw))return null;
  try {const u=new URL(raw);return u.protocol==='https:'&&u.origin===raw?raw:null;} catch {return null;}
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let response;
    if (url.pathname==='/api/v1'||url.pathname.startsWith('/api/v1/')) {
      response=await handleCloudAPI(request,env);
    } else if (!['GET', 'HEAD'].includes(request.method)) {
      response = Response.json({error: 'Nur GET und HEAD werden unterstützt.'}, {status: 405, headers: {allow: 'GET, HEAD'}});
    } else if (url.pathname === '/health') {
      response = Response.json({status: 'ok', service: 'red-loop', version: SERVICE_VERSION, mode: 'cloud-jobs-and-local-demo', storesConversations: false, storesJobs:true, webviewScript: '/red-loop-webview.js'});
    } else {
      try { response = await env.ASSETS.fetch(request); }
      catch { response = Response.json({error: 'Die Oberfläche ist vorübergehend nicht verfügbar.'}, {status: 503}); }
    }
    const result = new Response(request.method === 'HEAD' ? null : response.body, response);
    for (const [name, value] of Object.entries(headers)) result.headers.set(name, value);
    // Only this isolated page may connect to one explicitly configured private origin.
    // The dashboard, cloud jobs and ChatGPT content scripts keep their existing policy.
    const home=redIdOrigin(env.REDION_HOME_ORIGIN);
    if(url.pathname==='/red-id.html'&&home)result.headers.set('content-security-policy',headers['content-security-policy'].replace("connect-src 'self'","connect-src 'self' "+home));
    return result;
  }
};
