# Observatory Task Guides

Choose a guide by the question you are investigating. Each workflow states
whether it only observes or can change the current world. Guide links opened
from contextual help retain the current world, subject, and time range in the
shared context strip.

## Start and Observe

| Goal | Activity | Guide |
|---|---|---|
| Orient to a world and select a creature | Observe | [Orient and Observe](guide_orient_and_observe.md#orient-to-a-world-and-select-a-creature) |
| Observe perception, attention, action, and consequence | Observe | [Orient and Observe](guide_orient_and_observe.md#observe-perception-attention-action-and-consequence) |
| Investigate a surprising or failed action | Observe | [Investigate Behavior](guide_investigate_behavior.md#investigate-a-surprising-or-failed-action) |
| Follow a drive or chemical over time | Observe | [Follow and Compare](guide_follow_and_compare.md#follow-a-drive-or-chemical-over-time) |
| Compare an individual with a cohort | Observe | [Follow and Compare](guide_follow_and_compare.md#compare-an-individual-with-a-cohort) |
| Inspect a room route and smell gradient | Observe | [Ecology and Routes](guide_ecology_and_routes.md#inspect-a-room-route-and-smell-gradient) |
| Tour the Observatory with keyboard or screen reader | Observe | [Keyboard-only Observatory](guide_keyboard_observatory.md#orient-without-a-mouse) |

## Record and Change Deliberately

| Goal | Activity | Guide |
|---|---|---|
| Record a baseline and intervention | Observe, then reviewed change | [Safe Experiments](guide_safe_experiments.md#record-a-baseline-and-intervention) |
| Safely test a chemical change | Reviewed change | [Safe Experiments](guide_safe_experiments.md#safely-test-a-chemical-change) |
| Safely test a genome change | Reviewed change | [Safe Experiments](guide_safe_experiments.md#safely-test-a-genome-change) |
| Evaluate CAOS and install an event script | Read-only or reviewed change, depending on mode | [CAOS Workflows](guide_caos_workflows.md#evaluate-caos-and-install-an-event-script) |

## Diagnose Engine Execution

| Goal | Activity | Guide |
|---|---|---|
| Correlate a runtime error with source and agent context | Observe/develop | [Investigate Behavior](guide_investigate_behavior.md#correlate-a-runtime-error-with-source-and-agent-context) |
| Trace a selected metric from engine value to display or export | Observe | [Trace a Live Metric](guide_trace_data_path.md#trace-a-selected-metric-from-engine-to-export) |

## How to Use Contextual Help

- Choose the visible **Help** button for the current route.
- Focus a registered field, chart, panel, or action and press **F1** for its
  specific source, cadence, evidence, caution, and identifiers.
- Press **Shift+?** or use **Display** for the complete shortcut list, compact
  density, reduced motion, and conflict controls.
- Use **Open task guide** for steps or **Open reference** for field-level
  detail. Neither action changes the world.
- Press Escape, activate the close button, or click outside the drawer to
  dismiss it. The drawer does not trap focus, and Tab always performs normal
  keyboard navigation.
- Concise Tips are optional. On keyboard focus they are announced through the
  standard tooltip relationship; they never need to be pinned.

![Contextual help for the biological monitor in Firefox, with activity,
evidence, source, cadence, caution, live identifiers, terms, and guide
actions](/docs/images/observatory/contextual-help-drawer-firefox.png)

The concise metadata remains usable on an already loaded page when the engine
disconnects. Opening a full guide that is not already loaded still requires
the Developer Tools static-file host to be available.

The [Glossary and Evidence Legend](observatory_glossary.md) defines the terms
used throughout these guides.
