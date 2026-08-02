import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const verbose = process.argv
  .slice(2)
  .some((arg) => arg === "--verbose" || arg === "-v");
const generatedTypesRelativePath = "src/utils/generatedTypes.ts";
const generatedTypesPath = path.resolve(
  process.cwd(),
  generatedTypesRelativePath,
);
const maxIterations = Number(process.env.RUN_KNIP_MAX_ITERATIONS ?? "10");
const knipFixArgs = [
  "knip",
  "--fix-type",
  "exports",
  "--fix-type",
  "types",
  "--format",
];

function hashFile(filePath) {
  if (!existsSync(filePath)) {
    return "";
  }

  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function logVerbose(message) {
  if (verbose) {
    console.log(message);
  }
}

function runCommand(command, args, { ignoreFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["inherit", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (verbose) {
        process.stdout.write(chunk);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (verbose) {
        process.stderr.write(chunk);
      }
    });
    child.on("close", (code, signal) => {
      if (signal) {
        reject(
          new Error(
            `Command ${command} ${args.join(" ")} terminated with signal ${signal}`,
          ),
        );
        return;
      }

      const exitCode = code ?? 0;
      if (exitCode !== 0) {
        const message = `Command ${command} ${args.join(" ")} exited with code ${exitCode}`;
        if (ignoreFailure) {
          logVerbose(`[run-knip] ${message}; continuing`);
        } else {
          if (!verbose) {
            if (stdout) {
              process.stdout.write(stdout);
            }
            if (stderr) {
              process.stderr.write(stderr);
            }
          }
          reject(new Error(message));
          return;
        }
      }

      resolve({ exitCode, stdout, stderr });
    });
  });
}

function captureStdout(
  command,
  args,
  { allowedExitCodes = new Set([0]) } = {},
) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (verbose) {
        process.stdout.write(chunk);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (verbose) {
        process.stderr.write(chunk);
      }
    });
    child.on("close", (code, signal) => {
      if (signal) {
        reject(
          new Error(
            `Command ${command} ${args.join(" ")} terminated with signal ${signal}`,
          ),
        );
        return;
      }

      const exitCode = code ?? 0;
      if (!allowedExitCodes.has(exitCode)) {
        if (!verbose) {
          if (stdout) {
            process.stdout.write(stdout);
          }
          if (stderr) {
            process.stderr.write(stderr);
          }
        }
        reject(
          new Error(
            `Command ${command} ${args.join(" ")} exited with code ${exitCode}`,
          ),
        );
        return;
      }

      resolve(stdout);
    });
  });
}

function runCommandWithInput(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (verbose) {
        process.stdout.write(chunk);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (verbose) {
        process.stderr.write(chunk);
      }
    });
    child.stdin.setDefaultEncoding("utf8");
    child.stdin.write(input);
    child.stdin.end();
    child.on("close", (code, signal) => {
      if (signal) {
        reject(
          new Error(
            `Command ${command} ${args.join(" ")} terminated with signal ${signal}`,
          ),
        );
        return;
      }

      const exitCode = code ?? 0;
      if (exitCode !== 0) {
        if (!verbose) {
          if (stdout) {
            process.stdout.write(stdout);
          }
          if (stderr) {
            process.stderr.write(stderr);
          }
        }
        reject(
          new Error(
            `Command ${command} ${args.join(" ")} exited with code ${exitCode}`,
          ),
        );
        return;
      }

      resolve({ exitCode, stdout, stderr });
    });
  });
}

function extractOxlintDiagnostics(json) {
  if (Array.isArray(json)) {
    return json;
  }

  if (json && Array.isArray(json.diagnostics)) {
    return json.diagnostics;
  }

  return null;
}

function getSummaryLine(output) {
  if (!output) {
    return null;
  }

  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines[lines.length - 1] : null;
}

function summarizeKnip(result) {
  const lines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const summaryParts = [];
  for (const line of lines) {
    const match = line.match(/^(.+?)\s*\((\d+)\)$/);
    if (match) {
      summaryParts.push(`${match[1]} (${match[2]})`);
    }
  }

  if (summaryParts.length > 0) {
    return summaryParts.join(", ");
  }

  return null;
}

function printCommandSummary(label, result, { summaryExtractor } = {}) {
  let summary = null;
  if (summaryExtractor) {
    summary = summaryExtractor(result);
  }

  if (!summary) {
    summary = getSummaryLine(result.stdout) ?? getSummaryLine(result.stderr);
  }

  const exitSuffix = result.exitCode ? ` (exit ${result.exitCode})` : "";
  console.log(`[run-knip] ${label}: ${summary ?? "no output"}${exitSuffix}`);
}

async function runOxlintAndRemoveUnused() {
  const oxlintArgs = [
    "oxlint",
    "-A",
    "all",
    "-D",
    "no-unused-vars",
    "-f",
    "json",
    generatedTypesRelativePath,
  ];
  const output = await captureStdout("pnpm", oxlintArgs, {
    allowedExitCodes: new Set([0, 1]),
  });
  const trimmed = output.trim();
  if (!trimmed) {
    logVerbose(
      "[run-knip] oxlint found no unused vars; skipping remove-unused-vars.",
    );
    return { diagnosticsCount: 0 };
  }

  let parsedOutput;
  try {
    parsedOutput = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      `[run-knip] Failed to parse oxlint output: ${error.message}`,
    );
  }

  const diagnostics = extractOxlintDiagnostics(parsedOutput);
  if (!diagnostics || diagnostics.length === 0) {
    logVerbose(
      "[run-knip] oxlint found no unused vars; skipping remove-unused-vars.",
    );
    return { diagnosticsCount: 0 };
  }

  const removeResult = await runCommandWithInput(
    "pnpm",
    ["remove-unused-vars"],
    JSON.stringify(parsedOutput),
  );
  return { diagnosticsCount: diagnostics.length, removeResult };
}

async function main() {
  if (!existsSync(generatedTypesPath)) {
    logVerbose(
      `[run-knip] ${generatedTypesRelativePath} does not exist; continuing anyway.`,
    );
  }

  let previousHash = hashFile(generatedTypesPath);

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    console.log(`[run-knip] iteration ${iteration}`);
    const firstKnipResult = await runCommand("pnpm", knipFixArgs, {
      ignoreFailure: true,
    });
    printCommandSummary("knip (pre-oxlint)", firstKnipResult, {
      summaryExtractor: summarizeKnip,
    });

    const oxlintSummary = await runOxlintAndRemoveUnused();
    console.log(
      `[run-knip] oxlint: ${oxlintSummary.diagnosticsCount} diagnostic${
        oxlintSummary.diagnosticsCount === 1 ? "" : "s"
      }`,
    );
    if (oxlintSummary.removeResult) {
      printCommandSummary("remove-unused-vars", oxlintSummary.removeResult);
    }

    const secondKnipResult = await runCommand("pnpm", knipFixArgs, {
      ignoreFailure: true,
    });
    printCommandSummary("knip (post-oxlint)", secondKnipResult, {
      summaryExtractor: summarizeKnip,
    });

    const newHash = hashFile(generatedTypesPath);
    if (newHash === previousHash) {
      const successMessage = `[run-knip] Success after ${iteration} iteration${iteration === 1 ? "" : "s"}.`;
      console.log(successMessage);
      return;
    }

    previousHash = newHash;
  }

  throw new Error(
    `[run-knip] generatedTypes kept changing after ${maxIterations} iterations.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
