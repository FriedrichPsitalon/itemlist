# Materials Calculator - plan (branch: calculator)

Lives at /calculator/ on the Compendium site (GitHub Pages deploys from main only; this branch is safe to push).

## Findings from prep
- Buy syntax (ToolkitUtils): `!buy pants[devilstrand,excellent] 3` - material and quality in brackets, no space before the bracket, quantity last.
- Base store price: `_data/StoreItems.json` (`abr`, `price`, `defname`). Gladius = 60 coins. Note compendium.json "price" is a different scale (6) - use StoreItems.
- Viable materials list: Toolkit's `itemMaterials.json` (~90 names, includes modded stuff).
- compendium.json has material stats (StuffPower_*, multipliers) for ~51 materials but NOT: allowed stuff per item, costStuffCount, quality factors, per-material armor/DPS.
- ToolkitUtils has configurable per-quality price multipliers (awful..legendary) + buyItemMaterial/buyItemQuality toggles. Values aren't in the saved settings file (defaults), so they need confirming.

## Steps
1. Extend RimstreamLabelExporter mod -> `itemStats.json` (stuff categories, costStuffCount, per-stuff stats, quality factors). Needs one RimWorld launch.
2. Bot publishes that file to the repo like tally.json (or copy manually).
3. Build static calculator (vanilla JS, no build step) using the site theme.
4. Snapshot/compare tray + Copy button producing `!buy item[material,quality]`.
