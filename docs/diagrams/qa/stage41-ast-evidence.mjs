// Offline, read-only AST evidence for 73 Stage41 JS modules (acorn 8, acorn-walk 8).
// Usage: node stage41-ast-evidence.mjs <stage41-copy> <stage41-codeflow-graph.json> <out.json>
// This is NOT a runtime trace and does not resolve lexical scope/shadowing.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'acorn';
import { parse as parseLoose } from 'acorn-loose';
import * as walk from 'acorn-walk';

const [root, graphPath, outputPath] = process.argv.slice(2);
if (!root || !graphPath || !outputPath) throw Error('Expected <root> <codeflow-json> <output-json>');
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
if (graph.summary.active_modules !== 73 || graph.edges.length !== 367) {
  throw Error('Unexpected Stage41 graph; must be exactly 73 modules / 367 edges');
}
const modules = graph.modules.map(m => m.path);
const byFile = new Map();
const failures = [];
const tolerantFiles = [];

function push(map, name, line) {
  if (!name) return;
  const existing = map.get(name) || [];
  if (!existing.includes(line)) existing.push(line);
  map.set(name, existing);
}
function ignoredIdentifier(node, parent) {
  if (!parent) return false;
  if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) return true;
  if (parent.type === 'Property' && parent.key === node && !parent.computed) return true;
  if (parent.type === 'MethodDefinition' && parent.key === node && !parent.computed) return true;
  if ((parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression')
    && parent.id === node) return true;
  if (parent.type === 'VariableDeclarator' && parent.id === node) return true;
  return false;
}

for (const name of modules) {
  const file = path.join(root, name);
  const source = fs.readFileSync(file, 'utf8');
  const declarations = new Map(), direct = new Map(), references = new Map();
  try {
    const options = {
      ecmaVersion: 'latest', sourceType: 'script', locations: true,
      allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true
    };
    let tree;
    try { tree = parse(source, options); }
    catch (parseError) {
      // Some legacy source fragments are not parseable as isolated ES scripts.
      // Keep those records visibly lower confidence and use a tolerant AST.
      tolerantFiles.push({file:name, strict_error:String(parseError)});
      tree = parseLoose(source, options);
    }
    walk.simple(tree, {
      FunctionDeclaration(n) {
        if (n.id?.name) push(declarations, n.id.name, n.loc.start.line);
      },
      VariableDeclarator(n) {
        if (n.id?.type === 'Identifier') push(declarations, n.id.name, n.loc.start.line);
      },
      AssignmentExpression(n) {
        if (n.left?.type === 'Identifier') push(declarations, n.left.name, n.loc.start.line);
      }
    });
    walk.ancestor(tree, {
      CallExpression(n) {
        if (n.callee?.type === 'Identifier') push(direct, n.callee.name, n.loc.start.line);
      },
      Identifier(n, _state, ancestors) {
        const parent = ancestors.at(-2);
        if (!ignoredIdentifier(n, parent)) push(references, n.name, n.loc.start.line);
      }
    });
  } catch (error) {
    failures.push({ file: name, error: String(error) });
  }
  byFile.set(name, { declarations, direct, references });
}

const records = [];
const methodCount = { direct_call: 0, reference_only: 0, not_found: 0 };
const historical = { pairs: 0, direct_call_pairs: 0, reference_only_pairs: 0, unmatched_pairs: 0 };
for (const edge of graph.edges) {
  const a = byFile.get(edge.caller), b = byFile.get(edge.definition);
  const evidence = edge.functions.map(name => {
    const direct = a.direct.get(name) || [];
    const refs = a.references.get(name) || [];
    const defs = b.declarations.get(name) || [];
    const mode = direct.length ? 'direct_call' : refs.length ? 'reference_only' : 'not_found';
    methodCount[mode]++;
    return {
      name, mode, caller_lines: (direct.length ? direct : refs).slice(0, 8),
      definition_lines: defs.slice(0, 5), found_definition: defs.length > 0
    };
  });
  if (edge.historicalCodeFlowOnly) {
    historical.pairs++;
    if (evidence.some(x => x.mode === 'direct_call')) historical.direct_call_pairs++;
    else if (evidence.some(x => x.mode === 'reference_only')) historical.reference_only_pairs++;
    else historical.unmatched_pairs++;
  }
  records.push({
    caller: edge.caller, definition: edge.definition,
    historicalCodeFlowOnly: edge.historicalCodeFlowOnly,
    evidence
  });
}
const result = {
  schema_version: 1,
  source_revision: graph.target_revision,
  analyzed_files: modules.length,
  parser: 'acorn 8 / acorn-walk 8; AST direct calls and identifier references',
  method: 'Syntax-only, no scope/binding or runtime verification; MemberExpression property names are excluded',
  limitations: [
    'A syntax-level call/reference cannot establish the actual runtime target, especially when globals are reassigned',
    'Reference-only links may be DOM callbacks; cannot prove user reachability from AST alone',
    'Not-found is not proof of no runtime path; CodeFlow may use name fallback, and dynamic dispatch is excluded'
  ],
  parse_failures: failures,
  tolerant_parser_files: tolerantFiles,
  summary: {
    modules: modules.length, file_edges: records.length,
    symbol_records: records.reduce((n, e) => n + e.evidence.length, 0),
    method_count: methodCount, historical_77_retained: historical
  },
  edges: records
};
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log('STAGE41_AST_SUMMARY=' + JSON.stringify({
  summary: result.summary, failures, tolerantFiles, symbol_declaration_coverage:
  records.reduce((n,e) => n + e.evidence.filter(f=>f.found_definition).length,0)
}));
for (let i = 0; i < records.length; i += 25) {
  console.log('STAGE41_AST_BLOCK_' + (i / 25) + '=' + JSON.stringify(records.slice(i, i + 25)));
}
if (failures.length) process.exitCode = 2; // tolerant fallbacks are warnings, not false PASS for strict parsing
