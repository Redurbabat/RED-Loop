/** Pure, dependency-free URL preset helpers for the RED Loop Motion Studio. */
export const defaultMotionSettings=Object.freeze({density:58,depth:58,speed:42,hue:340});
export const motionSettingLimits=Object.freeze({
  density:[15,90],depth:[0,100],speed:[1,100],hue:[0,360],
});

export function normalizeMotionSettings(candidate={}) {
  const values={};
  for(const [key,[minimum,maximum]] of Object.entries(motionSettingLimits)){
    const raw=candidate[key];
    const parsed=raw===null||raw===undefined||String(raw).trim()===''?NaN:Number(raw);
    values[key]=Number.isFinite(parsed)
      ?Math.max(minimum,Math.min(maximum,Math.round(parsed)))
      :defaultMotionSettings[key];
  }
  return values;
}

export function readMotionPreset(search,availableScenes,fallbackScene='spectral-fold'){
  const params=new URLSearchParams(search);
  const requested=params.get('scene');
  const scene=availableScenes.includes(requested)?requested:fallbackScene;
  const candidate={};
  for(const key of Object.keys(motionSettingLimits))candidate[key]=params.get(key);
  return {scene,...normalizeMotionSettings(candidate)};
}

/**
 * Produce an explicit allowlist of public visual settings.
 * Never retain unrelated URL parameters (such as access tokens) in shared links.
 */
export function serializeMotionPreset(preset){
  const params=new URLSearchParams();
  const scene=/^[a-z][a-z0-9-]{0,63}$/.test(preset.scene||'')?preset.scene:'spectral-fold';
  params.set('scene',scene);
  const values=normalizeMotionSettings(preset);
  for(const [key,value] of Object.entries(values))params.set(key,String(value));
  return params.toString();
}

export function formatMotionUsage(preset){
  const values=normalizeMotionSettings(preset);
  const scene=/^[a-z][a-z0-9-]{0,63}$/.test(preset.scene||'')?preset.scene:'spectral-fold';
  return [
    "import { createMotionEngine } from './motion-engine.js';",
    "",
    "const canvas = document.querySelector('#preview');",
    "const engine = createMotionEngine(canvas);",
    "engine.configure({ scene: '"+scene+"', density: "+values.density+", depth: "+values.depth+", speed: "+values.speed+", hue: "+values.hue+" });",
    "",
    "// Animation ausschließlich nach Nutzeraktion starten:",
    "document.querySelector('#play').addEventListener('click', () => {",
    "  engine.setPlaying(!engine.running);",
    "});",
    "",
    "// Beim Entfernen der Vorschau:",
    "// engine.destroy();"
  ].join('\n');
}
