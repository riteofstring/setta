import { useEffect, useMemo, useRef, useState } from "react";
import { FiAlertCircle, FiAlertTriangle, FiInfo } from "react-icons/fi";
import type { WorkspaceSectionItemTree } from "../document/types.js";
import {
  getHighestWorkspaceItemDiagnosticSeverity,
  getWorkspaceItemDiagnosticCountSummary,
  getWorkspaceItemDiagnosticLabel,
  type WorkspaceItemDiagnostic,
  type WorkspaceItemDiagnosticRegistry,
  type WorkspaceItemDiagnosticSeverity,
} from "./itemDiagnostics.js";

type DiagnosticAnnouncementEntry = WorkspaceItemDiagnostic & {
  diagnosticOccurrence: number;
  itemId: string;
  itemLabel: string;
};

function getSeverityLabel(severity: WorkspaceItemDiagnosticSeverity): string {
  if (severity === "info") {
    return "Information";
  }
  return severity === "error" ? "Error" : "Warning";
}

function DiagnosticIcon({
  severity,
}: {
  severity: WorkspaceItemDiagnosticSeverity;
}) {
  const props = {
    "aria-hidden": true,
    className: "h-3.5 w-3.5 shrink-0",
    focusable: "false",
  } as const;
  if (severity === "error") {
    return <FiAlertCircle {...props} />;
  }
  if (severity === "warning") {
    return <FiAlertTriangle {...props} />;
  }
  return <FiInfo {...props} />;
}

function getSeverityClassName(
  severity: WorkspaceItemDiagnosticSeverity,
): string {
  if (severity === "error") {
    return "bg-red-500/80 text-white dark:bg-red-700/80";
  }
  if (severity === "warning") {
    return "bg-amber-400 text-amber-950 dark:bg-amber-500/80 dark:text-setta-950";
  }
  return "bg-sky-500/85 text-white dark:bg-sky-600/85";
}

function getAnnouncementEntryKey(entry: DiagnosticAnnouncementEntry): string {
  return JSON.stringify([
    entry.itemId,
    entry.severity,
    entry.message,
    entry.diagnosticOccurrence,
  ]);
}

function describeAnnouncementEntry(entry: DiagnosticAnnouncementEntry): string {
  return `${getSeverityLabel(entry.severity)} for ${entry.itemLabel}: ${entry.message}`;
}

function buildDiagnosticAnnouncement(
  previous: ReadonlyArray<DiagnosticAnnouncementEntry>,
  next: ReadonlyArray<DiagnosticAnnouncementEntry>,
): string {
  if (next.length === 0) {
    return previous.length === 0 ? "" : "Parameter diagnostics cleared.";
  }
  const previousKeys = new Set(previous.map(getAnnouncementEntryKey));
  const nextKeys = new Set(next.map(getAnnouncementEntryKey));
  const addedOrChanged = next.filter(
    (entry) => !previousKeys.has(getAnnouncementEntryKey(entry)),
  );
  const removed = previous.filter(
    (entry) => !nextKeys.has(getAnnouncementEntryKey(entry)),
  );
  if (addedOrChanged.length > 0) {
    const prefix =
      previous.length === 0
        ? "Parameter diagnostics available."
        : "Parameter diagnostics updated.";
    const described = addedOrChanged
      .slice(0, 2)
      .map(describeAnnouncementEntry)
      .join(" ");
    const remaining = addedOrChanged.length - 2;
    return `${prefix} ${described}${remaining > 0 ? ` ${remaining} more ${remaining === 1 ? "message" : "messages"}.` : ""}`;
  }
  if (removed.length > 0) {
    const labels = [...new Set(removed.map((entry) => entry.itemLabel))]
      .slice(0, 2)
      .join(" and ");
    return `Diagnostics cleared for ${labels}. ${getWorkspaceItemDiagnosticCountSummary(next)} ${next.length === 1 ? "remains" : "remain"}.`;
  }
  return "";
}

function collectAnnouncementEntries(
  diagnostics: WorkspaceItemDiagnosticRegistry,
  itemIds: ReadonlySet<string>,
  itemTree: WorkspaceSectionItemTree,
): Array<DiagnosticAnnouncementEntry> {
  const entries: Array<DiagnosticAnnouncementEntry> = [];
  for (const itemId of itemIds) {
    const item = itemTree.items[itemId];
    if (!item) {
      continue;
    }
    const itemLabel = getWorkspaceItemDiagnosticLabel(item);
    const occurrences = new Map<string, number>();
    for (const diagnostic of diagnostics[itemId] ?? []) {
      const occurrenceKey = JSON.stringify([
        diagnostic.severity,
        diagnostic.message,
      ]);
      const diagnosticOccurrence = occurrences.get(occurrenceKey) ?? 0;
      occurrences.set(occurrenceKey, diagnosticOccurrence + 1);
      entries.push({ ...diagnostic, diagnosticOccurrence, itemId, itemLabel });
    }
  }
  return entries;
}

export function WorkspaceItemDiagnosticAnnouncer({
  diagnostics,
  itemIds,
  itemTree,
}: {
  diagnostics: WorkspaceItemDiagnosticRegistry;
  itemIds: ReadonlySet<string>;
  itemTree: WorkspaceSectionItemTree;
}) {
  const entries = useMemo(
    () => collectAnnouncementEntries(diagnostics, itemIds, itemTree),
    [diagnostics, itemIds, itemTree],
  );
  const signature = JSON.stringify(entries);
  const previousEntriesRef = useRef<ReadonlyArray<DiagnosticAnnouncementEntry>>(
    [],
  );
  const previousSignatureRef = useRef("[]");
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (signature === previousSignatureRef.current) {
      return;
    }
    const nextAnnouncement = buildDiagnosticAnnouncement(
      previousEntriesRef.current,
      entries,
    );
    previousEntriesRef.current = entries;
    previousSignatureRef.current = signature;
    if (nextAnnouncement !== "") {
      setAnnouncement(nextAnnouncement);
    }
  }, [entries, signature]);

  return (
    <span
      className="sr-only"
      data-setta-workspace-item-diagnostic-announcer="true"
      role="status"
    >
      {announcement}
    </span>
  );
}

export function getWorkspaceItemDiagnosticTooltipContent(
  diagnostics: ReadonlyArray<WorkspaceItemDiagnostic>,
): string {
  const severityOrder: Record<WorkspaceItemDiagnosticSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };
  return [...diagnostics]
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .map(
      (diagnostic) =>
        `${getSeverityLabel(diagnostic.severity)}: ${diagnostic.message}`,
    )
    .join("\n\n");
}

export function WorkspaceItemDiagnostics({
  diagnostics,
}: {
  diagnostics: ReadonlyArray<WorkspaceItemDiagnostic>;
}) {
  const highestSeverity =
    getHighestWorkspaceItemDiagnosticSeverity(diagnostics);
  if (diagnostics.length === 0 || highestSeverity === null) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute end-0.5 top-px z-20 grid h-[18px] w-[18px] place-items-center rounded-full ${getSeverityClassName(highestSeverity)}`}
      data-setta-workspace-item-diagnostic-marker="true"
      data-setta-workspace-item-diagnostic-severity={highestSeverity}
    >
      <DiagnosticIcon severity={highestSeverity} />
    </span>
  );
}
