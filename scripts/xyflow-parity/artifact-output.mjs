import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
} from "node:fs";
import path from "node:path";

export function assertEmptyOutputDirectory(outputDir) {
  const parsed = path.parse(outputDir);
  if (outputDir === parsed.root) {
    throw new Error("--output-dir cannot be a filesystem root.");
  }
  const parentDirectory = path.dirname(outputDir);
  if (!existsSync(parentDirectory)) {
    throw new Error(
      `The parent directory for --output-dir does not exist: ${parentDirectory}.`,
    );
  }
  if (!statSync(parentDirectory).isDirectory()) {
    throw new Error(
      `The parent directory for --output-dir must be a directory: ${parentDirectory}.`,
    );
  }
  if (!existsSync(outputDir)) {
    return;
  }
  const status = lstatSync(outputDir);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new Error(
      `--output-dir must be a real directory when it already exists: ${outputDir}.`,
    );
  }
  if (readdirSync(outputDir).length > 0) {
    throw new Error(
      `--output-dir must be empty. Refusing to overwrite artifacts: ${outputDir}.`,
    );
  }
}

export function createStagingDirectory(outputDir) {
  return mkdtempSync(
    path.join(path.dirname(outputDir), `.${path.basename(outputDir)}.staging-`),
  );
}

export function promoteStagingDirectory(stagingDirectory, outputDir) {
  assertEmptyOutputDirectory(outputDir);
  if (existsSync(outputDir)) {
    rmdirSync(outputDir);
  }
  renameSync(stagingDirectory, outputDir);
}
