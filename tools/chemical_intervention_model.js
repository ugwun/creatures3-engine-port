// chemical_intervention_model.js — pure safety rules for reviewed chemistry changes
"use strict";

(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ChemicalInterventionModel = api;
})(typeof window !== "undefined" ? window :
  (typeof globalThis !== "undefined" ? globalThis : this), function() {
  const CONCENTRATION_MIN = 0;
  const CONCENTRATION_MAX = 1;
  const ADJUSTMENT_MIN = -1;
  const ADJUSTMENT_MAX = 1;
  const SMALL_DOSE = 0.05;
  const EXTREME_CHANGE = 0.25;
  const STALE_AFTER_TICKS = 200;

  function finite(value) {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function clamp(value) {
    return Math.max(CONCENTRATION_MIN,
      Math.min(CONCENTRATION_MAX, value));
  }

  function selectionToken(input) {
    const source = input || {};
    return [
      source.worldKey || "",
      source.creatureId == null ? "" : source.creatureId,
      source.moniker || "",
      source.chemicalId == null ? "" : source.chemicalId,
      source.sampleWorldTick == null ? "" : source.sampleWorldTick,
      source.currentValue == null ? "" : Number(source.currentValue).toFixed(6)
    ].join(":");
  }

  function preview(input) {
    const source = input || {};
    const errors = [];
    const warnings = [];
    const chemicalId = finite(source.chemicalId);
    const currentValue = finite(source.currentValue);
    const requestedValue = finite(source.requestedValue);
    const sampleWorldTick = finite(source.sampleWorldTick);
    const currentWorldTick = finite(source.currentWorldTick);
    const operation = source.operation === "target" ? "target" : "adjust";
    const creature = source.creature || {};
    const selectedWorldKey = source.selectedWorldKey == null
      ? null : String(source.selectedWorldKey);
    const currentWorldKey = source.currentWorldKey == null
      ? null : String(source.currentWorldKey);

    if (!Number.isInteger(chemicalId) || chemicalId < 1 ||
        chemicalId > 255) {
      errors.push(chemicalId === 0
        ? "Chemical 0 is reserved as none and cannot be adjusted."
        : "Select a chemical identifier from 1 to 255.");
    }
    if (currentValue == null || currentValue < CONCENTRATION_MIN ||
        currentValue > CONCENTRATION_MAX) {
      errors.push("A current observed concentration is required.");
    }
    if (requestedValue == null) {
      errors.push("Enter a finite numeric value.");
    } else if (operation === "adjust" &&
        (requestedValue < ADJUSTMENT_MIN ||
          requestedValue > ADJUSTMENT_MAX)) {
      errors.push("Adjustment must be between −1 and +1.");
    } else if (operation === "target" &&
        (requestedValue < CONCENTRATION_MIN ||
          requestedValue > CONCENTRATION_MAX)) {
      errors.push("Target concentration must be between 0 and 1.");
    }
    if (creature.id == null || !creature.moniker || creature.missing) {
      errors.push("Select an unambiguous live creature.");
    }
    if (!selectedWorldKey || !currentWorldKey ||
        selectedWorldKey !== currentWorldKey) {
      errors.push("The selected creature belongs to a different world.");
    }

    let sampleAgeTicks = null;
    if (sampleWorldTick == null || currentWorldTick == null) {
      errors.push("A world-tick-stamped chemistry sample is required.");
    } else {
      sampleAgeTicks = Math.trunc(currentWorldTick) -
        Math.trunc(sampleWorldTick);
      if (sampleAgeTicks < 0) {
        errors.push("The chemistry sample tick is invalid.");
      } else if (sampleAgeTicks > STALE_AFTER_TICKS) {
        errors.push("The chemistry sample is stale; refresh before reviewing.");
      }
    }

    let requestedChange = null;
    let projectedValue = null;
    let clamped = false;
    if (currentValue != null && requestedValue != null &&
        !errors.some(error =>
          error.includes("Adjustment") ||
          error.includes("Target concentration"))) {
      if (operation === "adjust") {
        requestedChange = requestedValue;
        const unbounded = currentValue + requestedValue;
        projectedValue = clamp(unbounded);
        clamped = projectedValue !== unbounded;
      } else {
        requestedChange = requestedValue - currentValue;
        projectedValue = requestedValue;
      }
    }

    const requiresExtremeConfirmation = requestedChange != null &&
      (Math.abs(requestedChange) > EXTREME_CHANGE || clamped);
    if (clamped) {
      warnings.push(
        "The engine will clamp the immediate concentration to the 0–1 range.");
    } else if (requiresExtremeConfirmation) {
      warnings.push(
        "The requested immediate concentration change exceeds 0.25.");
    }

    return Object.freeze({
      valid: errors.length === 0,
      errors: Object.freeze(errors),
      warnings: Object.freeze(warnings),
      operation,
      chemicalId,
      currentValue,
      requestedValue,
      requestedChange,
      projectedValue,
      clamped,
      requiresExtremeConfirmation,
      sampleWorldTick,
      sampleAgeTicks,
      token: selectionToken({
        worldKey: currentWorldKey,
        creatureId: creature.id,
        moniker: creature.moniker,
        chemicalId,
        sampleWorldTick,
        currentValue
      })
    });
  }

  function createSubmissionState() {
    return Object.freeze({ pending: false, token: null });
  }

  function beginSubmission(state, token) {
    const current = state || createSubmissionState();
    if (current.pending) {
      return Object.freeze({
        accepted: false,
        state: current,
        error: "A chemical intervention is already pending."
      });
    }
    return Object.freeze({
      accepted: true,
      state: Object.freeze({ pending: true, token: String(token || "") }),
      error: null
    });
  }

  function finishSubmission() {
    return createSubmissionState();
  }

  function createRefreshCoordinator() {
    let activeKey = null;
    let activePromise = null;
    return Object.freeze({
      run(key, request) {
        const normalizedKey = String(key);
        if (activePromise && activeKey === normalizedKey)
          return activePromise;
        const promise = Promise.resolve().then(request);
        activeKey = normalizedKey;
        activePromise = promise;
        const clear = () => {
          if (activePromise !== promise) return;
          activeKey = null;
          activePromise = null;
        };
        promise.then(clear, clear);
        return promise;
      },
      activeKey() {
        return activeKey;
      }
    });
  }

  function protocolPreset(manifest, chemicalId) {
    const steps = manifest && manifest.protocol &&
      manifest.protocol.plannedInterventions;
    if (!Array.isArray(steps)) return null;
    const id = Number(chemicalId);
    for (const step of steps) {
      const operation = String(step && step.operation || "");
      const match = /chemical\s+(\d+)\s+(adjust|target)\s+([+-]?(?:\d+\.?\d*|\.\d+))/i
        .exec(operation);
      if (!match || Number(match[1]) !== id) continue;
      const value = Number(match[3]);
      if (!Number.isFinite(value)) continue;
      return Object.freeze({
        id: step.id || null,
        label: step.label || "Protocol-defined",
        operation: match[2].toLowerCase(),
        requestedValue: value,
        sourceText: operation
      });
    }
    return null;
  }

  return Object.freeze({
    CONCENTRATION_MIN,
    CONCENTRATION_MAX,
    ADJUSTMENT_MIN,
    ADJUSTMENT_MAX,
    SMALL_DOSE,
    EXTREME_CHANGE,
    STALE_AFTER_TICKS,
    clamp,
    selectionToken,
    preview,
    createSubmissionState,
    beginSubmission,
    finishSubmission,
    createRefreshCoordinator,
    protocolPreset
  });
});
