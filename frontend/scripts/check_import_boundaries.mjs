import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const SUPPORTED_SOURCE_FILE = /\.[jt]sx?$/;
const HOST_RUNTIME_FILE = /^frontend\/src\/.+\.[jt]sx?$/;
const PLUGIN_FRONTEND_FILE =
  /^plugins\/[^/]+\/frontend\/(?:src|tests)\/.+\.[jt]sx?$/;
const HOST_PLUGIN_FRONTEND_IMPORT =
  /^(?:\.\.\/)+plugins\/[^/]+\/frontend\/src(?:\/.*)?$/;
const PLUGIN_FRONTEND_HOST_ALIAS_IMPORT =
  /^(?:components|forks|openapi|plugins|state|testUtils|utils)(?:\/.*)?$/;

const normalizePath = (filePath) => filePath.split(path.sep).join("/");
const resolveRelativeModulePath = (filePath, specifier) =>
  normalizePath(
    path.posix.normalize(path.posix.join(path.posix.dirname(filePath), specifier)),
  );

const scriptKindForFilePath = (filePath) => {
  if (filePath.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (filePath.endsWith(".ts")) {
    return ts.ScriptKind.TS;
  }
  if (filePath.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  return ts.ScriptKind.JS;
};

const collectModuleSpecifiers = (source, filePath) => {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForFilePath(filePath),
  );
  const specifiers = [];

  const pushSpecifier = (moduleSpecifier) => {
    if (!moduleSpecifier || !ts.isStringLiteralLike(moduleSpecifier)) {
      return;
    }
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      moduleSpecifier.getStart(sourceFile),
    );

    specifiers.push({
      column: character + 1,
      line: line + 1,
      specifier: moduleSpecifier.text,
    });
  };

  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      pushSpecifier(node.moduleSpecifier);
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      pushSpecifier(node.moduleReference.expression);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      pushSpecifier(node.arguments[0]);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      pushSpecifier(node.argument.literal);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return specifiers;
};

export const findImportBoundaryViolations = (entries) => {
  const violations = [];

  for (const entry of entries) {
    const normalizedFilePath = normalizePath(entry.filePath);
    const specifiers = collectModuleSpecifiers(entry.source, normalizedFilePath);

    if (HOST_RUNTIME_FILE.test(normalizedFilePath)) {
      for (const imported of specifiers) {
        if (!HOST_PLUGIN_FRONTEND_IMPORT.test(imported.specifier)) {
          continue;
        }
        violations.push({
          ...imported,
          filePath: normalizedFilePath,
          message:
            "Host runtime frontend code must load plugin frontend code through runtime metadata instead of importing plugin source directly.",
        });
      }
    }

    if (!PLUGIN_FRONTEND_FILE.test(normalizedFilePath)) {
      continue;
    }
    const pluginRootMatch = normalizedFilePath.match(/^(plugins\/[^/]+)\//);
    for (const imported of specifiers) {
      if (PLUGIN_FRONTEND_HOST_ALIAS_IMPORT.test(imported.specifier)) {
        violations.push({
          ...imported,
          filePath: normalizedFilePath,
          message:
            "Plugin frontend code must use the published SDK or plugin-owned code instead of importing host source aliases.",
        });
        continue;
      }
      if (
        pluginRootMatch &&
        imported.specifier.startsWith(".") &&
        !resolveRelativeModulePath(
          normalizedFilePath,
          imported.specifier,
        ).startsWith(`${pluginRootMatch[1]}/`)
      ) {
        violations.push({
          ...imported,
          filePath: normalizedFilePath,
          message:
            "Plugin frontend code must not import repo-private host paths through relative specifiers. Use plugin-owned code or the published SDK instead.",
        });
      }
    }
  }

  return violations;
};

const expandTargetFiles = async (targetPath) => {
  const stats = await stat(targetPath);
  if (!stats.isDirectory()) {
    return [targetPath];
  }

  const entries = await readdir(targetPath, { withFileTypes: true });
  const expanded = [];
  for (const entry of entries) {
    const childPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      expanded.push(...(await expandTargetFiles(childPath)));
      continue;
    }
    if (entry.isFile()) {
      expanded.push(childPath);
    }
  }

  return expanded;
};

const resolveTargetFiles = async (targets) => {
  const files = [];

  for (const target of targets) {
    const expanded = await expandTargetFiles(path.resolve(target));
    for (const filePath of expanded) {
      if (!SUPPORTED_SOURCE_FILE.test(filePath)) {
        continue;
      }
      files.push(filePath);
    }
  }

  return [...new Set(files)];
};

const runCli = async () => {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  if (args.length === 0) {
    return 0;
  }

  const targetFiles = await resolveTargetFiles(args);
  const cwd = process.cwd();
  const entries = await Promise.all(
    targetFiles.map(async (filePath) => {
      const source = await readFile(filePath, "utf-8");
      return {
        filePath: normalizePath(path.relative(cwd, filePath)),
        source,
      };
    }),
  );
  const violations = findImportBoundaryViolations(entries);

  if (violations.length === 0) {
    return 0;
  }

  for (const violation of violations) {
    console.error(
      `${violation.filePath}:${violation.line}:${violation.column} ${violation.message} (${violation.specifier})`,
    );
  }

  return 1;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exitCode = await runCli();
  process.exit(exitCode);
}
