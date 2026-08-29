import type { WorkspaceItem } from "../document/types";

export type WorkspaceItemDiagnosticSeverity = "error" | "warning" | "info";

export type WorkspaceItemDiagnostic = Readonly<{
  severity: WorkspaceItemDiagnosticSeverity;
  message: string;
}>;

// A list-scoped host input. Item ids are resolved against the list's section, so unrelated
// sections may use the same item id without sharing ephemeral validation state.
export type WorkspaceItemDiagnosticRegistry = Readonly<
  Record<string, ReadonlyArray<WorkspaceItemDiagnostic>>
>;

const EMPTY_WORKSPACE_ITEM_DIAGNOSTIC_REGISTRY: WorkspaceItemDiagnosticRegistry =
  Object.freeze({});

const DIAGNOSTIC_SEVERITIES = new Set<WorkspaceItemDiagnosticSeverity>([
  "error",
  "warning",
  "info",
]);

const DIAGNOSTIC_PRIORITY: Record<WorkspaceItemDiagnosticSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

type UnknownRecord = Record<string, unknown>;

function assertRecord(
  value: unknown,
  owner: string,
): asserts value is UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${owner} must be an object.`);
  }
}

function assertKnownDiagnosticFields(
  diagnostic: UnknownRecord,
  owner: string,
): void {
  const knownFields = new Set(["message", "severity"]);
  for (const field of Object.keys(diagnostic)) {
    if (!knownFields.has(field)) {
      throw new Error(`${owner} contains the unknown field ${field}.`);
    }
  }
}

function normalizeDiagnostic(
  value: unknown,
  owner: string,
): WorkspaceItemDiagnostic {
  assertRecord(value, owner);
  assertKnownDiagnosticFields(value, owner);
  if (
    typeof value["severity"] !== "string" ||
    !DIAGNOSTIC_SEVERITIES.has(
      value["severity"] as WorkspaceItemDiagnosticSeverity,
    )
  ) {
    throw new Error(
      `${owner} has unknown severity ${String(value["severity"])}.`,
    );
  }
  if (typeof value["message"] !== "string" || value["message"].trim() === "") {
    throw new Error(`${owner} requires a non-empty message.`);
  }
  return Object.freeze({
    severity: value["severity"] as WorkspaceItemDiagnosticSeverity,
    message: value["message"].trim(),
  });
}

// Parse the complete external registry before publishing any of it to row contexts. Diagnostics
// are intentionally absent from WorkspaceDocument; replacing this prop cannot mutate or notify the
// canonical document.
export function normalizeWorkspaceItemDiagnosticRegistry(
  registry: WorkspaceItemDiagnosticRegistry | undefined,
  sectionId: string,
  knownItemIds: ReadonlySet<string>,
): WorkspaceItemDiagnosticRegistry {
  if (registry === undefined) {
    return EMPTY_WORKSPACE_ITEM_DIAGNOSTIC_REGISTRY;
  }
  assertRecord(registry, `Item diagnostic registry for section ${sectionId}`);
  const normalized: Record<string, ReadonlyArray<WorkspaceItemDiagnostic>> = {};
  for (const [itemId, candidate] of Object.entries(registry)) {
    if (itemId.trim() === "") {
      throw new Error(
        `Item diagnostic registry for section ${sectionId} contains a blank item id.`,
      );
    }
    if (!knownItemIds.has(itemId)) {
      throw new Error(
        `Item diagnostic registry for section ${sectionId} names unknown item ${itemId}.`,
      );
    }
    if (!Array.isArray(candidate)) {
      throw new Error(
        `Diagnostics for ${sectionId}/${itemId} must be an array.`,
      );
    }
    Object.defineProperty(normalized, itemId, {
      configurable: false,
      enumerable: true,
      value: Object.freeze(
        candidate.map((diagnostic, index) =>
          normalizeDiagnostic(
            diagnostic,
            `Diagnostic ${sectionId}/${itemId}[${index}]`,
          ),
        ),
      ),
      writable: false,
    });
  }
  return Object.freeze(normalized);
}

export function getHighestWorkspaceItemDiagnosticSeverity(
  diagnostics: ReadonlyArray<WorkspaceItemDiagnostic>,
): WorkspaceItemDiagnosticSeverity | null {
  let highest: WorkspaceItemDiagnosticSeverity | null = null;
  for (const diagnostic of diagnostics) {
    if (
      highest === null ||
      DIAGNOSTIC_PRIORITY[diagnostic.severity] > DIAGNOSTIC_PRIORITY[highest]
    ) {
      highest = diagnostic.severity;
    }
  }
  return highest;
}

export function getWorkspaceItemDiagnosticLabel(item: WorkspaceItem): string {
  return item.presentation?.label.trim() || item.id;
}

export function getWorkspaceItemDiagnosticCountSummary(
  diagnostics: ReadonlyArray<WorkspaceItemDiagnostic>,
): string {
  const counts: Record<WorkspaceItemDiagnosticSeverity, number> = {
    error: 0,
    warning: 0,
    info: 0,
  };
  for (const diagnostic of diagnostics) {
    counts[diagnostic.severity] += 1;
  }
  const parts = [
    formatDiagnosticCount(counts.error, "error", "errors"),
    formatDiagnosticCount(counts.warning, "warning", "warnings"),
    formatDiagnosticCount(
      counts.info,
      "information message",
      "information messages",
    ),
  ].filter((part): part is string => part !== null);
  return joinDiagnosticCountParts(parts);
}

function formatDiagnosticCount(
  count: number,
  singular: string,
  plural: string,
): string | null {
  if (count === 0) {
    return null;
  }
  return `${count} ${count === 1 ? singular : plural}`;
}

function joinDiagnosticCountParts(parts: ReadonlyArray<string>): string {
  if (parts.length <= 1) {
    return parts[0] ?? "no diagnostics";
  }
  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }
  return `${parts[0]}, ${parts[1]}, and ${parts[2]}`;
}

export function getWorkspaceItemDiagnosticRowClassName(
  severity: WorkspaceItemDiagnosticSeverity | null,
): string {
  if (severity === "error") {
    return "bg-red-200 dark:bg-red-800/30";
  }
  if (severity === "warning") {
    return "bg-amber-100/60 dark:bg-amber-950/25";
  }
  if (severity === "info") {
    return "bg-sky-100/50 dark:bg-sky-950/20";
  }
  return "";
}
