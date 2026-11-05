"use strict";
const fs = require("node:fs");
const path = require("node:path");
const {hash, stableStringify} = require("../firebase-merge/core");
const isMap = v => v !== null && typeof v === "object" && !Array.isArray(v);
function leaves(a, b, prefix = "", result = {onlyReference: [], onlyTarget: [], changed: []}) {
  if (isMap(a) && isMap(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) leaves(a[k], b[k], prefix + "/" + k, result);
  } else if (a === undefined && b !== undefined) result.onlyTarget.push(prefix);
  else if (a !== undefined && b === undefined) result.onlyReference.push(prefix);
  else if (stableStringify(a) !== stableStringify(b)) result.changed.push(prefix);
  return result;
}
function compare(reference, target, coverage, old = {}) {
  const readable = new Map(coverage.map(r => [r.root, r]));
  const rows = [], details = [];
  for (const root of [...new Set([...Object.keys(reference), ...Object.keys(target), ...readable.keys()])].sort()) {
    const access = readable.get(root);
    if (!access?.read) { rows.push({root, status: "NAO_VERIFICADO", http: access?.status ?? null, targetCount: isMap(target[root]) ? Object.keys(target[root]).length : 0}); continue; }
    const a = reference[root] || {}, b = target[root] || {}, previous = old[root] || {};
    const ids = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    const row = {root, status: hash(a) === hash(b) ? "IDENTICO" : "DIFERENTE", referenceCount: Object.keys(a).length, targetCount: Object.keys(b).length, identical: 0, changed: 0, onlyReference: 0, onlyTarget: 0, sourceContainsTarget: 0, targetContainsSource: 0, referenceNewSinceExport: 0, referenceChangedSinceExport: 0};
    for (const id of ids) {
      if (a[id] !== undefined && previous[id] === undefined) row.referenceNewSinceExport++;
      else if (a[id] !== undefined && hash(a[id]) !== hash(previous[id])) row.referenceChangedSinceExport++;
      if (a[id] === undefined) { row.onlyTarget++; details.push({root, id, status: "SO_NOSSO"}); }
      else if (b[id] === undefined) { row.onlyReference++; details.push({root, id, status: "SO_OFICIAL"}); }
      else if (hash(a[id]) === hash(b[id])) row.identical++;
      else {
        const diff = leaves(a[id], b[id]); row.changed++;
        if (!diff.onlyReference.length && !diff.changed.length) row.targetContainsSource++;
        if (!diff.onlyTarget.length && !diff.changed.length) row.sourceContainsTarget++;
        details.push({root, id, status: "DIFERENTE", ...diff});
      }
    }
    rows.push(row);
  }
  return {rows, details};
}
if (require.main === module) {
  const out = path.resolve(__dirname, "../../scratch/virada-20261103");
  const read = file => JSON.parse(fs.readFileSync(file,"utf8"));
  const reference = read(path.join(out,"reference-live.json")), target = read(path.join(out,"target-live.json"));
  const manifest = read(path.join(out,"reference-live-manifest.json"));
  if(fs.existsSync(path.join(out,"reference-extra.json"))) {
    Object.assign(reference,read(path.join(out,"reference-extra.json")));
    manifest.coverage.push(...read(path.join(out,"reference-extra-manifest.json")).coverage);
  }
  const old = read(process.argv[2]);
  const result = compare(reference,target,manifest.coverage,old);
  fs.writeFileSync(path.join(out,"comparison-private.json"), JSON.stringify(result,null,2),{mode:0o600});
  fs.writeFileSync(path.join(out,"comparison-summary.json"), JSON.stringify({completedAt:new Date().toISOString(),rows:result.rows},null,2),{mode:0o600});
  console.log(JSON.stringify(result.rows,null,2));
}
module.exports = {compare,leaves};
