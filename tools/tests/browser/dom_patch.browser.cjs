"use strict";

const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { available, open, startSuite } = require("./harness.cjs");

const skip = !available ? "Firefox is not installed"
  : process.env.OBSERVATORY_URL ? "needs no engine" : false;
let suite;

async function run(script) {
  return suite.browser.evaluate(`
    const box = document.createElement('div');
    document.body.appendChild(box);
    try { ${script} } finally { box.remove(); }
  `);
}

before(async () => {
  if (skip) return;
  suite = await startSuite();
  await open(suite.browser, suite.baseUrl);
});

after(async () => {
  if (suite) await suite.stop();
});

test("updates text and attributes on the existing node", { skip }, async () => {
  assert.equal(await run(`
    DomPatch.update(box, '<p class="a">one</p>');
    const node = box.firstChild;
    DomPatch.update(box, '<p class="b">two</p>');
    return box.firstChild === node && node.className === 'b' &&
      node.textContent === 'two';
  `), true);
});

test("keeps a user-opened disclosure", { skip }, async () => {
  assert.equal(await run(`
    DomPatch.update(box, '<details><summary>a</summary>x</details>');
    box.firstChild.open = true;
    DomPatch.update(box, '<details><summary>a</summary>y</details>');
    return box.firstChild.open;
  `), true);
});

test("keeps typed text and the focused field", { skip }, async () => {
  assert.equal(await run(`
    DomPatch.update(box, '<input value="a"><textarea>b</textarea>');
    const [input, area] = box.children;
    input.value = 'typed';
    area.focus();
    area.value = 'note';
    DomPatch.update(box, '<input value="c"><textarea>d</textarea>');
    return input.value + '/' + area.value + '/' +
      (document.activeElement === area);
  `), "typed/note/true");
});

test("checkboxes follow the application's state", { skip }, async () => {
  assert.equal(await run(`
    DomPatch.update(box, '<input type="checkbox" checked>');
    const input = box.firstChild;
    input.checked = false;
    DomPatch.update(box, '<input type="checkbox" checked>');
    return input.checked;
  `), true);
});

test("keyed rows move with their identity", { skip }, async () => {
  assert.equal(await run(`
    DomPatch.update(box,
      '<p data-patch-key="a">a</p><p data-patch-key="b">b</p>');
    const a = box.firstChild;
    DomPatch.update(box,
      '<p data-patch-key="b">b</p><p data-patch-key="a">a2</p>');
    return box.lastChild === a && a.textContent === 'a2';
  `), true);
});

test("help annotations survive and do not change a control's identity",
  { skip }, async () => {
    assert.equal(await run(`
      DomPatch.update(box, '<button data-id="1">one</button>');
      const button = box.firstChild;
      button.dataset.helpId = 'action.pin';
      button.setAttribute('aria-describedby', 'tip');
      DomPatch.update(box, '<button data-id="1">ONE</button>');
      return box.firstChild === button &&
        button.dataset.helpId === 'action.pin' &&
        button.getAttribute('aria-describedby') === 'tip';
    `), true);
  });

test("a reordered row keeps focus", { skip }, async () => {
  assert.equal(await run(`
    DomPatch.update(box, '<button data-patch-key="a">a</button>' +
      '<button data-patch-key="b">b</button>');
    const b = box.lastChild;
    b.focus();
    DomPatch.update(box, '<button data-patch-key="b">b</button>' +
      '<button data-patch-key="a">a</button>');
    return box.firstChild === b && document.activeElement === b;
  `), true);
});

test("a focused control is never reused for another subject", { skip }, async () => {
  assert.equal(await run(`
    DomPatch.update(box, '<button data-chemical-id="1">one</button>' +
      '<button data-chemical-id="2">two</button>');
    box.firstChild.focus();
    DomPatch.update(box, '<button data-chemical-id="2">two</button>');
    const focused = document.activeElement;
    return focused.dataset ? focused.dataset.chemicalId || 'none' : 'none';
  `), "none");
});

test("a keyed control survives a sampled value changing", { skip }, async () => {
  assert.equal(await run(`
    DomPatch.update(box,
      '<div role="button" tabindex="0" data-patch-key="c1" data-value="1"></div>');
    const row = box.firstChild;
    row.focus();
    DomPatch.update(box,
      '<div role="button" tabindex="0" data-patch-key="c1" data-value="2"></div>');
    return box.firstChild === row && document.activeElement === row &&
      row.dataset.value === '2';
  `), true);
});

test("a control survives when only its appearance changes", { skip }, async () => {
  assert.equal(await run(`
    DomPatch.update(box, '<button data-id="1" class="a">one</button>');
    const button = box.firstChild;
    DomPatch.update(box, '<button data-id="1" class="b">ONE</button>');
    return box.firstChild === button;
  `), true);
});

test("a select keeps the focused choice when options refresh", { skip }, async () => {
  assert.equal(await run(`
    DomPatch.update(box, '<select><option value="1">a</option>' +
      '<option value="2">b</option></select>');
    const select = box.firstChild;
    select.focus();
    select.value = '2';
    DomPatch.update(box, '<select><option value="1">a!</option>' +
      '<option value="2">b!</option></select>');
    return select.value;
  `), "2");
});

test("patches SVG content in place", { skip }, async () => {
  assert.equal(await run(`
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    box.appendChild(svg);
    DomPatch.update(svg, '<line x1="1"></line>');
    const line = svg.firstChild;
    DomPatch.update(svg, '<line x1="2"></line>');
    return svg.firstChild === line && line.getAttribute('x1') === '2' &&
      line.namespaceURI === svg.namespaceURI;
  `), true);
});
