// Shared by the Gear Calculator and the Paper Doll: item stats, prices and buy commands.
// Keep the price rule and stat math in ONE place so the two pages can't disagree.
// Pages assign DATA (the parsed calc-data.json) after loading it.
'use strict';

// ---------------------------------------------------------------- constants
const QUALITY_LABEL = { std: 'Normal', awful: 'Awful', poor: 'Poor', good: 'Good',
  excellent: 'Excellent', masterwork: 'Masterwork', legendary: 'Legendary' };
const QUALITY_ORDER = ['std', 'awful', 'poor', 'good', 'excellent', 'masterwork', 'legendary'];
const GAME_QUALITY_INDEX = { awful: 0, poor: 1, std: 2, good: 3, excellent: 4, masterwork: 5, legendary: 6 };
const PRICE_QUALITY = {};   // id -> price factor, filled from the data file
const CAT_LABEL = { Metallic: 'Metals', Woody: 'Wood', Stony: 'Stone', Fabric: 'Fabrics', Leathery: 'Leathers' };
const CAT_ORDER = ['Metallic', 'Woody', 'Stony', 'Fabric', 'Leathery'];

let DATA = null;

// ---------------------------------------------------------------- pricing (verified against real store prices)
function roundHalfUp(x) { return Math.floor(x + 0.5 + 1e-9); }
// Naming a material: (base + units x material price) x 1.05. Naming a quality: x quality factor x 1.1.
// Leaving both off is the plain base price.
// The item's default material (starred in the UI) is what you get when no material is named, so it
// costs the base price and needs no bracket entry.
function isDefaultMat(item, mat) { return !mat || mat === item.defaultStuff; }
function priceOf(item, mat, q) {
  let p = item.price;
  if (!isDefaultMat(item, mat)) p = roundHalfUp((item.price + item.units * DATA.materials[mat].price) * DATA.rules.materialMarkup);
  if (q && q !== 'std') p = roundHalfUp(p * PRICE_QUALITY[q] * DATA.rules.qualityMarkup);
  return p;
}
function commandOf(item, mat, q, qty) {
  const parts = [];
  if (!isDefaultMat(item, mat)) parts.push(DATA.materials[mat].token);
  if (q && q !== 'std') parts.push(q);
  return '!buy ' + item.token + (parts.length ? '[' + parts.join(',') + ']' : '') + (qty > 1 ? ' ' + qty : '');
}

// ---------------------------------------------------------------- stats
function statKey(item, mat) {
  if (!item.madeFromStuff) return '';
  if (mat) return mat;
  return item.stats[item.defaultStuff] ? item.defaultStuff : item.mats[0];
}
function compute(item, mat, q) {
  const row = item.stats[statKey(item, mat)] || [];
  const raw = n => { const i = item.statNames.indexOf(n); return i < 0 ? undefined : row[i]; };
  const qi = GAME_QUALITY_INDEX[q || 'std'];
  const f = n => (item.hasQuality && item.qf[n]) ? item.qf[n][qi] : 1;
  const out = {};
  const set = (id, v) => { if (v !== undefined && !Number.isNaN(v)) out[id] = v; };

  set('hp', raw('MaxHitPoints')); set('mass', raw('Mass')); set('work', raw('WorkToMake'));
  set('flam', raw('Flammability'));
  if (item.kind === 'melee') {
    const m = f('MeleeWeapon_DamageMultiplier');
    set('dps', raw('MeleeWeapon_AverageDPS') * m);
    set('ap', raw('MeleeWeapon_AverageArmorPenetration') * m);
  } else if (item.kind === 'ranged' && item.ranged) {
    const r = item.ranged, dmgMul = f('RangedWeapon_DamageMultiplier');
    const dmg = r.damage * dmgMul;
    const acc = n => Math.min(1, raw(n) * f(n));
    const cooldown = raw('RangedWeapon_Cooldown') || 0;
    const cycle = r.warmup + cooldown + Math.max(0, r.burstShots - 1) * r.ticksBetweenShots / 60;
    set('dmg', dmg); set('range', r.range);
    if (raw('AccuracyTouch') !== undefined) set('accTouch', acc('AccuracyTouch'));
    if (raw('AccuracyShort') !== undefined) { set('accShort', acc('AccuracyShort')); set('accMed', acc('AccuracyMedium')); set('accLong', acc('AccuracyLong')); }
    if (cycle > 0 && raw('AccuracyMedium') !== undefined) set('dps', dmg * r.burstShots * acc('AccuracyMedium') / cycle);
    if (r.armorPenetration > 0) set('ap', r.armorPenetration * dmgMul);
  } else if (item.kind === 'apparel') {
    set('sharp', (raw('ArmorRating_Sharp') || 0) * f('ArmorRating_Sharp'));
    set('blunt', (raw('ArmorRating_Blunt') || 0) * f('ArmorRating_Blunt'));
    set('heat', (raw('ArmorRating_Heat') || 0) * f('ArmorRating_Heat'));
    set('cold', (raw('Insulation_Cold') || 0) * f('Insulation_Cold'));
    set('warm', (raw('Insulation_Heat') || 0) * f('Insulation_Heat'));
  }
  return out;
}

// ---------------------------------------------------------------- helpers
// Materials in display order: category, then price, then name.
function orderedMats(item) {
  const cat = m => { const i = CAT_ORDER.indexOf((DATA.materials[m].cats.find(c => CAT_ORDER.includes(c))) || ''); return i < 0 ? 99 : i; };
  return item.mats.slice().sort((a, b) => cat(a) - cat(b) || DATA.materials[a].price - DATA.materials[b].price || a.localeCompare(b));
}
function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  if (props) for (const k of Object.keys(props)) {
    if (k === 'class') n.className = props[k];
    else if (k === 'text') n.textContent = props[k];
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), props[k]);
    else if (props[k] === true) n.setAttribute(k, '');
    else if (props[k] !== false && props[k] != null) n.setAttribute(k, props[k]);
  }
  for (const kid of kids) if (kid != null) n.append(kid);
  return n;
}
const coins = n => n.toLocaleString() + (n === 1 ? ' coin' : ' coins');
const title = s => s.replace(/\b[a-z]/g, c => c.toUpperCase());
// Keep the game's own casing for item names ("Shroud of the Soulreaper"); only capitalize the first letter.
const itemName = s => s.charAt(0).toUpperCase() + s.slice(1);
function matLabel(item, mat) {
  if (!item.madeFromStuff) return '—';
  const m = mat || statKey(item, '');
  return title(DATA.materials[m].label) + (isDefaultMat(item, m) ? '*' : '');
}
async function copyText(text, btn) {
  const old = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied!'; btn.classList.add('copied'); }
  catch (e) { btn.textContent = 'Copy failed'; }
  setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); }, 1400);
}
