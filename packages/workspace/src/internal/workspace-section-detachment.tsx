import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import type { WorkspaceSection } from "../core.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_ROOT_DRAG_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import {
  assertWorkspaceDetachmentProviderCallbacks,
  resolveWorkspaceDetachedWindowInitialBounds,
  resolveWorkspaceDetachmentDecision,
  workspaceDetachedWindowFeatures,
  type WorkspaceDetachedWindowBounds,
  type WorkspaceDetachedWindowHeadRenderer,
  type WorkspaceDetachmentProviderProps,
  type WorkspaceDetachmentRequest,
} from "./workspace-section-detachment-contract.js";
import { DetachIcon } from "./workspace-section-frame-icons.js";
import type { ResolvedSectionDefinition } from "./workspace-section-registry.js";

const detachedThemeProperties = [
  "--setta-workspace-canvas-background",
  "--setta-workspace-control-background",
  "--setta-workspace-focus",
  "--setta-workspace-grid-color",
  "--setta-workspace-group-background",
  "--setta-workspace-invalid",
  "--setta-workspace-minimap-background",
  "--setta-workspace-section-accent",
  "--setta-workspace-section-background",
  "--setta-workspace-section-border",
  "--setta-workspace-section-header-background",
  "--setta-workspace-section-local-background",
  "--setta-workspace-section-local-header",
  "--setta-workspace-section-local-muted-text",
  "--setta-workspace-section-local-text",
  "--setta-workspace-section-muted-text",
  "--setta-workspace-section-text",
  "--setta-workspace-selection",
  "--setta-workspace-toolbar-background",
] as const;

const detachedWindowStyle = `
html, body { min-block-size: 100%; margin: 0; }
body { background: var(--setta-workspace-canvas-background); }
.setta-workspace__detached-window {
  box-sizing: border-box;
  min-block-size: 100vh;
  padding: 1rem;
  color: var(--setta-workspace-section-local-text, var(--setta-workspace-section-text));
  font: 400 1rem/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--setta-workspace-canvas-background);
}
.setta-workspace__detached-window-header {
  display: flex;
  flex-wrap: wrap;
  gap: .75rem 1rem;
  align-items: center;
  justify-content: space-between;
  margin-block-end: 1rem;
  padding: .75rem 1rem;
  background: var(--setta-workspace-section-local-header, var(--setta-workspace-section-background));
  border-radius: .875rem;
  box-shadow: 0 0 0 1px color-mix(in oklch, var(--setta-workspace-section-text) 12%, transparent);
}
.setta-workspace__detached-window-heading { min-inline-size: 0; }
.setta-workspace__detached-window-heading p {
  margin: 0;
  color: var(--setta-workspace-section-local-muted-text, var(--setta-workspace-section-muted-text));
  font-size: .75rem;
  font-weight: 650;
}
.setta-workspace__detached-window-heading h1 {
  margin: .125rem 0 0;
  font-size: 1.125rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.setta-workspace__detached-window button {
  min-block-size: 2.5rem;
  padding-inline: .875rem;
  color: var(--setta-workspace-section-local-text, var(--setta-workspace-section-text));
  font: inherit;
  font-weight: 650;
  background: var(--setta-workspace-section-local-background, var(--setta-workspace-section-background));
  border: 0;
  border-radius: .625rem;
  box-shadow: 0 0 0 1px color-mix(in oklch, currentColor 16%, transparent);
  cursor: pointer;
}
.setta-workspace__detached-window button:focus-visible {
  outline: 2px solid var(--setta-workspace-focus);
  outline-offset: 2px;
}
.setta-workspace__detached-window-content {
  min-inline-size: 0;
  min-block-size: 0;
  padding: 1rem;
  overflow: auto;
  color: var(--setta-workspace-section-local-text, var(--setta-workspace-section-text));
  background: var(--setta-workspace-section-local-background, var(--setta-workspace-section-background));
  border-radius: .875rem;
  box-shadow: 0 .75rem 2rem oklch(0 0 0 / .12);
}
@media (pointer: coarse) {
  .setta-workspace__detached-window button { min-block-size: 2.75rem; }
}
`;

