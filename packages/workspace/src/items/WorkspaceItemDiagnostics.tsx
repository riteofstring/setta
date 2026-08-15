import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { FiAlertCircle, FiAlertTriangle, FiInfo } from "react-icons/fi";
import { ControlPopover } from "../controls/popover/ControlPopover";
import type { WorkspaceSectionItemTree } from "../document/types";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
} from "../interaction";
import { getElementTextDirection, type WorkspaceTextDirection } from "../styles/textDirection";
import {
  getHighestWorkspaceItemDiagnosticSeverity,
  getWorkspaceItemDiagnosticCountSummary,
  getWorkspaceItemDiagnosticLabel,
  type WorkspaceItemDiagnostic,
  type WorkspaceItemDiagnosticRegistry,
  type WorkspaceItemDiagnosticSeverity,
} from "./itemDiagnostics";

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

function DiagnosticIcon({ severity }: { severity: WorkspaceItemDiagnosticSeverity }) {
  const props = { "aria-hidden": true, className: "h-4 w-4 shrink-0", focusable: "false" } as const;
  if (severity === "error") {
    return <FiAlertCircle {...props} />;
  }
  if (severity === "warning") {
    return <FiAlertTriangle {...props} />;
  }
  return <FiInfo {...props} />;
}

function getSeverityClassName(severity: WorkspaceItemDiagnosticSeverity): string {
  if (severity === "error") {
    return "border-red-300 text-red-700 dark:border-red-800 dark:text-red-300";
  }
  if (severity === "warning") {
    return "border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-300";
  }
  return "border-sky-300 text-sky-700 dark:border-sky-800 dark:text-sky-300";
}

function getAnnouncementEntryKey(entry: DiagnosticAnnouncementEntry): string {
  return JSON.stringify([entry.itemId, entry.severity, entry.message, entry.diagnosticOccurrence]);
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
  const addedOrChanged = next.filter((entry) => !previousKeys.has(getAnnouncementEntryKey(entry)));
  const removed = previous.filter((entry) => !nextKeys.has(getAnnouncementEntryKey(entry)));
  if (addedOrChanged.length > 0) {
    const prefix =
      previous.length === 0 ? "Parameter diagnostics available." : "Parameter diagnostics updated.";
    const described = addedOrChanged.slice(0, 2).map(describeAnnouncementEntry).join(" ");
    const remaining = addedOrChanged.length - 2;
    return `${prefix} ${described}${remaining > 0 ? ` ${remaining} more ${remaining === 1 ? "message" : "messages"}.` : ""}`;
  }
  if (removed.length > 0) {
    const labels = [...new Set(removed.map((entry) => entry.itemLabel))].slice(0, 2).join(" and ");
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
      const occurrenceKey = JSON.stringify([diagnostic.severity, diagnostic.message]);
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
  const previousEntriesRef = useRef<ReadonlyArray<DiagnosticAnnouncementEntry>>([]);
  const previousSignatureRef = useRef("[]");
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (signature === previousSignatureRef.current) {
      return;
    }
    const nextAnnouncement = buildDiagnosticAnnouncement(previousEntriesRef.current, entries);
    previousEntriesRef.current = entries;
    previousSignatureRef.current = signature;
    if (nextAnnouncement !== "") {
      setAnnouncement(nextAnnouncement);
    }
  }, [entries, signature]);

  return (
    <span className="sr-only" data-setta-workspace-item-diagnostic-announcer="true" role="status">
      {announcement}
    </span>
  );
}

function getDiagnosticDescription(diagnostics: ReadonlyArray<WorkspaceItemDiagnostic>): string {
  return diagnostics
    .map((diagnostic) => `${getSeverityLabel(diagnostic.severity)}: ${diagnostic.message}`)
    .join(" ");
}

