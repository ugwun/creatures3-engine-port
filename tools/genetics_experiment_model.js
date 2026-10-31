// genetics_experiment_model.js — copy-first genome safety and structured diffs
"use strict";

(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.GeneticsExperimentModel = api;
})(typeof window !== "undefined" ? window :
  (typeof globalThis !== "undefined" ? globalThis : this), function() {
  const SCHEMA_VERSION = 1;
  const FORMAT = "dna3";
  const KNOWN_SUBTYPES = Object.freeze({
    0: 3,
    1: 6,
    2: 9,
    3: 1
  });
  const OMITTED_FIELDS = new Set([
    "index", "typeName", "subtypeName", "switchOnLabel",
    "_originalStr", "_sourceKey"
  ]);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function validateName(value) {
    const name = String(value == null ? "" : value).trim();
    if (!name) return { valid: false, name, error: "Genome name is required." };
    if (name.length > 80) {
      return {
        valid: false,
        name,
        error: "Genome name must be at most 80 characters."
      };
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) {
      return {
        valid: false,
        name,
        error: "Use only letters, numbers, hyphens, and underscores; begin with a letter or number."
      };
    }
    if (name.includes("..")) {
      return {
        valid: false,
        name,
        error: "Parent-directory notation is not allowed."
      };
    }
    return { valid: true, name, error: null };
  }

  function suggestCopyName(sourceName, existingNames) {
    const raw = String(sourceName == null ? "" : sourceName).trim();
    let base = raw
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/^[^A-Za-z0-9]+/, "")
      .replace(/_+$/g, "")
      .slice(0, 64);
    if (!validateName(base).valid) base = "genome";
    const existing = new Set((existingNames || []).map(String));
    for (let index = 1; index <= 999; index++) {
      const candidate = base + "_experiment_" + String(index).padStart(2, "0");
      if (!existing.has(candidate)) return candidate;
    }
    return base + "_experiment_" + Date.now();
  }

  function normalized(value) {
    if (Array.isArray(value)) return value.map(normalized);
    if (!value || typeof value !== "object") return value;
    const result = {};
    Object.keys(value).sort().forEach(key => {
      if (OMITTED_FIELDS.has(key) || key === "identity") return;
      result[key] = normalized(value[key]);
    });
    return result;
  }

  function canonicalJson(value) {
    return JSON.stringify(normalized(value));
  }

  function checksum(value) {
    const input = canonicalJson(value);
    let hash = 14695981039346656037n;
    const prime = 1099511628211n;
    const bytes = typeof TextEncoder !== "undefined"
      ? new TextEncoder().encode(input)
      : Uint8Array.from(
        unescape(encodeURIComponent(input)),
        character => character.charCodeAt(0));
    for (let index = 0; index < bytes.length; index++) {
      hash ^= BigInt(bytes[index]);
      hash = BigInt.asUintN(64, hash * prime);
    }
    return "fnv1a64:" + hash.toString(16).padStart(16, "0");
  }

  function geneSignature(gene) {
    const source = gene || {};
    return [
      Number(source.type),
      Number(source.subtype),
      Number(source.id)
    ].join(":");
  }

  function keyedGenes(genome) {
    const occurrences = Object.create(null);
    return ((genome && genome.genes) || []).map((gene, index) => {
      const signature = geneSignature(gene);
      occurrences[signature] = (occurrences[signature] || 0) + 1;
      return {
        key: signature + ":" + occurrences[signature],
        signature,
        index,
        gene
      };
    });
  }

  function comparableGene(gene) {
    const source = clone(gene || {});
    Object.keys(source).forEach(key => {
      if (OMITTED_FIELDS.has(key)) delete source[key];
    });
    if (source.active == null) source.active = true;
    return source;
  }

  function walkFields(before, after, path, changes) {
    if (Object.is(before, after)) return;
    const beforeObject = before && typeof before === "object";
    const afterObject = after && typeof after === "object";
    if (!beforeObject || !afterObject ||
        Array.isArray(before) !== Array.isArray(after)) {
      changes.push({
        path: path || "gene",
        before: clone(before),
        after: clone(after),
        evidenceLevel: "observed"
      });
      return;
    }
    if (Array.isArray(before)) {
      const limit = Math.max(before.length, after.length);
      for (let index = 0; index < limit; index++) {
        walkFields(before[index], after[index],
          (path || "value") + "[" + index + "]", changes);
      }
      return;
    }
    const keys = Array.from(new Set(
      Object.keys(before).concat(Object.keys(after)))).sort();
    keys.forEach(key => walkFields(
      before[key], after[key], path ? path + "." + key : key, changes));
  }

  function decoding(gene) {
    const type = Number(gene && gene.type);
    const subtype = Number(gene && gene.subtype);
    const known = Number.isInteger(type) &&
      Object.prototype.hasOwnProperty.call(KNOWN_SUBTYPES, type) &&
      Number.isInteger(subtype) && subtype >= 0 &&
      subtype < KNOWN_SUBTYPES[type];
    return {
      confidence: known ? "exact-structured-decoding" : "unknown-layout",
      evidenceLevel: known ? "observed" : "unknown",
      limitation: known ? null :
        "This gene type or subtype is not decoded; inspect raw values."
    };
  }

  function relatedView(gene) {
    const type = Number(gene && gene.type);
    if (type === 0) return "brain";
    if (type === 1) return "chemistry";
    if (type === 3) return "organs";
    if (type === 2) return "genome";
    return null;
  }

  function structuredDiff(sourceGenome, derivedGenome) {
    const source = keyedGenes(sourceGenome);
    const derived = keyedGenes(derivedGenome);
    const sourceMap = new Map(source.map(entry => [entry.key, entry]));
    const derivedMap = new Map(derived.map(entry => [entry.key, entry]));
    const changes = [];

    source.forEach(entry => {
      if (!derivedMap.has(entry.key)) {
        changes.push({
          kind: "removed",
          key: entry.key,
          sourceIndex: entry.index,
          derivedIndex: null,
          gene: clone(entry.gene),
          fields: [],
          decoding: decoding(entry.gene),
          relatedView: relatedView(entry.gene)
        });
      }
    });
    derived.forEach(entry => {
      const original = sourceMap.get(entry.key);
      if (!original) {
        changes.push({
          kind: "added",
          key: entry.key,
          sourceIndex: null,
          derivedIndex: entry.index,
          gene: clone(entry.gene),
          fields: [],
          decoding: decoding(entry.gene),
          relatedView: relatedView(entry.gene)
        });
        return;
      }
      const fields = [];
      walkFields(
        comparableGene(original.gene),
        comparableGene(entry.gene),
        "",
        fields);
      const enabledField = fields.find(field => field.path === "active");
      if (fields.length) {
        changes.push({
          kind: enabledField && fields.length === 1
            ? (entry.gene.active === false ? "disabled" : "enabled")
            : "modified",
          key: entry.key,
          sourceIndex: original.index,
          derivedIndex: entry.index,
          gene: clone(entry.gene),
          fields,
          decoding: decoding(entry.gene),
          relatedView: relatedView(entry.gene)
        });
      }
      if (original.index !== entry.index) {
        changes.push({
          kind: "reordered",
          key: entry.key,
          sourceIndex: original.index,
          derivedIndex: entry.index,
          gene: clone(entry.gene),
          fields: [],
          decoding: decoding(entry.gene),
          relatedView: relatedView(entry.gene)
        });
      }
    });

    const summary = {
      added: 0,
      removed: 0,
      reordered: 0,
      enabled: 0,
      disabled: 0,
      modified: 0,
      fieldChanges: 0,
      total: changes.length
    };
    changes.forEach(change => {
      summary[change.kind]++;
      summary.fieldChanges += change.fields.length;
    });
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      sourceGeneCount: source.length,
      derivedGeneCount: derived.length,
      sourceModelChecksum: checksum(sourceGenome || {}),
      derivedModelChecksum: checksum(derivedGenome || {}),
      changed: changes.length > 0,
      summary: Object.freeze(summary),
      changes: Object.freeze(changes),
      limitations: Object.freeze([
        "Stable matching uses type, subtype, gene ID, and duplicate occurrence.",
        "Decoded fields are format facts; biological consequences are not inferred.",
        "Raw source and derived values remain available for expert verification."
      ])
    });
  }

  function injectionReadiness(input) {
    const source = input || {};
    const errors = [];
    if (!source.connected) errors.push("Engine connection is required.");
    if (!source.worldName || source.worldName === "Startup") {
      errors.push("Load the intended non-Startup world.");
    }
    if (!source.isExperimentalCopy) {
      errors.push("Create and select an experimental copy first.");
    }
    if (!source.savedChecksum ||
        source.savedChecksum !== source.currentChecksum) {
      errors.push("Save the reviewed derived genome before injection.");
    }
    if (!source.disposableOrBranchedConfirmed) {
      errors.push("Confirm a disposable or explicitly chosen branch world.");
    }
    if (!source.reviewConfirmed) {
      errors.push("Confirm the final genome and world review.");
    }
    return Object.freeze({
      ready: errors.length === 0,
      errors: Object.freeze(errors)
    });
  }

  function writeReadiness(genome) {
    const genes = genome && Array.isArray(genome.genes)
      ? genome.genes : [];
    const errors = [];
    if (!genes.length) errors.push("At least one decoded gene is required.");
    genes.forEach((gene, index) => {
      const info = decoding(gene);
      if (info.evidenceLevel === "unknown") {
        errors.push(
          "Gene " + index + " has an unknown type/subtype layout.");
        return;
      }
      const prefix = "Gene " + index + " ";
      const byteHeader = [
        "id", "generation", "switchOnTime", "mutability",
        "variant", "flagsRaw"
      ];
      byteHeader.forEach(key => {
        if (gene[key] != null &&
            (!Number.isInteger(gene[key]) ||
              gene[key] < 0 || gene[key] > 255)) {
          errors.push(prefix + key + " must be an integer from 0 to 255.");
        }
      });
      if (!gene.data || typeof gene.data !== "object" ||
          Array.isArray(gene.data)) {
        errors.push(prefix + "requires structured gene data.");
        return;
      }
      const u16 = new Set([
        "updateTime", "x", "y", "sLower", "sUpper", "sNum",
        "dLower", "dUpper", "dNum"
      ]);
      const ignoredDecoded = new Set(["initRule", "updateRule"]);
      const fixedArrays = {
        initRuleBytes: 48,
        updateRuleBytes: 48,
        halfLives: 256,
        poses: 8
      };
      const fixedStrings = {
        lobeName: 4,
        srcLobe: 4,
        dstLobe: 4,
        motherMoniker: 32,
        fatherMoniker: 32,
        poseString: 16
      };
      Object.keys(gene.data).forEach(key => {
        if (ignoredDecoded.has(key)) return;
        const value = gene.data[key];
        if (Object.prototype.hasOwnProperty.call(fixedArrays, key)) {
          if (!Array.isArray(value) ||
              value.length !== fixedArrays[key] ||
              value.some(byte => !Number.isInteger(byte) ||
                byte < 0 || byte > 255)) {
            errors.push(prefix + key + " must contain exactly " +
              fixedArrays[key] + " bytes from 0 to 255.");
          }
          return;
        }
        if (Object.prototype.hasOwnProperty.call(fixedStrings, key)) {
          const byteLength = typeof TextEncoder !== "undefined"
            ? new TextEncoder().encode(String(value)).length
            : unescape(encodeURIComponent(String(value))).length;
          if (typeof value !== "string" ||
              value.includes("\0") ||
              byteLength > fixedStrings[key]) {
            errors.push(prefix + key + " exceeds its fixed serialized field.");
          }
          return;
        }
        if (typeof value !== "number") return;
        const isStimulusAmount = Number(gene.type) === 2 &&
          Number(gene.subtype) === 0 && /^amount[0-3]$/.test(key);
        if (isStimulusAmount) {
          if (!Number.isFinite(value) ||
              value < -1 || value > 127 / 128) {
            errors.push(prefix + key +
              " must fit the signed float8 range.");
          }
          return;
        }
        const maximum = u16.has(key) ? 65535 : 255;
        if (!Number.isInteger(value) || value < 0 || value > maximum) {
          errors.push(prefix + key + " must be an integer from 0 to " +
            maximum + ".");
        }
      });
      const requiredArrays = [];
      if (Number(gene.type) === 0 &&
          (Number(gene.subtype) === 0 ||
            Number(gene.subtype) === 2)) {
        requiredArrays.push(["initRuleBytes", 48]);
        requiredArrays.push(["updateRuleBytes", 48]);
      } else if (Number(gene.type) === 1 &&
          Number(gene.subtype) === 3) {
        requiredArrays.push(["halfLives", 256]);
      } else if (Number(gene.type) === 2 &&
          Number(gene.subtype) === 4) {
        requiredArrays.push(["poses", 8]);
      }
      requiredArrays.forEach(([key, length]) => {
        if (!Object.prototype.hasOwnProperty.call(gene.data, key)) {
          errors.push(prefix + key + " is required and must contain exactly " +
            length + " bytes.");
        }
      });
    });
    const activeGenus = genes.filter(gene =>
      gene.active !== false && Number(gene.type) === 2 &&
      Number(gene.subtype) === 1).length;
    const activeHalfLives = genes.filter(gene =>
      gene.active !== false && Number(gene.type) === 1 &&
      Number(gene.subtype) === 3).length;
    if (activeGenus > 1)
      errors.push("Only one active Genus gene can be serialized safely.");
    if (activeHalfLives > 1)
      errors.push("Only one active Half-lives gene can be serialized safely.");
    return Object.freeze({
      ready: errors.length === 0,
      errors: Object.freeze(errors)
    });
  }

  function createBlankGene(type, subtype) {
    const typeNames = ["Brain", "Biochemistry", "Creature", "Organ"];
    const subtypeNames = {
      0: ["Lobe", "Brain Organ", "Tract"],
      1: ["Receptor", "Emitter", "Reaction", "Half-lives", "InitConc", "Neuroemitter"],
      2: ["Stimulus", "Genus", "Appearance", "Pose", "Gait", "Instinct", "Pigment", "Pigment Bleed", "Expression"],
      3: ["Organ"]
    };

    const g = {
      id: 0,
      type: type,
      subtype: subtype,
      typeName: typeNames[type] || "Unknown",
      subtypeName: subtypeNames[type]?.[subtype] || "Unknown",
      generation: 0,
      mutability: 0,
      variant: 0,
      flagsRaw: 0,
      switchOnTime: 0,
      switchOnLabel: "Baby",
      active: true,
      flags: { mutable: true, dupable: true, cutable: true, maleOnly: false, femaleOnly: false, dormant: false },
      data: {}
    };

    // Neural rules are fixed-length: the writer and validator need all 48 bytes.
    const emptyRule = () => Array(48).fill(0);

    // Sensible defaults
    if (type === 0 && subtype === 0) g.data = { lobeName: "lob", x: 0, y: 0, width: 1, height: 1, red: 255, green: 255, blue: 255, wta: 0, tissue: 0, initAlways: 0, updateTime: 1, initRule: [], initRuleBytes: emptyRule(), updateRule: [], updateRuleBytes: emptyRule() };
    if (type === 0 && subtype === 2) g.data = { srcLobe: "src", sLower: 0, sUpper: 0, sNum: 0, srcVar: 0, dstLobe: "dst", dLower: 0, dUpper: 0, dNum: 0, dstVar: 0, migrates: 0, ran: 0, initAlways: 0, updateTime: 1, initRule: [], initRuleBytes: emptyRule(), updateRule: [], updateRuleBytes: emptyRule() };
    if (type === 0 && subtype === 1) g.data = { clockRate: 0, damageRate: 0, lifeForce: 0, biotickStart: 0, atpDamageCoef: 0 };
    if (type === 1 && (subtype === 0 || subtype === 1)) g.data = { organ: 0, tissue: 0, locus: 0, chemical: 0, threshold: 0, gain: 128, nominal: 0, rate: 0, flags: 0 };
    if (type === 1 && subtype === 2) g.data = { r1Amount: 0, r1Chem: 0, r2Amount: 0, r2Chem: 0, p1Amount: 0, p1Chem: 0, p2Amount: 0, p2Chem: 0, rate: 0 };
    if (type === 1 && subtype === 3) g.data = { halfLives: Array(256).fill(255) };
    if (type === 1 && subtype === 4) g.data = { chemical: 0, amount: 128 };
    if (type === 1 && subtype === 5) g.data = { lobe0: 0, neuron0: 0, lobe1: 0, neuron1: 0, lobe2: 0, neuron2: 0, rate: 0, chem0: 0, amount0: 0, chem1: 0, amount1: 0, chem2: 0, amount2: 0, chem3: 0, amount3: 0 };
    if (type === 2 && subtype === 0) g.data = { stimulus: 0, significance: 0, input: 0, intensity: 0, chem0: 0, amount0: 0, chem1: 0, amount1: 0, chem2: 0, amount2: 0, chem3: 0, amount3: 0 };
    if (type === 2 && subtype === 1) g.data = { genus: 1, motherMoniker: "", fatherMoniker: "" };
    if (type === 2 && subtype === 2) g.data = { part: 0, variant: 0, species: 0 };
    if (type === 2 && subtype === 3) g.data = { poseNumber: 0, poseString: "0" };
    if (type === 2 && subtype === 4) g.data = { gait: 0, poses: [0,0,0,0,0,0,0,0] };
    if (type === 2 && subtype === 5) g.data = { lobe0: 0, cell0: 0, lobe1: 0, cell1: 0, lobe2: 0, cell2: 0, action: 0, reinforcementAmount: 0, reinforcementChemical: 0 };
    if (type === 2 && subtype === 6) g.data = { pigment: 0, amount: 0 };
    if (type === 2 && subtype === 7) g.data = { rotation: 0, swap: 0 };
    if (type === 2 && subtype === 8) g.data = { expression: 0, weight: 0, drive0: 0, amount0: 0, drive1: 0, amount1: 0, drive2: 0, amount2: 0, drive3: 0, amount3: 0 };
    if (type === 3 && subtype === 0) g.data = { clockRate: 0, damageRate: 0, lifeForce: 0, biotickStart: 0, atpDamageCoef: 0 };

    return g;
  }

  // Lowest ID unused by this gene type. The file format stores one byte, and
  // experiments match genes by type, subtype and ID.
  function nextGeneId(genes, type, subtype) {
    const used = new Set((genes || [])
      .filter(gene => gene.type === type && gene.subtype === subtype)
      .map(gene => gene.id));
    for (let id = 0; id <= 255; id++) {
      if (!used.has(id)) return id;
    }
    return null;
  }

  return Object.freeze({
    SCHEMA_VERSION,
    FORMAT,
    validateName,
    suggestCopyName,
    canonicalJson,
    checksum,
    geneSignature,
    structuredDiff,
    injectionReadiness,
    writeReadiness,
    createBlankGene,
    nextGeneId
  });
});