type DetachedThemeStyle = CSSProperties & Record<(typeof detachedThemeProperties)[number], string>;

type DetachedPresentation = Readonly<{
  direction: "ltr" | "rtl";
  style: DetachedThemeStyle;
}>;

type DetachedPlaceholderSize = Readonly<{
  height: number;
  width: number;
}>;

type DetachedSession = Readonly<{
  cleanup(): void;
  contentTarget: HTMLElement;
  dockTarget: HTMLElement;
  document: Document;
  focusTrigger(): void;
  headTarget: HTMLHeadElement;
  lastBounds: { current: WorkspaceDetachedWindowBounds };
  ownerWindow: Window;
  placeholderSize: DetachedPlaceholderSize;
  presentation: DetachedPresentation;
  request: { current: WorkspaceDetachmentRequest };
  rendererTarget: HTMLElement;
  window: Window;
}>;

type DetachSectionInput = Readonly<{
  dockTarget: HTMLElement;
  focusTrigger(): void;
  placeholderSize: DetachedPlaceholderSize;
  presentation: DetachedPresentation;
  request: WorkspaceDetachmentRequest;
  rendererTarget: HTMLElement;
  sourceElement: HTMLElement;
}>;

type DetachmentContextValue = Readonly<{
  detach(input: DetachSectionInput): void;
  detachedSectionIds: readonly string[];
  focus(sectionId: string): void;
  redock(sectionId: string): void;
  release(sectionId: string): void;
  renderWindowHead: WorkspaceDetachedWindowHeadRenderer | undefined;
  session(sectionId: string): DetachedSession | null;
}>;

const WorkspaceDetachmentContext = createContext<DetachmentContextValue | null>(null);
const EMPTY_DETACHED_SECTION_IDS: readonly string[] = Object.freeze([]);

function validatedDetachmentDecision(
  validator: WorkspaceDetachmentProviderProps["validateDetachment"],
  request: WorkspaceDetachmentRequest,
) {
  return validator
    ? resolveWorkspaceDetachmentDecision(validator(request))
    : ({ allowed: true } as const);
}

function securityAccessFailure(error: unknown): boolean {
  return error instanceof Error && error.name === "SecurityError";
}

function connectedWindowDocument(openedWindow: Window, ownerWindow: Window): Document | null {
  try {
    if (openedWindow.closed || openedWindow.opener !== ownerWindow) {
      return null;
    }
    return openedWindow.document;
  } catch (error) {
    if (securityAccessFailure(error)) {
      return null;
    }
    throw error;
  }
}

function actualWindowBounds(detachedWindow: Window): WorkspaceDetachedWindowBounds {
  const positive = (outer: number, inner: number) =>
    Number.isFinite(outer) && outer > 0 ? outer : Math.max(1, inner);
  const finite = (value: number) => (Number.isFinite(value) ? value : 0);
  return Object.freeze({
    height: positive(detachedWindow.outerHeight, detachedWindow.innerHeight),
    width: positive(detachedWindow.outerWidth, detachedWindow.innerWidth),
    x: finite(detachedWindow.screenX),
    y: finite(detachedWindow.screenY),
  });
}

function installDetachedDocument(document: Document, request: WorkspaceDetachmentRequest) {
  document.title = request.title;
  document.documentElement.dataset.settaWorkspaceDetachedDocument = "";
  const charset = document.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  charset.dataset.settaWorkspaceDetachedMetadata = "charset";
  const viewport = document.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1";
  viewport.dataset.settaWorkspaceDetachedMetadata = "viewport";
  const style = document.createElement("style");
  style.dataset.settaWorkspaceDetachedStyles = "";
  style.textContent = detachedWindowStyle;
  document.head.append(charset, viewport, style);
  const contentTarget = document.createElement("div");
  contentTarget.dataset.settaWorkspaceDetachedPortal = request.sectionId;
  document.body.replaceChildren(contentTarget);
  return contentTarget;
}

