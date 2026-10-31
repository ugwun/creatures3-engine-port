// scripts.js — compact observed activity workspace for running CAOS scripts
"use strict";

(() => {
    const model = window.ScriptsActivityModel;
    const workspace = document.getElementById("scripts-workspace");
    const container = document.getElementById("scripts-container");
    const list = document.getElementById("scripts-list");
    const empty = document.getElementById("scripts-empty");
    const emptyTitle = document.getElementById("scripts-empty-title");
    const emptyHint = document.getElementById("scripts-empty-hint");
    const sampleStatus = document.getElementById("scripts-sample-status");
    const btnRefresh = document.getElementById("btn-scripts-refresh");
    const optAuto = document.getElementById("opt-auto-refresh");
    const searchInput = document.getElementById("scripts-search");
    const stateInput = document.getElementById("scripts-state-filter");
    const classifierInput = document.getElementById("scripts-classifier-filter");
    const eventInput = document.getElementById("scripts-event-filter");
    const galleryInput = document.getElementById("scripts-gallery-filter");
    const groupInput = document.getElementById("scripts-group-filter");
    const creatureInput = document.getElementById("scripts-creature-filter");
    const changedInput = document.getElementById("scripts-changed-filter");
    const newInput = document.getElementById("scripts-new-filter");
    const fullSourceInput = document.getElementById("scripts-full-source");
    if (!model || !workspace || !container || !list || !empty) return;

    const tracker = model.createTracker({ retentionMs: 5000 });
    const collapsedGroups = new Set();
    const knownGroups = new Set();
    const expandedDetails = new Set();
    const expandedSources = new Set();
    const FULL_SOURCE_CACHE_LIMIT = 200;
    const fullSourceCache = new Map();
    const cardElements = new Map();
    const groupElements = new Map();
    const POLL_INTERVAL = 2000;

    let autoTimer = null;
    let isScriptsTabActive = false;
    let requestSerial = 0;
    let lastLayout = "";
    let agentNames = null;
    let agentNamesPromise = null;
    let lastSample = null;
    let lastError = null;

    function currentWorldKey() {
        const identity = ObservatoryState.getState().world.identity;
        return identity && identity.key;
    }

    function eventName(event) {
        return window.CAOS_EVENT_NAMES && window.CAOS_EVENT_NAMES[event]
            ? window.CAOS_EVENT_NAMES[event]
            : null;
    }

    function selectedAgentId() {
        const selection = ObservatoryState.getState().selection;
        return selection.agent
            ? selection.agent.id
            : selection.creature
                ? selection.creature.id
                : null;
    }

    function selectedCreatureName(agentId) {
        const creature = ObservatoryState.getState().selection.creature;
        if (!creature || String(creature.id) !== String(agentId)) return null;
        return creature.name
            ? (creature.genusName || "Creature") + " “" + creature.name + "”"
            : creature.genusName || "Creature";
    }

    function identityName(script) {
        const exactCreature = selectedCreatureName(script.agentId);
        if (exactCreature) return exactCreature;
        const key = [
            script.agentFamily,
            script.agentGenus,
            script.agentSpecies
        ].join(" ");
        if (agentNames && agentNames[key]) return agentNames[key];
        if (Number(script.agentFamily) === 4) return "Creature";
        return script.gallery || "Agent";
    }

    async function ensureAgentNames() {
        if (agentNames) return agentNames;
        if (!agentNamesPromise) {
            agentNamesPromise = fetch("/api/agent-names")
                .then(response => response.ok ? response.json() : {})
                .catch(() => ({}))
                .then(names => {
                    agentNames = names || {};
                    return agentNames;
                });
        }
        return agentNamesPromise;
    }

    function currentFilters() {
        return {
            query: searchInput.value,
            state: stateInput.value,
            classifier: classifierInput.value,
            event: eventInput.value,
            gallery: galleryInput.value,
            creaturesOnly: creatureInput.checked,
            changedOnly: changedInput.checked,
            newOnly: newInput.checked
        };
    }

    async function refreshScripts() {
        const serial = ++requestSerial;
        const requestedWorld = currentWorldKey();
        const startedAt = performance.now();
        try {
            const response = await fetch("/api/scripts");
            if (!response.ok) {
                throw new Error("Scripts request failed (" + response.status + ")");
            }
            const scripts = await response.json();
            if (serial !== requestSerial || requestedWorld !== currentWorldKey()) return;
            await ensureAgentNames();
            if (serial !== requestSerial || requestedWorld !== currentWorldKey()) return;

            const enriched = (Array.isArray(scripts) ? scripts : []).map(script =>
                Object.assign({}, script, {
                    eventName: eventName(script.event),
                    agentName: identityName(script)
                })
            );
            const capturedAt = Date.now();
            tracker.ingest(enriched, capturedAt);
            lastError = null;
            lastSample = {
                capturedAt,
                worldTick: enriched.length
                    ? enriched[0].worldTick
                    : ObservatoryState.getState().world.tick,
                activeCount: enriched.length,
                payloadBytes: new Blob([JSON.stringify(scripts)]).size,
                requestMs: performance.now() - startedAt
            };
            renderActivity();
        } catch (error) {
            if (serial !== requestSerial) return;
            lastError = error;
            renderActivity();
        }
    }

    function initialiseGroupState(records) {
        const counts = new Map();
        records.forEach(record => {
            counts.set(record.classifierKey,
                (counts.get(record.classifierKey) || 0) + 1);
        });
        counts.forEach((count, key) => {
            if (count <= 1 || knownGroups.has(key)) return;
            knownGroups.add(key);
            collapsedGroups.add(key);
        });
    }

    function renderActivity() {
        const records = tracker.getRecords();
        initialiseGroupState(records);
        const view = model.buildView(records, currentFilters(), {
            grouped: groupInput.checked,
            collapsedGroups,
            selectedAgentId: selectedAgentId()
        });
        const visibleRecords = view.flatMap(group =>
            group.collapsed ? [] : group.records
        );
        const layout = JSON.stringify({
            groups: view.map(group => [
                group.key,
                group.collapsed,
                group.records.map(record => record.key)
            ]),
            details: Array.from(expandedDetails).sort(),
            sources: Array.from(expandedSources).sort(),
            fullSource: fullSourceInput.checked
        });
        const renderStarted = performance.now();

        if (layout !== lastLayout) {
            rebuildList(view);
            lastLayout = layout;
        } else {
            visibleRecords.forEach(record => updateCard(record));
            view.forEach(group => updateGroup(group));
        }

        const visibleCount = visibleRecords.length;
        list.hidden = view.length === 0;
        empty.hidden = view.length !== 0;
        if (view.length === 0) updateEmptyState(records);
        updateSampleStatus(records, view, visibleCount,
            performance.now() - renderStarted);
    }

    function updateEmptyState(records) {
        const filters = currentFilters();
        const hasFilter =
            Boolean(filters.query.trim() || filters.classifier.trim() ||
                filters.event.trim() || filters.gallery.trim()) ||
            filters.state !== "all" || filters.creaturesOnly ||
            filters.changedOnly || filters.newOnly;
        if (records.length && hasFilter) {
            emptyTitle.textContent = "No scripts match the current filters.";
            emptyHint.textContent =
                "Clear or broaden filters to return to observed activity.";
        } else if (lastSample && lastSample.activeCount === 0) {
            emptyTitle.textContent = "No running scripts.";
            emptyHint.textContent =
                "Wait for agent activity or load a world with active scripts.";
        } else {
            emptyTitle.textContent = "Waiting for script activity.";
            emptyHint.textContent =
                "Start or load a world, then refresh this workspace.";
        }
    }

    function rebuildList(view) {
        const previousCards = new Map(cardElements);
        const previousGroups = new Map(groupElements);
        cardElements.clear();
        groupElements.clear();
        const fragment = document.createDocumentFragment();
        view.forEach(group => {
            if (group.records.length > 1) {
                const groupHeader = previousGroups.get(group.key) ||
                    createGroupHeader(group);
                updateGroup(group, groupHeader);
                fragment.appendChild(groupHeader);
                groupElements.set(group.key, groupHeader);
            }
            if (!group.collapsed) {
                group.records.forEach(record => {
                    const card = previousCards.get(record.key) ||
                        createCard(record);
                    updateCard(record, card);
                    fragment.appendChild(card);
                    cardElements.set(record.key, card);
                });
            }
        });
        list.replaceChildren(fragment);
    }

    function createGroupHeader(group) {
        const header = document.createElement("section");
        header.className = "script-group";
        header.dataset.groupKey = group.classifierKey;
        header.setAttribute("role", "listitem");

        const button = document.createElement("button");
        button.type = "button";
        button.className = "script-group__toggle";
        button.addEventListener("click", () => {
            if (collapsedGroups.has(group.classifierKey)) {
                collapsedGroups.delete(group.classifierKey);
            } else {
                collapsedGroups.add(group.classifierKey);
            }
            lastLayout = "";
            renderActivity();
        });
        header.appendChild(button);
        header._scriptGroupRefs = {
            button,
            classifier: null,
            summary: null
        };
        const classifier = document.createElement("code");
        classifier.className = "script-group__classifier";
        const summary = document.createElement("span");
        summary.className = "script-group__summary";
        button.append(classifier, summary);
        header._scriptGroupRefs.classifier = classifier;
        header._scriptGroupRefs.summary = summary;
        updateGroup(group, header);
        return header;
    }

    function updateGroup(group, suppliedElement) {
        const header = suppliedElement || groupElements.get(group.key);
        if (!header) return;
        const refs = header._scriptGroupRefs;
        header.classList.toggle("script-group--selected", group.selected);
        refs.button.disabled = group.selected;
        refs.button.setAttribute("aria-expanded", String(!group.collapsed));
        refs.button.title = group.selected
            ? "The group containing the shared selected agent stays expanded"
            : group.collapsed
            ? "Expand identical script instances"
            : "Collapse identical script instances";
        refs.classifier.textContent =
            (group.collapsed ? "▶ " : "▼ ") + group.classifierKey;
        refs.summary.textContent =
            group.records.length + " instances · " +
            model.formatStateSummary(group.counts);
    }

    function createCard(record) {
        const card = document.createElement("article");
        card.className = "script-activity-row";
        card.dataset.scriptKey = record.key;
        card.setAttribute("role", "listitem");

        const identity = document.createElement("div");
        identity.className = "script-identity";
        const gallery = document.createElement("span");
        gallery.className = "script-gallery";
        gallery.setAttribute("aria-hidden", "true");
        const identityText = document.createElement("span");
        const name = document.createElement("strong");
        const id = document.createElement("small");
        identityText.append(name, id);
        identity.append(gallery, identityText);

        const classifier = document.createElement("div");
        classifier.className = "script-classifier";
        const classifierCode = document.createElement("code");
        const event = document.createElement("small");
        classifier.append(classifierCode, event);

        const state = document.createElement("div");
        state.className = "script-state";
        const stateBadge = document.createElement("span");
        stateBadge.className = "state-badge";
        const flags = document.createElement("span");
        flags.className = "script-flags";
        state.append(stateBadge, flags);

        const statement = document.createElement("code");
        statement.className = "script-statement";

        const actions = document.createElement("div");
        actions.className = "script-actions";
        const focus = actionButton("Focus", "Focus the game camera on this agent");
        const debuggerButton = actionButton(
            "Debugger",
            "Open this exact agent and event in Debugger"
        );
        const detailsButton = actionButton("Details", "Show expert VM details");
        actions.append(focus, debuggerButton, detailsButton);

        const details = document.createElement("div");
        details.className = "script-row-details";
        const facts = document.createElement("dl");
        facts.className = "script-expert-facts";
        const factRefs = {};
        [
            ["ip", "Bytecode IP"],
            ["command", "Blocking command"],
            ["reason", "Wait/block reason"],
            ["targ", "TARG"],
            ["it", "IT"],
            ["tick", "Observed tick"]
        ].forEach(([key, label]) => {
            const term = document.createElement("dt");
            term.textContent = label;
            term.dataset.scriptFact = key;
            const value = document.createElement("dd");
            value.dataset.scriptFact = key;
            facts.append(term, value);
            factRefs[key] = value;
        });
        const sourceButton = actionButton(
            "Load full source",
            "Fetch this installed classifier source once and expand it"
        );
        sourceButton.classList.add("script-source-toggle");
        const source = document.createElement("pre");
        source.className = "caos-source script-full-source";
        details.append(facts, sourceButton, source);

        card.append(identity, classifier, state, statement, actions, details);
        card._scriptRefs = {
            gallery,
            name,
            id,
            classifierCode,
            event,
            stateBadge,
            flags,
            statement,
            focus,
            debuggerButton,
            detailsButton,
            details,
            factRefs,
            sourceButton,
            source
        };

        focus.addEventListener("click", () => focusAgent(record.key));
        debuggerButton.addEventListener("click", () => {
            const current = recordByKey(record.key);
            if (current) openScriptInDebugger(current);
        });
        detailsButton.addEventListener("click", () => {
            toggleSet(expandedDetails, record.key);
            lastLayout = "";
            renderActivity();
        });
        sourceButton.addEventListener("click", () => {
            toggleSet(expandedSources, record.key);
            expandedDetails.add(record.key);
            lastLayout = "";
            renderActivity();
        });
        updateCard(record, card);
        return card;
    }

    function actionButton(label, title) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.title = title;
        return button;
    }

    function toggleSet(set, key) {
        if (set.has(key)) set.delete(key);
        else set.add(key);
    }

    function recordByKey(key) {
        return tracker.getRecords().find(record => record.key === key) || null;
    }

    function updateCard(record, suppliedElement) {
        const card = suppliedElement || cardElements.get(record.key);
        if (!card) return;
        const refs = card._scriptRefs;
        const selected = selectedAgentId() != null &&
            String(record.agentId) === String(selectedAgentId());
        card.classList.toggle("script-activity-row--selected", selected);
        card.classList.toggle("script-activity-row--changed", record.changed);
        card.classList.toggle("script-activity-row--finished",
            record.displayState === "finished");

        refs.gallery.textContent = (record.gallery || "agent")
            .slice(0, 2).toUpperCase();
        refs.gallery.title = record.gallery
            ? "Gallery " + record.gallery
            : "Gallery unavailable";
        refs.name.textContent =
            selectedCreatureName(record.agentId) ||
            record.agentName ||
            identityName(record);
        refs.id.textContent =
            "Agent #" + record.agentId +
            (record.gallery ? " · " + record.gallery : "");
        refs.classifierCode.textContent = record.classifierKey;
        refs.event.textContent = record.eventName
            ? "Event " + record.event + " · " + record.eventName
            : "Event " + record.event;
        refs.stateBadge.className =
            "state-badge state-" + record.displayState;
        refs.stateBadge.textContent = record.displayState;
        refs.stateBadge.title = stateTitle(record);

        const flagLabels = [];
        if (selected) flagLabels.push("Selected");
        if (record.newlyStarted) flagLabels.push("New");
        if (record.changed) flagLabels.push("Changed");
        refs.flags.textContent = flagLabels.join(" · ");
        refs.statement.textContent =
            record.source || "Current statement unavailable";
        refs.statement.title =
            "Observed source statement mapped near bytecode IP " + record.ip;
        refs.focus.disabled = record.posX == null || record.posY == null ||
            record.displayState === "finished";

        const detailsOpen = expandedDetails.has(record.key) ||
            fullSourceInput.checked || expandedSources.has(record.key);
        card.classList.toggle("script-activity-row--expanded", detailsOpen);
        refs.details.hidden = !detailsOpen;
        refs.detailsButton.setAttribute("aria-expanded", String(detailsOpen));
        refs.detailsButton.textContent = detailsOpen ? "Hide" : "Details";
        refs.factRefs.ip.textContent = record.ip == null ? "Unknown" : record.ip;
        refs.factRefs.command.textContent =
            record.blockingCommand || "Not blocked";
        refs.factRefs.reason.textContent = record.blockReason ||
            (record.displayState === "blocking"
                ? "Reason unavailable"
                : "Not blocked");
        refs.factRefs.targ.textContent = record.targ ? "#" + record.targ : "—";
        refs.factRefs.it.textContent = record.it ? "#" + record.it : "—";
        refs.factRefs.tick.textContent =
            record.worldTick == null ? "Unknown" : record.worldTick;

        const sourceOpen = fullSourceInput.checked ||
            expandedSources.has(record.key);
        refs.source.hidden = !sourceOpen;
        refs.sourceButton.textContent = sourceOpen
            ? fullSourceInput.checked
                ? "Shown by Full source option"
                : "Hide full source"
            : "Load full source";
        refs.sourceButton.disabled = fullSourceInput.checked;
        refs.sourceButton.setAttribute("aria-expanded", String(sourceOpen));
        if (sourceOpen) loadFullSource(record, refs.source);
    }

    function stateTitle(record) {
        switch (record.displayState) {
        case "running":
            return "Observed running between scheduler yields";
        case "waiting":
            return "Observed blocked in WAIT: " +
                (record.blockReason || "tick delay");
        case "blocking":
            return "Observed blocked in " +
                (record.blockingCommand || "an engine-managed operation") +
                (record.blockReason ? ": " + record.blockReason : "");
        case "paused":
            return "This agent VM is paused at a breakpoint; the world may still run";
        case "finished":
            return "Derived from disappearance between successive /api/scripts samples";
        default:
            return record.displayState;
        }
    }

    async function loadFullSource(record, target) {
        const cacheKey = record.classifierKey + ":" +
            (record.sourceRevision || "unknown");
        if (!fullSourceCache.has(cacheKey)) {
            const path = [
                "/api/scriptorium",
                record.family,
                record.genus,
                record.species,
                record.event
            ].join("/");
            fullSourceCache.set(cacheKey,
                fetch(path)
                    .then(response => response.json())
                    .then(data => {
                        if (!data.source) {
                            throw new Error(data.error || "Source unavailable");
                        }
                        return typeof formatCAOS === "function"
                            ? formatCAOS(data.source)
                            : escHtml(data.source);
                    })
                    .catch(error => {
                        // A failure must not be remembered as the answer.
                        fullSourceCache.delete(cacheKey);
                        throw error;
                    })
            );
            while (fullSourceCache.size > FULL_SOURCE_CACHE_LIMIT) {
                fullSourceCache.delete(fullSourceCache.keys().next().value);
            }
        }
        target.textContent = "Loading installed source…";
        try {
            const formatted = await fullSourceCache.get(cacheKey);
            if (!target.isConnected) return;
            target.innerHTML = formatted;
        } catch (error) {
            if (!target.isConnected) return;
            target.textContent = "Full source unavailable: " + error.message;
        }
    }

    async function focusAgent(key) {
        const record = recordByKey(key);
        if (!record || record.posX == null || record.posY == null) return;
        try {
            const response = await fetch("/api/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    caos: "cmrp " + Number(record.posX) + " " +
                        Number(record.posY) + " 0"
                })
            });
            const result = await response.json();
            if (!response.ok || result.ok === false) {
                throw new Error(result.error || "engine rejected camera focus");
            }
        } catch (error) {
            sampleStatus.textContent =
                "Camera focus failed: " + error.message;
            sampleStatus.classList.add("scripts-sample-status--error");
        }
    }

    function openScriptInDebugger(script) {
        if (!window.DevToolsNavigation) return;
        const world = ObservatoryState.getState().world.identity;
        const scriptId = [
            script.agentId,
            script.family,
            script.genus,
            script.species,
            script.event
        ].join(":");
        window.DevToolsNavigation.navigate({
            tab: "debugger",
            view: "script",
            worldKey: world && world.key,
            primary: "script",
            selections: {
                agent: {
                    id: script.agentId,
                    family: script.agentFamily,
                    genus: script.agentGenus,
                    species: script.agentSpecies,
                    gallery: script.gallery
                },
                script: {
                    id: scriptId,
                    agentId: script.agentId,
                    family: script.family,
                    genus: script.genus,
                    species: script.species,
                    event: script.event,
                    eventName: script.eventName || null
                },
                event: {
                    id: script.event,
                    name: script.eventName || null
                },
                classifier: { id: script.classifierKey },
                gallery: script.gallery ? { id: script.gallery } : null
            }
        });
    }

    function updateSampleStatus(records, view, visibleCount, renderMs) {
        sampleStatus.classList.toggle("scripts-sample-status--error",
            Boolean(lastError));
        if (lastError) {
            sampleStatus.textContent =
                "Disconnected/stale — retaining the last Scripts sample · " +
                lastError.message;
            return;
        }
        if (!lastSample) {
            sampleStatus.textContent = "Waiting for an observed engine sample…";
            return;
        }
        const finished = records.filter(record =>
            record.displayState === "finished").length;
        const payloadKiB = (lastSample.payloadBytes / 1024).toFixed(1);
        sampleStatus.textContent =
            "Observed near world tick " +
            (lastSample.worldTick == null ? "unknown" : lastSample.worldTick) +
            " · " + lastSample.activeCount + " active" +
            (finished ? " · " + finished + " recently finished (derived)" : "") +
            " · " + view.length + (groupInput.checked ? " groups" : " rows") +
            " · " + visibleCount + " visible" +
            " · " + payloadKiB + " KiB" +
            " · request " + lastSample.requestMs.toFixed(1) + " ms" +
            " · render " + renderMs.toFixed(1) + " ms";
    }

    function filterChanged() {
        lastLayout = "";
        renderActivity();
    }

    [
        searchInput,
        classifierInput,
        eventInput,
        galleryInput
    ].forEach(input => input.addEventListener("input", filterChanged));
    [
        stateInput,
        groupInput,
        creatureInput,
        changedInput,
        newInput,
        fullSourceInput
    ].forEach(input => input.addEventListener("change", filterChanged));

    btnRefresh.addEventListener("click", refreshScripts);
    optAuto.addEventListener("change", () => {
        if (optAuto.checked && isScriptsTabActive) startAutoRefresh();
        else stopAutoRefresh();
    });

    function startAutoRefresh() {
        stopAutoRefresh();
        autoTimer = setInterval(refreshScripts, POLL_INTERVAL);
    }

    function stopAutoRefresh() {
        if (autoTimer) clearInterval(autoTimer);
        autoTimer = null;
    }

    DevToolsEvents.on("tab:activated", tab => {
        if (tab !== "scripts") return;
        isScriptsTabActive = true;
        refreshScripts();
        if (optAuto.checked) startAutoRefresh();
    });

    DevToolsEvents.on("tab:deactivated", tab => {
        if (tab !== "scripts") return;
        isScriptsTabActive = false;
        stopAutoRefresh();
    });

    ObservatoryState.subscribe(
        state => state.selection.agent
            ? state.selection.agent.id
            : state.selection.creature
                ? state.selection.creature.id
                : null,
        () => {
            lastLayout = "";
            renderActivity();
        }
    );

    ObservatoryState.subscribe(
        state => state.world.status + ":" +
            (state.world.identity ? state.world.identity.key : "") + ":" +
            (state.world.transition ? state.world.transition.targetName : ""),
        () => {
            requestSerial += 1;
            tracker.clear();
            collapsedGroups.clear();
            knownGroups.clear();
            expandedDetails.clear();
            expandedSources.clear();
            fullSourceCache.clear();
            agentNames = null;
            agentNamesPromise = null;
            lastSample = null;
            lastError = null;
            lastLayout = "";
            renderActivity();
        }
    );

    if (window.DevToolsNavigation) {
        window.DevToolsNavigation.registerWorkspace("scripts", {
            capture() {
                return {
                    autoRefresh: optAuto.checked,
                    scrollTop: container.scrollTop,
                    filters: currentFilters(),
                    grouped: groupInput.checked,
                    fullSource: fullSourceInput.checked,
                    collapsedGroups: Array.from(collapsedGroups),
                    expandedDetails: Array.from(expandedDetails),
                    expandedSources: Array.from(expandedSources)
                };
            },
            restore(saved) {
                if (!saved) return;
                optAuto.checked = saved.autoRefresh !== false;
                const filters = saved.filters || {};
                searchInput.value = filters.query || "";
                stateInput.value = filters.state || "all";
                classifierInput.value = filters.classifier || "";
                eventInput.value = filters.event || "";
                galleryInput.value = filters.gallery || "";
                creatureInput.checked = Boolean(filters.creaturesOnly);
                changedInput.checked = Boolean(filters.changedOnly);
                newInput.checked = Boolean(filters.newOnly);
                groupInput.checked = saved.grouped !== false;
                fullSourceInput.checked = Boolean(saved.fullSource);
                collapsedGroups.clear();
                (saved.collapsedGroups || []).forEach(key =>
                    collapsedGroups.add(key));
                expandedDetails.clear();
                (saved.expandedDetails || []).forEach(key =>
                    expandedDetails.add(key));
                expandedSources.clear();
                (saved.expandedSources || []).forEach(key =>
                    expandedSources.add(key));
                lastLayout = "";
                renderActivity();
                if (isScriptsTabActive) {
                    if (optAuto.checked) startAutoRefresh();
                    else stopAutoRefresh();
                }
                requestAnimationFrame(() => {
                    container.scrollTop = Number(saved.scrollTop) || 0;
                });
            },
            open(route) {
                const script = route.selections &&
                    route.selections.script;
                const agent = route.selections &&
                    (route.selections.agent ||
                        route.selections.creature);
                if (agent && agent.id != null) {
                    searchInput.value = String(agent.id);
                }
                if (script) {
                    const details = script.details || script;
                    const family = details.family;
                    const genus = details.genus;
                    const species = details.species;
                    if ([family, genus, species].every(value =>
                        value != null)) {
                        classifierInput.value =
                            [family, genus, species].join(" ");
                    }
                    if (details.event != null) {
                        eventInput.value = String(details.event);
                    }
                }
                stateInput.value = "all";
                changedInput.checked = false;
                newInput.checked = false;
                lastLayout = "";
                renderActivity();
                if (isScriptsTabActive) refreshScripts();
            }
        });
    }
})();
