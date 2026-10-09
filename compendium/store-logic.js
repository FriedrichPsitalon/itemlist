/*
 * Store logic that doesn't touch the DOM: name matching, ranking, the chat commands a row can copy,
 * quantity rules. Loaded by compendium/index.html in the browser and by _tools/check.js in node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.StoreLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Fallback for the minimum spend; the page overrides it from economy.json (_data/economy.yml).
  let MIN_SPEND = 4;
  const setMinSpend = n => { if (n > 0) MIN_SPEND = n; };
  const getMinSpend = () => MIN_SPEND;

  const strip = s => String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  // "Wolf-meat", "wolf meat" and "wolfmeat" all become "wolfmeat".
  const norm = s => strip(s).replace(/[^a-z0-9]+/g, '');
  const words = s => strip(s).split(/[^a-z0-9]+/).filter(Boolean);

  // Lets people paste a whole chat command into the search box.
  function cleanQuery(q) {
    return String(q || '').trim().replace(/^!+\s*/, '').replace(/^buy\s+/i, '').trim();
  }

  function prepare(item) {
    if (item._s) return item;
    const labelText = item.label || item.defName || '';
    Object.defineProperty(item, '_s', {
      enumerable: false,
      value: {
        label: norm(labelText),
        abr: norm(item.abr),
        def: norm(item.defName),
        words: words(labelText),
        alt: norm((item.note || '') + ' ' + (item.usage || '')),
        desc: norm(item.description),
        descWords: strip(item.description),
      },
    });
    return item;
  }

  /* Tiers: 0 exact, 1 prefix, 2 every query word starts a word of the label, 3 contained in
     label/command/defName, 4 words found anywhere in name fields or shared-command note.
     Returns -1 for no name match. */
  function nameTier(item, nq, tokens) {
    const s = prepare(item)._s;
    if (s.label === nq || s.abr === nq || s.def === nq) return 0;
    if (s.label.startsWith(nq) || s.abr.startsWith(nq) || s.def.startsWith(nq)) return 1;
    if (tokens.length && tokens.every(t => s.words.some(w => w.startsWith(t)))) return 2;
    if (s.label.includes(nq) || s.abr.includes(nq) || s.def.includes(nq)) return 3;
    const all = s.label + ' ' + s.abr + ' ' + s.def + ' ' + s.alt;
    if (s.alt.includes(nq)) return 4;
    if (tokens.length > 1 && tokens.every(t => all.includes(norm(t)))) return 4;
    return -1;
  }

  function descMatches(item, nq, tokens) {
    const s = prepare(item)._s;
    if (!s.desc) return false;
    if (s.desc.includes(nq)) return true;
    return tokens.length > 1 && tokens.every(t => s.descWords.includes(t));
  }

  const labelOf = it => (it.label || it.defName || '').toLowerCase();
  const byRank = (a, b) => a.tier - b.tier || labelOf(a.item).length - labelOf(b.item).length ||
    labelOf(a.item).localeCompare(labelOf(b.item));

  /* search(items, rawQuery, pass) -> { main: [item...], desc: [item...] }
     `pass` is the facet filter (type/category/source/tags); description-only matches are kept apart. */
  function search(items, rawQuery, pass) {
    const q = cleanQuery(rawQuery);
    const nq = norm(q);
    const tokens = words(q);
    if (!nq) return { main: items.filter(pass), desc: [] };
    const main = [];
    const desc = [];
    for (const item of items) {
      if (!pass(item)) continue;
      const tier = nameTier(item, nq, tokens);
      if (tier >= 0) main.push({ item, tier });
      else if (descMatches(item, nq, tokens)) desc.push(item);
    }
    main.sort(byRank);
    desc.sort((a, b) => labelOf(a).localeCompare(labelOf(b)));
    return { main: main.map(m => m.item), desc };
  }

  const coins = n => (n === 1 ? '1 coin' : n + ' coins');

  // Items cheaper than the minimum spend have to be bought in bulk.
  function minQty(item) {
    if (item.type !== 'item' || !(item.price > 0)) return 1;
    return Math.max(1, Math.ceil(MIN_SPEND / item.price));
  }

  /* The chat commands a row may offer for copying. Rule: never a command that fails or does something
     else when pasted as-is. Pawn kinds return nothing because their syntax has never been confirmed. */
  function commandsFor(item, qty) {
    if (item.type === 'item') {
      if (!item.abr) return [];
      const n = qty || minQty(item);
      return [{ id: 'buy', label: 'Copy buy command', cmd: n > 1 ? `!buy ${item.abr} ${n}` : `!buy ${item.abr}` }];
    }
    if (item.type === 'event') {
      if (item.usage) return [{ id: 'example', label: 'Copy example', cmd: item.example }];
      return [{ id: 'buy', label: 'Copy buy command', cmd: `!buy ${item.defName}` }];
    }
    if (item.type === 'trait') {
      const cmds = [];
      if (item.canAdd) cmds.push({ id: 'add', label: 'Copy add command', cmd: `!buy trait ${item.label}` });
      if (item.canRemove) cmds.push({ id: 'remove', label: 'Copy remove command', cmd: `!buy removetrait ${item.label}` });
      return cmds;
    }
    return [];
  }

  function basePrice(item) {
    if (item.type === 'trait') return item.addPrice != null ? item.addPrice : item.removePrice;
    return item.price;
  }

  return { norm, words, cleanQuery, prepare, search, nameTier, coins, minQty, commandsFor, basePrice, setMinSpend, getMinSpend };
});
