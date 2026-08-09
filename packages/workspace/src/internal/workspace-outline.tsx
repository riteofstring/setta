import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  getWorkspaceSectionOrder,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspaceJsonValue,
} from "../core.js";

import { isDenseArray } from "./runtime-option-validation.js";

export type WorkspaceOutlineProps<TSectionData = WorkspaceJsonValue> = Omit<
  HTMLAttributes<HTMLElement>,
  "aria-label" | "children"
> &
  Readonly<{
    ariaLabel?: string;
    controller: WorkspaceController<TSectionData>;
    defaultExpandedSectionIds?: readonly string[];
    emptyState?: ReactNode;
    heading?: string;
  }>;

export type WorkspaceOutlineRow = Readonly<{
  expanded: boolean;
  hasChildren: boolean;
  level: number;
  parentSectionId: string | null;
  positionInSet: number;
  sectionId: string;
  setSize: number;
  title: string;
}>;

type PendingWorkspaceOutlineRow = Readonly<{
  level: number;
  parentSectionId: string | null;
  positionInSet: number;
  sectionId: string;
  setSize: number;
}>;

export type WorkspaceOutlineKeyboardAction =
  | Readonly<{ sectionId: string; type: "collapse" | "expand" | "focus" }>
  | Readonly<{ type: "activate" }>;

const workspaceOutlineKeys = new Set([
  " ",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Enter",
  "Home",
]);

function assertNonEmptyText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
}

function pendingWorkspaceOutlineRows(
  sectionIds: readonly string[],
  parentSectionId: string | null,
  level: number,
): readonly PendingWorkspaceOutlineRow[] {
  return sectionIds.map((sectionId, index) => ({
    level,
    parentSectionId,
    positionInSet: index + 1,
    sectionId,
    setSize: sectionIds.length,
  }));
}

export function resolveWorkspaceOutlineRows(
  document: WorkspaceDocument<unknown>,
  expandedSectionIds: readonly string[],
): readonly WorkspaceOutlineRow[] {
  getWorkspaceSectionOrder(document);
  const expanded = new Set(expandedSectionIds);
  const rootIds = document.rootSections.map(({ sectionId }) => sectionId);
  const pending = [...pendingWorkspaceOutlineRows(rootIds, null, 1)].reverse();
  const rows: WorkspaceOutlineRow[] = [];
  while (pending.length > 0) {
    const candidate = pending.pop();
    if (!candidate) continue;
    const section = document.sections[candidate.sectionId];
    if (!section) {
      throw new TypeError(
        `Workspace outline section ${JSON.stringify(candidate.sectionId)} is missing.`,
      );
    }
    const childIds = section.childLayout?.sectionIds ?? [];
    const rowExpanded = childIds.length > 0 && expanded.has(section.id);
    rows.push({
      ...candidate,
      expanded: rowExpanded,
      hasChildren: childIds.length > 0,
      title: section.title,
    });
    if (rowExpanded) {
      pending.push(
        ...[...pendingWorkspaceOutlineRows(childIds, section.id, candidate.level + 1)].reverse(),
      );
    }
  }
  return rows;
}

function defaultWorkspaceOutlineExpansion(
  document: WorkspaceDocument<unknown>,
  value: readonly string[] | undefined,
): readonly string[] {
  const sectionOrder = getWorkspaceSectionOrder(document);
  if (value === undefined) {
    const rootIds = new Set(document.rootSections.map(({ sectionId }) => sectionId));
    return sectionOrder.filter(
      (sectionId) =>
        rootIds.has(sectionId) &&
        (document.sections[sectionId]?.childLayout?.sectionIds.length ?? 0) > 0,
    );
  }
  if (!isDenseArray(value)) {
    throw new TypeError(
      "Workspace outline default expanded section IDs must be a dense array without extra fields.",
    );
  }
  const requested = new Set<string>();
  for (const [index, sectionId] of value.entries()) {
    assertNonEmptyText(
      sectionId,
      `Workspace outline expanded section ID at index ${String(index)}`,
    );
    if (!document.sections[sectionId]) {
      throw new TypeError(
        `Workspace outline expanded section ID ${JSON.stringify(sectionId)} is unknown.`,
      );
    }
    if (requested.has(sectionId)) {
      throw new TypeError(
        `Workspace outline expanded section ID ${JSON.stringify(sectionId)} is duplicated.`,
      );
    }
    requested.add(sectionId);
  }
  return sectionOrder.filter((sectionId) => requested.has(sectionId));
}

