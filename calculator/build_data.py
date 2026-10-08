#!/usr/bin/env python3
"""Builds calculator/calc-data.json for the materials calculator.

Inputs (all read-only):
  itemStats.json      - written by the Rimstream Label Exporter RimWorld mod (game data)
  itemMaterials.json  - Toolkit's list of materials it accepts in !buy item[material]
  itemdata.json       - Toolkit's per-item flags (IsStuffAllowed ...)
  _data/StoreItems.json - store prices (this repo)

Usage:  python build_data.py [path-to-TwitchToolkit-data-folder]
Standard library only, so it runs anywhere Python 3 does.
"""
import datetime
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DEFAULT_TK = os.path.join(
    os.path.expanduser('~'), 'AppData', 'LocalLow', 'Ludeon Studios',
    'RimWorld by Ludeon Studios', 'TwitchToolkit')

QUALITIES = ['awful', 'poor', 'normal', 'good', 'excellent', 'masterwork', 'legendary']
# ToolkitUtils quality price factors (confirmed against real store prices, Oct 2026).
PRICE_QUALITY_FACTOR = {'awful': 0.5, 'poor': 0.75, 'normal': 1, 'good': 1.25,
                        'excellent': 1.5, 'masterwork': 2.5, 'legendary': 5}
# Used only if the game export lacks the hidden multiplier stats (older itemStats.json).
WIKI_FALLBACK = {
    'MeleeWeapon_DamageMultiplier': [0.8, 0.9, 1, 1.1, 1.2, 1.45, 1.65],
    'RangedWeapon_DamageMultiplier': [0.9, 1, 1, 1, 1, 1.25, 1.5],
}
EXCLUDED_CATEGORIES = {'Drugs', 'Raw resources', 'Misc', 'Utility', 'Magic artifacts'}


# Built-in bonuses (RimWorld of Magic etc.) are listed in the item's description as
# "Label: +x" / "Label: +x%" lines under a header line ending in ":". Anything else under
# that header ("Shroud of Undeath: reduces ...") is a special effect shown as text.
EFFECT_RE = re.compile(r"^([A-Za-z][A-Za-z' /-]{1,32}?):\s*([+\-−])\s?(\d[\d.,]*)\s*(%?)\s*$")
EFFECT_ALIASES = {'Arcane Res': 'Arcane Resistance'}
LOWER_IS_BETTER = ('cost', 'cooldown')


def parse_effects(description):
    lines = [l.strip() for l in (description or '').splitlines() if l.strip()]
    effects, special, seen_header = [], [], False
    for line in lines:
        m = EFFECT_RE.match(line)
        if m:
            label = EFFECT_ALIASES.get(m.group(1).strip(), m.group(1).strip())
            sign = -1 if m.group(2) in '-−' else 1
            value = sign * float(m.group(3).replace(',', ''))
            unit = '%' if m.group(4) else ''
            effects.append({'label': label, 'value': value, 'unit': unit,
                            'better': 'low' if any(w in label.lower() for w in LOWER_IS_BETTER) else 'high'})
        elif line.endswith(':'):
            seen_header = True
        elif seen_header and ':' in line and len(line) <= 220:
            special.append(line)
    return effects, special


def load(path):
    with open(path, encoding='utf8') as f:
        return json.load(f)