function detachedWindowChange(session: DetachedSession, open: boolean) {
  return Object.freeze({
    ...session.request.current,
    bounds: session.lastBounds.current,
    open,
  });
}

function focusInNextFrame(ownerWindow: Window, focus: () => void): void {
  ownerWindow.requestAnimationFrame(focus);
}

export function WorkspaceDetachmentProvider({
  children,
  getInitialWindowBounds,
  onWindowChange,
  renderWindowHead,
  validateDetachment,
}: WorkspaceDetachmentProviderProps) {
  assertWorkspaceDetachmentProviderCallbacks(
    getInitialWindowBounds,
    onWindowChange,
    renderWindowHead,
    validateDetachment,
  );
  const callbacksRef = useRef({
    getInitialWindowBounds,
    onWindowChange,
    validateDetachment,
  });
  callbacksRef.current = { getInitialWindowBounds, onWindowChange, validateDetachment };
  const sessionsRef = useRef(new Map<string, DetachedSession>());
  const [announcement, setAnnouncement] = useState("");
  const [detachedSectionIds, setDetachedSectionIds] = useState<readonly string[]>(
    EMPTY_DETACHED_SECTION_IDS,
  );
  const synchronizeDetachedSectionIds = useCallback(
    () => setDetachedSectionIds(Object.freeze([...sessionsRef.current.keys()])),
    [],
  );

  const removeSession = useCallback(
    (
      sectionId: string,
      options: Readonly<{
        announcement: string;
        closeWindow: boolean;
        restoreFocus: boolean;
      }>,
    ) => {
      const session = sessionsRef.current.get(sectionId);
      if (!session) {
        return;
      }
      session.cleanup();
      sessionsRef.current.delete(sectionId);
      session.dockTarget.append(session.rendererTarget);
      if (!session.window.closed) {
        session.lastBounds.current = actualWindowBounds(session.window);
        if (options.closeWindow) {
          session.window.close();
        }
      }
      callbacksRef.current.onWindowChange?.(detachedWindowChange(session, false));
      setAnnouncement(options.announcement);
      synchronizeDetachedSectionIds();
      if (options.restoreFocus) {
        focusInNextFrame(session.ownerWindow, session.focusTrigger);
      }
    },
    [synchronizeDetachedSectionIds],
  );

  const redock = useCallback(
    (sectionId: string) => {
      const session = sessionsRef.current.get(sectionId);
      if (!session) {
        return;
      }
      removeSession(sectionId, {
        announcement: `${session.request.current.title} returned to the workspace.`,
        closeWindow: true,
        restoreFocus: true,
      });
    },
    [removeSession],
  );

  const focus = useCallback(
    (sectionId: string) => {
      const session = sessionsRef.current.get(sectionId);
      if (!session) {
        return;
      }
      if (!connectedWindowDocument(session.window, session.ownerWindow)) {
        removeSession(sectionId, {
          announcement: `${session.request.current.title} returned because its window is no longer available.`,
          closeWindow: true,
          restoreFocus: true,
        });
        return;
      }
      session.window.focus();
      setAnnouncement(`${session.request.current.title} window focused.`);
    },
    [removeSession],
  );

  const release = useCallback(
    (sectionId: string) => {
      const session = sessionsRef.current.get(sectionId);
      if (!session) {
        return;
      }
      removeSession(sectionId, {
        announcement: `${session.request.current.title} window closed because the section is unavailable.`,
        closeWindow: true,
        restoreFocus: false,
      });
    },
    [removeSession],
  );

  const detach = useCallback(
    (input: DetachSectionInput) => {
      const existing = sessionsRef.current.get(input.request.sectionId);
      if (existing) {
        focus(input.request.sectionId);
        return;
      }
      const decision = validatedDetachmentDecision(
        callbacksRef.current.validateDetachment,
        input.request,
      );
      if (!decision.allowed) {
        setAnnouncement(`${input.request.title} stayed in the workspace. ${decision.reason}`);
        return;
      }
      const ownerWindow = input.sourceElement.ownerDocument.defaultView;
      if (!ownerWindow || ownerWindow.closed) {
        setAnnouncement(
          `${input.request.title} stayed in the workspace because its browser window is unavailable.`,
        );
        return;
      }
      const initialBounds = resolveWorkspaceDetachedWindowInitialBounds(
        callbacksRef.current.getInitialWindowBounds?.(input.request),
      );
      const detachedWindow = ownerWindow.open(
        "about:blank",
        "_blank",
        workspaceDetachedWindowFeatures(initialBounds),
      );
      if (!detachedWindow) {
        setAnnouncement(
          `Unable to open ${input.request.title} in a new window. Allow pop-ups for this site and try again.`,
        );
        return;
      }
      const document = connectedWindowDocument(detachedWindow, ownerWindow);
      if (!document) {
        detachedWindow.close();
        setAnnouncement(
          `${input.request.title} stayed in the workspace because the new window was unavailable.`,
        );
        return;
      }
      const contentTarget = installDetachedDocument(document, input.request);
      const lastBounds = { current: actualWindowBounds(detachedWindow) };
      const request = { current: input.request };
      let active = true;
      let intervalId = 0;
      const handleWindowUnavailable = () => {
        removeSession(input.request.sectionId, {
          announcement: `${request.current.title} returned because its window closed, reloaded, or lost its opener.`,
          closeWindow: true,
          restoreFocus: true,
        });
      };
      const handlePageHide = () => handleWindowUnavailable();
      const cleanup = () => {
        if (!active) {
          return;
        }
        active = false;
        detachedWindow.removeEventListener("pagehide", handlePageHide);
        ownerWindow.clearInterval(intervalId);
      };
      const session: DetachedSession = Object.freeze({
        cleanup,
        contentTarget,
        dockTarget: input.dockTarget,
        document,
        focusTrigger: input.focusTrigger,
        headTarget: document.head,
        lastBounds,
        ownerWindow,
        placeholderSize: input.placeholderSize,
        presentation: input.presentation,
        request,
        rendererTarget: input.rendererTarget,
        window: detachedWindow,
      });
      sessionsRef.current.set(input.request.sectionId, session);
      detachedWindow.addEventListener("pagehide", handlePageHide);
      intervalId = ownerWindow.setInterval(() => {
        if (!connectedWindowDocument(detachedWindow, ownerWindow)) {
          handleWindowUnavailable();
          return;
        }
        lastBounds.current = actualWindowBounds(detachedWindow);
      }, 250);
      callbacksRef.current.onWindowChange?.(detachedWindowChange(session, true));
      setAnnouncement(`${input.request.title} opened in a new window.`);
      synchronizeDetachedSectionIds();
      detachedWindow.focus();
    },
    [focus, removeSession, synchronizeDetachedSectionIds],
  );

  useEffect(
    () => () => {
      for (const session of sessionsRef.current.values()) {
        session.cleanup();
        if (!session.window.closed) {
          session.lastBounds.current = actualWindowBounds(session.window);
          session.window.close();
        }
        callbacksRef.current.onWindowChange?.(detachedWindowChange(session, false));
      }
      sessionsRef.current.clear();
    },
    [],
  );

  const context = useMemo<DetachmentContextValue>(
    () => ({
      detach,
      detachedSectionIds,
      focus,
      redock,
      release,
      renderWindowHead,
      session: (sectionId) => sessionsRef.current.get(sectionId) ?? null,
    }),
    [detach, detachedSectionIds, focus, redock, release, renderWindowHead],
  );
  return (
    <WorkspaceDetachmentContext.Provider value={context}>
      {children}
      <span
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-detachment-announcement=""
        role="status"
      >
        {announcement}
      </span>
    </WorkspaceDetachmentContext.Provider>
  );
}

