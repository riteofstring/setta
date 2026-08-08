import fs from "node:fs";
import path from "node:path";

const candidates = [
  path.join("node_modules", "@xterm/xterm/lib/xterm.mjs"),
  path.join("node_modules", "@xterm/xterm/lib/xterm.js"),
  path.join("node_modules", "xterm/lib/xterm.mjs"),
  path.join("node_modules", "xterm/lib/xterm.js"),
];

const existingCandidates = candidates.filter((candidatePath) =>
  fs.existsSync(candidatePath),
);

if (existingCandidates.length === 0) {
  throw new Error(
    `Could not find xterm bundle to patch. Tried: ${candidates.join(", ")}`,
  );
}

const identifier = String.raw`[A-Za-z_$][\w$]*`;
const declKeyword = String.raw`(?:let|const)`;
const getCoordsPattern = new RegExp(
  String.raw`function\s+(?<fn>${identifier})\s*` +
    String.raw`\(\s*(?<win>${identifier})\s*,\s*(?<evt>${identifier})\s*,\s*(?<el>${identifier})\s*\)\s*` +
    String.raw`\{\s*(?<decl>${declKeyword})\s+` +
    String.raw`(?<rect>${identifier})\s*=\s*\k<el>\.getBoundingClientRect\(\)\s*,\s*` +
    String.raw`(?<style>${identifier})\s*=\s*\k<win>\.getComputedStyle\(\s*\k<el>\s*\)\s*,\s*` +
    String.raw`(?<padX>${identifier})\s*=\s*parseInt\(\s*\k<style>\.getPropertyValue\("padding-left"\)\s*\)\s*,\s*` +
    String.raw`(?<padY>${identifier})\s*=\s*parseInt\(\s*\k<style>\.getPropertyValue\("padding-top"\)\s*\)\s*;\s*` +
    String.raw`return\s*\[\s*(?<xExpr>[^,]+?)\s*,\s*(?<yExpr>[^\]]+?)\s*\]\s*\}`,
);

const replacementForGroups = (groups) => {
  const zoomX = `((${groups.rect}.width)/(${groups.el}.offsetWidth||${groups.rect}.width)||1)`;
  const zoomY = `((${groups.rect}.height)/(${groups.el}.offsetHeight||${groups.rect}.height)||1)`;
  return (
    `function ${groups.fn}(${groups.win},${groups.evt},${groups.el}){` +
    `${groups.decl} ${groups.rect}=${groups.el}.getBoundingClientRect(),` +
    `${groups.style}=${groups.win}.getComputedStyle(${groups.el}),` +
    `${groups.padX}=parseInt(${groups.style}.getPropertyValue("padding-left")),` +
    `${groups.padY}=parseInt(${groups.style}.getPropertyValue("padding-top"));` +
    `return[(${groups.evt}.clientX-${groups.rect}.left)/${zoomX}-${groups.padX},` +
    `(${groups.evt}.clientY-${groups.rect}.top)/${zoomY}-${groups.padY}]}`
  );
};

for (const candidatePath of existingCandidates) {
  const source = fs.readFileSync(candidatePath, "utf8");
  const match = source.match(getCoordsPattern);
  if (match === null || match.groups === undefined) {
    throw new Error(
      `xterm reactFlowZoom patch failed: did not find a supported getCoordsRelativeToElement snippet (${candidatePath})`,
    );
  }

  let replacementCount = 0;
  const patched = source.replace(getCoordsPattern, (...args) => {
    const groups = args.at(-1);
    replacementCount += 1;
    return replacementForGroups(groups);
  });

  if (replacementCount !== 1) {
    throw new Error(
      `xterm reactFlowZoom patch failed: expected 1 replacement, got ${replacementCount} (${candidatePath})`,
    );
  }

  if (patched === source) {
    continue;
  }

  fs.writeFileSync(candidatePath, patched, "utf8");
  console.log(
    `patched xterm mouse coords for react flow zoom: ${candidatePath}`,
  );
}
