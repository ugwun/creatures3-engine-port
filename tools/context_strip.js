// context_strip.js — persistent world and investigation breadcrumb
"use strict";

(function(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.ObservatoryContextStrip = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
    function createElement(documentObj, tag, className, text) {
        const element = documentObj.createElement(tag);
        if (className) element.className = className;
        if (text != null) element.textContent = text;
        return element;
    }

    function mount(options) {
        const opts = options || {};
        const store = opts.store;
        const navigation = opts.navigation;
        const navigationModel = opts.navigationModel ||
            (typeof ObservatoryNavigation !== "undefined"
                ? ObservatoryNavigation
                : null);
        const documentObj = opts.document ||
            (typeof document !== "undefined" ? document : null);
        if (!store || !navigation || !navigationModel || !documentObj) {
            throw new TypeError("Context strip requires store, navigation, and document");
        }

        const strip = documentObj.getElementById("context-strip");
        const segmentsEl = documentObj.getElementById("context-segments");
        const backButton = documentObj.getElementById("context-back");
        const tickEl = documentObj.getElementById("context-tick");
        const statusEl = documentObj.getElementById("context-status");
        if (!strip || !segmentsEl || !backButton || !tickEl || !statusEl) {
            throw new Error("Context strip markup is incomplete");
        }

        function render() {
            const state = store.getState();
            const segments = navigationModel.buildContextSegments(
                state,
                navigation.getCurrentRoute
                    ? navigation.getCurrentRoute() : null
            );
            const activeTab = navigation.getActiveTab();
            const fragment = documentObj.createDocumentFragment();

            if (segments.length === 0) {
                const empty = createElement(
                    documentObj,
                    "span",
                    "context-strip__empty",
                    "No world or subject selected"
                );
                fragment.appendChild(empty);
            }

            segments.forEach((segment, index) => {
                if (index > 0) {
                    const separator = createElement(
                        documentObj,
                        "span",
                        "context-segment__separator",
                        "/"
                    );
                    separator.setAttribute("aria-hidden", "true");
                    fragment.appendChild(separator);
                }

                const group = createElement(
                    documentObj,
                    "span",
                    "context-segment" +
                        (segment.primary ? " context-segment--primary" : "") +
                        (segment.missing ? " context-segment--missing" : "")
                );
                const open = createElement(
                    documentObj,
                    segment.route ? "button" : "span",
                    "context-segment__open",
                    segment.label
                );
                if (segment.route) open.type = "button";
                open.title = segment.title;
                open.dataset.contextKind = segment.kind;
                open.setAttribute(
                    "aria-label",
                    segment.label +
                        (segment.primary ? ", primary selection" : ", related selection") +
                        ". " + segment.title
                );
                if (segment.route) {
                    open.addEventListener(
                        "click", () => navigation.navigate(segment.route));
                }
                group.appendChild(open);

                if (segment.clearable) {
                    const clear = createElement(
                        documentObj,
                        "button",
                        "context-segment__clear",
                        "×"
                    );
                    clear.type = "button";
                    clear.title = "Clear " + segment.label + " from shared context";
                    clear.setAttribute("aria-label", "Clear " + segment.label);
                    clear.addEventListener("click", () =>
                        navigation.clearSelection(segment.kind)
                    );
                    group.appendChild(clear);
                }
                fragment.appendChild(group);
            });
            DomPatch.replaceChanged(segmentsEl, fragment);

            const world = state.world;
            const tick = world.tick == null ? "—" : world.tick.toLocaleString();
            tickEl.textContent = "Tick " + tick;
            tickEl.title = world.identity
                ? "Current observed world tick for " + world.identity.name
                : "No active world tick";

            const missing = navigation.getStatus().missing;
            statusEl.hidden = !missing;
            statusEl.textContent = missing ? missing.reason : "";
            statusEl.title = missing
                ? "Historical context was retained, but this target cannot be opened"
                : "";

            backButton.disabled = !navigation.canGoBack();
            backButton.title = navigation.canGoBack()
                ? "Return to the previous investigation, including its filters and scroll position"
                : "No earlier in-tool investigation in this browser history";
            strip.dataset.tab = activeTab;
        }

        backButton.addEventListener("click", () => navigation.back());
        const unsubscribeState = store.subscribe(
            state => ({
                world: state.world,
                selection: state.selection
            }),
            render,
            (left, right) =>
                left.world === right.world && left.selection === right.selection
        );
        const unsubscribeNavigation = navigation.subscribe(render);
        render();

        return Object.freeze({
            render,
            destroy() {
                unsubscribeState();
                unsubscribeNavigation();
            }
        });
    }

    return Object.freeze({ mount });
});
