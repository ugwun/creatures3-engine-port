// dom_patch.js — update rendered HTML in place
//
// Panels re-render from polled data every second or so. Assigning innerHTML
// throws away everything the user was doing there: open disclosures, focus,
// typed text, scroll position, a half-finished click. Patching the existing
// nodes keeps all of that and leaves the DOM stable between samples.
//
// Rules a patched panel must follow:
//   - Attach listeners by delegation from the container. Nodes are reused, so
//     per-render listeners would pile up or keep stale closures.
//   - Give rows that can be inserted, removed or reordered a data-patch-key.
//     Without one, a control whose data attributes change is replaced, not
//     reused, so it cannot silently start acting on another subject.
"use strict";

(function(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.DomPatch = api;
})(typeof window !== "undefined" ? window : globalThis, function() {
  // Help and tooltips annotate controls after they render. These are not part
  // of a panel's markup, so a refresh must neither strip them nor read them as
  // a change of identity.
  const RUNTIME_ATTRIBUTES = new Set([
    "aria-describedby", "aria-keyshortcuts", "data-help-id"
  ]);

  function keyOf(node) {
    if (node.nodeType !== 1) return null;
    return node.getAttribute("data-patch-key") || node.id || null;
  }

  function isInteractive(element) {
    return ["A", "BUTTON", "INPUT", "SELECT", "SUMMARY", "TEXTAREA"]
      .includes(element.tagName) ||
      element.hasAttribute("tabindex") ||
      element.getAttribute("role") === "button";
  }

  function identityOf(element) {
    return Array.from(element.attributes)
      .filter(attribute => attribute.name.startsWith("data-") &&
        attribute.name !== "data-patch-key" &&
        !RUNTIME_ATTRIBUTES.has(attribute.name))
      .map(attribute => attribute.name + "=" + attribute.value)
      .sort()
      .join("|");
  }

  // The data attributes on a control say what it acts on. Reusing it for
  // something else would move the user's focus or click onto a different
  // subject without any visible sign, so an unkeyed control is replaced.
  function sameKind(left, right) {
    if (left.nodeType !== right.nodeType ||
        left.nodeName !== right.nodeName) return false;
    return left.nodeType !== 1 || !isInteractive(left) ||
      identityOf(left) === identityOf(right);
  }

  function isTextEntry(element) {
    if (element.tagName === "TEXTAREA") return true;
    if (element.tagName !== "INPUT") return false;
    return !["checkbox", "radio", "button", "submit", "reset"]
      .includes(element.type);
  }

  function containsControl(element) {
    return element.matches("input, select, textarea") ||
      element.querySelector("input, select, textarea") !== null;
  }

  function syncControl(current, next) {
    if (current.tagName === "INPUT" &&
        (current.type === "checkbox" || current.type === "radio")) {
      // Toggles are rendered from application state, so the render wins.
      if (document.activeElement !== current ||
          current.checked === next.hasAttribute("checked")) {
        current.checked = next.hasAttribute("checked");
      }
      return;
    }
    if (isTextEntry(current)) {
      // Anything the user has typed outranks a refresh.
      const edited = current.value !== current.defaultValue;
      if (document.activeElement === current || edited) return;
      current.value = next.getAttribute("value") || next.value || "";
    }
  }

  function syncAttributes(current, next) {
    Array.from(current.attributes).forEach(attribute => {
      if (!next.hasAttribute(attribute.name) && attribute.name !== "open" &&
          !RUNTIME_ATTRIBUTES.has(attribute.name)) {
        current.removeAttribute(attribute.name);
      }
    });
    Array.from(next.attributes).forEach(attribute => {
      if (attribute.name === "open") return;
      if (current.getAttribute(attribute.name) !== attribute.value) {
        current.setAttribute(attribute.name, attribute.value);
      }
    });
  }

  function syncNode(current, next) {
    if (current.nodeType !== 1) {
      if (current.nodeValue !== next.nodeValue) {
        current.nodeValue = next.nodeValue;
      }
      return;
    }
    // Equal markup says nothing about a control's live state, which is held
    // in properties, so anything containing one still needs syncing.
    if (current.isEqualNode(next) && !containsControl(current)) return;
    const controlValue = current.tagName === "SELECT" ? current.value : null;
    const controlActive = current === document.activeElement;
    syncAttributes(current, next);
    if (current.tagName === "INPUT" || current.tagName === "TEXTAREA") {
      syncControl(current, next);
      if (current.tagName === "INPUT") return;
    }
    syncChildren(current, Array.from(next.childNodes));
    if (current.tagName === "SELECT") {
      const available = Array.from(current.options)
        .some(option => option.value === controlValue);
      if (available && (controlActive || current.dataset.patchKeepValue)) {
        current.value = controlValue;
      }
    }
  }

  function syncChildren(parent, nextChildren) {
    const existing = Array.from(parent.childNodes);
    const keyed = new Map();
    existing.forEach(node => {
      const key = keyOf(node);
      if (key) keyed.set(key, node);
    });
    let cursor = parent.firstChild;
    nextChildren.forEach(next => {
      const key = keyOf(next);
      let match = null;
      // A key is the identity, so a keyed row keeps its node even when other
      // data attributes change with each sample.
      if (key && keyed.has(key) &&
          keyed.get(key).nodeName === next.nodeName) {
        match = keyed.get(key);
        keyed.delete(key);
      } else if (!key && cursor && !keyOf(cursor) && sameKind(cursor, next)) {
        match = cursor;
      }
      if (match) {
        if (match === cursor) cursor = cursor.nextSibling;
        else parent.insertBefore(match, cursor);
        syncNode(match, next);
      } else {
        parent.insertBefore(next, cursor);
      }
    });
    while (cursor) {
      const following = cursor.nextSibling;
      parent.removeChild(cursor);
      cursor = following;
    }
  }

  function parse(container, html) {
    const template = document.createElement("template");
    const svg = typeof SVGElement !== "undefined" &&
      container instanceof SVGElement;
    template.innerHTML = svg ? "<svg>" + html + "</svg>" : html;
    return Array.from(
      (svg ? template.content.firstChild : template.content).childNodes);
  }

  // Moving a node blurs it, so reordered rows would drop focus they should keep.
  function keepingFocus(apply) {
    const focused = document.activeElement;
    apply();
    if (focused && focused !== document.activeElement && focused.isConnected) {
      focused.focus({ preventScroll: true });
    }
  }

  // Makes container's contents match html, reusing what is already there.
  function update(container, html) {
    if (!container) return;
    keepingFocus(() => syncChildren(container, parse(container, html)));
  }

  // The same, for content built with createElement. Do not attach listeners
  // to nodes passed here; reused nodes keep their original ones.
  function updateChildren(container, children) {
    if (!container) return;
    const list = children == null ? []
      : children.nodeType === 11 ? Array.from(children.childNodes)
        : Array.from(children);
    keepingFocus(() => syncChildren(container, list));
  }

  // For rows that carry their own listeners: rows that did not change stay in
  // place, so a click in progress survives, and changed rows are swapped whole.
  function replaceChanged(container, children) {
    if (!container) return;
    const list = children.nodeType === 11
      ? Array.from(children.childNodes) : Array.from(children);
    const existing = Array.from(container.childNodes);
    list.forEach((next, index) => {
      const current = existing[index];
      if (!current) container.appendChild(next);
      else if (!current.isEqualNode(next)) {
        container.replaceChild(next, current);
      }
    });
    existing.slice(list.length).forEach(node => container.removeChild(node));
  }

  return Object.freeze({ update, updateChildren, replaceChanged });
});
