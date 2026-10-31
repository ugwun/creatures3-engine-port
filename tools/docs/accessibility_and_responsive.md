# Accessibility and Responsive Operation

The Observatory is designed to preserve scientific context when it is used
with a keyboard, browser zoom, reduced motion, a narrow viewport, or a screen
reader. These features change presentation only; they do not change engine
state, evidence levels, sampling, or mutation safeguards.

![Keyboard and display settings in Firefox, showing density, motion, and
shortcut controls](/docs/images/observatory/accessibility-display-dialog-firefox.png)

## Supported Layouts

The maintained test targets are:

| Layout | CSS viewport | Expected behaviour |
|---|---:|---|
| Narrow inspection | 720 × 900 | Navigation is an overlay, toolbars scroll horizontally, and multi-column workspaces become stacked inspection regions. |
| Laptop | 1600 × 940 | Primary workspace and supporting inspectors remain visible without document-level horizontal overflow. |
| Wide investigation | 1920 × 1080 | Multi-panel comparison, map, timeline, and architecture views use the available width. |
| Text zoom | 200% at a desktop window | The effective narrow layout remains operable; no session warning or reviewed-change context is removed. |

![Narrow 720-pixel Firefox layout retaining the live session ribbon,
context strip, intent actions, and observed session card](/docs/images/observatory/narrow-observatory-firefox.png)

At narrow widths, open the workspace menu with the labelled menu button.
Escape closes the overlay and returns focus to that button. Long toolbars and
tables scroll within their own region instead of widening the document.
Identifiers remain ordinary selectable text.

## Keyboard Operation

- Press Tab and Shift+Tab for normal document order. A **Skip to active
  workspace** link is the first focus target.
- In the workspace navigation, use Up/Down, Home, and End; press Enter or
  Space to open a route.
- In creature, chemistry, and documentation tab lists, use Left/Right, Home,
  and End. Selection and the associated panel are exposed with tab semantics.
- On timeline marks, map rooms/agents, brain neurons/tracts, and architecture
  nodes/relationships, use arrow keys to move and Enter or Space to inspect.
- Escape dismisses native dialogs, contextual help, and the narrow navigation.
  Focus returns to the control that opened a modal dialog.
- Alt+Left returns to the previous Observatory investigation.
- F1 opens contextual help for a focused non-editable control.
- Shift+? opens **Keyboard and display**.

Global shortcuts do not run while focus is in an input, select, textarea,
CAOS editor, content-editable surface, or ARIA text box. Turn off **Enable
global Observatory shortcuts** when F1, Shift+?, or Alt+Left conflicts with a
browser or assistive-technology command. Buttons and local arrow-key patterns
remain available.

For an end-to-end keyboard walkthrough, use
[Keyboard-only Observatory Tour](guide_keyboard_observatory.md).

## Screen-Reader Alternatives

Changing routes and preference results use restrained polite announcements.
Connection, recording, validation, and mutation results retain their existing
status or alert regions. Polling data is not announced on every tick.

- The ecology SVG has a name and description. Each room and agent has an exact
  focus label. **Room data table — textual map alternative** exposes room
  type, selected CA value, connections, agents, tick, metaroom, and bounded
  result status.
- Timeline marks announce label, evidence level, and exact tick/range. The
  retained event list exposes the same records and detailed before/after
  evidence.
- Brain neurons announce lobe, neuron, activity, non-zero state values, and
  activation purpose. Tract relationships announce tract name and dendrite
  count. The adjacent detail region contains the selected data.
- Biological sparklines expose exact range summaries. The live architecture
  graph has a complete keyboard-operable text view with node and relationship
  parity.

The evidence words **Observed**, **Derived**, **Inferred**, and **Unknown**,
fresh/stale labels, selected outlines, and error text accompany colour. Colour
is never the only critical state signal.

## Density, Motion, and Theme Semantics

Open **Display** in the header:

- **Comfortable** density is the default.
- **Compact** reduces row and card padding while retaining text, units, sample
  times, evidence labels, and focus targets.
- **Reduce interface motion** removes meaningful transition time and animated
  traces. The operating-system `prefers-reduced-motion` setting is also
  honored.

Preferences are browser-local and apply without changing the world. Browser
zoom remains independent.

The visual system uses semantic state/evidence tokens. Light content surfaces
use dark success, warning, danger, information, and evidence text meeting
WCAG AA for normal text. The black header/navigation and dark ecology map use
light text and a gold focus indicator. Hazard orange remains a structural
accent; a darker accent token is used for small text on white.

## Manual Verification Matrix

For a release audit:

1. Run the keyboard tour at 720 × 900 and at a laptop viewport.
2. Repeat the route, map-table, timeline, reviewed experiment, Workbench
   review, documentation, and architecture-text workflows with a screen
   reader or the browser accessibility tree.
3. Set browser zoom to 200%, then verify session identity, warnings, units,
   evidence labels, and all reviewed-change actions remain reachable.
4. Enable compact density and load representative high-density log, timeline,
   comparison, ecology, and architecture data.
5. Enable reduced motion in the Observatory and at operating-system level.
6. Disconnect the engine after the page is loaded and verify retained
   documentation, preferences, and explicitly stale/unknown states.
7. Confirm Escape dismissal and opener-focus restoration for every modal
   reached during the tour.

Automated Node tests protect contrast ratios, preference normalization,
editable-control shortcut exclusions, shortcut uniqueness, and the core
semantic source contract. They complement rather than replace the keyboard,
screen-reader-oriented, Firefox, zoom, and viewport matrix.
