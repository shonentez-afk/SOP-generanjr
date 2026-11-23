// Standalone documentation smoke test. Run: node docs/diagrams/qa/verify-unified-map.mjs
// No npm packages, browser automation or network required.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Script, runInNewContext } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(resolve(root, 'sop-stage39-unified.html'), 'utf8');
const callgraph = JSON.parse(readFileSync(resolve(root, 'stage39-verified-callgraph.json'), 'utf8'));

function between(source, opener) {
  const pos = source.indexOf(opener);
  assert.ok(pos >= 0, 'missing embedded resource: ' + opener);
  const end = source.indexOf('</script>', pos + opener.length);
  assert.ok(end > pos, 'unclosed embedded resource');
  return source.slice(pos + opener.length, end);
}

const blob = '<script type="application/json" id="bundle">';
const pack = JSON.parse(between(html, blob));
const taskBlob = '<script type="application/json" id="taskdata">';
const tasks = JSON.parse(between(pack.ai, taskBlob)).tasks;
assert.equal(tasks.length, 16);
assert.equal(tasks.filter(t => t.status === 'not_in_ui').length, 1);
assert.equal(pack.graph.summary.activeModules, 67);
assert.equal(pack.graph.summary.moduleEdges, 258);
assert.equal(pack.graph.summary.recognizedCrossFileCallSites, 995);
assert.deepEqual(pack.graph.summary, callgraph.summary);
assert.equal(new Set(callgraph.nodes.map(n => n.path)).size, 67);
assert.ok(!/<script\b[^>]*\bsrc=/i.test(html), 'unexpected remote script in standalone page');

function jsSource(page) {
  const found = page.match(/<script>\s*([\s\S]*?)<\/script>\s*<\/body>/i);
  assert.ok(found, 'missing application script');
  return found[1];
}
for (const [name, page] of [['unified', html], ['overview', pack.overview], ['ai', pack.ai]]) {
  new Script(jsSource(page), { filename: name + '.js' });
}

function fakeElement() {
  return {
    dataset: {}, hidden: false, innerHTML: '', textContent: '', value: '',
    classList: { toggle() {}, add() {}, remove() {} },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {}
  };
}
const ids = 'viewer stats search group filelist results modulename modulepath modulechips centername openfile incoming outgoing edgeDetails quick description docview depsview likeview';
const el = new Map(ids.split(' ').map(id => [id, fakeElement()]));
const tabControls = ['overview', 'ai', 'dependencies', 'likec4'].map(tab => ({
  dataset: { tab }, classList: { toggle() {} }, addEventListener() {}
}));
const viewControls = ['landscape','modules','sop','ai','twi','frv','storage','excel'].map(view => {
  const el = fakeElement();
  el.dataset.c4view = view;
  return el;
});
const frame = el.get('viewer');
let loads = 0;
const selected = [];
const pending = [];
frame.contentWindow = { select(value) { selected.push(value); } };
frame.contentDocument = { readyState: 'complete', querySelector() { return { scrollIntoView() {} }; } };
Object.defineProperty(frame, 'srcdoc', { set() { loads++; } });
frame.addEventListener = (kind, callback) => { if (kind === 'load') pending.push(callback); };
const document = {
  getElementById(id) { return id === 'bundle' ? { textContent: between(html, blob) } : el.get(id) || fakeElement(); },
  querySelectorAll(selector) {
    if (selector === '.tab' || selector === '[data-tab]') return tabControls;
    if (selector === '[data-c4view]') return viewControls;
    return [];
  }
};
const location = { hash: '' };
const history = { replaceState(_a, _b, hash) { location.hash = hash; } };
const vm = { document, location, history };
runInNewContext(jsSource(html) + '\n;globalThis.__api = {setTab,pickOverview};', vm);
const { setTab, pickOverview } = vm.__api;
assert.equal(loads, 1, 'initial overview should be loaded once');
setTab('overview');
assert.equal(loads, 1, 'same tab must not reload an iframe');
setTab('likec4');
pickOverview('sop');
assert.ok(selected.includes('sop'), 'LikeC4 -> SOP selection failed');
assert.equal(loads, 1, 'cached overview must not reload');
setTab('ai');
assert.equal(loads, 2);
pickOverview('frv');
assert.equal(loads, 3, 'AI -> overview should load once');
const callbacks = pending.splice(0, pending.length);
callbacks.forEach(fn => fn());
assert.ok(selected.includes('frv'), 'delayed AI -> FRV selection failed');
pickOverview('twi');
assert.equal(loads, 3);
assert.ok(selected.includes('twi'));
console.log('PASS: 67 modules / 258 edges / 995 references, 16 AI tasks, 3 JS scripts, navigation smoke');