function verticalWorkspaceOutlineAction(
  rows: readonly WorkspaceOutlineRow[],
  currentIndex: number,
  key: string,
): WorkspaceOutlineKeyboardAction | null {
  const targetIndexes: Readonly<Record<string, number | undefined>> = {
    ArrowDown: Math.min(rows.length - 1, currentIndex + 1),
    ArrowUp: Math.max(0, currentIndex - 1),
    End: rows.length - 1,
    Home: 0,
  };
  const targetIndex = targetIndexes[key];
  const target = targetIndex === undefined ? undefined : rows[targetIndex];
  return target ? { sectionId: target.sectionId, type: "focus" } : null;
}

function horizontalWorkspaceOutlineAction(
  rows: readonly WorkspaceOutlineRow[],
  currentIndex: number,
  key: string,
  direction: "ltr" | "rtl",
): WorkspaceOutlineKeyboardAction | null {
  const row = rows[currentIndex];
  if (!row) return null;
  const expandKey = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
  const collapseKey = direction === "rtl" ? "ArrowRight" : "ArrowLeft";
  if (key === expandKey) return forwardWorkspaceOutlineAction(rows, currentIndex, row);
  return key === collapseKey ? backwardWorkspaceOutlineAction(row) : null;
}

function forwardWorkspaceOutlineAction(
  rows: readonly WorkspaceOutlineRow[],
  currentIndex: number,
  row: WorkspaceOutlineRow,
): WorkspaceOutlineKeyboardAction | null {
  if (row.hasChildren && !row.expanded) {
    return { sectionId: row.sectionId, type: "expand" };
  }
  const child = rows[currentIndex + 1];
  return child?.parentSectionId === row.sectionId
    ? { sectionId: child.sectionId, type: "focus" }
    : null;
}

function backwardWorkspaceOutlineAction(
  row: WorkspaceOutlineRow,
): WorkspaceOutlineKeyboardAction | null {
  if (row.expanded) return { sectionId: row.sectionId, type: "collapse" };
  return row.parentSectionId ? { sectionId: row.parentSectionId, type: "focus" } : null;
}

export function planWorkspaceOutlineKeyboardAction(
  rows: readonly WorkspaceOutlineRow[],
  sectionId: string,
  key: string,
  direction: "ltr" | "rtl",
): WorkspaceOutlineKeyboardAction | null {
  const currentIndex = rows.findIndex((row) => row.sectionId === sectionId);
  if (currentIndex < 0) return null;
  const vertical = verticalWorkspaceOutlineAction(rows, currentIndex, key);
  if (vertical) return vertical;
  if (key === "Enter" || key === " ") return { type: "activate" };
  return horizontalWorkspaceOutlineAction(rows, currentIndex, key, direction);
}

function workspaceOutlineDirection(element: HTMLElement): "ltr" | "rtl" {
  return element.ownerDocument.defaultView?.getComputedStyle(element).direction === "rtl"
    ? "rtl"
    : "ltr";
}

function workspaceOutlineIndent(level: number): CSSProperties {
  return { "--setta-workspace-outline-depth": String(level - 1) } as CSSProperties;
}

function pluralizedSectionCount(count: number): string {
  return `${String(count)} ${count === 1 ? "section" : "sections"}`;
}

function selectionIsAdditive(
  event: Pick<ReactKeyboardEvent | ReactMouseEvent, "ctrlKey" | "metaKey" | "shiftKey">,
): boolean {
  return event.ctrlKey || event.metaKey || event.shiftKey;
}

