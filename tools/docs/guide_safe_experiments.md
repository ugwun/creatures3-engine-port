# Guide — Safe Experiments

Activity: **Observe, then reviewed change.** Use an isolated data copy and a
disposable or explicitly chosen branch for invasive work. Recording alone does
not mutate the world; chemical/genome application does.

## Record a Baseline and Intervention

1. Open **Experiment → Workspaces** and define the question, hypothesis,
   subjects, measurements, interval, planned intervention, duration, stopping
   condition, unavoidable differences, and desired exports.
2. Capture the current world/tick/speed provenance and mark whether the world
   is disposable or branched.
3. Start baseline recording. Keep control and treatment observations separate.
4. Begin treatment only when the baseline is adequate. The phase button does
   not perform the intervention.
5. Use the dedicated reviewed action. The ledger keeps the user action,
   requested operation, observed engine response, and verification separate.
6. Stop recording, inspect gaps, add notes/bookmarks, and export the manifest.

## Safely Test a Chemical Change

1. Select the exact creature and pin the target chemical plus relevant drives
   or organ evidence.
2. Create or open an experiment and record a baseline.
3. Open **Experiment → Chemical intervention**.
4. Choose signed dose or absolute target. Confirm units (`0..1`
   concentration) and inspect the Derived clamp preview.
5. Refresh and review the creature identity, chemical ID, precondition tick,
   sampled value, requested operation, and immediate projection.
6. Confirm once. Verify the engine-reported after value and retained provenance.
7. Continue observation; do not describe the preview as a prediction of later
   biology.

## Safely Test a Genome Change

1. Open **Experiment → Genetics experiments** in an isolated data copy.
2. Select a trusted source by explicit path/checksum. Create a collision-free
   experimental copy; never select a protected original as the save target.
3. Edit only supported decoded fields in browser memory.
4. Review the structured gene diff and raw checksum provenance. Save the
   experimental copy only after stale/collision validation.
5. Choose egg or hatched injection and sex deliberately.
6. Review the exact saved checksum, source, diff, operation, and active
   disposable/branch world. Confirm injection once.
7. Observe the resulting world object and retain the ledger entry. Injection
   is not an undo operation.

Related references: [Experiment Workspaces](experiment_workspaces.md),
[Safe Chemical Interventions](safe_chemical_interventions.md), and [Genetics
Kit](tab_genetics_kit.md).
