import type { DesktopPlatform } from "@shared/types";
import type { ReactNode } from "react";
import { createRoot as createReactRoot, type Root } from "react-dom/client";

import { EasyButtonSurface } from "../features/easy-button/easy-button-surface";
import { requestEasyButtonPaneClose } from "../features/easy-button/easy-button-conversation-commands";
import type { AppShellMasterController } from "../features/global-master/app-shell-master-controller";
import {
  AppShellMasterPaneSurface,
  AppShellMasterPaneUnavailable,
} from "../features/global-master/app-shell-master-pane-surface";
import type { AppShellSpeechCaptureController } from "../features/global-speech/app-shell-speech-capture-controller";
import type { AppShellSpeechPlaybackController } from "../features/global-speech/app-shell-speech-playback-controller";
import type { GlobalSpeechPresentationSource } from "../features/global-speech/global-speech-presentation";
import type { SpeechCaptureRequester } from "../features/global-speech/speech-capture-destination";
import {
  applySnapshotScrollOffsets,
  cloneSnapshotNode,
  recordSnapshotScrollOffsets,
} from "./surface-dom-content";
import { notifyReactDomSurfaceHostChanged } from "./react-dom-surface-events";
import type {
  FreezeReason,
  WorkspacePane,
  PaneSnapshot,
  Rect,
  ResumeReason,
  SurfaceAdapter,
  SurfaceId,
  SurfaceKind,
  SurfacePaneCloseRequest,
  SurfacePaneCloseResult,
  ViewportChangeReason,
} from "./types";

export interface ReactSurfaceRoot {
  render(node: ReactNode): void;
  unmount(): void;
}

export interface ReactSurfaceRootFactory {
  createRoot(container: HTMLElement): ReactSurfaceRoot;
}

export interface ReactDomSurfaceState {
  activated: boolean;
  focused: boolean;
}

export interface ReactDomSurfaceAdapterOptions {
  masterController?: AppShellMasterController;
  onOpenVoiceCredentialSettings?: () => void;
  masterSpeechCapture?: AppShellSpeechCaptureController;
  masterSpeechPlayback?: AppShellSpeechPlaybackController;
  platform?: DesktopPlatform;
  speechCapture?: SpeechCaptureRequester;
  speechPresentation?: GlobalSpeechPresentationSource;
  workspaceId?: string;
}

const defaultRootFactory: ReactSurfaceRootFactory = {
  createRoot(container) {
    return createReactRoot(container) satisfies Root;
  },
};

export class ReactDomSurfaceAdapter implements SurfaceAdapter {
  readonly kind: SurfaceKind;
  private container: HTMLElement | null = null;
  private destroyed = false;
  private focused = false;
  private frozen = false;
  private frozenVisual: HTMLElement | null = null;
  private host: HTMLElement | null = null;
  private root: ReactSurfaceRoot | null = null;
  private activated = false;
  private scrollbarSuppressionToken = 0;
  private visible = false;

  constructor(
    private readonly pane: WorkspacePane,
    private readonly renderSurface: (state: ReactDomSurfaceState) => ReactNode,
    private readonly rootFactory: ReactSurfaceRootFactory = defaultRootFactory,
    private readonly paneCloseRequest?: (
      request: SurfacePaneCloseRequest,
    ) => Promise<SurfacePaneCloseResult>,
  ) {
    this.kind = pane.surfaceKind;
  }

  get lifecycleState() {
    return {
      activated: this.activated,
      destroyed: this.destroyed,
      focused: this.focused,
      frozen: this.frozen,
      mounted: this.host !== null,
      visible: this.visible,
    };
  }

  get surfaceId(): SurfaceId {
    return this.pane.surfaceId;
  }

  mount(host: HTMLElement): void {
    this.ensureNotDestroyed();
    if (this.host && this.host !== host) {
      this.unmount();
    }
    this.host = host;
    if (!this.container) {
      this.container = host.ownerDocument.createElement("div");
      this.container.className = "workspace-react-dom-surface";
      this.container.dataset.reactSurfaceKind = this.kind;
    }
    host.dataset.surfaceId = this.surfaceId;
    host.dataset.surfaceKind = this.kind;
    host.replaceChildren(this.container);
    notifyReactDomSurfaceHostChanged(this.container);
    this.restoreParkedScrollOffsets();
    if (!this.root) {
      this.root = this.rootFactory.createRoot(this.container);
      this.renderCurrentSurface();
    }
    this.syncHostState();
  }

