export type WorkspaceRootEntry = {
  name: string;
  type: string;
};

const PYTHON_ROOT_MARKER_FILES = new Set<string>([
  "pyproject.toml",
  "requirements.txt",
  "requirements-dev.txt",
  "setup.py",
  "setup.cfg",
  "Pipfile",
  "tox.ini",
  "poetry.lock",
  "uv.lock",
]);

export function hasPythonSignalsInRoot(entries: WorkspaceRootEntry[]): boolean {
  for (const entry of entries) {
    if (entry.type !== "file") {
      continue;
    }
    const lowerName = entry.name.toLowerCase();
    if (lowerName.endsWith(".py")) {
      return true;
    }
    if (PYTHON_ROOT_MARKER_FILES.has(lowerName)) {
      return true;
    }
  }
  return false;
}

export function getCachedWorkspacePythonSignal(
  cache: Map<string, boolean>,
  rootPath: string,
): boolean | null {
  if (!cache.has(rootPath)) {
    return null;
  }
  const cached = cache.get(rootPath);
  if (typeof cached !== "boolean") {
    return null;
  }
  return cached;
}

export function setCachedWorkspacePythonSignal(
  cache: Map<string, boolean>,
  rootPath: string,
  hasPython: boolean,
): void {
  cache.set(rootPath, hasPython);
}
