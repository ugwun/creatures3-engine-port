# Contextual Help Inventory

The JavaScript registry is authoritative; this page records review ownership
and coverage for writers and reviewers.

Release audit: Task 20 reconciled this inventory with all 18 named routes and
every registered primary panel, field, metric, state, and consequential action
on 28 July 2026. Automated checks fail when an ID, owner, live target,
guide/reference document, or documented inventory row is missing.

## Primary Routes

| Help ID | Surface | Activity | Owner |
|---|---|---|---|
| `route.dashboard` | Observatory overview | Observe | Task 16 |
| `route.creatures` | Live creature observation | Observe | Tasks 02, 07, 08 |
| `route.timeline` | Ethology timeline | Observe | Task 09 |
| `route.compare` | Creature/cohort comparison | Observe | Task 10 |
| `route.ecology` | World and ecology | Observe | Task 11 |
| `route.scripts` | Running scripts | Observe | Task 05 |
| `route.logs` | Contextual logs | Observe | Task 06 |
| `route.experiments` | Experiment workspaces | Reviewed change | Task 12 |
| `route.chemicals` | Chemical intervention | Reviewed change | Task 13 |
| `route.genetics` | Genetics experiments | Reviewed change | Task 14 |
| `route.workbench` | CAOS Workbench | Reviewed change | Task 15 |
| `route.scratchpad` | Evaluate-now Scratchpad | Read only | Task 15 |
| `route.debugger` | CAOS Debugger | Develop | Tasks 05, 06 |
| `route.diagnostics` | Engine/API diagnostics | Develop | Task 06 |
| `route.guides` | Task guides | Learn | Task 17 |
| `route.caos-reference` | CAOS reference | Learn | Task 17 |
| `route.architecture` | Architecture graph | Learn | Tasks 17, 18 |
| `route.evidence` | Evidence and terms | Learn | Tasks 01, 02, 17 |

## Primary Panels Fields and Consequential Actions

| Help ID | Target | Owner |
|---|---|---|
| `concept.evidence-levels` | Evidence button and generated evidence badges | Tasks 01, 17 |
| `action.accessibility-settings` | Keyboard and display settings | Task 19 |
| `panel.architecture-inspector` | Architecture node/edge/path inspector | Task 18 |
| `field.architecture-search` | Architecture metadata search | Task 18 |
| `field.architecture-layers` | Layer filters and evidence legend | Task 18 |
| `field.architecture-path` | Metric data-path selector | Task 18 |
| `action.architecture-fit` | Fit selected node or filtered graph | Task 18 |
| `panel.biological-monitor` | Biological time-series monitor | Task 07 |
| `panel.observation-strip` | Seven-stage creature observation strip | Task 08 |
| `action.biological-record` | Biological history record/pause action | Task 07 |
| `action.biological-pin` | Biological signal pin controls | Task 07 |
| `action.timeline-record` | Timeline record/pause action | Task 09 |
| `action.timeline-bookmark` | Timeline event bookmark controls | Task 09 |
| `field.timeline-scrubber` | Historical world-tick cursor | Task 09 |
| `field.ecology-ca-channel` | CA/smell channel selector | Task 11 |
| `action.experiment-record` | Baseline recording action | Task 12 |
| `action.chemical-intervention` | Chemical preview/confirmation entry | Task 13 |
| `action.genetics-injection` | Genome injection review entry | Task 14 |
| `field.workbench-mode` | Evaluate/Inspect/Install/Replace/Remove modes | Task 15 |
| `field.log-context` | Structured log context preview | Task 06 |
| `action.log-bookmark` | Structured log record bookmark controls | Task 06 |

## Visible Controls

- Pin: biological signal diamonds and timeline event bookmarks.
- Bookmark: timeline events and log records.
- Record: Timeline recording, biological monitor recording, and Experiment
  baseline/treatment controls.
- Help: persistent header Help/Evidence buttons and F1 on registered targets.

These controls have visible labels or accessible names. Optional shortcuts are
listed in the drawer and full guide. Standard Tab navigation is never repurposed.
