#!/usr/bin/env python3
"""Builds calculator/calc-data.json for the materials calculator.

Inputs (all read-only):
  itemStats.json      - written by the Rimstream Label Exporter RimWorld mod (game data)
  itemMaterials.json  - material names written by the Rimstream Label Exporter mod (every stuff label the game knows)
  itemdata.json       - Toolkit's per-item flags (IsStuffAllowed ...)
  _data/StoreItems.json - store prices (this repo)

Also read (optional, read-only): the game's own Bodies_Humanlike.xml / ApparelLayerDefs.xml, for the paper doll page
  (body parts, their body-part groups and hit-chance weights, apparel layer names). Found under the Steam install, or
  set RIMWORLD_DIR. If the game is not on this PC the previous values in calc-data.json are kept.

Usage:  python build_data.py [path-to-TwitchToolkit-data-folder]
Standard library only, so it runs anywhere Python 3 does.
"""
import datetime
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

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
# Vanilla "worn bonus" stats (equippedStatOffsets) that only matter in niche situations. Dropped from the
# page so the bonuses that decide a purchase stay readable; edit this set to change what is hidden.
HIDDEN_BONUS_STATS = {'SlaveSuppressionOffset', 'VacuumResistance', 'ToxicEnvironmentResistance',
                      'DecompressionResistance', 'DecompressionResistanceOffset', 'HypoxiaResistance',
                      'HypoxiaResistanceOffset', 'VacuumSpeedMultiplier'}
# Bonus stats where a smaller number is the better one (the game exporter only flags IncomingDamageFactor).
LOWER_BETTER_BONUS_STATS = {'AimingDelayFactor', 'MentalBreakThreshold', 'MeleeCooldownFactor', 'RangedCooldownFactor'}
BONUS_UNITS = {'MoveSpeed': ' c/s', 'CarryingCapacity': ' kg'}
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


# ---- body + layers for the paper doll (read from the game's own XML) ---------------------------------------------
DEFAULT_GAME = r'C:\Program Files (x86)\Steam\steamapps\common\RimWorld'
LAYER_LABEL_FALLBACK = {'TM_Cloak': 'cloak', 'TM_Artifact': 'artifact'}   # RimWorld of Magic layers (no XML on this PC)


def game_data_dir():
    root = os.environ.get('RIMWORLD_DIR') or DEFAULT_GAME
    d = os.path.join(root, 'Data', 'Core', 'Defs')
    return d if os.path.isdir(d) else None


def load_body(core_defs):
    """Flatten the Human BodyDef: every part with its body-part groups and its share of hits (self coverage)."""
    root = ET.parse(os.path.join(core_defs, 'Bodies', 'Bodies_Humanlike.xml')).getroot()
    human = next(b for b in root.findall('BodyDef') if b.findtext('defName') == 'Human')
    parts = []

    def walk(node, parent_abs, parent_depth):
        cov = float(node.findtext('coverage') or 1)
        absolute = parent_abs * cov
        depth = node.findtext('depth') or parent_depth
        entry = {'id': node.findtext('customLabel') or node.findtext('def'), 'def': node.findtext('def'),
                 'groups': [li.text for li in node.findall('groups/li')], 'depth': depth, '_abs': absolute}
        parts.append(entry)
        kids = [walk(li, absolute, depth) for li in node.findall('parts/li')]
        entry['w'] = absolute - sum(k['_abs'] for k in kids)   # share of hits that land on this part itself
        return entry

    walk(human.find('corePart'), 1.0, 'Outside')
    for p in parts:
        p['w'] = round(max(p['w'], 0), 5)
        del p['_abs']
    return parts


def load_pawn(core_defs):
    """Baseline numbers for an ordinary human pawn (walking speed, cells per second)."""
    root = ET.parse(os.path.join(core_defs, 'ThingDefs_Races', 'Races_Humanlike.xml')).getroot()
    for t in root.findall('ThingDef'):
        if t.findtext('defName') == 'Human':
            return {'moveSpeed': float(t.findtext('statBases/MoveSpeed') or 4.6)}
    return {'moveSpeed': 4.6}


