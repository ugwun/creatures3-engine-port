// biological_semantics.js — engine-accurate labels and pure view transforms
"use strict";

(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.BiologicalSemantics = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const CHEMICALS = Object.freeze({
    glucose: Object.freeze({ id: 3, label: "Glucose" }),
    glycogen: Object.freeze({ id: 4, label: "Glycogen" }),
    carbonDioxide: Object.freeze({ id: 24, label: "Dissolved carbon dioxide" }),
    oxygen: Object.freeze({ id: 30, label: "Oxygen" }),
    atp: Object.freeze({ id: 35, label: "ATP" }),
    adp: Object.freeze({ id: 36, label: "ADP" }),
    injury: Object.freeze({ id: 127, label: "Injury" })
  });

  const TOXINS = Object.freeze([
    Object.freeze({ id: 56, label: "Geddonase" }),
    Object.freeze({ id: 66, label: "Heavy metals" }),
    Object.freeze({ id: 67, label: "Cyanide" }),
    Object.freeze({ id: 68, label: "Belladonna" }),
    Object.freeze({ id: 69, label: "Geddonase" }),
    Object.freeze({ id: 70, label: "Glycotoxin" }),
    Object.freeze({ id: 71, label: "Sleep toxin" }),
    Object.freeze({ id: 72, label: "Fever toxin" }),
    Object.freeze({ id: 75, label: "Alcohol" }),
    Object.freeze({ id: 78, label: "ATP decoupler" }),
    Object.freeze({ id: 79, label: "Carbon monoxide" }),
    Object.freeze({ id: 80, label: "Fear toxin" }),
    Object.freeze({ id: 81, label: "Muscle toxin" })
  ]);
  const TOXIN_DETECTION_THRESHOLD = 0.001;

  const ORGAN_RULES = Object.freeze([
    Object.freeze({
      role: "gas exchange",
      anyGroups: [[29, 30]],
      explanation: "contains reactions, receptors, or emitters involving air and oxygen"
    }),
    Object.freeze({
      role: "digestion",
      anyGroups: [[5, 3], [12, 13]],
      explanation: "contains paired nutrient and digestion-product chemicals"
    }),
    Object.freeze({
      role: "detoxification",
      anyOf: [66, 68, 70, 75],
      explanation: "contains reactions, receptors, or emitters involving known toxins"
    }),
    Object.freeze({
      role: "immune activity",
      anyOf: [102, 103, 104, 105, 106, 107, 108, 109],
      explanation: "contains reactions, receptors, or emitters involving antibodies"
    }),
    Object.freeze({
      role: "ATP turnover",
      anyGroups: [[35, 36]],
      explanation: "contains both ATP and ADP"
    }),
    Object.freeze({
      role: "reproductive chemistry",
      anyOf: [46, 47, 48, 53],
      explanation: "contains reactions, receptors, or emitters involving reproductive hormones"
    }),
    Object.freeze({
      role: "fat storage",
      anyOf: [9],
      explanation: "contains reactions, receptors, or emitters involving adipose tissue"
    }),
    Object.freeze({
      role: "antigen handling",
      anyOf: [82, 83, 84, 85, 86, 87, 88, 89],
      explanation: "contains reactions, receptors, or emitters involving antigens"
    })
  ]);

  function concentration(chemistry, id) {
    if (!chemistry || !Array.isArray(chemistry.chemicals)) return null;
    const value = chemistry.chemicals[id];
    return Number.isFinite(value) ? value : null;
  }

  function buildVitalityIndicators(creature, chemistry) {
    const glycogen = concentration(chemistry, CHEMICALS.glycogen.id);
    const legacyGlycogen = creature && Number.isFinite(creature.glycogenReserve)
      ? creature.glycogenReserve
      : creature && Number.isFinite(creature.health)
        ? creature.health
        : null;
    const organs = chemistry && Array.isArray(chemistry.organs) ? chemistry.organs : [];
    const failedOrgans = organs.filter(organ => organ.failed).length;
    const atpUnavailableOrgans =
      organs.filter(organ => !organ.failed && !organ.functioning).length;

    return Object.freeze({
      evidenceLevels: Object.freeze({
        measurements: "observed",
        organSummary: "derived",
        toxinDetection: "derived"
      }),
      source: chemistry ? "GET /api/creature/:id/chemistry" : "GET /api/creatures",
      reserve: Object.freeze({
        glycogen: glycogen == null ? legacyGlycogen : glycogen,
        glucose: concentration(chemistry, CHEMICALS.glucose.id)
      }),
      energy: Object.freeze({
        atp: concentration(chemistry, CHEMICALS.atp.id),
        adp: concentration(chemistry, CHEMICALS.adp.id)
      }),
      respiration: Object.freeze({
        oxygen: concentration(chemistry, CHEMICALS.oxygen.id),
        carbonDioxide: concentration(chemistry, CHEMICALS.carbonDioxide.id)
      }),
      injury: concentration(chemistry, CHEMICALS.injury.id),
      toxins: Object.freeze(TOXINS
        .map(toxin => Object.freeze({
          id: toxin.id,
          label: toxin.label,
          concentration: concentration(chemistry, toxin.id)
        }))
        .filter(toxin =>
          toxin.concentration != null &&
          toxin.concentration > TOXIN_DETECTION_THRESHOLD)),
      toxinDetectionThreshold: TOXIN_DETECTION_THRESHOLD,
      organs: Object.freeze({
        total: organs.length || null,
        failed: organs.length ? failedOrgans : null,
        atpUnavailableAtLastActivation: organs.length ? atpUnavailableOrgans : null
      }),
      lifeState: creature && creature.lifeState ? creature.lifeState : "unknown"
    });
  }

  function collectOrganChemicalIds(organ) {
    const ids = new Set();
    (organ && organ.reactions || []).forEach(reaction => {
      ids.add(reaction.r1);
      ids.add(reaction.r2);
      ids.add(reaction.p1);
      ids.add(reaction.p2);
    });
    (organ && organ.emitters || []).forEach(emitter => ids.add(emitter.chemical));
    (organ && organ.receptors || []).forEach(receptor => ids.add(receptor.chemical));
    ids.delete(0);
    return ids;
  }

  function matchingEvidence(rule, ids) {
    if (rule.anyGroups) {
      const group = rule.anyGroups.find(candidate => candidate.every(id => ids.has(id)));
      return group || null;
    }
    if (rule.anyOf) {
      const matches = rule.anyOf.filter(id => ids.has(id));
      return matches.length ? matches : null;
    }
    return null;
  }

  function inferOrganRole(organ) {
    const ids = collectOrganChemicalIds(organ);
    for (const rule of ORGAN_RULES) {
      const matchingIds = matchingEvidence(rule, ids);
      if (!matchingIds) continue;
      return Object.freeze({
        role: rule.role,
        evidenceLevel: "inferred",
        confidence: null,
        confidenceLabel: "not calibrated",
        method: "chemical-participation heuristic",
        explanation: rule.explanation,
        chemicalIds: Object.freeze(matchingIds.slice())
      });
    }
    return null;
  }

  function cloneLobe(lobe) {
    const clone = Object.assign({}, lobe);
    if (Array.isArray(lobe.colour)) clone.colour = lobe.colour.slice();
    if (Array.isArray(lobe.labels)) clone.labels = lobe.labels.slice();
    return clone;
  }

  function layoutBrainLobes(lobes, mode) {
    const result = (lobes || []).map(cloneLobe);
    if (mode !== "functional-flow") return result;

    const comb = result.find(lobe => lobe.name === "comb");
    if (!comb) return result;
    result.forEach(lobe => {
      if (lobe.name === "noun") {
        lobe.x = comb.x;
        lobe.y = comb.y - 12;
      } else if (lobe.name === "visn") {
        lobe.x = comb.x;
        lobe.y = comb.y - 8;
      } else if (lobe.name === "stim") {
        lobe.x = comb.x;
        lobe.y = comb.y - 4;
      } else if (lobe.name === "move") {
        lobe.x = comb.x;
        lobe.y = comb.y + comb.height + 4;
      }
    });
    return result;
  }

  function brainLayoutDescription(mode) {
    if (mode === "functional-flow") {
      return Object.freeze({
        label: "Functional flow",
        evidenceLevel: "derived",
        description: "Transformed view: noun, vision, and stimulus lobes are aligned around combination; movement is repositioned below."
      });
    }
    return Object.freeze({
      label: "Genome anatomy",
      evidenceLevel: "observed",
      description: "Exact lobe x/y coordinates returned by the engine from the expressed genome."
    });
  }

  return Object.freeze({
    CHEMICALS,
    TOXINS,
    TOXIN_DETECTION_THRESHOLD,
    buildVitalityIndicators,
    collectOrganChemicalIds,
    inferOrganRole,
    layoutBrainLobes,
    brainLayoutDescription
  });
});
