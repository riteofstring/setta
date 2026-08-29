import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { repositoryRoot } from "./lib/process.mjs";

// The package delivers one self-contained scoped stylesheet. `rehype-katex` emits markup that
// only KaTeX's own stylesheet can lay out, so this step folds that stylesheet into the compiled
// sheet rather than leaving a dependency CSS import in the built entry: a consumer imports no
// dependency CSS, resolves no dependency fonts, and adds no bundler configuration, and a host
// that never registers the built-in Text section still receives a coherent bundle.
//
// It runs after the Tailwind step because KaTeX's layout rules must outrank the typography the
// rendered Markdown surface puts around them, which is the order the reference gets from
// importing this stylesheet inside the component that renders math.
//
// Package-only design decisions recorded here:
//   - every folded rule is scoped under the workspace surface marker class, so nothing here can
//     style host content. KaTeX's one host-wide rule resets its equation counters on `body`;
//     scoped, that becomes the workspace root itself, so equation numbering restarts per
//     workspace rather than per document.
//   - only the woff2 source of each face survives. KaTeX declares woff2, woff, and truetype for
//     all twenty faces; the faces ship inlined here, and carrying three encodings would triple
//     the stylesheet for formats no browser this package supports would choose.

const packageRootRelative = "packages/workspace";
const packageRoot = path.join(repositoryRoot, packageRootRelative);
const stylesheetPath = path.join(packageRoot, "dist/styles.css");
const scopeSelectorPrefix = ".setta-workspace";
const foldedSectionMarker = "/* KaTeX math presentation, folded from";

// Resolved from the package's own manifest, so the folded rules and faces are the pinned copy
// installed beside the `rehype-katex` that renders the markup they lay out. That pin is why
// `katex` stays a declared dependency although package runtime source does not import it: this
// build entry point is its authoritative reader.
const requireFromPackage = createRequire(
  path.join(packageRoot, "package.json"),
);
const katexStylesheetPath = requireFromPackage.resolve(
  "katex/dist/katex.min.css",
);
const katexRoot = path.dirname(katexStylesheetPath);
const katexVersion = requireFromPackage("katex/package.json").version;

// KaTeX ships one flat rule list, so a nested block would mean a stylesheet shape this fold has
// never seen; it fails here instead of emitting rules it did not understand.
function readBlocks(css) {
  const blocks = [];
  let depth = 0;
  let preludeStart = 0;
  let bodyStart = 0;
  let prelude = "";
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === "{") {
      depth += 1;
      if (depth > 1) {
        throw new Error(
          `KaTeX stylesheet carries a nested block inside ${prelude.trim()}.`,
        );
      }
      prelude = css.slice(preludeStart, index);
      bodyStart = index + 1;
      continue;
    }
    if (character !== "}") {
      continue;
    }
    depth -= 1;
    if (depth !== 0) {
      throw new Error("KaTeX stylesheet closes a block that was never opened.");
    }
    blocks.push({
      prelude: prelude.trim(),
      body: css.slice(bodyStart, index).trim(),
    });
    preludeStart = index + 1;
  }
  if (depth !== 0) {
    throw new Error("KaTeX stylesheet leaves a block unclosed.");
  }
  return blocks;
}

function scopePrelude(prelude) {
  const selectors = prelude.split(",").map((part) => part.trim());
  return selectors
    .map((selector) => {
      if (selector === "") {
        throw new Error(
          `KaTeX stylesheet carries an empty selector in ${prelude}.`,
        );
      }
      if (selector === "body") {
        return scopeSelectorPrefix;
      }
      if (!selector.startsWith(".katex")) {
        throw new Error(
          `KaTeX stylesheet carries the unrecognized selector ${selector}.`,
        );
      }
      return `${scopeSelectorPrefix} ${selector}`;
    })
    .join(",");
}

function inlineFontFace(body) {
  const declarations = body
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration !== "");
  const sourceDeclarations = declarations.filter((declaration) =>
    declaration.startsWith("src:"),
  );
  if (sourceDeclarations.length !== 1) {
    throw new Error(
      `A KaTeX face declares ${String(sourceDeclarations.length)} src lists.`,
    );
  }
  return declarations
    .map((declaration) => {
      if (!declaration.startsWith("src:")) {
        return declaration;
      }
      const woff2 = /url\(([^)]+\.woff2)\)/u.exec(declaration);
      if (!woff2) {
        throw new Error(
          `A KaTeX face declares no woff2 source: ${declaration}`,
        );
      }
      const fontPath = path.resolve(katexRoot, woff2[1]);
      if (!existsSync(fontPath)) {
        throw new Error(
          `A KaTeX face names the missing font file ${fontPath}.`,
        );
      }
      const encoded = readFileSync(fontPath).toString("base64");
      return `src:url(data:font/woff2;base64,${encoded}) format("woff2")`;
    })
    .join(";");
}

function foldKatexStylesheet() {
  const blocks = readBlocks(readFileSync(katexStylesheetPath, "utf8"));
  let faceCount = 0;
  const rules = blocks.map(({ prelude, body }) => {
    if (!prelude.startsWith("@")) {
      return `${scopePrelude(prelude)}{${body}}`;
    }
    if (prelude !== "@font-face") {
      throw new Error(
        `KaTeX stylesheet carries the unsupported at-rule ${prelude}.`,
      );
    }
    faceCount += 1;
    return `@font-face{${inlineFontFace(body)}}`;
  });
  return { faceCount, rules };
}

if (!existsSync(stylesheetPath)) {
  console.error(
    `${packageRootRelative}/dist/styles.css: missing; run the Tailwind build first`,
  );
  process.exit(1);
}

const { faceCount, rules } = foldKatexStylesheet();
const compiled = readFileSync(stylesheetPath, "utf8");
// A rebuilt sheet carries no folded section; re-running this step over an already folded sheet
// replaces that section instead of appending a second copy.
const markerIndex = compiled.indexOf(foldedSectionMarker);
const tailwindOutput =
  markerIndex === -1 ? compiled : compiled.slice(0, markerIndex);
const folded = [
  `${foldedSectionMarker} katex@${katexVersion}: every rule scoped to the workspace`,
  " * surface, every face inlined as woff2. See scripts/compile-katex-styles.mjs. */",
  ...rules,
  "",
].join("\n");

writeFileSync(stylesheetPath, `${tailwindOutput.trimEnd()}\n${folded}`);
console.log(
  `Folded katex@${katexVersion} into dist/styles.css ` +
    `(${String(rules.length - faceCount)} scoped rules, ${String(faceCount)} inlined faces).`,
);
