import {createHash, createPrivateKey, createPublicKey, sign, verify} from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const RELEASE_FORMAT = 'red-loop-script-v1';
export const SCRIPT_MAX_BYTES = 262_144;
export const MANIFEST_MAX_BYTES = 4096;
const MAX_SEQUENCE = 2_147_483_647;
const SEMVER = /^(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})\.(?:0|[1-9][0-9]{0,8})$/;
const DIGEST = /^[a-f0-9]{64}$/;
const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function scriptBytes(value) {
  if (!(typeof value === 'string' || value instanceof Uint8Array)) throw new Error('Script must be text or bytes.');
  const bytes = Buffer.from(value);
  if (bytes.length === 0 || bytes.length > SCRIPT_MAX_BYTES) throw new Error('Script exceeds 256 KiB limit or is empty.');
  const source = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
  if (!['red-loop-root', '__RED_LOOP_HOST__', 'rl-start', 'rl-stop'].every(marker => source.includes(marker)) || !source.trimEnd().endsWith(')();')) {
    throw new Error('Script fails the native structural integrity checks.');
  }
  const version = source.split(/\r?\n/, 25).find(line => line.startsWith('// @version'))?.slice('// @version'.length).trim();
  if (!version || !SEMVER.test(version)) throw new Error('Script requires a valid x.y.z @version header.');
  return {bytes, version};
}

function safeSequence(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SEQUENCE) throw new Error('Sequence must be an integer in 1..2147483647.');
  return value;
}

export function manifestMessage({version, sequence, sha256}) {
  if (typeof version !== 'string' || !SEMVER.test(version) || typeof sha256 !== 'string' || !DIGEST.test(sha256)) {
    throw new Error('Manifest version or SHA-256 digest is invalid.');
  }
  safeSequence(sequence);
  // Domain-separated fixed field order, independent of JSON serialization.
  return Buffer.from('RED_LOOP_SCRIPT_V1\n' + version + '\n' + sequence + '\n' + sha256 + '\n', 'utf8');
}

function verifiedManifest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'format,sequence,sha256,signature,version' ||
      value.format !== RELEASE_FORMAT || typeof value.signature !== 'string' ||
      value.signature.length > 160 || !B64.test(value.signature)) {
    throw new Error('Unrecognized signed release manifest.');
  }
  const signature = Buffer.from(value.signature, 'base64');
  if (signature.length < 64 || signature.length > 80 || signature.toString('base64') !== value.signature) {
    throw new Error('Invalid DER signature encoding.');
  }
  const payload = manifestMessage(value);
  return {signature, payload};
}

function publicP256(key) {
  const parsed = key?.type === 'public' ? key : createPublicKey(key);
  if (parsed.asymmetricKeyType !== 'ec' || parsed.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error('Only P-256 release public keys are supported.');
  }
  return parsed;
}

export function signRelease({script, privateKey, sequence}) {
  const {bytes, version} = scriptBytes(script);
  safeSequence(sequence);
  const key = createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new Error('Only P-256 release private keys are supported.');
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const manifest = {format: RELEASE_FORMAT, version, sequence, sha256};
  const signature = sign('sha256', manifestMessage(manifest), key);
  manifest.signature = signature.toString('base64');
  if (!verifyRelease({script: bytes, manifest, publicKey: createPublicKey(key)})) throw new Error('Signature self-check failed.');
  return {script: bytes, manifest};
}

export function verifyRelease({script, manifest, publicKey, minimumSequence = 1, minimumVersion = '0.0.0'}) {
  const {bytes, version} = scriptBytes(script);
  safeSequence(minimumSequence);
  if (!SEMVER.test(minimumVersion)) throw new Error('Invalid minimum version.');
  const encoded = Buffer.from(JSON.stringify(manifest), 'utf8');
  if (encoded.length > MANIFEST_MAX_BYTES) throw new Error('Manifest is too large.');
  const {payload, signature} = verifiedManifest(manifest);
  if (version !== manifest.version || createHash('sha256').update(bytes).digest('hex') !== manifest.sha256 || manifest.sequence < minimumSequence) return false;
  const compare = (left, right) => {
    const a = left.split('.').map(Number), b = right.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return Math.sign(a[i] - b[i]);
    return 0;
  };
  if (compare(version, minimumVersion) < 0) return false;
  return verify('sha256', payload, publicP256(publicKey), signature);
}

function argsMap(args, allowed) {
  if (args.length % 2) throw new Error('Options must have values.');
  const result = Object.create(null);
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.includes(args[i]) || Object.hasOwn(result, args[i])) throw new Error('Unknown or duplicate option: ' + args[i]);
    result[args[i]] = args[i + 1];
  }
  return result;
}

async function cli([action, ...args]) {
  if (!action || action === '--help') {
    process.stdout.write('Sign: --sign --script file.js --private-key private.pem --sequence N [--out red-loop-signed-release]\n' +
      'Verify: --verify --script file.js --manifest manifest.json --public-key public.pem [--min-sequence N]\n');
    return;
  }
  if (action === '--sign') {
    const opt = argsMap(args, ['--script', '--private-key', '--sequence', '--out']);
    if (!opt['--script'] || !opt['--private-key'] || !opt['--sequence']) throw new Error('Missing sign arguments.');
    const script = await readFile(resolve(opt['--script']));
    const secret = await readFile(resolve(opt['--private-key']));
    const release = signRelease({script, privateKey: secret, sequence: Number(opt['--sequence'])});
    const output = resolve(opt['--out'] || 'red-loop-signed-release');
    await mkdir(output, {recursive: true, mode: 0o700});
    const scriptPath = resolve(output, 'red-loop-webview.js');
    const manifestPath = resolve(output, 'red-loop-webview.manifest.json');
    await writeFile(scriptPath + '.tmp', release.script, {mode: 0o600});
    await rename(scriptPath + '.tmp', scriptPath);
    await writeFile(manifestPath + '.tmp', JSON.stringify(release.manifest, null, 2) + '\n', {mode: 0o600});
    await rename(manifestPath + '.tmp', manifestPath);
    process.stdout.write('Signed release generated. Sequence: ' + release.manifest.sequence + '\n');
    return;
  }
  if (action === '--verify') {
    const opt = argsMap(args, ['--script', '--manifest', '--public-key', '--min-sequence']);
    if (!opt['--script'] || !opt['--manifest'] || !opt['--public-key']) throw new Error('Missing verification arguments.');
    const [script, rawManifest, publicKey] = await Promise.all([readFile(resolve(opt['--script'])), readFile(resolve(opt['--manifest'])), readFile(resolve(opt['--public-key']))]);
    if (rawManifest.length > MANIFEST_MAX_BYTES) throw new Error('Manifest is too large.');
    const manifest = JSON.parse(rawManifest.toString('utf8'));
    if (!verifyRelease({script, manifest, publicKey, minimumSequence: opt['--min-sequence'] === undefined ? 1 : Number(opt['--min-sequence'])})) {
      throw new Error('Signature, script digest, version, or minimum sequence verification failed.');
    }
    process.stdout.write('Verified P-256 signature and exact script bytes.\n');
    return;
  }
  throw new Error('Unknown operation. See --help.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).catch(error => {
    process.stderr.write('RED Loop release: ' + error.message + '\n');
    process.exitCode = 1;
  });
}
