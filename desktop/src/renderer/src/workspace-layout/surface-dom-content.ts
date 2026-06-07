import type { WorkspacePane, SurfaceKind } from "./types";

export interface EmptyFrameOption {
  disabled?: boolean;
  label: string;
  meta?: string;
  surfaceKind: SurfaceKind;
}

export function renderFakePaneContent(
  host: HTMLElement,
  pane: WorkspacePane,
  rowCount: number,
): HTMLElement {
  const document = host.ownerDocument;
  const content = document.createElement("div");
  content.className = "workspace-pane-content";
  content.dataset.workspaceSurfaceContent = "true";

  const header = document.createElement("div");
  header.className = "workspace-pane-header";

  const index = document.createElement("span");
  index.className = "workspace-pane-index";
  index.dataset.workspacePaneIndex = "";
  index.textContent = String(pane.sequence + 1);

  const titleBlock = document.createElement("div");
  titleBlock.className = "min-w-0";

  const title = document.createElement("h2");
  title.dataset.workspacePaneTitle = "";
  title.textContent = pane.title;

  const subtitle = document.createElement("p");
  subtitle.dataset.workspacePaneSubtitle = "";
  subtitle.textContent = pane.subtitle;

  titleBlock.append(title, subtitle);
  header.append(index, titleBlock);

  const meter = document.createElement("div");
  meter.className = "workspace-pane-meter";
  const meterLabel = document.createElement("span");
  meterLabel.textContent = pane.surfaceKind === "fake-heavy-dom" ? "heavy" : "load";
  const meterValue = document.createElement("strong");
  meterValue.dataset.workspacePaneHeat = "";
  meterValue.textContent = `${pane.heat}%`;
  meter.append(meterLabel, meterValue);

  const rows = document.createElement("div");
  rows.className = "workspace-pane-rows";
  rows.setAttribute("aria-hidden", "true");
  const boundedRowCount = Math.max(1, rowCount);
  for (let index = 0; index < boundedRowCount; index += 1) {
    const row = document.createElement("span");
    row.style.width = `${46 + ((pane.sequence + index * 7) % 48)}%`;
    rows.append(row);
  }

  content.append(header, meter, rows);
  return content;
}

export function renderEmptyFrameContent(
  host: HTMLElement,
  pane: WorkspacePane,
  options: readonly EmptyFrameOption[],
): HTMLElement {
  const document = host.ownerDocument;
  const content = document.createElement("div");
  content.className = "workspace-pane-content workspace-empty-frame-surface";
  content.dataset.workspaceSurfaceContent = "true";

  const header = document.createElement("div");
  header.className = "workspace-empty-frame-header";
  const title = document.createElement("h2");
  title.dataset.workspacePaneTitle = "";
  title.textContent = pane.title;
  const subtitle = document.createElement("p");
  subtitle.dataset.workspacePaneSubtitle = "";
  subtitle.textContent = pane.subtitle;
  header.append(title, subtitle);

  const actions = document.createElement("div");
  actions.className = "workspace-empty-frame-actions";
  actions.setAttribute("aria-label", "Create pane in this frame");
  for (const option of options) {
    const button = document.createElement("button");
    button.className = "workspace-empty-frame-action";
    button.dataset.workspaceEmptyFrameAction = "true";
    button.dataset.surfaceKind = option.surfaceKind;
    button.disabled = option.disabled ?? false;
    button.type = "button";
    button.title = button.disabled ? `${option.label} limit reached` : option.label;

    const label = document.createElement("span");
    label.className = "workspace-empty-frame-action-label";
    label.textContent = option.label;
    button.append(label);
    if (option.meta) {
      const meta = document.createElement("span");
      meta.className = "workspace-empty-frame-action-meta";
      meta.textContent = option.meta;
      button.append(meta);
    }
    actions.append(button);
  }

  content.append(header, actions);
  return content;
}

export function renderSnapshotContent(
  host: HTMLElement,
  pane: WorkspacePane,
  texture: HTMLElement | null,
  staticFallback: boolean,
): HTMLElement {
  const document = host.ownerDocument;
  const content = document.createElement("div");
  content.className = "workspace-pane-content workspace-snapshot-surface";
  if (texture) {
    content.append(texture);
    return content;
  }
  const fallbackTexture = staticFallback ? renderStaticSnapshotTexture(host, pane) : null;
  if (fallbackTexture) {
    content.append(fallbackTexture);
    return content;
  }
  const label = document.createElement("div");
  label.className = "workspace-snapshot-label";
  label.textContent = pane.title;
  const state = document.createElement("div");
  state.className = "workspace-snapshot-state";
  state.textContent = "snapshot";
  content.append(label, state);
  return content;
}

export function cloneSnapshotNode(node: Element, document: Document): Element {
  if (typeof node.cloneNode !== "function") {
    const fallback = document.createElement("div");
    fallback.className = (node as HTMLElement).className;
    fallback.textContent = node.textContent ?? "";
    return fallback;
  }
  const clone = node.cloneNode(true) as Element;
  copyCanvasBitmaps(node, clone);
  return clone;
}