function nextWorkspaceOutlineSelection<TSectionData>(
  controller: WorkspaceController<TSectionData>,
  sectionId: string,
): readonly string[] {
  const selected = controller.getSelectedSectionIds();
  return selected.includes(sectionId)
    ? selected.filter((selectedId) => selectedId !== sectionId)
    : [...selected, sectionId];
}

function workspaceOutlineSelectionAnnouncement(
  document: WorkspaceDocument<unknown>,
  sectionIds: readonly string[],
): string {
  if (sectionIds.length === 0) return "Selection cleared.";
  if (sectionIds.length > 1) return `${String(sectionIds.length)} sections selected.`;
  return `${document.sections[sectionIds[0] ?? ""]?.title ?? "Section"} selected.`;
}

function WorkspaceOutlineDisclosure({ expanded }: Readonly<{ expanded: boolean }>) {
  return (
    <span aria-hidden="true" className="setta-workspace__outline-disclosure">
      <svg fill="none" focusable="false" viewBox="0 0 20 20">
        <path d="m7.5 4.75 5.25 5.25-5.25 5.25" />
      </svg>
      <span className="setta-workspace__visually-hidden">{expanded ? "Collapse" : "Expand"}</span>
    </span>
  );
}

function WorkspaceOutlineLeafMarker() {
  return <span aria-hidden="true" className="setta-workspace__outline-leaf" />;
}