export function useWorkspaceDetachedSectionIds(): readonly string[] {
  return useContext(WorkspaceDetachmentContext)?.detachedSectionIds ?? EMPTY_DETACHED_SECTION_IDS;
}

function useWorkspaceDetachmentContext(): DetachmentContextValue | null {
  return useContext(WorkspaceDetachmentContext);
}

export function useWorkspaceSectionDetached(sectionId: string): boolean {
  const context = useWorkspaceDetachmentContext();
  return context ? context.session(sectionId) !== null : false;
}

function themeStylesMatch(left: DetachedThemeStyle, right: DetachedThemeStyle): boolean {
  return detachedThemeProperties.every((property) => left[property] === right[property]);
}

function detachedPresentation(source: HTMLElement): DetachedPresentation {
  const view = source.ownerDocument.defaultView;
  if (!view) {
    throw new Error("Workspace section detachment requires a live browser window.");
  }
  const computed = view.getComputedStyle(source);
  const property = (name: (typeof detachedThemeProperties)[number]) =>
    computed.getPropertyValue(name);
  const style: DetachedThemeStyle = {
    "--setta-workspace-canvas-background": property("--setta-workspace-canvas-background"),
    "--setta-workspace-control-background": property("--setta-workspace-control-background"),
    "--setta-workspace-focus": property("--setta-workspace-focus"),
    "--setta-workspace-grid-color": property("--setta-workspace-grid-color"),
    "--setta-workspace-group-background": property("--setta-workspace-group-background"),
    "--setta-workspace-invalid": property("--setta-workspace-invalid"),
    "--setta-workspace-minimap-background": property("--setta-workspace-minimap-background"),
    "--setta-workspace-section-accent": property("--setta-workspace-section-accent"),
    "--setta-workspace-section-background": property("--setta-workspace-section-background"),
    "--setta-workspace-section-border": property("--setta-workspace-section-border"),
    "--setta-workspace-section-header-background": property(
      "--setta-workspace-section-header-background",
    ),
    "--setta-workspace-section-local-background": property(
      "--setta-workspace-section-local-background",
    ),
    "--setta-workspace-section-local-header": property("--setta-workspace-section-local-header"),
    "--setta-workspace-section-local-muted-text": property(
      "--setta-workspace-section-local-muted-text",
    ),
    "--setta-workspace-section-local-text": property("--setta-workspace-section-local-text"),
    "--setta-workspace-section-muted-text": property("--setta-workspace-section-muted-text"),
    "--setta-workspace-section-text": property("--setta-workspace-section-text"),
    "--setta-workspace-selection": property("--setta-workspace-selection"),
    "--setta-workspace-toolbar-background": property("--setta-workspace-toolbar-background"),
    colorScheme: computed.colorScheme,
  };
  return Object.freeze({
    direction: computed.direction === "rtl" ? "rtl" : "ltr",
    style,
  });
}