def main():
    tk = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_TK
    stats = load(os.path.join(tk, 'itemStats.json'))
    viable = set(load(os.path.join(tk, 'itemMaterials.json')))
    idata = load(os.path.join(tk, 'itemdata.json'))
    compendium = {x['defName']: x for x in load(os.path.join(REPO, 'compendium', 'compendium.json'))}
    store = {i['defname']: i for i in load(os.path.join(REPO, '_data', 'StoreItems.json'))['items']}

    materials = {}
    for def_name, st in stats['stuffs'].items():
        s = store.get(def_name)
        if not s:
            continue  # no store price -> can't be priced, so not viable
        names = {st['label'], st.get('adjective') or '', s['abr']}
        if not (names & viable):
            continue  # Toolkit doesn't list it as a material
        materials[def_name] = {
            'token': s['abr'],
            'label': st['label'],
            'price': s['price'],
            'cats': st['categories'],
        }

    items = []
    skipped = []
    for def_name, it in stats['items'].items():
        s = store.get(def_name)
        if not s:
            continue
        if s['category'] in EXCLUDED_CATEGORIES:
            skipped.append((def_name, s['category']))
            continue
        allow_stuff = idata.get(def_name, {}).get('IsStuffAllowed', True)
        mats = [m for m in it['materials'] if m == '' or m in materials] if allow_stuff else []
        if it['madeFromStuff'] and not allow_stuff:
            mats = []
        if it['madeFromStuff'] and not mats:
            pass  # still listable: shows base stats, no material options
        default_stuff = it.get('defaultStuff') or ''
        # Beauty scales by offset, not factor, and the page never shows it; MarketValue isn't used by store prices.
        stat_names = [n for n in it['statNames'] if n not in ('Beauty', 'MarketValue', 'EquipDelay')]
        qf = {k: v for k, v in it.get('qualityFactors', {}).items() if k not in ('Beauty', 'MarketValue')}
        if it['hasQuality']:
            for k, v in WIKI_FALLBACK.items():
                if (it['kind'] == 'melee' and k.startswith('Melee')) or (it['kind'] == 'ranged' and k.startswith('Ranged')):
                    qf.setdefault(k, v)

        by_mat = {}
        for m in (mats if it['madeFromStuff'] else ['']):
            by_mat[m] = [it['materials'][m]['stats'].get(n, 0) for n in stat_names]

        # Group: weapons / armor / clothing
        if it['kind'] in ('melee', 'ranged'):
            group = 'weapon'
        else:
            # Armor vs clothing from the item's own armor stats (not the best material it can
            # be made from - a hyperweave cowboy hat is still a hat).
            cs = (compendium.get(def_name) or {}).get('stats', {})
            base_armor = cs.get('ArmorRating_Sharp', 0)
            stuff_mult = cs.get('StuffEffectMultiplierArmor', 0)
            is_armor = (s['category'] == 'Armor' or base_armor >= 0.5 or stuff_mult >= 0.5
                        or (stuff_mult >= 0.4 and s['category'] != 'Headgear'))
            group = 'armor' if is_armor else 'clothing'

        effects, special = parse_effects((compendium.get(def_name) or {}).get('description'))
        for e in it.get('equipped', []):
            # vanilla stat offsets the item gives its wearer; skip any the description already listed
            label = e['label'][:1].upper() + e['label'][1:]
            if any(x['label'].lower() == label.lower() for x in effects):
                continue
            effects.append({'label': label, 'value': round(e['value'] * 100, 1) if e['pct'] else e['value'],
                            'unit': '%' if e['pct'] else '', 'better': 'low' if e.get('lowerBetter') else 'high'})
        cost_extra = {k: v for k, v in it['costList'].items() if k not in ('',)}
        items.append({
            'def': def_name,
            'token': s['abr'],
            'label': it['label'],
            'price': s['price'],
            'cat': s['category'],
            'kind': it['kind'],
            'group': group,
            'hasQuality': it['hasQuality'],
            'madeFromStuff': it['madeFromStuff'] and bool(mats),
            'units': it['costStuffCount'],
            'extra': cost_extra,
            'defaultStuff': default_stuff,
            'mats': [m for m in by_mat.keys() if m != ''],
            'statNames': stat_names,
            'qf': qf,
            'stats': by_mat,
            'effects': effects,
            'special': special,
            'tools': it.get('tools'),
            'ranged': it.get('ranged'),
        })

    items.sort(key=lambda i: (i['group'], i['label'].lower()))
    # extra-cost ingredients need labels/prices too
    ingredient_labels = {}
    for it in items:
        for k in it['extra']:
            ingredient_labels[k] = {'label': stats['stuffs'].get(k, {}).get('label') or (store.get(k) or {}).get('abr') or k,
                                    'price': (store.get(k) or {}).get('price')}

    out = {
        'generated': datetime.date.today().isoformat(),
        'gameVersion': stats.get('gameVersion'),
        'qualities': [{'id': q, 'factor': PRICE_QUALITY_FACTOR[q]} for q in QUALITIES],
        'rules': {'materialMarkup': 1.05, 'qualityMarkup': 1.1},
        'materials': materials,
        'ingredients': ingredient_labels,
        'items': items,
    }
    dest = os.path.join(HERE, 'calc-data.json')
    with open(dest, 'w', encoding='utf8') as f:
        json.dump(out, f, separators=(',', ':'))
    groups = {}
    for i in items:
        groups[i['group']] = groups.get(i['group'], 0) + 1
    print('Wrote %s (%d KB): %d items %s, %d materials; skipped by category: %d'
          % (dest, os.path.getsize(dest) // 1024, len(items), groups, len(materials), len(skipped)))
    if stats['diagnostics'].get('qualityFactorMismatches'):
        print('Note: game export reported quality-factor mismatches:', stats['diagnostics'].get('mismatchByStat', '(no per-stat breakdown - old export)'))


if __name__ == '__main__':
    main()