  unmount(): void {
    if (this.container) {
      recordSnapshotScrollOffsets(this.container);
    }
    this.removeFrozenVisual();
    this.host?.replaceChildren();
    if (this.container) {
      notifyReactDomSurfaceHostChanged(this.container);
    }
    this.host = null;
    this.visible = false;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    const activatedChanged = visible && !this.activated;
    if (visible) {
      this.activated = true;
    }
    if (activatedChanged) {
      this.renderCurrentSurface();
    }
    this.syncHostState();
  }

  setFocused(focused: boolean): void {
    if (focused) {
      this.activated = true;
    }
    if (this.focused === focused) {
      return;
    }
    this.focused = focused;
    this.renderCurrentSurface();
    this.syncHostState();
  }

  setViewport(rect: Rect, reason: ViewportChangeReason): void {
    if (!this.host) {
      return;
    }
    this.host.dataset.viewportReason = reason;
    this.host.dataset.surfaceViewport = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
  }

  freeze(reason: FreezeReason): void {
    if (!this.frozen) {
      this.installFrozenVisual();
    }
    this.frozen = true;
    this.host?.setAttribute("data-freeze-reason", reason);
    this.syncHostState();
  }

  resume(reason: ResumeReason): void {
    const wasFrozen = this.frozen;
    this.frozen = false;
    this.removeFrozenVisual();
    this.host?.setAttribute("data-resume-reason", reason);
    if (wasFrozen) {
      this.suppressLiveScrollbars();
    }
    this.syncHostState();
  }

  captureSnapshot(): Promise<PaneSnapshot> {
    return Promise.resolve({
      capturedAt: performanceNow(),
      label: this.pane.title,
      surfaceId: this.surfaceId,
    });
  }

  requestPaneClose(request: SurfacePaneCloseRequest): Promise<SurfacePaneCloseResult> {
    return this.paneCloseRequest?.(request) ?? Promise.resolve({ removePane: true });
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    const root = this.root;
    this.root = null;
    this.unmount();
    this.container = null;
    if (root) {
      deferReactRootUnmount(root);
    }
    this.destroyed = true;
  }

  private ensureNotDestroyed(): void {
    if (this.destroyed) {
      throw new Error(`react DOM surface ${this.surfaceId} has already been destroyed`);
    }
  }

  private syncHostState(): void {
    if (!this.host) {
      return;
    }
    this.host.dataset.surfaceFocused = String(this.focused);
    this.host.dataset.surfaceFrozen = String(this.frozen);
    this.host.dataset.surfaceVisible = String(this.visible);
    this.host.style.visibility = this.visible ? "visible" : "hidden";
    if (this.container) {
      this.container.dataset.focused = String(this.focused);
      this.container.dataset.frozen = String(this.frozen);
      if (this.frozenVisual !== null) {
        this.container.dataset.liveFrozenHidden = "true";
      } else {
        delete this.container.dataset.liveFrozenHidden;
      }
      this.container.dataset.visible = String(this.visible);
    }
  }

  private renderCurrentSurface(): void {
    this.root?.render(
      this.renderSurface({
        activated: this.activated,
        focused: this.focused,
      }),
    );
  }

  private installFrozenVisual(): void {
    const host = this.host;
    const container = this.container;
    if (!host || !container) {
      return;
    }
    recordSnapshotScrollOffsets(container);
    this.removeFrozenVisual();
    const visual = host.ownerDocument.createElement("div");
    visual.className = "workspace-frozen-dom-visual";
    visual.dataset.surfaceKind = this.kind;
    visual.append(cloneSnapshotNode(container, host.ownerDocument));
    host.append(visual);
    applySnapshotScrollOffsets(visual);
    this.frozenVisual = visual;
  }

  private removeFrozenVisual(): void {
    this.frozenVisual?.remove();
    this.frozenVisual = null;
    if (this.container) {
      delete this.container.dataset.liveFrozenHidden;
    }
  }

  private restoreParkedScrollOffsets(): void {
    const container = this.container;
    if (!container) {
      return;
    }
    applySnapshotScrollOffsets(container);
    restoreScrollOffsetsAcrossFrames(container, 24);
  }