export function WorkspaceItemDiagnostics({
  diagnostics,
  itemLabel,
  rowRef,
}: {
  diagnostics: ReadonlyArray<WorkspaceItemDiagnostic>;
  itemLabel: string;
  rowRef: RefObject<HTMLDivElement | null>;
}) {
  const [displayedDiagnostics, setDisplayedDiagnostics] = useState(diagnostics);
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<WorkspaceTextDirection>("ltr");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const instanceId = useId().replaceAll(":", "");
  const descriptionId = `setta-item-diagnostics-description-${instanceId}`;
  const titleId = `setta-item-diagnostics-title-${instanceId}`;
  const incomingSignature = JSON.stringify(diagnostics);
  const displayedSignature = JSON.stringify(displayedDiagnostics);

  // Keep a focused trigger mounted for one layout phase when its last diagnostic clears. This
  // lets the package move focus to the stable row before removing the ephemeral control.
  useLayoutEffect(() => {
    if (incomingSignature === displayedSignature) {
      return;
    }
    if (diagnostics.length === 0) {
      setOpen(false);
      if (document.activeElement === triggerRef.current) {
        rowRef.current?.focus({ preventScroll: true });
      }
    }
    setDisplayedDiagnostics(diagnostics);
  }, [diagnostics, displayedSignature, incomingSignature, rowRef]);

  const displayedHighestSeverity = getHighestWorkspaceItemDiagnosticSeverity(displayedDiagnostics);
  if (displayedDiagnostics.length === 0 || displayedHighestSeverity === null) {
    return null;
  }

  const resolvedLabel = itemLabel.trim() || "unnamed parameter";
  const countSummary = getWorkspaceItemDiagnosticCountSummary(displayedDiagnostics);

  function handleOpenChange(nextOpen: boolean): void {
    if (nextOpen && triggerRef.current) {
      setDirection(getElementTextDirection(triggerRef.current));
    }
    setOpen(nextOpen);
  }

  return (
    <>
      <ControlPopover
        contentClasses="z-[90] box-border max-h-[calc(100vh-1rem)] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-setta-200 bg-white p-3 text-sm leading-5 text-setta-700 shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-setta-700 dark:bg-setta-950 dark:text-setta-300"
        contentProps={{
          align: "end",
          "aria-labelledby": titleId,
          collisionPadding: 8,
          onCloseAutoFocus: (event) => event.preventDefault(),
          onOpenAutoFocus: (event) => event.preventDefault(),
          side: "top",
          sideOffset: 6,
        }}
        direction={direction}
        onOpenChange={handleOpenChange}
        open={open}
        trigger={
          <button
            aria-describedby={descriptionId}
            aria-label={`Show diagnostics for ${resolvedLabel}: ${countSummary}`}
            className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION} absolute end-0.5 top-0 z-20 grid h-6 w-6 place-items-center rounded-full border bg-white/90 p-0 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-1 dark:bg-setta-950/90 ${getSeverityClassName(displayedHighestSeverity)}`}
            data-tab-native="true"
            data-setta-workspace-item-diagnostic-severity={displayedHighestSeverity}
            data-setta-workspace-item-diagnostic-trigger="true"
            data-setta-workspace-touch-target="compact"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            ref={triggerRef}
            type="button"
          >
            <DiagnosticIcon severity={displayedHighestSeverity} />
          </button>
        }
      >
        <p className="mb-2 font-semibold text-setta-800 dark:text-setta-200" id={titleId}>
          Diagnostics for {resolvedLabel}
        </p>
        <ul className="flex min-w-0 flex-col gap-2">
          {displayedDiagnostics.map((diagnostic, index) => (
            <li
              className={`flex min-w-0 items-start gap-2 rounded-md border p-2 ${getSeverityClassName(diagnostic.severity)}`}
              data-setta-workspace-item-diagnostic-message={diagnostic.severity}
              key={`${diagnostic.severity}:${diagnostic.message}:${index}`}
            >
              <DiagnosticIcon severity={diagnostic.severity} />
              <div className="min-w-0">
                <p className="font-semibold">{getSeverityLabel(diagnostic.severity)}</p>
                <p className="whitespace-pre-wrap break-words text-setta-700 dark:text-setta-300">
                  {diagnostic.message}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </ControlPopover>
      <span className="sr-only" id={descriptionId}>
        {getDiagnosticDescription(displayedDiagnostics)}
      </span>
    </>
  );
}
