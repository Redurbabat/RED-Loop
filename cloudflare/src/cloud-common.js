export const SERVICE_VERSION = '0.5.0';
export const LIMITS = Object.freeze({jobs:20, prompt:20000, title:120, steps:50, durationMinutes:480, tokenBudget:1000000, requestBytes:131072, stepOutput:12000, summary:1600, artifacts:12, artifactBytes:24576, workspaceBytes:262144, recordBytes:98304, modelResponseBytes:131072, researchBytes:131072, researchText:6000});
export const CAPABILITIES = Object.freeze(['persistent_jobs','bounded_steps','text_artifacts','public_documentation_read','pause_resume_stop']);
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status=status; }
}
export class CapabilityError extends Error {}
export const bytes = value => new TextEncoder().encode(value).byteLength;
export const clone = value => value === undefined ? undefined : structuredClone(value);
export const iso = value => new Date(value).toISOString();
export const validArtifactName = name => typeof name==='string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(name) && !name.includes('..') && /\.(txt|md|json|csv|html|css|js|swift)$/i.test(name);
export async function readBoundedText(response, maxBytes) {
  const length=Number(response.headers.get('content-length'));
  if (length>maxBytes) { await response.body?.cancel(); throw new ApiError(413,'Inhalt überschreitet die erlaubte Größe.'); }
  if (!response.body) return '';
  const reader=response.body.getReader();const decoder=new TextDecoder();let size=0,text='';
  try {
    while(true) {const {done,value}=await reader.read();if(done) break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new ApiError(413,'Inhalt überschreitet die erlaubte Größe.');}text+=decoder.decode(value,{stream:true});}
    return text+decoder.decode();
  } finally {reader.releaseLock();}
}
export async function authenticate(request, token) {
  if(typeof token!=='string'||token.length<32) throw new ApiError(503,'Der private Auftragsdienst ist noch nicht eingerichtet.');
  const header=request.headers.get('authorization')||'';
  const supplied=header.startsWith('Bearer ')?header.slice(7):'';
  if(supplied.length>2048) throw new ApiError(401,'Zugriff verweigert.');
  const encode=new TextEncoder();
  const [expected,actual]=await Promise.all([crypto.subtle.digest('SHA-256',encode.encode(token)),crypto.subtle.digest('SHA-256',encode.encode(supplied))]);
  // Equal-length digests avoid a token-length branch in the comparison. Workers
  // provides timingSafeEqual; the fixed 32-byte fallback keeps Node tests usable.
  let equal;
  if(typeof crypto.subtle.timingSafeEqual==='function') equal=crypto.subtle.timingSafeEqual(expected,actual);
  else {const a=new Uint8Array(expected),b=new Uint8Array(actual);let difference=0;for(let i=0;i<32;i++)difference|=a[i]^b[i];equal=difference===0;}
  if(!equal) throw new ApiError(401,'Zugriff verweigert.');
}
