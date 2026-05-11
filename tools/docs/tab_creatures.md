# Creatures Tab

The **Creatures** tab is a comprehensive, live inspector for all creature agents (Norns, Grendels, Ettins) currently active in the world. It provides real-time insights into drive levels, biochemistry, neural activity, and general health.

![Creatures Tab](/docs/media/tab_creatures.png)

## Interface Layout

The interface uses a three-panel design:
1. **Creature List (Left Sidebar):** A list of all active creatures.
2. **Detail Panel (Center):** The main content area displaying in-depth tabs (Drives, Chemistry, Organs, Genome, Brain).
3. **Summary Card (Right Sidebar):** At-a-glance information for the selected creature.

### Toolbar Controls
* **Refresh:** Manually fetch the latest data from the engine.
* **Auto (2s):** Toggle automatic background polling (enabled by default).
* **Focus:** Instantly snap the in-game camera to the selected creature's coordinates.

### Creature List
* Lists all creatures with their species icon (🐣 Norn, 🦎 Grendel, 🔧 Ettin).
* Displays the creature's name (or genus + moniker), life state badge (alert, asleep, unconscious, dead), and a tiny health bar.
* **Search & Filters:** Use the text box to search by name/moniker, and toggle buttons to filter by species.

---

## Drives Sub-Tab

Provides a visual breakdown of the creature's immediate motivations.

* Displays 20 horizontal bars for all creature drives (Pain, Hunger, Tiredness, Sex Drive, etc.).
* Uses a colour gradient: green (low) → yellow (mid) → red (high).
* The highest active drive is highlighted with an orange accent border.
* Numeric values are displayed alongside each bar.

---

## Chemistry Sub-Tabs

The Chemistry inspector is split into two distinct modes: **Monitoring** and **Syringe**.

### Monitoring Mode
* Displays all 256 biochemical concentrations as colour-coded bars.
* Automatically sorts by value (highest first) for quick identification.
* Includes a "Non-zero only" toggle to hide inactive chemicals.
* Features a full repository of all 256 biochemicals, mapped directly from the engine's internal dictionary and the historical GameWare Chemical List.
* Colour-coded by category: purple (drives), red (antigens), orange (antibodies), green (smells), blue (general).

### Syringe Mode
* Allows you to inject or extract specific chemicals directly into the creature's bloodstream on the fly.
* Includes dynamic filtering to search through all 256 chemicals by ID or label.
* An adjustable dosage spinner spans from -1.0 to 1.0.
* Injection provides instant visual feedback as the engine recalculates the creature's state.

---

## Organs Sub-Tab

Provides deep insight into the biological machinery keeping the creature alive.

* Lists all of the creature's organs as expandable cards.
* Each card shows an at-a-glance health bar, status badge (OK / IMPAIRED / FAILED), and component counts (Receptors, Emitters, Reactions).
* **Expanding an organ** reveals:
  * **Stats Grid:** Clock Rate, Energy Cost, Life Force, and Rate of Repair.
  * **Reactions:** Chemical formulas with proportions and visual reaction-rate bars (e.g., `Glucogen + 4 ASH2Dehydrogenase → Starch`).
  * **Receptors:** Target locus, binding chemical, threshold, gain, and effect flags.
  * **Emitters:** Target locus, emitted chemical, threshold, gain, and tick rate.

---

## Genome Sub-Tab

The Genome tab is a fully immersive, real-time binary parser for inspecting the root genetics data loaded into the creature. It maps exactly to the C++ binary structure of the `.gen` files.

* **Filtering & Search:** Filter genes by category (Brain, Biochemistry, Creature, Organ) or perform text searches against parameters.
* **Age Filter:** Isolate genes by their "switch-on" time (Baby, Child, Adult, Senile).
* **Intelligent Badges:** Gene cards present structural parameters like mutable/cuttable flags, gender targeting, and dormancy.
* **SVRule Translation:** Decompiles complex binary SVRule neuron setup structures into formatted, human-readable CAOS pseudo-code for Brain Lobes and Neural Tracts.

*(For full genetic modification and cross-breeding, use the dedicated [Genetics Kit](tab_genetics_kit.md).)*

---

## Brain Sub-Tab

The Brain tab provides a real-time spatial visualization of the creature's neural network, inspired by the original "Brain in VAT" tool.

### Spatial Heatmap
* Lobes are positioned on a 2D canvas according to their genome coordinates.
* **Neurons (Cells):**
  * **Dark/transparent:** Inactive. Faint inner boundaries maintain the grid.
  * **Bright orange:** Highly active (activity ≈ 1).
* **Winning Neuron:** The neuron with the highest activation in Winner-Takes-All (WTA) lobes is highlighted with an orange border and glow.
* Zoom in/out using the controls or Ctrl/⌘+Scroll.

### Neuron Inspection
* **Hover** over a neuron to see a tooltip with its lobe name, ID, semantic label, and all non-zero SVRule state variables (S1–S7).
* **Click** a neuron to open the **Deep Neuron Detail** panel:
  * Shows State Variables as visual bars.
  * Displays decompiled Lobe and Tract SVRules.
  * Lists tabular Dendrite Connections (incoming and outgoing) with weights.
  * Clicking dormant lines visualizes zero-weight anatomical pathways.

### Tract Connection Lines
* Orange SVG lines connect lobes linked by neural tracts. Thickness indicates dendrite count.
* **Click** a tract line to fetch its dendrite data and draw individual neuron-to-neuron connections as magenta lines.

*Note: While the overall brain state is polled every 2 seconds, dendrite data is fetched **on-demand** only due to its size.*

---

## See Also

* **[Genetics Kit](tab_genetics_kit.md)** — For full genetic modification, cross-breeding, and injection of new creatures.
* **[Debugger](tab_debugger.md)** — To inspect and step through the CAOS scripts driving creature behaviour.
* **[API Reference](api_reference.md)** — Endpoint documentation for `GET /api/creatures`, chemistry, organs, brain, and syringe endpoints.
