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
2. `python calculator/build_data.py` merges it with `_data/StoreItems.json` and Toolkit's `itemMaterials.json` / `itemdata.json` into `calculator/calc-data.json`.
3. Commit and push the branch.

## The price rule (fitted to real store prices, Oct 2026)
| You type | Price |
|---|---|
| `!buy gladius` | base price |
| `!buy gladius[steel]` | round((base + units x material price) x 1.05) |
| `!buy gladius[good]` | round(base x quality factor x 1.1) |
| `!buy gladius[steel,good]` | round(round((base + units x material price) x 1.05) x quality factor x 1.1) |

Quality factors: awful 0.5, poor 0.75, normal 1, good 1.25, excellent 1.5, masterwork 2.5, legendary 5.
`units` = the item's `costStuffCount` from the game; material price = its `StoreItems.json` price.
13 of 15 observed prices match exactly; two shroud prices (excellent, masterwork) were off by 1 coin.
Naming a quality, even `normal`, costs 10% more than leaving it off.

## Still to verify in the store
- Materials with spaces (`alpaca wool`): does the buy command want `[alpacawool]` or `[alpaca wool]`? The calculator emits the store name without spaces.
- Whether `$item[...]` is a shortcut for `!buy item[...]` (the calculator copies `!buy ...`).
