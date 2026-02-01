import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  computeHash,
  generatedDir,
  generateTestFileContent,
  listGeneratedFiles,
  listSpecFiles,
  parseSpecFile,
  repoRoot,
  getGeneratedFileName,
  toPosixPath,
} from "./acceptance-tools.mjs";

function parseArgs(argv) {
  const flags = new Set(argv);
  return {
    write: flags.has("--write"),
    quiet: flags.has("--quiet"),
  };
}

function log(message, quiet) {
  if (!quiet) {
    console.log(message);
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function formatSpecPath(specPath) {
  return toPosixPath(path.relative(repoRoot, specPath));
}

async function buildExpectedOutputs() {
  const specFiles = await listSpecFiles();
  const expected = new Map();
  for (const specPath of specFiles) {
    const parsed = await parseSpecFile(specPath);
    const sourceRelative = formatSpecPath(specPath);
    const sourceHash = computeHash(parsed.content);
    const content = generateTestFileContent(parsed, sourceRelative, sourceHash);
    const outputName = getGeneratedFileName(specPath);
    const outputPath = path.join(generatedDir, outputName);
    expected.set(outputPath, { content, sourceRelative });
  }
  return expected;
}

export async function verifyOrWrite({ write, quiet }) {
  const expected = await buildExpectedOutputs();
  await ensureDir(generatedDir);

  const errors = [];
  for (const [outputPath, { content, sourceRelative }] of expected.entries()) {
    if (write) {
      await fs.writeFile(outputPath, content, "utf-8");
      log(`Wrote ${toPosixPath(path.relative(repoRoot, outputPath))}`, quiet);
      continue;
    }
    let existing;
    try {
      existing = await fs.readFile(outputPath, "utf-8");
    } catch (error) {
      if (error && error.code === "ENOENT") {
        errors.push(`Missing generated test for ${sourceRelative}`);
        continue;
      }
      throw error;
    }
    if (existing !== content) {
      errors.push(
        `Generated test out of date for ${sourceRelative}. Run pnpm -C frontend acceptance:generate.`,
      );
    }
  }

  if (!write) {
    const existingFiles = await listGeneratedFiles();
    const expectedFiles = new Set(expected.keys());
    for (const filePath of existingFiles) {
      if (!expectedFiles.has(filePath)) {
        errors.push(
          `Unexpected generated test ${toPosixPath(path.relative(repoRoot, filePath))}.`,
        );
      }
    }
  }

  if (errors.length > 0) {
    errors.forEach((message) => console.error(message));
    process.exitCode = 1;
    return;
  }

  log("Acceptance specs verified.", quiet);
}

function isMainModule() {
  const invoked = process.argv[1];
  if (!invoked) {
    return false;
  }
  return import.meta.url === pathToFileURL(invoked).href;
}

if (isMainModule()) {
  const args = parseArgs(process.argv.slice(2));
  verifyOrWrite(args).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
