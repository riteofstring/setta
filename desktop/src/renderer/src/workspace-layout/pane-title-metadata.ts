import type { SurfaceKind, WorkspacePane } from "./types";

type PaneTitleTruncation = "end" | "start";

export interface PaneChromeTitleModel {
  fullTitle: string;
  icon: PaneChromeIconName;
  title: string;
  truncation: PaneTitleTruncation;
}

export type PaneChromeIconName =
  | "chat"
  | "document"
  | "network"
  | "settings"
  | "sparkles"
  | "terminal"
  | "workflow";

interface PaneTitleOverride {
  fullTitle?: string;
  title: string;
  truncation?: PaneTitleTruncation;
}

const fallbackTitle = "Pane";
const terminalFallbackTitle = "Terminal";
const chatFallbackTitle = "Chat";
const paneChromeIconsBySurfaceKind: Partial<Record<SurfaceKind, PaneChromeIconName>> = {
  "chat-dom": "chat",
  "easy-button": "sparkles",
  "fake-long-chat": "chat",
  "fake-terminal": "terminal",
  "git-graph": "network",
  "semantic-node-details": "network",
  "settings-dom": "settings",
  terminal: "terminal",
  "workflow-graph": "workflow",
  "workflow-node-details": "workflow",
  "workflow-settings": "workflow",
};

export function paneChromeTitleModel(
  pane: WorkspacePane,
  override: PaneTitleOverride | null = null,
): PaneChromeTitleModel {
  const title = nonEmptyTitle(override?.title) ?? defaultPaneTitle(pane);
  return {
    fullTitle: nonEmptyTitle(override?.fullTitle) ?? title,
    icon: paneChromeIconName(pane.surfaceKind),
    title,
    truncation: override?.truncation ?? defaultPaneTitleTruncation(pane.surfaceKind),
  };
}

export function terminalPaneTitle(cwd: string): PaneTitleOverride {
  const title = nonEmptyTitle(cwd) ?? terminalFallbackTitle;
  return {
    fullTitle: title,
    title,
    truncation: "start",
  };
}

export function chatPaneTitle(title: string): PaneTitleOverride {
  const normalized = nonEmptyTitle(title) ?? chatFallbackTitle;
  return {
    fullTitle: normalized,
    title: normalized,
    truncation: "end",
  };
}

export function paneTitleOverrideFromHost(host: HTMLElement): PaneTitleOverride | null {
  const title = nonEmptyTitle(host.dataset.workspacePaneChromeTitle);
  if (!title) {
    return null;
  }
  return {
    fullTitle: nonEmptyTitle(host.dataset.workspacePaneChromeFullTitle) ?? title,
    title,
    truncation: paneTitleTruncation(host.dataset.workspacePaneChromeTruncation),
  };
}

export function setHostPaneChromeTitle(host: HTMLElement, override: PaneTitleOverride): void {
  const title = nonEmptyTitle(override.title) ?? fallbackTitle;
  host.dataset.workspacePaneChromeTitle = title;
  host.dataset.workspacePaneChromeFullTitle = nonEmptyTitle(override.fullTitle) ?? title;
  host.dataset.workspacePaneChromeTruncation = override.truncation ?? "end";
  syncExistingPaneTitle(host, {
    fullTitle: host.dataset.workspacePaneChromeFullTitle,
    icon: paneChromeIconName(surfaceKindFromHost(host)),
    title,
    truncation: override.truncation ?? "end",
  });
}

export function syncPaneTitleElement(root: ParentNode, model: PaneChromeTitleModel): void {
  const text = elementWithClass(root, "workspace-pane-title");
  if (!isTitleTextElement(text)) {
    return;
  }
  text.textContent = model.title;
  text.title = model.fullTitle;
  text.dataset.workspacePaneTitle = "";
  text.dataset.workspacePaneTitleTruncation = model.truncation;
}

function paneChromeIconName(surfaceKind: SurfaceKind | string): PaneChromeIconName {
  return paneChromeIconsBySurfaceKind[surfaceKind as SurfaceKind] ?? "document";
}

function syncExistingPaneTitle(host: HTMLElement, model: PaneChromeTitleModel): void {
  syncPaneTitleElement(host, model);
}

function elementWithClass(root: ParentNode, className: string): Element | null {
  const queried = root.querySelector?.(`.${className}`);
  if (queried) {
    return queried;
  }
  return findChildWithClass(root, className);
}

function findChildWithClass(root: ParentNode, className: string): Element | null {
  const children = Array.from(
    (root as ParentNode & { children?: HTMLCollectionOf<Element> | Element[] }).children ?? [],
  );
  for (const child of children) {
    if (child.classList.contains(className)) {
      return child;
    }
    const descendant = findChildWithClass(child, className);
    if (descendant) {
      return descendant;
    }
  }
  return null;
}

function defaultPaneTitle(pane: WorkspacePane): string {
  if (pane.surfaceKind === "terminal") {
    return (
      nonEmptyTitle(pane.terminalConfig?.cwdOverride) ??
      nonEmptyTitle(pane.title) ??
      terminalFallbackTitle
    );
  }
  return nonEmptyTitle(pane.title) ?? fallbackTitle;
}

function defaultPaneTitleTruncation(surfaceKind: SurfaceKind): PaneTitleTruncation {
  return surfaceKind === "terminal" || surfaceKind === "fake-terminal" ? "start" : "end";
}

function paneTitleTruncation(value: string | undefined): PaneTitleTruncation {
  return value === "start" ? "start" : "end";
}

function surfaceKindFromHost(host: HTMLElement): SurfaceKind | string {
  return host.dataset.surfaceKind ?? "";
}

function nonEmptyTitle(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized === "" ? null : normalized;
}

function isTitleTextElement(element: Element | null): element is HTMLElement {
  return element !== null && "dataset" in element && "textContent" in element && "title" in element;
}