function measuredPlaceholderSize(element: HTMLElement): DetachedPlaceholderSize {
  const bounds = element.getBoundingClientRect();
  return Object.freeze({
    height: Math.max(1, element.offsetHeight || bounds.height),
    width: Math.max(1, element.offsetWidth || bounds.width),
  });
}

export function WorkspaceSectionDetachmentControl({
  contentId,
  contentRef,
  controlRef,
  definition,
  frameRef,
  section,
}: Readonly<{
  contentId: string;
  contentRef: RefObject<HTMLDivElement | null>;
  controlRef: RefObject<HTMLButtonElement | null>;
  definition: ResolvedSectionDefinition<unknown>;
  frameRef: RefObject<HTMLElement | null>;
  section: WorkspaceSection<unknown>;
}>) {
  const context = useWorkspaceDetachmentContext();
  const session = context?.session(section.id) ?? null;
  if (!context || !definition.detachable || section.isMinimized) {
    return null;
  }
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (session) {
      context.focus(section.id);
      return;
    }
    const content = contentRef.current;
    const frame = frameRef.current;
    const sourceElement = controlRef.current;
    if (!content || !frame || !sourceElement) {
      throw new Error(`Workspace section ${section.id} is not ready to detach.`);
    }
    const rendererTarget = content.querySelector<HTMLElement>(
      ":scope > [data-workspace-section-renderer-target]",
    );
    if (!rendererTarget) {
      throw new Error(`Workspace section ${section.id} renderer is not ready to detach.`);
    }
    context.detach({
      dockTarget: content,
      focusTrigger: () => controlRef.current?.focus({ preventScroll: true }),
      placeholderSize: measuredPlaceholderSize(content),
      presentation: detachedPresentation(frame),
      request: Object.freeze({ kind: section.kind, sectionId: section.id, title: section.title }),
      rendererTarget,
      sourceElement,
    });
  };
  return (
    <button
      aria-controls={contentId}
      aria-label={
        session ? `Focus ${section.title} window` : `Open ${section.title} in a new window`
      }
      aria-pressed={Boolean(session)}
      className="setta-workspace__section-detachment-control"
      data-workspace-section-detachment-control=""
      onClick={handleClick}
      ref={controlRef}
      type="button"
    >
      <DetachIcon detached={Boolean(session)} />
    </button>
  );
}