  private suppressLiveScrollbars(): void {
    const container = this.container;
    if (!container) {
      return;
    }
    this.scrollbarSuppressionToken += 1;
    const token = this.scrollbarSuppressionToken;
    container.dataset.scrollbarsSuppressed = "true";
    clearScrollbarsSuppressedAcrossFrames(
      container,
      token,
      () => this.scrollbarSuppressionToken,
      18,
    );
  }
}

function restoreScrollOffsetsAcrossFrames(root: Element, remainingFrames: number): void {
  if (remainingFrames <= 0) {
    return;
  }
  const restore = () => {
    applySnapshotScrollOffsets(root);
    queueMicrotask(() => applySnapshotScrollOffsets(root));
    setTimeout(() => applySnapshotScrollOffsets(root), 0);
    restoreScrollOffsetsAcrossFrames(root, remainingFrames - 1);
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(restore);
    return;
  }
  queueMicrotask(restore);
}

function clearScrollbarsSuppressedAcrossFrames(
  root: HTMLElement,
  token: number,
  currentToken: () => number,
  remainingFrames: number,
): void {
  if (remainingFrames <= 0) {
    if (currentToken() === token) {
      delete root.dataset.scrollbarsSuppressed;
    }
    return;
  }
  const clear = () => {
    clearScrollbarsSuppressedAcrossFrames(root, token, currentToken, remainingFrames - 1);
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(clear);
    return;
  }
  queueMicrotask(clear);
}

export function createReactDomSurfaceAdapter(
  pane: WorkspacePane,
  rootFactory?: ReactSurfaceRootFactory,
  options: ReactDomSurfaceAdapterOptions = {},
): ReactDomSurfaceAdapter {
  const renderSurface = reactDomSurfaceRenderFactory(pane, options);
  if (renderSurface) {
    return new ReactDomSurfaceAdapter(
      pane,
      renderSurface,
      rootFactory,
      reactDomPaneCloseRequest(pane, options),
    );
  }
  throw new Error(`surface ${pane.surfaceId} is not a React DOM surface`);
}

function reactDomPaneCloseRequest(
  pane: WorkspacePane,
  options: ReactDomSurfaceAdapterOptions,
): ((request: SurfacePaneCloseRequest) => Promise<SurfacePaneCloseResult>) | undefined {
  if (pane.surfaceKind === "master") {
    return () => Promise.resolve({ removePane: false });
  }
  if (pane.surfaceKind !== "conversation") {
    return undefined;
  }
  const conversationId = pane.conversationConfig.conversationId;
  const workspaceId = options.workspaceId;
  if (!workspaceId) {
    return undefined;
  }
  return (request) =>
    requestEasyButtonPaneClose({
      confirm: request.confirm,
      conversationId,
      paneId: pane.paneId,
      speechCapture: options.speechCapture,
      workspaceId,
    });
}

function reactDomSurfaceRenderFactory(
  pane: WorkspacePane,
  options: ReactDomSurfaceAdapterOptions,
): ((state: ReactDomSurfaceState) => ReactNode) | undefined {
  switch (pane.surfaceKind) {
    case "master":
      return ({ focused }) =>
        options.masterController ? (
          <AppShellMasterPaneSurface
            controller={options.masterController}
            focused={focused}
            onOpenVoiceCredentialSettings={options.onOpenVoiceCredentialSettings}
            platform={options.platform ?? "linux"}
            speechCapture={options.masterSpeechCapture}
            speechPlayback={options.masterSpeechPlayback}
          />
        ) : (
          <AppShellMasterPaneUnavailable />
        );
    case "conversation":
      return () => (
        <EasyButtonSurface
          conversationId={pane.conversationConfig.conversationId}
          paneId={pane.paneId}
          speechCapture={options.speechCapture}
          speechPresentation={options.speechPresentation}
          workspaceId={options.workspaceId ?? null}
        />
      );
    default:
      return undefined;
  }
}

function performanceNow(): number {
  if (typeof performance === "undefined") {
    return Date.now();
  }
  return performance.now();
}

function deferReactRootUnmount(root: ReactSurfaceRoot): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(() => root.unmount());
    return;
  }
  setTimeout(() => root.unmount(), 0);
}
