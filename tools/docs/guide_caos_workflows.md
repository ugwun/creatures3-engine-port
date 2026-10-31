# Guide — CAOS Evaluation and Event Scripts

Activity: **Read-only or reviewed change.** Scratchpad accepts only maintained
known-read-only ownerless source. Workbench Evaluate/Install/Replace/Remove can
change engine or persistent world state after explicit review.

## Evaluate CAOS and Install an Event Script

### Immediate read-only query

1. Open **Develop → Scratchpad**.
2. Enter a short ownerless expression using `outs` or `outv`.
3. Review compiler/risk feedback. Known mutation, unknown commands, and
   blocking/yielding source are refused.
4. Press Enter to evaluate; Shift+Enter inserts a line break.
5. Read output with its reviewed world/tick context.

### Reviewed one-shot evaluation

1. Transfer source to **Develop → CAOS Workbench** and choose **Evaluate now**.
2. Decide whether to bind the selected target and pause the simulation before
   the run.
3. Review source checksum, world/tick, target identity, ownerless semantics,
   and mutation acknowledgement.
4. Apply once with Ctrl/Cmd+Enter or the visible action.

### Installed event script

1. Choose **Install**, **Replace**, or **Remove**, then enter an exact non-zero
   family/genus/species/event classifier.
2. Inspect the installed source/checksum. Install requires absence;
   Replace/Remove require the reviewed existing checksum.
3. Review the source diff and persistent world scope.
4. Confirm the requested mode. Refusals caused by stale world, changed source,
   missing/occupied target, compile error, or lock do not mutate the script.
5. Verify in Running Scripts, Debugger, and Logs with the exact classifier.

Immediate execution and installed event scripts have different lifetime,
owner, and persistence semantics. Do not use one as shorthand for the other.

Related references: [CAOS Workbench](tab_caos_ide.md), [Scratchpad](tab_console.md),
and [CAOS Scripts and Execution](caos_scripts.md).