function detachedPlaceholderStyle(size: DetachedPlaceholderSize): CSSProperties {
  return {
    "--setta-workspace-detached-placeholder-height": `${String(size.height)}px`,
    "--setta-workspace-detached-placeholder-width": `${String(size.width)}px`,
  } as CSSProperties;
}

function DetachedSectionPlaceholder({
  inactive,
  onFocus,
  onRedock,
  section,
  size,
}: Readonly<{
  inactive: boolean;
  onFocus(): void;
  onRedock(): void;
  section: WorkspaceSection<unknown>;
  size: DetachedPlaceholderSize;
}>) {
  return (
    <div
      aria-label={`${section.title} detached window controls`}
      className="setta-workspace__detached-placeholder"
      data-workspace-detached-placeholder=""
      inert={inactive || undefined}
      role="group"
      style={detachedPlaceholderStyle(size)}
    >
      <p>{section.title} is open in another window.</p>
      <div className="setta-workspace__detached-placeholder-actions">
        <button onClick={onFocus} type="button">
          Focus window
        </button>
        <button onClick={onRedock} type="button">
          Redock section
        </button>
      </div>
    </div>
  );
}

function useLiveDetachedPresentation(
  frameRef: RefObject<HTMLElement | null>,
  session: DetachedSession | null,
): DetachedPresentation | null {
  const [presentation, setPresentation] = useState<DetachedPresentation | null>(
    session?.presentation ?? null,
  );
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !session) {
      setPresentation(null);
      return;
    }
    const synchronize = () => {
      const next = detachedPresentation(frame);
      setPresentation((current) =>
        current &&
        current.direction === next.direction &&
        themeStylesMatch(current.style, next.style)
          ? current
          : next,
      );
    };
    synchronize();
    const view = frame.ownerDocument.defaultView;
    if (!view) {
      return;
    }
    const observer = new view.MutationObserver(synchronize);
    const workspaceRoot = frame.closest<HTMLElement>("[data-setta-workspace]");
    observer.observe(frame, {
      attributeFilter: ["style", "data-workspace-accent-color"],
      attributes: true,
    });
    if (workspaceRoot) {
      observer.observe(workspaceRoot, {
        attributeFilter: ["style", "data-workspace-resolved-appearance"],
        attributes: true,
      });
    }
    return () => observer.disconnect();
  }, [frameRef, session]);
  return presentation;
}

