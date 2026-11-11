import {createHash, createPrivateKey, createPublicKey, generateKeyPairSync} from 'node:crypto';
import {mkdir, readFile, rename, stat, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {signRelease, verifyRelease, scriptBytes} from './signed-script.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATE_VERSION = 1;
const MAX_SEQUENCE = 2_147_483_647;

async function exists(path) {
  try {await stat(path);return true;} catch (error) {if (error.code === 'ENOENT') return false;throw error;}
}
async function privateWrite(path, contents) {
  await writeFile(path, contents, {mode: 0o600, flag:'wx'});
}
async function atomicReplace(path, contents) {
  const temp = path + '.new-' + process.pid + '-' + Date.now();
  try {
    await privateWrite(temp, contents);
    await rename(temp, path);
  } catch (error) {
    const {rm} = await import('node:fs/promises');
    await rm(temp, {force:true}).catch(()=>{});
    throw error;
  }
}
function layout(root) {
  return {
    secret:join(root, 'release-secrets'),
    privateKey:join(root,'release-secrets','release-private.pem'),
    publicKey:join(root,'release-secrets','release-public.pem'),
    state:join(root,'release-secrets','release-state.json'),
    trackedPublic:join(root,'release','release-public.pem'),
    trackedManifest:join(root,'release','red-loop-webview.manifest.json'),
    canonical:join(root,'userscripts','red-loop.user.js'),
    output:join(root,'red-loop-signed-release'),
    outputScript:join(root,'red-loop-signed-release','red-loop-webview.js'),
    outputManifest:join(root,'red-loop-signed-release','red-loop-webview.manifest.json')
  };
}
function validateState(raw) {
  let data;
  try {data=JSON.parse(raw);}catch{throw new Error('Release state is unreadable. Restore it from a secure backup, do not reset the counter.');}
  if(!data || typeof data!=='object' || Object.keys(data).sort().join(',')!=='lastSequence,version' || data.version!==STATE_VERSION || !Number.isSafeInteger(data.lastSequence) || data.lastSequence < 0 || data.lastSequence > MAX_SEQUENCE) {
    throw new Error('Release state is invalid. Do not reset the counter.');
  }
  return data;
}

/** Generates one local private key if and only if no key or state exists yet.
 *  Public trust material lives in release/release-public.pem for an app build.
 *  There is intentionally no key rotation or overwrite path. */
export async function ensureReleaseIdentity(root = ROOT) {
  const paths=layout(root);
  const secretPresent=await exists(paths.secret);
  const publicPresent=await exists(paths.trackedPublic);
  if(!secretPresent) {
    if(publicPresent) throw new Error('Public release key already exists without a local secret; refusing to replace the trust anchor.');
    await mkdir(paths.secret,{mode:0o700});
    const {privateKey,publicKey}=generateKeyPairSync('ec',{
      namedCurve:'prime256v1',
      privateKeyEncoding:{type:'pkcs8',format:'pem'},
      publicKeyEncoding:{type:'spki',format:'pem'}
    });
    await privateWrite(paths.privateKey,privateKey);
    await privateWrite(paths.publicKey,publicKey);
    await privateWrite(paths.state,JSON.stringify({version:STATE_VERSION,lastSequence:0})+'\n');
  }
  // An interrupted initial setup never silently creates another private key.
  const [secret,publicText,rawState]=await Promise.all([
    readFile(paths.privateKey),readFile(paths.publicKey,'utf8'),readFile(paths.state,'utf8')
  ]);
  const state=validateState(rawState);
  const derived=createPublicKey(createPrivateKey(secret)).export({type:'spki',format:'pem'});
  if(derived!==publicText) throw new Error('Local public and private release keys disagree.');
  await mkdir(dirname(paths.trackedPublic),{recursive:true});
  if(await exists(paths.trackedPublic)) {
    if(await readFile(paths.trackedPublic,'utf8')!==publicText) throw new Error('Tracked public release key changed: aborting to protect app trust.');
  } else {
    await privateWrite(paths.trackedPublic,publicText);
  }
  return {paths,state,privateKey:secret,publicKey:publicText};
}

/** Local only: a no-op for identical, already signed source, otherwise reserve
 * a new monotonic sequence BEFORE writing a new release, never reusing it on a crash. */
export async function prepareRelease(root=ROOT) {
  const {paths,state,privateKey,publicKey}=await ensureReleaseIdentity(root);
  const source=await readFile(paths.canonical);
  scriptBytes(source); // strict script validation before incrementing state
  const currentHash=createHash('sha256').update(source).digest('hex');
  const hasScript=await exists(paths.outputScript);
  const hasManifest=await exists(paths.outputManifest);
  if(hasScript!==hasManifest) throw new Error('Incomplete previous release. Inspect or restore it before publishing again.');
  if(hasScript) {
    const [oldScript,rawManifest]=await Promise.all([readFile(paths.outputScript),readFile(paths.outputManifest,'utf8')]);
    let manifest;
    try {manifest=JSON.parse(rawManifest);}catch{throw new Error('Previous signed manifest is corrupt.');}
    if(!verifyRelease({script:oldScript,manifest,publicKey}) || manifest.sequence>state.lastSequence) throw new Error('Previous release does not verify against the local public key/state.');
    if(currentHash===manifest.sha256) {
      const signedManifest=JSON.stringify(manifest,null,2)+'\n';
      if(!await exists(paths.trackedManifest) || await readFile(paths.trackedManifest,'utf8')!==signedManifest) {
        await atomicReplace(paths.trackedManifest,signedManifest);
      }
      return {status:'unchanged',sequence:manifest.sequence,paths};
    }
  }
  if(state.lastSequence>=MAX_SEQUENCE) throw new Error('Release sequence exhausted; key rotation must be reviewed.');
  const nextSequence=state.lastSequence+1;
  // Reserve before signing, so a crash never repeats a sequence automatically.
  await atomicReplace(paths.state,JSON.stringify({version:STATE_VERSION,lastSequence:nextSequence})+'\n');
  const release=signRelease({script:source,privateKey,sequence:nextSequence});
  if(!verifyRelease({...release,publicKey,minimumSequence:nextSequence})) throw new Error('Generated release failed local verification.');
  await mkdir(paths.output,{recursive:true,mode:0o700});
  await atomicReplace(paths.outputScript,release.script);
  const manifestText=JSON.stringify(release.manifest,null,2)+'\n';
  await atomicReplace(paths.outputManifest,manifestText);
  await atomicReplace(paths.trackedManifest,manifestText);
  return {status:'signed',sequence:nextSequence,paths};
}

async function cli(args) {
  if(args.length!==1 || !['--prepare','--init','--status','--help'].includes(args[0])) throw new Error('Use --prepare, --init, --status or --help.');
  if(args[0]==='--help') {process.stdout.write('npm run release:auto  (first run creates a local P-256 key and signs the current script)\n');return;}
  if(args[0]==='--status') {
    const p=layout(ROOT);
    if(!await exists(p.state)) {process.stdout.write('Release identity is not set up.\n');return;}
    const state=validateState(await readFile(p.state,'utf8'));
    process.stdout.write('Local release identity exists. Last reserved sequence: '+state.lastSequence+'\n');return;
  }
  if(args[0]==='--init') {const identity=await ensureReleaseIdentity(ROOT);process.stdout.write('Release public key ready: '+identity.paths.trackedPublic+'\n');return;}
  const result=await prepareRelease(ROOT);
  process.stdout.write(result.status==='unchanged'?'Existing signed release is current.\n':'Signed a new release.\n');
  process.stdout.write('Sequence: '+result.sequence+'\nPublic key: '+result.paths.trackedPublic+'\nRelease files: '+result.paths.output+'\n');
  process.stdout.write('Never commit or upload release-secrets/. No production deployment was made.\n');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).catch(error=>{process.stderr.write('Release automation: '+error.message+'\n');process.exitCode=1;});
}