def load_layers(core_defs, used):
    order = {}
    path = os.path.join(core_defs, 'Misc', 'ApparelLayerDefs', 'ApparelLayerDefs.xml')
    root = ET.parse(path).getroot()
    for d in root.findall('ApparelLayerDef'):
        order[d.findtext('defName')] = (d.findtext('label'), int(d.findtext('drawOrder') or 0))
    layers = []
    for l in sorted(used, key=lambda x: order.get(x, (None, 999))[1]):
        label, draw = order.get(l, (LAYER_LABEL_FALLBACK.get(l) or l.replace('TM_', '').lower(), 250))
        layers.append({'id': l, 'label': label, 'order': draw})
    return layers


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
            if e['stat'] in HIDDEN_BONUS_STATS:
                continue
            effects.append({'label': label, 'value': round(e['value'] * 100, 1) if e['pct'] else e['value'],
                            'unit': '%' if e['pct'] else BONUS_UNITS.get(e['stat'], ''),
                            'better': 'low' if (e.get('lowerBetter') or e['stat'] in LOWER_BETTER_BONUS_STATS) else 'high'})
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
            # Which apparel layers it takes and which body-part groups it covers (two pieces clash when they share both).
            'apparel': ({'layers': it['apparel']['layers'], 'groups': it['apparel']['bodyParts']}
                        if it['kind'] == 'apparel' and it.get('apparel') else None),
        })

    items.sort(key=lambda i: (i['group'], i['label'].lower()))
    # extra-cost ingredients need labels/prices too
    ingredient_labels = {}
    for it in items:
        for k in it['extra']:
            ingredient_labels[k] = {'label': stats['stuffs'].get(k, {}).get('label') or (store.get(k) or {}).get('abr') or k,
                                    'price': (store.get(k) or {}).get('price')}

    # Paper doll data. Without the game installed, keep what the last build stored.
    previous = {}
    try:
        previous = load(os.path.join(HERE, 'calc-data.json'))
    except (OSError, ValueError):
        pass
    used_layers = sorted({l for i in items if i['apparel'] for l in i['apparel']['layers']})
    core = game_data_dir()
    if core:
        body, layers, pawn = load_body(core), load_layers(core, used_layers), load_pawn(core)
    else:
        body, layers, pawn = previous.get('body'), previous.get('layers'), previous.get('pawn') or {'moveSpeed': 4.6}
        if not body or not layers:
            sys.exit('Need the RimWorld install (set RIMWORLD_DIR) to read the human body the first time.')
        print('RimWorld not found: kept the body and layers from the previous calc-data.json')

    out = {
        'generated': datetime.date.today().isoformat(),
        'gameVersion': stats.get('gameVersion'),
        'qualities': [{'id': q, 'factor': PRICE_QUALITY_FACTOR[q]} for q in QUALITIES],
        'rules': {'materialMarkup': 1.05, 'qualityMarkup': 1.1},
        'materials': materials,
        'ingredients': ingredient_labels,
        'body': body,
        'layers': layers,
        'pawn': pawn,
        'items': items,
    }
    dest = os.path.join(HERE, 'calc-data.json')
    with open(dest, 'w', encoding='utf8') as f:
        json.dump(out, f, separators=(',', ':'))
    # Tiny list the Store page reads to know which items get a "Compare materials" button.
    with open(os.path.join(HERE, 'calc-items.json'), 'w', encoding='utf8') as f:
        json.dump(sorted(i['def'] for i in items), f, separators=(',', ':'))
    groups = {}
    for i in items:
        groups[i['group']] = groups.get(i['group'], 0) + 1
    print('Wrote %s (%d KB): %d items %s, %d materials; skipped by category: %d'
          % (dest, os.path.getsize(dest) // 1024, len(items), groups, len(materials), len(skipped)))
    if stats['diagnostics'].get('qualityFactorMismatches'):
        print('Note: game export reported quality-factor mismatches:', stats['diagnostics'].get('mismatchByStat', '(no per-stat breakdown - old export)'))


if __name__ == '__main__':
    main()