export function WorkspaceOutline<TSectionData = WorkspaceJsonValue>({
  ariaLabel = "Workspace outline",
  className,
  controller,
  defaultExpandedSectionIds,
  emptyState = "No sections to navigate.",
  heading = "Outline",
  ...props
}: WorkspaceOutlineProps<TSectionData>) {
  assertNonEmptyText(ariaLabel, "Workspace outline ariaLabel");
  assertNonEmptyText(heading, "Workspace outline heading");
  const document = controller.getDocument();
  const [expandedSectionIds, setExpandedSectionIds] = useState<readonly string[]>(() =>
    defaultWorkspaceOutlineExpansion(document, defaultExpandedSectionIds),
  );
  const rows = useMemo(
    () => resolveWorkspaceOutlineRows(document, expandedSectionIds),
    [document, expandedSectionIds],
  );
  const selectedSectionIds = controller.getSelectedSectionIds();
  const initiallyFocusableId =
    rows.find((row) => selectedSectionIds.includes(row.sectionId))?.sectionId ??
    rows[0]?.sectionId ??
    null;
  const [tabStopSectionId, setTabStopSectionId] = useState<string | null>(initiallyFocusableId);
  const [announcementText, setAnnouncementText] = useState("");
  const outlineElementsRef = useRef(new Map<string, HTMLLIElement>());
  const headingId = useId();
  const instructionsId = useId();

  useEffect(() => {
    if (rows.some((row) => row.sectionId === tabStopSectionId)) return;
    const nextId =
      rows.find((row) => selectedSectionIds.includes(row.sectionId))?.sectionId ??
      rows[0]?.sectionId ??
      null;
    setTabStopSectionId(nextId);
  }, [rows, selectedSectionIds, tabStopSectionId]);

  const registerOutlineItem = (sectionId: string, element: HTMLLIElement | null) => {
    if (element) outlineElementsRef.current.set(sectionId, element);
    else outlineElementsRef.current.delete(sectionId);
  };
  const focusOutlineItem = (sectionId: string) => {
    setTabStopSectionId(sectionId);
    outlineElementsRef.current.get(sectionId)?.focus();
  };
  const setExpanded = (sectionId: string, expanded: boolean) => {
    setExpandedSectionIds((current) => {
      const includes = current.includes(sectionId);
      if (includes === expanded) return current;
      return expanded
        ? [...current, sectionId]
        : current.filter((candidate) => candidate !== sectionId);
    });
  };
  const activateSection = (
    sectionId: string,
    event: Pick<ReactKeyboardEvent | ReactMouseEvent, "ctrlKey" | "metaKey" | "shiftKey">,
  ) => {
    if (selectionIsAdditive(event)) {
      const nextSelection = nextWorkspaceOutlineSelection(controller, sectionId);
      const result = controller.selectSections(nextSelection);
      setAnnouncementText(
        result.status === "rejected"
          ? "Unable to change the section selection."
          : workspaceOutlineSelectionAnnouncement(document, nextSelection),
      );
      return;
    }
    void controller.focusSection(sectionId);
  };
  const handleItemKeyDown = (
    row: WorkspaceOutlineRow,
    event: ReactKeyboardEvent<HTMLLIElement>,
  ) => {
    event.stopPropagation();
    if (workspaceOutlineKeys.has(event.key)) event.preventDefault();
    const action = planWorkspaceOutlineKeyboardAction(
      rows,
      row.sectionId,
      event.key,
      workspaceOutlineDirection(event.currentTarget),
    );
    if (!action) return;
    if (action.type === "focus") focusOutlineItem(action.sectionId);
    else if (action.type === "expand") setExpanded(action.sectionId, true);
    else if (action.type === "collapse") setExpanded(action.sectionId, false);
    else activateSection(row.sectionId, event);
  };
  const handleItemClick = (row: WorkspaceOutlineRow, event: ReactMouseEvent<HTMLLIElement>) => {
    event.stopPropagation();
    setTabStopSectionId(row.sectionId);
    if (
      row.hasChildren &&
      (event.target as Element).closest(".setta-workspace__outline-disclosure")
    ) {
      setExpanded(row.sectionId, !row.expanded);
      return;
    }
    activateSection(row.sectionId, event);
  };
  const resolvedClassName = ["setta-workspace__outline", className].filter(Boolean).join(" ");

  return (
    <nav {...props} aria-label={ariaLabel} className={resolvedClassName} data-workspace-outline="">
      <div className="setta-workspace__outline-heading">
        <h2 id={headingId}>{heading}</h2>
        <p>{pluralizedSectionCount(Object.keys(document.sections).length)}</p>
      </div>
      <p className="setta-workspace__visually-hidden" id={instructionsId}>
        Use arrow keys to navigate. Press Enter or Space to focus a section. Hold Control, Command,
        or Shift while activating to toggle selection.
      </p>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-outline-announcement=""
      >
        {announcementText}
      </div>
      {rows.length > 0 ? (
        <ul
          aria-describedby={instructionsId}
          aria-labelledby={headingId}
          aria-multiselectable="true"
          className="setta-workspace__outline-tree"
          role="tree"
        >
          {rows.map((row) => {
            const selected = selectedSectionIds.includes(row.sectionId);
            return (
              <li
                aria-expanded={row.hasChildren ? row.expanded : undefined}
                aria-level={row.level}
                aria-posinset={row.positionInSet}
                aria-selected={selected}
                aria-setsize={row.setSize}
                className="setta-workspace__outline-item"
                data-workspace-outline-section-id={row.sectionId}
                key={row.sectionId}
                onClick={(event) => handleItemClick(row, event)}
                onFocus={() => setTabStopSectionId(row.sectionId)}
                onKeyDown={(event) => handleItemKeyDown(row, event)}
                ref={(element) => registerOutlineItem(row.sectionId, element)}
                role="treeitem"
                style={workspaceOutlineIndent(row.level)}
                tabIndex={tabStopSectionId === row.sectionId ? 0 : -1}
              >
                {row.hasChildren ? (
                  <WorkspaceOutlineDisclosure expanded={row.expanded} />
                ) : (
                  <WorkspaceOutlineLeafMarker />
                )}
                <span className="setta-workspace__outline-title">{row.title}</span>
                <span
                  aria-hidden="true"
                  className="setta-workspace__outline-selected-mark"
                  data-selected={String(selected)}
                >
                  ✓
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="setta-workspace__outline-empty">{emptyState}</p>
      )}
    </nav>
  );
}
