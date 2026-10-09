#!/usr/bin/env node
/*
 * Checks the LIVE site (or any base URL) against the repo data.   node _tools/check-live.js [baseUrl]
 *   - every page loads and every internal link on it returns 200
 *   - the Guide's stated numbers equal the data (economy.yml, StoreIncidents.json)
 *   - no page leaks template code, and none still says "Compendium"
 *   - the published compendium.json is the cleaned one
 * Uses a random ?cb= on every request because GitHub Pages sits behind a CDN.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'https://friedrichpsitalon.github.io/itemlist').replace(/\/$/, '');
const ROOT = path.resolve(__dirname, '..');
const PAGES = ['/', '/guide/', '/guide/jobs/', '/guide/classes/', '/info', '/commands', '/modlist', '/calculator/', '/compendium/'];

let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok ? '' : '\n        ' + (detail || '')));
  if (!ok) failed++;
}
const cb = () => 'cb=' + Math.random().toString(36).slice(2);
const bust = u => u + (u.includes('?') ? '&' : '?') + cb();
async function get(u) { return fetch(bust(u), { redirect: 'follow', headers: { 'Cache-Control': 'no-cache' } }); }

const incidents = JSON.parse(fs.readFileSync(path.join(ROOT, '_data', 'StoreIncidents.json'), 'utf8')).incitems;
const price = abr => (incidents.find(i => i.abr === abr) || {}).price;
const eco = {};
fs.readFileSync(path.join(ROOT, '_data', 'economy.yml'), 'utf8').split(/\r?\n/).forEach(l => {
  const m = /^(\w+):\s*(\d+)/.exec(l);
  if (m) eco[m[1]] = +m[2];
});
const coinsRe = n => (n === 1 ? '1 coin\\b' : `${n} coins\\b`);
const text = html => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&mdash;|&#8212;/g, '—').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

(async () => {
  const links = new Set();
  const pageHtml = {};
  for (const p of PAGES) {
    const res = await get(BASE + p);
    check(`page ${p} loads`, res.status === 200, 'status ' + res.status);
    if (res.status !== 200) continue;
    const html = await res.text();
    pageHtml[p] = html;
    for (const m of html.matchAll(/<a [^>]*href="([^"]+)"/g)) {
      let h = m[1];
      if (/^(mailto:|tel:|javascript:|#)/.test(h)) continue;
      const u = new URL(h, BASE + p);
      if (u.origin !== new URL(BASE).origin) continue;   // external links are not ours to check
      u.hash = '';
      links.add(u.pathname + u.search);
    }
    check(`page ${p} has no template code showing`, !/\{\{|\{%|%\}/.test(text(html)), 'found {{ or {% in rendered text');
    if (p !== '/compendium/') check(`page ${p} never says "Compendium" to a reader`, !/compendium/i.test(text(html).replace(/\/compendium\//gi, '')), '');
  }

  const bad = [];
  for (const l of links) {
    if (/\.(png|jpg|css|js|json)(\?|$)/.test(l)) continue;
    const r = await get(new URL(l, BASE).origin + l);
    if (r.status !== 200) bad.push(`${l} -> ${r.status}`);
  }
  check(`all ${links.size} internal links on those pages return 200`, bad.length === 0, bad.join('\n        '));

  const g = text(pageHtml['/guide/'] || '');
  const expect = (name, re) => check(`Guide ${name}`, re.test(g), `expected /${re.source}/ in the Guide text`);
  expect(`earn rate is ${eco.earn_per_minute} coins a minute`, new RegExp(`${eco.earn_per_minute} coins a minute`));
  expect(`starting balance is ${eco.starting_balance}`, new RegExp(`start with ${eco.starting_balance}\\b`));
  expect(`minimum spend is ${eco.min_spend}`, new RegExp(`at least ${eco.min_spend} coins`));
  expect(`!buy pawn costs ${price('pawn')}`, new RegExp(`!buy pawn — ${coinsRe(price('pawn'))}`));
  expect(`!buy wildman costs ${price('wildman')}`, new RegExp(`!buy wildman \\(${coinsRe(price('wildman'))}\\)`));
  expect(`!buy prisoner costs ${price('prisoner')}`, new RegExp(`!buy prisoner \\(${coinsRe(price('prisoner'))}\\)`));
  expect(`!buy maninblack costs ${price('maninblack')}`, new RegExp(`!buy maninblack — ${coinsRe(price('maninblack'))}`));
  check('Guide has the How to buy block', /id="how-to-buy"/.test(pageHtml['/guide/'] || ''));
  check('home page links to How to buy', /guide\/#how-to-buy/.test(pageHtml['/'] || ''));

  const cres = await get(BASE + '/compendium/compendium.json');
  const comp = await cres.json();
  check('published compendium.json is the cleaned one (has hidden rows, no retired Reel items)',
    comp.some(r => r.hidden) && !comp.some(r => r.defName === 'ReelStorageBarrel'));

  console.log(failed ? `\n${failed} check(s) failed` : '\nall live checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
