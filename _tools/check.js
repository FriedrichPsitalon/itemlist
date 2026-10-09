#!/usr/bin/env node
/*
 * Offline checks for the Store data and search code.   node _tools/check.js
 * Exits non-zero if anything fails. Needs only Node.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SL = require('../compendium/store-logic.js');
const { fixArticles } = require('./clean-compendium.js');

const ROOT = path.resolve(__dirname, '..');
const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'compendium', 'compendium.json'), 'utf8'));
const items = all.filter(r => !r.hidden);
const incidents = JSON.parse(fs.readFileSync(path.join(ROOT, '_data', 'StoreIncidents.json'), 'utf8')).incitems;
const storeItems = JSON.parse(fs.readFileSync(path.join(ROOT, '_data', 'StoreItems.json'), 'utf8')).items;

let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '\n        ' + (detail || '')));
  if (!ok) failed++;
}
const pass = () => true;
const names = r => r.main.map(x => x.defName);
const labelOf = x => x.label || x.defName;

// ---- search (brief C1 / D1) ----
let r = SL.search(items, 'alligator', pass);
check('"alligator" returns the alligator meat', names(r).includes('Meat_Alligator'), names(r).join(', '));
check('"alligator" ranks name matches ahead of everything else', r.main.slice(0, 4).every(x => SL.norm(labelOf(x)).startsWith('alligator')));

r = SL.search(items, 'thrumbo', pass);
check('"thrumbo" returns all 11 thrumbo rows', r.main.length === 11, `got ${r.main.length}: ${r.main.map(labelOf).join(', ')}`);

r = SL.search(items, 'mechlink', pass);
check('"mechlink" finds the mechlink', r.main.length >= 1 && SL.norm(labelOf(r.main[0])).includes('mechlink'), names(r).join(', '));

const wm = names(SL.search(items, 'wolfmeat', pass));
const wm2 = names(SL.search(items, 'wolf meat', pass));
check('"wolfmeat" and "wolf meat" return the same rows', wm.length > 0 && wm.slice().sort().join() === wm2.slice().sort().join(), `${wm} vs ${wm2}`);

r = SL.search(items, '!buy pawn', pass);
check('a pasted chat command ("!buy pawn") finds the pawn event first', r.main[0] && r.main[0].defName === 'pawn', names(r).slice(0, 3).join(', '));
r = SL.search(items, 'levelskill', pass);
check('a command name ("levelskill") finds its event', r.main[0] && r.main[0].defName === 'levelskill');
r = SL.search(items, 'dire wolf', pass);
check('a hidden duplicate is still findable through its shared row ("dire wolf")', names(r).includes('Meat_Wolf_Timber'));

r = SL.search(items, 'steel', pass);
check('"steel": description-only matches stay in their own tier', r.main.length < 10 && r.desc.length > r.main.length &&
  r.main.every(x => SL.nameTier(x, 'steel', ['steel']) >= 0) && !r.desc.some(x => SL.nameTier(x, 'steel', ['steel']) >= 0),
  `main ${r.main.length}, desc ${r.desc.length}`);

// ---- data rules (brief D2) ----
const cmdOwners = {};
items.forEach(it => SL.commandsFor(it).forEach(c => { (cmdOwners[c.cmd] = cmdOwners[c.cmd] || []).push(labelOf(it)); }));
const sharedCmds = Object.entries(cmdOwners).filter(([, v]) => v.length > 1);
check('no two visible rows share a copy command', sharedCmds.length === 0, sharedCmds.map(([c, v]) => `${c}: ${v.join(' | ')}`).join('\n        '));

const oneCoinEvents = items.filter(x => x.type === 'event' && x.price <= 1 && x.defName !== 'pawn');
check('no visible event is priced at 1 coin (pawn is the one real purchase)', oneCoinEvents.length === 0, oneCoinEvents.map(x => x.defName).join(', '));

const bareNeedingArgs = items.filter(x => x.usage && SL.commandsFor(x).some(c => c.cmd.replace(/^!\w+\s*/, '') === ''));
check('events that need arguments never copy a bare command', bareNeedingArgs.length === 0, bareNeedingArgs.map(x => x.defName).join(', '));
check('levelskill / passion / removepassion all carry usage + example',
  ['levelskill', 'passion', 'removepassion'].every(n => { const e = items.find(x => x.defName === n); return e && e.usage && e.example; }));

const articleBugs = items.filter(x => x.description && fixArticles(x.description) !== x.description);
check('no description has an a/an mistake', articleBugs.length === 0, articleBugs.map(x => x.defName).join(', '));

const dupLabels = {};
items.forEach(x => { const k = x.type + '|' + labelOf(x).toLowerCase(); (dupLabels[k] = dupLabels[k] || []).push(x.defName); });
const dl = Object.entries(dupLabels).filter(([, v]) => v.length > 1);
check('no two visible rows of a type share a label', dl.length === 0, dl.map(([k, v]) => `${k}: ${v.join(', ')}`).join('\n        '));
check('no generic-meat row is labelled just "meat"', !items.some(x => x.kind === 'generic-meat' && x.label === 'meat'));
check('retired Reel storage is gone', !all.some(x => /^ReelStorage(Barrel|Fridge|WoodCrate|LargeLocker|MedicineCabinet|LargeWoodCrate|Locker)$|^ReelIndustrialShelf$/.test(x.defName)));
check('no label still says (old) or (new)', !items.some(x => /\((old|new)\)/.test(labelOf(x))));

// prices are only ever changed by Jesse: compendium must agree with the synced data
const priceById = new Map(storeItems.map(s => [s.defname, s.price]));
const incPrice = new Map(incidents.map(i => [i.abr, i.price]));
const badItem = all.filter(x => x.type === 'item' && priceById.get(x.defName) !== x.price);
check('every item price equals StoreItems.json', badItem.length === 0, badItem.map(x => x.defName).join(', '));
const badEv = all.filter(x => x.type === 'event' && incPrice.has(x.defName) && incPrice.get(x.defName) !== x.price);
check('every event price equals StoreIncidents.json', badEv.length === 0, badEv.map(x => x.defName).join(', '));

// quantity rule
const cheap = items.find(x => x.type === 'item' && x.price === 1);
check('a 1-coin item defaults to the minimum-spend quantity', cheap && SL.minQty(cheap) === 4 && SL.commandsFor(cheap)[0].cmd === `!buy ${cheap.abr} 4`);
const dear = items.find(x => x.type === 'item' && x.price >= 4);
check('an item at or above the minimum copies with no quantity', SL.minQty(dear) === 1 && SL.commandsFor(dear)[0].cmd === `!buy ${dear.abr}`);
check('"1 coin" is not "1 coins"', SL.coins(1) === '1 coin' && SL.coins(2) === '2 coins');

// The Guide's "!buy hay <min spend>" example only makes sense while hay is cheaper than the minimum.
const eco = {};
fs.readFileSync(path.join(ROOT, '_data', 'economy.yml'), 'utf8').split(/\r?\n/).forEach(l => { const m = /^(\w+):\s*(\d+)/.exec(l); if (m) eco[m[1]] = +m[2]; });
const hay = storeItems.find(s => s.abr === 'hay');
check('the Guide\'s hay example still fits (hay costs less than the minimum spend)', hay && hay.price < eco.min_spend, `hay ${hay && hay.price}, min ${eco.min_spend}`);
check('economy.yml min_spend matches the page default', eco.min_spend === SL.getMinSpend(), `${eco.min_spend} vs ${SL.getMinSpend()}`);

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
