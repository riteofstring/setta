import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const repoRoot = path.resolve(__dirname, "../../../../");
export const specsDir = path.join(repoRoot, "docs/acceptance/specs");
export const generatedDir = path.join(
  repoRoot,
  "frontend/tests/e2e/acceptance/generated",
);

export function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

export function computeHash(content) {
  return createHash("sha256").update(content).digest("hex");
}

export async function listSpecFiles() {
  let entries;
  try {
    entries = await fs.readdir(specsDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(specsDir, entry.name))
    .sort();
}

export async function listGeneratedFiles() {
  let entries;
  try {
    entries = await fs.readdir(generatedDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".spec.ts"))
    .map((entry) => path.join(generatedDir, entry.name))
    .sort();
}

export function getGeneratedFileName(specPath) {
  const base = path.basename(specPath, ".md");
  return `${base}.acceptance.spec.ts`;
}

function parseHeading(trimmed, label) {
  const prefix = `${label}:`;
  if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    return null;
  }
  const value = trimmed.slice(prefix.length).trim();
  return value || null;
}

function dedent(lines) {
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0) {
    return "";
  }
  const indents = nonEmpty.map((line) => {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
  });
  const minIndent = Math.min(...indents);
  return lines.map((line) => line.slice(minIndent)).join("\n").trimEnd();
}

export async function parseSpecFile(specPath) {
  const content = await fs.readFile(specPath, "utf-8");
  const lines = content.split(/\r?\n/);
  let feature = "";
  const scenarios = [];
  let currentScenario = null;
  let pendingDocStep = null;
  let inDocString = false;
  let docLines = [];

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (inDocString) {
      if (trimmed === '"""') {
        if (!pendingDocStep) {
          throw new Error(
            `Unexpected docstring close at ${specPath}:${lineNumber}.`,
          );
        }
        pendingDocStep.docString = dedent(docLines);
        pendingDocStep = null;
        inDocString = false;
        docLines = [];
        return;
      }
      docLines.push(line);
      return;
    }

    if (pendingDocStep) {
      if (trimmed === '"""') {
        inDocString = true;
        return;
      }
      if (trimmed.length === 0) {
        return;
      }
      throw new Error(
        `Expected docstring after step at ${specPath}:${pendingDocStep.line}.`,
      );
    }

    if (!trimmed) {
      return;
    }

    if (trimmed.startsWith("# ")) {
      const value = parseHeading(trimmed.slice(2).trim(), "Feature");
      if (!value) {
        throw new Error(`Missing feature name at ${specPath}:${lineNumber}.`);
      }
      feature = value;
      return;
    }

    if (trimmed.startsWith("## ")) {
      const value = parseHeading(trimmed.slice(3).trim(), "Scenario");
      if (!value) {
        throw new Error(
          `Missing scenario name at ${specPath}:${lineNumber}.`,
        );
      }
      currentScenario = { name: value, steps: [] };
      scenarios.push(currentScenario);
      return;
    }

    const stepMatch = trimmed.match(/^(Given|When|Then|And)\s+(.*)$/i);
    if (stepMatch) {
      if (!currentScenario) {
        throw new Error(
          `Step found before scenario at ${specPath}:${lineNumber}.`,
        );
      }
      const rawKeyword = stepMatch[1] ?? "";
      const keyword =
        rawKeyword.charAt(0).toUpperCase() + rawKeyword.slice(1).toLowerCase();
      const rawText = (stepMatch[2] ?? "").trim();
      if (!rawText) {
        throw new Error(`Empty step at ${specPath}:${lineNumber}.`);
      }
      const expectsDoc = rawText.endsWith(":");
      const text = expectsDoc ? rawText.slice(0, -1).trim() : rawText;
      if (!text) {
        throw new Error(`Empty step text at ${specPath}:${lineNumber}.`);
      }
      const step = {
        keyword,
        text,
        line: lineNumber,
      };
      currentScenario.steps.push(step);
      if (expectsDoc) {
        pendingDocStep = step;
      }
      return;
    }

    if (trimmed === '"""') {
      throw new Error(
        `Docstring found without a step at ${specPath}:${lineNumber}.`,
      );
    }

    throw new Error(
      `Unrecognized line at ${specPath}:${lineNumber}: ${trimmed}`,
    );
  });

  if (inDocString) {
    throw new Error(`Unclosed docstring in ${specPath}.`);
  }
  if (pendingDocStep) {
    throw new Error(`Missing docstring for step at ${specPath}:${pendingDocStep.line}.`);
  }
  if (!feature) {
    throw new Error(`Missing feature heading in ${specPath}.`);
  }
  if (scenarios.length === 0) {
    throw new Error(`No scenarios found in ${specPath}.`);
  }

  return { feature, scenarios, content };
}

export function generateTestFileContent(parsed, sourceRelative, sourceHash) {
  const featureTitle = `@acceptance ${parsed.feature}`;
  const featureLiteral = JSON.stringify(featureTitle);
  const scenarios = parsed.scenarios.map((scenario) => ({
    feature: parsed.feature,
    name: scenario.name,
    source: sourceRelative,
    sourceHash,
    steps: scenario.steps.map((step) => ({
      keyword: step.keyword,
      text: step.text,
      docString: step.docString ?? undefined,
    })),
  }));

  const serialized = JSON.stringify(scenarios, null, 2);

  return `// GENERATED FILE - DO NOT EDIT.
// Source: ${sourceRelative}
// SourceHash: ${sourceHash}

import { test } from "@playwright/test";
import { runAcceptanceScenario } from "../runner";
import type { AcceptanceScenario } from "../types";

const acceptanceEnabled = process.env.SETTA_ACCEPTANCE === "1";

const scenarios = ${serialized} satisfies AcceptanceScenario[];

test.describe(${featureLiteral}, () => {
  test.skip(!acceptanceEnabled, "SETTA_ACCEPTANCE not set");

  for (const scenario of scenarios) {
    test(scenario.name, async ({ page }) => {
      await runAcceptanceScenario(page, scenario);
    });
  }
});
`;
}
