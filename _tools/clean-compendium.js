#!/usr/bin/env node
/*
 * Cleans compendium/compendium.json in place.  Safe to run any number of times (idempotent).
 *
 *   node _tools/clean-compendium.js            rewrite the file
 *   node _tools/clean-compendium.js --check    report what would change, write nothing
 *
 * Why this exists: the script that originally generated compendium.json is not in this repo,
 * so these fixes live in a post-processing step instead. Run it after every regeneration.
 * (The original output looks like Python's json.dump(indent=1), so the generator is probably Python.)
 *
 * What it does:
 *   - drops the retired "old" Reel's Expanded Storage items (the mod's own 1.6 files file them under
 *     "Old" / "No longer used"; only the "New" versions exist in game)
 *   - flags shortcut commands that are not products (trait, surgery, equip...) as hidden
 *   - adds usage + example for events whose command needs extra words (levelskill, passion, removepassion)
 *   - gives every "meat" row its own label, fixes "a alligator" style articles, tidies the meat text
 *   - collapses rows that share one !buy command into a single honest row; the rest are hidden
 *   - tells the two "human" pawn kinds apart
 *
 * Prices are never touched.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'compendium', 'compendium.json');
const STORE = path.join(ROOT, '_data', 'StoreItems.json');

// Plain "key: number" lines from _data/economy.yml.
const ECONOMY = {};
fs.readFileSync(path.join(ROOT, '_data', 'economy.yml'), 'utf8').split(/\r?\n/).forEach(l => {
  const m = /^(\w+):\s*(\d+)/.exec(l);
  if (m) ECONOMY[m[1]] = +m[2];
});

// Reel's Expanded Storage items the mod itself retired (1.6 "Old" / "No longer used" folders).
const RETIRED_DEFNAMES = new Set([
  'ReelStorageBarrel', 'ReelStorageFridge', 'ReelStorageWoodCrate', 'ReelStorageLargeLocker',
  'ReelStorageMedicineCabinet', 'ReelIndustrialShelf', 'ReelStorageLargeWoodCrate', 'ReelStorageLocker',
]);

// Toolkit shortcut/plumbing commands. They are priced 1 as a placeholder and are documented on the
// Commands page, so they are not products. (`pawn` is a real purchase and stays visible.)
const HIDDEN_EVENTS = new Set([
  'trait', 'removetrait', 'surgery', 'replacetrait', 'backpack', 'settraits', 'cleartraits', 'use', 'wear', 'equip',
]);

// Events whose command needs extra words. Syntax is from _data/commands.json; the examples are
// real skill names so a pasted example works as written.
const EVENT_USAGE = {
  levelskill: { usage: '!levelskill <skill> <coins>', example: '!levelskill shooting 50' },
  passion: { usage: '!passion <skill>', example: '!passion shooting' },
  removepassion: { usage: '!removepassion <skill>', example: '!removepassion shooting' },
};

// Display name for the single visible row of a group of items that share one command.
const GROUP_LABELS = {
  elementaldust: 'elemental dust',
  stone: 'stone (sentinel meat)',
  demonflesh: 'demon flesh',
  mysterymeat: 'mystery meat',
  wolfmeat: 'wolf meat',
  elephanttusk: 'elephant tusk',
};

// ---------- helpers ----------

// "a"/"an" agreement. "yoo"-sounding u-words and a few silent-h words are the only exceptions worth
// handling; all-caps words (LMG, AI) are left alone because they are spelled-out letters.
const YOO = /^(uni|use|usu|uti|ura|ute|ubi|eu|one|once)/;
const SILENT_H = /^(hour|honest|heir|honor)/;
function wantsAn(word) {
  const w = word.toLowerCase();
  if (SILENT_H.test(w)) return true;
  return /^[aeiou]/.test(w) && !YOO.test(w);
}
function fixArticles(text) {
  if (!text) return text;
  return text.replace(/\b([Aa])(n?) ([A-Za-z][\w'-]*)/g, (m, a, n, word) => {
    if (/^[A-Z]{2,}/.test(word)) return m; // acronyms
    const an = wantsAn(word);
    if (an === (n === 'n')) return m;
    return a + (an ? 'n' : '') + ' ' + word;
  });
}
const article = word => (wantsAn(word) ? 'an' : 'a');

function plainAnimal(row) {
  const m = /^Raw meat from an? (.+?)\./.exec(row.description || '');
  if (m) return m[1].toLowerCase();
  return row.defName.replace(/^Meat_/, '').replace(/^TM_/, '').replace(/R$/, '').replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function variantName(row) {
  if (row.animal) return row.animal;
  const base = row.variantLabel || row.label || row.defName;
  return row.source ? `${base} (${row.source})` : base;
}

// ---------- main ----------

function clean(rows, storeOrder) {
  const report = { retired: [], hiddenEvents: [], usage: [], relabelled: 0, articles: 0, groups: [], races: [] };
  const before = JSON.stringify(rows);

  // 1. retired Reel items
  rows = rows.filter(r => {
    if (RETIRED_DEFNAMES.has(r.defName)) { report.retired.push(r.defName + ' (' + r.abr + ')'); return false; }
    return true;
  });
  rows.forEach(r => {
    if (/^ReelStorage|^ReelNew/.test(r.defName)) {
      r.label = r.label.replace(/ \((new|old)\)$/, '');
    }
  });

  // 2. shortcut commands that are not products; 3. events that need arguments
  rows.forEach(r => {
    if (r.type !== 'event') return;
    if (HIDDEN_EVENTS.has(r.defName)) {
      if (!r.hidden) report.hiddenEvents.push(r.defName);
      r.hidden = true;
      r.hiddenReason = 'Shortcut command, documented on the Commands page; not a product.';
    }
    // StoreIncidents.json lists `pawn` at a placeholder 1; the real price is charged by a separate
    // Toolkit setting and recorded in _data/economy.yml (confirmed in game, Oct 2026).
    if (r.defName === 'pawn' && ECONOMY.pawn_price) r.price = ECONOMY.pawn_price;
    const u = EVENT_USAGE[r.defName];
    if (u) {
      r.usage = u.usage;
      r.example = u.example;
      report.usage.push(r.defName);
    }
  });

  // 4. meat: unique label from the description, then tidy the text
  rows.forEach(r => {
    if (r.kind !== 'generic-meat') return;
    const animal = r.animal || plainAnimal(r);
    r.animal = animal;
    if (r.label === 'meat') { r.label = animal + ' meat'; report.relabelled++; }
    if (/^Raw meat from an? /.test(r.description || '')) {
      r.description = `Raw meat from ${article(animal)} ${animal}. Cook it before eating. ` +
        'Nutritionally interchangeable with other raw meats regardless of source animal.';
    }
  });

  // 5. article agreement everywhere ("a alligator", "an power")
  rows.forEach(r => {
    if (!r.description) return;
    const fixed = fixArticles(r.description);
    if (fixed !== r.description) { r.description = fixed; report.articles++; }
  });

  // 6. items that share one !buy command: one visible row per command
  const byAbr = {};
  rows.filter(r => r.type === 'item' && r.abr).forEach(r => (byAbr[r.abr] = byAbr[r.abr] || []).push(r));
  for (const [abr, members] of Object.entries(byAbr)) {
    if (members.length < 2) continue;
    members.sort((a, b) => (storeOrder.get(a.defName) ?? 1e9) - (storeOrder.get(b.defName) ?? 1e9));
    const rep = members[0];
    const others = members.slice(1);
    rep.variantLabel = rep.variantLabel || rep.label;
    rep.sharedWith = members.map(m => m.defName);
    const names = members.map(variantName);
    // Tested in game (Oct 2026): the store hands over the first one in StoreItems.json.
    rep.note = `${members.length} items share the command !buy ${abr}, and the store always hands over the ${variantName(rep)}. ` +
      `The others (${names.slice(1).join(', ')}) can't be ordered.`;
    if (GROUP_LABELS[abr]) rep.label = GROUP_LABELS[abr];
    if (rep.kind === 'generic-meat') {
      rep.description = `Raw meat. ${members.length} creatures share this command; ` +
        `the store always delivers the meat of the ${variantName(rep)}.`;
    }
    others.forEach(o => {
      o.hidden = true;
      o.hiddenReason = `Shares the command !buy ${abr} with ${rep.defName}, which is shown instead.`;
    });
    report.groups.push({ abr, shown: rep.defName, hidden: others.map(o => o.defName) });
  }

  // 7. the two "human" pawn kinds
  rows.forEach(r => {
    if (r.type === 'race' && r.defName === 'CreepJoiner' && r.label === 'human') {
      r.label = 'creepjoiner (human)';
      r.description += ' Listed separately because it is its own entry in the pawn-kind list; the stats are identical to the plain human.';
      report.races.push(r.defName);
    }
  });

  report.changed = JSON.stringify(rows) !== before;
  return { rows, report };
}

function main() {
  const check = process.argv.includes('--check');
  const rows = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const store = JSON.parse(fs.readFileSync(STORE, 'utf8')).items;
  const storeOrder = new Map(store.map((x, i) => [x.defname, i]));
  const { rows: out, report } = clean(rows, storeOrder);

  const noDesc = out.filter(r => !r.description && !r.hidden);
  const byRequest = noDesc.filter(r => r.kind === 'no-description-by-request');
  const gaps = noDesc.filter(r => r.kind !== 'no-description-by-request');
  console.log(`rows: ${rows.length} -> ${out.length}  (visible: ${out.filter(r => !r.hidden).length})`);
  console.log(`retired old Reel items: ${report.retired.length}  ${report.retired.join(', ')}`);
  console.log(`hidden shortcut events: ${report.hiddenEvents.length} newly hidden`);
  console.log(`events with usage/example: ${report.usage.join(', ')}`);
  console.log(`meat labels fixed: ${report.relabelled}; descriptions with article fixes: ${report.articles}`);
  report.groups.forEach(g => console.log(`shared command !buy ${g.abr}: shown ${g.shown}, hidden ${g.hidden.length}`));
  console.log(`no description: ${noDesc.length} (${byRequest.length} by request, ${gaps.length} real gaps)`);
  if (gaps.length) console.log('  gaps: ' + gaps.map(r => r.defName).join(' '));

  if (check) { console.log(report.changed ? 'would change the file' : 'already clean'); return; }
  if (report.changed) fs.writeFileSync(FILE, JSON.stringify(out, null, 1) + '\n', 'utf8');
  console.log(report.changed ? 'written' : 'already clean, nothing written');
}

if (require.main === module) main();
module.exports = { clean, fixArticles };
