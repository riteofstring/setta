#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const largeTemplateMinChars = 700;
const executableMarkers = [
  "document.querySelector",
  "document.querySelectorAll",
  "window.",
  "const ",
  "let ",
  "await ",
  "requestAnimationFrame",
  "MutationObserver",
  "PerformanceObserver",
  "HTMLElement",
  "HTMLButtonElement",
];

const filePaths = process.argv.slice(2).filter(isElectronTestJavaScriptPath);
const failures = [];

for (const filePath of filePaths) {
  const currentSource = readFileSync(filePath, "utf8");
  const currentViolations = executableLargeTemplates(currentSource);
  if (currentViolations.length === 0) {
    continue;
  }

  const baselineSource = readHeadSource(filePath);
  const baselineHashes = new Set(
    baselineSource ? executableLargeTemplates(baselineSource).map((violation) => violation.hash) : [],
  );
  for (const violation of currentViolations) {
    if (baselineHashes.has(violation.hash)) {
      continue;
    }
    failures.push({ filePath, ...violation });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(
      [
        "Large executable template literal in Electron test:",
        `${failure.filePath}:${failure.line}`,
        `${failure.length} chars`,
        `preview=${JSON.stringify(failure.preview)}`,
      ].join(" "),
    );
  }
  console.error(
    "Move browser-side programs into a driver module and call them through driverCallExpression/client.driver.",
  );
  process.exit(1);
}

function isElectronTestJavaScriptPath(filePath) {
  return (
    filePath.startsWith("desktop/tests/electron/") &&
    (filePath.endsWith(".js") || filePath.endsWith(".mjs"))
  );
}

function readHeadSource(filePath) {
  try {
    return execFileSync("git", ["show", `HEAD:${filePath}`], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function executableLargeTemplates(source) {
  return templateLiterals(source)
    .filter(
      (template) =>
        template.content.length >= largeTemplateMinChars &&
        executableMarkers.some((marker) => template.content.includes(marker)),
    )
    .map((template) => ({
      hash: hashTemplateContent(template.content),
      length: template.content.length,
      line: lineForOffset(source, template.start),
      preview: template.content.trim().slice(0, 96).replace(/\s+/g, " "),
    }));
}

function templateLiterals(source) {
  const templates = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "`") {
      continue;
    }
    const start = index;
    let content = "";
    index += 1;
    for (; index < source.length; index += 1) {
      const character = source[index];
      if (character === "\\") {
        const escaped = source.slice(index, Math.min(index + 2, source.length));
        content += escaped;
        index += 1;
        continue;
      }
      if (character === "`") {
        templates.push({ content, start });
        break;
      }
      content += character;
    }
  }
  return templates;
}

function lineForOffset(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") {
      line += 1;
    }
  }
  return line;
}

function hashTemplateContent(content) {
  return createHash("sha256").update(content).digest("hex");
}
