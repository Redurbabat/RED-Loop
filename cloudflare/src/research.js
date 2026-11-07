import {ApiError,CapabilityError,LIMITS,readBoundedText} from './cloud-common.js';
export const DOCUMENTATION_HOSTS=Object.freeze(['developers.cloudflare.com','developer.apple.com','docs.codemagic.io','developers.openai.com','platform.openai.com','learn.microsoft.com','support.microsoft.com','developer.mozilla.org']);
export function documentationURL(value) {
  let url;try {url=new URL(value);}catch{throw new CapabilityError('Die Recherche benötigt eine gültige öffentliche Dokumentations-URL.');}
  if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||url.hash||value.length>2000||url.href.length>2000||!DOCUMENTATION_HOSTS.includes(url.hostname)) throw new CapabilityError('Recherche ist auf die freigegebenen öffentlichen Dokumentationshosts beschränkt. Andere Websites oder private Zugänge benötigen eine Freigabe/zusätzliche Fähigkeit.');
  return url;
}
export async function fetchDocumentation(value,{fetchImpl=fetch,signal}={}) {
  const url=documentationURL(value);
  const timeout=AbortSignal.timeout(10000);const combined=signal?AbortSignal.any([signal,timeout]):timeout;
  let response;
  try {response=await fetchImpl(url.href,{method:'GET',redirect:'manual',credentials:'omit',headers:{accept:'text/html,text/plain,text/markdown,application/json'},signal:combined});}
  catch {throw new CapabilityError('Die öffentliche Dokumentation konnte nicht geladen werden; es wurde kein Rechercheerfolg angenommen.');}
  if(response.status>=300&&response.status<400){await response.body?.cancel();throw new CapabilityError('Weiterleitungen werden bei der Recherche nicht verfolgt. Bitte eine direkte erlaubte Dokumentations-URL verwenden.');}
  if(!response.ok){await response.body?.cancel();throw new CapabilityError('Die Dokumentation ist nicht öffentlich erreichbar (HTTP '+response.status+').');}
  const contentType=response.headers.get('content-type')||'';
  if(!/^(text\/(html|plain|markdown)|application\/json)(;|$)/i.test(contentType)){await response.body?.cancel();throw new CapabilityError('Die Dokumentation hat kein erlaubtes Textformat.');}
  let text;try{text=await readBoundedText(response,LIMITS.researchBytes);}catch(error){if(error instanceof ApiError)throw new CapabilityError('Die Dokumentation überschreitet die erlaubte Recherchegröße.');throw error;}
  if(/text\/html/i.test(contentType)) text=text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi,' ').replace(/<\/(?:p|div|li|h[1-6]|pre|section)>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g,entity=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[entity]));
  const truncated=text.length>LIMITS.researchText;
  return {url:url.href,text:text.trim().slice(0,LIMITS.researchText),truncated};
}
