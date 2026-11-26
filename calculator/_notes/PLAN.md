# Materials calculator

Lives at `/calculator/` on the Compendium site. It is a plain static page (no build step, no nav entry, so it stays unlinked until it's ready).
GitHub Pages deploys from `main` only; all work happens on the `calculator` branch.

## Working on it from another computer
```bash
git clone https://github.com/FriedrichPsitalon/itemlist.git
cd itemlist
git checkout calculator
python -m http.server 8765      # then open http://localhost:8765/calculator/
```
Edit `calculator/index.html` (all CSS/JS inline) and refresh. `calc-data.json` is committed, so no game or Python is needed for page work.

## Refreshing the data (only on the PC with RimWorld)
1. Launch RimWorld to the main menu. The `Rimstream Label Exporter` mod rewrites
   `...\LocalLow\Ludeon Studios\RimWorld by Ludeon Studios\TwitchToolkit\itemStats.json`
   whenever the game version or mod list changes (source: `RimstreamBot-src/rimworld-mod/Source/ItemStatsExporter.cs`).
2. `python calculator/build_data.py` merges it with `_data/StoreItems.json` and the Rimstream mod's `itemMaterials.json` (every material label the game knows) / `itemdata.json` into `calculator/calc-data.json`.
3. Commit and push the branch.

## Where the numbers on the page come from
- **Stats, materials, unit costs, default material:** `itemStats.json` from the game (see above).
- **Built-in bonuses:** vanilla "worn" bonuses (`equippedStatOffsets`, e.g. social impact, move speed, incoming damage) come from the game export;
  RimWorld of Magic bonuses (Max Energy, Energy Regen, Class XP Gain...) and special-effect text are parsed from each item's description in
  `compendium/compendium.json`. Niche vanilla stats are hidden via `HIDDEN_BONUS_STATS` in `build_data.py`.
- **Default material:** pre-selected and starred. It is priced as "material left off" (base price) and the copied command omits it.

## The price rule (read from ToolkitUtils' own code, Oct 2026; matches 22 of 22 real chat quotes)
Since 2026-11-26 weapons and apparel are priced by how good the result is, not by material cost. The rule lives in two places that must change together: `priceOf` in `calculator/calc-core.js`, and the game mod `RimstreamBot-src/rimworld-mod/Source/PriceFormula.cs` (which replaces ToolkitUtils' own price).

- **Base** (default material, no quality named): the store price.
- **Score:** melee = average DPS; apparel = sharp + blunt + 0.5 heat armour + 0.02 x (cold + heat insulation).
- **Material:** base x (score / default score) ^ k, where k = ln M / ln max(best score / default score, 1.4); never below 0.4 x base. M rises 2.5 to 4.5 as base goes 20 to 300 (log scale).
- **Quality:** x Q ^ step (awful -0.5, poor -0.25, normal 0, good 0.25, excellent 0.5, masterwork 0.75, legendary 1). With a material choice Q rises 3 to 6 over base 20 to 300; fixed-material gear: 3 to 10 over base 20 to 200, then 10 x sqrt(200 / base).
- Round up, at least 1. Furniture and other non-gear keep ToolkitUtils' rule.
- To verify: the in-game test `PriceFormula PF` compares the game with calc-core.js for every item, material and quality (17,388 rows matched on 2026-11-26).
- Reference quotes: plasteel plate armor 189, legendary arcalleum plate armor 2,288, legendary assault rifle 2,000.

## Confirmed in the store (Oct 2026)
- Materials with spaces must be typed without the space: `[alpacawool]` works, `[alpaca wool]` does not. The calculator uses the store name without spaces.
- `$item[...]` is just a game shorthand for `!buy item[...]`; both work. The calculator copies the `!buy` form.

## Paper Doll (`/calculator/paperdoll/`)
A second page that dresses a pawn: pick apparel, see which slots it takes, which pieces it clashes with, and the armor / insulation / price of the whole outfit.
- **Shared code:** `calc-core.js` holds the price rule, `compute()` (per-piece stats), `commandOf()` and small helpers. BOTH pages load it, so a price fix lands everywhere. `DATA` is declared there; each page assigns it after fetching `calc-data.json`.
- **Data added to `calc-data.json`** (by `build_data.py`): per apparel item `apparel: {layers, groups}` (from the game export), plus top-level `body` (every Human body part with its body-part groups and `w`, its share of hits) and `layers` (name + draw order).
  `body`/`layers` are read from the game's own XML (`Data/Core/Defs/Bodies/Bodies_Humanlike.xml`, `Misc/ApparelLayerDefs`) under the Steam install, or `RIMWORLD_DIR`. If the game isn't installed the previous values in `calc-data.json` are kept.
  RimWorld of Magic layers (`TM_Cloak`) have no XML on this PC, so they use the `LAYER_LABEL_FALLBACK` names and draw order 250.
- **Clash rule (the game's own):** two pieces clash if they share an apparel layer AND both cover some body part (a part is covered when it shares a body-part group with the piece). That is why a FullHead helmet clashes with an UpperHead hat, and a plate suit (Middle + Shell) clashes with both a vest and a cape.
- **Armor maths:** every layer rolls separately on each hit: under half its rating the hit is absorbed, under the full rating the damage is halved, else full. Armor penetration is subtracted from the rating first (not for heat). Layers roll outermost first and the average damage let through compounds; a sharp hit that a layer halves turns blunt, so layers beneath use their blunt rating (`partPass`). An area's figure is averaged over its body parts weighted by `w`. Formula confirmed against the RimWorld wiki's Armor / Armor penetration pages (Oct 2026); not yet checked in a live game. "Overall" weights areas by how often they are hit. This is NOT the sum of ratings.
- **Doll art:** the pawn is original SVG (RimWorld-ish proportions, not game textures), built in layers: body -> hair/face (decoration) -> garments -> invisible hit zones. Garments are separate shapes: `archetype(item)` classifies each piece (shirt, pants, vest, jacket, suit, plate, robe, cape, cloak, and for the head hat, wizard, cap, helmOpen, helmet, hood, maskFull, maskMouth, blindfold, crown, headset, collar) from its layers, body-part groups and name, and `garmentMarkup` draws it from the piece's real coverage (greaves only if it covers Legs, boots only if Feet, etc.). Armor-group pieces get plate styling, the rest soft styling. Add a new shape by adding a case in `archetype` + `garmentMarkup`; unknown pieces fall back to a vest/cap. Pieces are drawn inner layer first; the try-on piece is a cyan ghost; hair/face hide where a garment covers them (`HEAD_HIDES`).
- **Doll zones:** 11 hit zones in `REGION_DEFS` (hands are one zone; Waist = the utility-belt slot, never struck). They are invisible except for clash hatching, the cyan try-on outline and hover highlight. Which zone a body part belongs to comes from its groups (`regionOfPart`).
- **Sharing:** the outfit lives in the URL (`?a=def:material:quality,...&b=...&cmp=1&dmg=&ap=`) and in localStorage (`rs-doll-v1`). `?add=<def>&m=<material>&q=<quality>` (what the calculator's "Try on doll" sends) previews a piece on the viewer's saved outfit.
- **Hover text:** every area has one breakdown tooltip, shown from the zone, its label on the doll, and its table row (numbers included). Feet carry a joke note (vanilla has no boots; only modded pieces like Ancient Mail cover feet). Move speed rows explain the baseline walk speed (`pawn.moveSpeed` in calc-data.json, read from Races_Humanlike.xml: 4.6 cells/s) and the percent change.
- **Preview rule:** the try-on piece is only drawn on the pawn while the pointer is on the piece list or the try-on card (or a control in the card has focus), tracked in `state.live`. Put on / Swap makes it permanent. Arriving from the calculator keeps it drawn until the pointer has visited either.
- **Remove all clothing** (centre column, above the try-on card) empties the active outfit and offers Undo until the next edit.
- **Doll-only items:** the calculator skips the store categories Misc, Utility and Magic artifacts, but the store files everyday clothing (T-shirts, pants, dusters, sashes) under Misc, belts/packs under Utility and rings/bracers under Magic artifacts, and pawns wear them. `build_data.py` keeps worn apparel from those categories with `dollOnly: true`; the calculator filters them out at load (so it looks exactly as before) and `calc-items.json` (Store page) excludes them. The doll hides its calculator links for them. Only items that have a store entry are included (no store price = can't be bought or imported).
- **Import from chat** (button beside Remove all clothing): paste a `!mypawngear` reply and the doll loads the pawn's apparel into the active outfit (undoable). It needs ToolkitUtils' *apparel* option on for that command (off by default; Twitch Toolkit settings > Store > Commands > Edit > viewer gear). Reply format, read from the ToolkitUtils DLL: `【Gear】 Overall armor: ... ⎮ Weapon: ... ⎮ Apparel: Steel plate armor (good 87%), Cowboy hat (normal)` (`[Gear]` and ` | ` when its emojis option is off). Each piece is RimWorld's label `{material adjective-or-label} {item} (quality hp% T)`; the parser (`parseGearReply`) matches longest item label first, then the prefix against `DATA.materials` label/adjective (`adj` is stored by build_data.py when it differs, e.g. golden/wooden), and reports anything it can't place or that clashes. Only the line holding `Apparel:` is read. Not yet checked against a real reply from the live game.
- **Buy outfit** shows each `!buy` line separately with a "Copy next" stepper, so nobody pastes nine commands into chat at once.