function DetachedWindowContent({
  appearance,
  inactive,
  onRedock,
  presentation,
  rendererTarget,
  section,
}: Readonly<{
  appearance: "dark" | "light";
  inactive: boolean;
  onRedock(): void;
  presentation: DetachedPresentation;
  rendererTarget: HTMLElement;
  section: WorkspaceSection<unknown>;
}>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  useEffect(() => headingRef.current?.focus({ preventScroll: true }), []);
  return (
    <section
      aria-labelledby={headingId}
      className="setta-workspace setta-workspace__detached-window"
      data-setta-workspace-detached-section={section.id}
      data-workspace-resolved-appearance={appearance}
      dir={presentation.direction}
      style={presentation.style}
    >
      <header className="setta-workspace__detached-window-header">
        <div className="setta-workspace__detached-window-heading">
          <p>Detached section</p>
          <h1 id={headingId} ref={headingRef} tabIndex={-1}>
            {section.title}
          </h1>
        </div>
        <button onClick={onRedock} type="button">
          Return to workspace
        </button>
      </header>
      <div
        className={`setta-workspace__detached-window-content setta-workspace__interaction-boundary ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
        data-workspace-prevent-pan="true"
        data-workspace-prevent-wheel="true"
        inert={inactive || undefined}
        ref={(element) => element?.append(rendererTarget)}
        tabIndex={inactive ? undefined : 0}
      />
    </section>
  );
}

type WorkspaceSectionContentProps = Readonly<{
  appearance: "dark" | "light";
  contentId: string;
  contentRef: RefObject<HTMLDivElement | null>;
  definition: ResolvedSectionDefinition<unknown>;
  frameRef: RefObject<HTMLElement | null>;
  inactive: boolean;
  readOnly: boolean;
  section: WorkspaceSection<unknown>;
}>;

function useDetachedSectionSessionLifecycle(
  context: DetachmentContextValue | null,
  section: WorkspaceSection<unknown>,
  session: DetachedSession | null,
): void {
  const redockSection = context?.redock;
  const releaseSection = context?.release;
  useEffect(() => {
    if (section.isMinimized && session) {
      redockSection?.(section.id);
    }
  }, [redockSection, section.id, section.isMinimized, session]);
  useEffect(() => {
    if (session) {
      session.request.current = Object.freeze({
        kind: section.kind,
        sectionId: section.id,
        title: section.title,
      });
      session.document.title = section.title;
    }
  }, [section.id, section.kind, section.title, session]);
  useEffect(
    () => () => {
      releaseSection?.(section.id);
    },
    [releaseSection, section.id],
  );
}

function DetachedWindowHead({
  renderWindowHead,
  section,
  session,
}: Readonly<{
  renderWindowHead: WorkspaceDetachedWindowHeadRenderer | undefined;
  section: WorkspaceSection<unknown>;
  session: DetachedSession;
}>) {
  const contribution = renderWindowHead?.({
    kind: section.kind,
    sectionId: section.id,
    title: section.title,
  });
  if (contribution === undefined || contribution === null) {
    return null;
  }
  return createPortal(
    contribution,
    session.headTarget,
    `setta-workspace-detached-head-${section.id}`,
  );
}

function DetachedSectionPortals({
  appearance,
  context,
  inactive,
  presentation,
  rendererTarget,
  section,
  session,
}: Readonly<{
  appearance: "dark" | "light";
  context: DetachmentContextValue | null;
  inactive: boolean;
  presentation: DetachedPresentation | null;
  rendererTarget: HTMLElement | null;
  section: WorkspaceSection<unknown>;
  session: DetachedSession | null;
}>) {
  if (!context || !presentation || !rendererTarget || !session) return null;
  return (
    <>
      {createPortal(
        <DetachedWindowContent
          appearance={appearance}
          inactive={inactive}
          onRedock={() => context.redock(section.id)}
          presentation={presentation}
          rendererTarget={rendererTarget}
          section={section}
        />,
        session.contentTarget,
        `setta-workspace-detached-content-${section.id}`,
      )}
      <DetachedWindowHead
        renderWindowHead={context.renderWindowHead}
        section={section}
        session={session}
      />
    </>
  );
}

function WorkspaceSectionRendererPlacement({
  appearance,
  definition,
  insideContent,
  readOnly,
  rendererTarget,
  section,
}: Readonly<{
  appearance: "dark" | "light";
  definition: ResolvedSectionDefinition<unknown>;
  insideContent: boolean;
  readOnly: boolean;
  rendererTarget: HTMLElement | null;
  section: WorkspaceSection<unknown>;
}>) {
  const Renderer = definition.render;
  const renderer = (
    <Renderer
      appearance={appearance}
      data={section.data}
      readOnly={readOnly}
      sectionId={section.id}
    />
  );
  if (!rendererTarget) return insideContent ? renderer : null;
  return insideContent
    ? null
    : createPortal(renderer, rendererTarget, `setta-workspace-renderer-${section.id}`);
}

function OpenDetachedSectionPlaceholder({
  context,
  inactive,
  section,
  session,
}: Readonly<{
  context: DetachmentContextValue | null;
  inactive: boolean;
  section: WorkspaceSection<unknown>;
  session: DetachedSession | null;
}>) {
  if (!context || !session) return null;
  return (
    <DetachedSectionPlaceholder
      inactive={inactive}
      onFocus={() => context.focus(section.id)}
      onRedock={() => context.redock(section.id)}
      section={section}
      size={session.placeholderSize}
    />
  );
}

export function WorkspaceSectionContent(props: WorkspaceSectionContentProps) {
  const { appearance, contentId, contentRef, definition, frameRef, inactive, readOnly, section } =
    props;
  const context = useWorkspaceDetachmentContext();
  const session = context?.session(section.id) ?? null;
  const presentation = useLiveDetachedPresentation(frameRef, session);
  const [rendererTarget] = useState(() => {
    if (typeof document === "undefined") return null;
    const target = document.createElement("div");
    target.dataset.workspaceSectionRendererTarget = "";
    target.style.display = "contents";
    return target;
  });
  useDetachedSectionSessionLifecycle(context, section, session);
  useLayoutEffect(() => {
    if (!rendererTarget || session || section.isMinimized) return;
    contentRef.current?.append(rendererTarget);
  }, [contentRef, rendererTarget, section.isMinimized, session]);
  if (section.isMinimized) {
    return <div hidden id={contentId} ref={contentRef} />;
  }
  return (
    <>
      <div
        aria-hidden={inactive || undefined}
        className={`setta-workspace__section-content setta-workspace__interaction-boundary ${WORKSPACE_NO_PAN_CLASS_NAME}${session ? ` ${WORKSPACE_NO_ROOT_DRAG_CLASS_NAME}` : ""} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
        data-workspace-prevent-pan="true"
        data-workspace-prevent-wheel="true"
        id={contentId}
        inert={inactive || undefined}
        ref={contentRef}
        tabIndex={inactive || session ? undefined : 0}
      >
        <OpenDetachedSectionPlaceholder
          context={context}
          inactive={inactive}
          section={section}
          session={session}
        />
        <WorkspaceSectionRendererPlacement
          appearance={appearance}
          definition={definition}
          insideContent
          readOnly={readOnly}
          rendererTarget={rendererTarget}
          section={section}
        />
      </div>
      <WorkspaceSectionRendererPlacement
        appearance={appearance}
        definition={definition}
        insideContent={false}
        readOnly={readOnly}
        rendererTarget={rendererTarget}
        section={section}
      />
      <DetachedSectionPortals
        appearance={appearance}
        context={context}
        inactive={inactive}
        presentation={presentation}
        rendererTarget={rendererTarget}
        section={section}
        session={session}
      />
    </>
  );
}
