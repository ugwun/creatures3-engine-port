# Feeder Agent Debugging — Final Resolution

## Status: ✅ RESOLVED

## Root Causes Found (3 bugs)

### Bug 1: Wrong Chemical IDs ✅ Fixed
The feeder scripts used `chem 1` and `chem 2` (Lactate/Pyruvate — metabolic byproducts) instead of `chem 149` and `chem 150` (Hunger for Protein / Hunger for Carbohydrate — the actual drive chemicals). These drive chemical IDs start at 148, not 0.

### Bug 2: Player Click Doesn't Feed ✅ Fixed
The Push Script (event 1) only checked `doif crea from eq 1` — it only fed when a creature pushed the feeder. When the **player** clicks the feeder, `FROM` is the pointer agent (not a creature), so the feeding branch was completely skipped.

**Fix:** Added a two-step creature lookup:
1. First try `FROM` (for creature push)
2. If FROM isn't a creature, use `rtar 4 0 0` to find any creature in the world

### Bug 3: Wrong Event Number for Player Click ✅ Fixed
The tutorial had a separate "Activate Script" on **event 4**, believing this is what fires on player click. But event 4 = SCRIPTPICKUP (the pickup event). Player left-click fires **message ACTIVATE1 (ID 0)** → which maps to **script event 1** (the Push Script). The separate event 4 script was never triggered by player clicks.

**Fix:** Merged all feeding logic into event 1. Removed the redundant event 4 script. Added an event mapping table to the tutorial documentation.

## Additional Discoveries

### Biochemistry Delay
Chemical injections via `chem` don't change drives instantly. The creature's biochemistry organs need **5–10 ticks** to process chemical changes into drive updates. This made early tests appear to fail when checking drives too quickly.

### Line-of-Sight Blocking
The `star` and `esee` CAOS commands (which find agents the OWNR can see) use `CanPointSeePoint()` which checks for **walls** between agents. In the test metaroom, walls between rooms blocked the feeder's line-of-sight to creatures, causing those commands to return empty results. The fix uses `rtar` which doesn't check sight.

### Console FROM Limitation
The `mesg wrt+` command sends the message with `FROM = vm.GetOwner()`. In the console, OWNR is NULLHANDLE. This means you **cannot simulate a creature push from the console** — the `FROM` will always be null. To test creature-push behavior, you must physically interact in-game.

## Verified Working
- ✅ Direct `chem 149 -1.0` reduces Norn protein drive to 0
- ✅ Direct `chem 150 -1.0` reduces Norn carb drive to 0
- ✅ Feeder food counter decrements on activation
- ✅ Feeder animation plays correctly
- ✅ `rtar 4 0 0` fallback finds creatures
- ✅ World saved with corrected scripts

## Files Modified
- `tools/docs/caos_tutorial_intermediate.md` — Corrected Push Script, added event mapping table, fixed test commands