function renderStaticSnapshotTexture(host: HTMLElement, pane: WorkspacePane): HTMLElement | null {
  return staticSnapshotRenderers[pane.surfaceKind](host, pane);
}

type StaticSnapshotRenderer = (host: HTMLElement, pane: WorkspacePane) => HTMLElement | null;

const staticSnapshotRenderers = {
  browser: renderWrappedStaticBrowserSnapshot,
  "chat-dom": renderWrappedGenericSnapshot,
  "empty-frame": renderWrappedEmptyFrameSnapshot,
  "fake-dom": renderWrappedGenericSnapshot,
  "fake-heavy-dom": renderWrappedGenericSnapshot,
  "fake-long-chat": renderWrappedGenericSnapshot,
  "fake-terminal": renderWrappedGenericSnapshot,
  "git-graph": renderWrappedGenericSnapshot,
  "workflow-graph": () => null,
  "settings-dom": renderWrappedGenericSnapshot,
  snapshot: () => null,
  terminal: renderWrappedTerminalSnapshot,
  "workflow-node-details": renderWrappedGenericSnapshot,
  "workflow-settings": renderWrappedGenericSnapshot,
} satisfies Record<SurfaceKind, StaticSnapshotRenderer>;

function renderWrappedStaticBrowserSnapshot(host: HTMLElement, pane: WorkspacePane): HTMLElement {
  return wrapStaticSnapshotTexture(host, renderStaticBrowserSnapshot(host, pane));
}

function renderWrappedGenericSnapshot(host: HTMLElement, pane: WorkspacePane): HTMLElement {
  const rowCount = pane.surfaceKind === "fake-terminal" ? 12 : 4;
  return wrapStaticSnapshotTexture(host, renderFakePaneContent(host, pane, rowCount));
}

function renderWrappedTerminalSnapshot(host: HTMLElement): HTMLElement {
  return wrapStaticSnapshotTexture(host, renderStaticTerminalSnapshot(host));
}

function renderWrappedEmptyFrameSnapshot(host: HTMLElement, pane: WorkspacePane): HTMLElement {
  return wrapStaticSnapshotTexture(host, renderEmptyFrameContent(host, pane, []));
}

function wrapStaticSnapshotTexture(host: HTMLElement, child: HTMLElement): HTMLElement {
  const texture = host.ownerDocument.createElement("div");
  texture.className = "workspace-snapshot-texture";
  texture.append(child);
  return texture;
}

function renderStaticBrowserSnapshot(host: HTMLElement, pane: WorkspacePane): HTMLElement {
  const document = host.ownerDocument;
  const content = document.createElement("div");
  content.className = "workspace-pane-content workspace-browser-proxy-surface";
  const toolbar = document.createElement("div");
  toolbar.className = "workspace-browser-proxy-toolbar";
  toolbar.textContent = `setta://browser/${pane.sequence}`;
  const title = document.createElement("h2");
  title.textContent = pane.title;
  const subtitle = document.createElement("p");
  subtitle.textContent = pane.subtitle;

  const rowOne = document.createElement("div");
  rowOne.className = "workspace-browser-proxy-row";
  rowOne.style.width = "82%";

  const rowTwo = document.createElement("div");
  rowTwo.className = "workspace-browser-proxy-row";
  rowTwo.style.width = "64%";

  const rowThree = document.createElement("div");
  rowThree.className = "workspace-browser-proxy-row";
  rowThree.style.width = "72%";

  content.append(toolbar, title, subtitle, rowOne, rowTwo, rowThree);
  return content;
}

function renderStaticTerminalSnapshot(host: HTMLElement): HTMLElement {
  const document = host.ownerDocument;
  const content = document.createElement("div");
  content.className = "workspace-pane-content workspace-terminal-surface";
  const status = document.createElement("span");
  status.className = "workspace-terminal-status";
  status.setAttribute("aria-live", "polite");
  status.setAttribute("data-terminal-status", "true");
  status.textContent = "snapshot";
  content.append(status);
  return content;
}

function copyCanvasBitmaps(sourceRoot: Element, cloneRoot: Element): void {
  if (typeof HTMLCanvasElement === "undefined") {
    return;
  }
  const sourceCanvases =
    sourceRoot instanceof HTMLCanvasElement
      ? [sourceRoot]
      : Array.from(sourceRoot.querySelectorAll("canvas"));
  const cloneCanvases =
    cloneRoot instanceof HTMLCanvasElement
      ? [cloneRoot]
      : Array.from(cloneRoot.querySelectorAll("canvas"));
  for (let index = 0; index < sourceCanvases.length; index += 1) {
    const sourceCanvas = sourceCanvases[index];
    const cloneCanvas = cloneCanvases[index];
    if (!sourceCanvas || !cloneCanvas) {
      continue;
    }
    cloneCanvas.width = sourceCanvas.width;
    cloneCanvas.height = sourceCanvas.height;
    cloneCanvas.getContext("2d")?.drawImage(sourceCanvas, 0, 0);
  }
}
