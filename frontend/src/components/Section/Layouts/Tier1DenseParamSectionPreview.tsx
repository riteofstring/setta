import { createPortal } from "react-dom";
import {
  type CSSProperties,
  type PropsWithChildren,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type PreviewStatus = "idle" | "pending" | "ready" | "error";

type CaptureSize = {
  width: number;
  height: number;
};

type SectionBodyBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type PreviewData = {
  src: string;
  captureSize: CaptureSize;
  bodyBounds: SectionBodyBounds;
};

let previewCaptureQueueTail: Promise<void> = Promise.resolve();

type Tier1DenseParamSectionPreviewProps = PropsWithChildren<{
  sectionId: string;
  isActiveSection: boolean;
  shouldWarmPreview: boolean;
  showPreview: boolean;
}>;

export const Tier1DenseParamSectionPreview = function Tier1DenseParamSectionPreview({
  children,
  sectionId,
  isActiveSection,
  shouldWarmPreview,
  showPreview,
}: Tier1DenseParamSectionPreviewProps) {
  const liveBodyRootRef = useRef<HTMLDivElement | null>(null);
  const wasActiveSectionRef = useRef(isActiveSection);
  const [previewHost, setPreviewHost] = useState<HTMLElement | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [needsCapture, setNeedsCapture] = useState(false);
  const [status, setStatus] = useState<PreviewStatus>("idle");

  useEffect(() => {
    setPreviewData(null);
    setPreviewHost(null);
    setNeedsCapture(false);
    setStatus("idle");
    wasActiveSectionRef.current = isActiveSection;
  }, [sectionId]);

  useEffect(() => {
    const liveBodyRoot = liveBodyRootRef.current;
    if (liveBodyRoot === null) {
      setPreviewHost(null);
      return;
    }

    const root = liveBodyRoot.closest('[id$="-CustomResizable"]');
    setPreviewHost(root instanceof HTMLElement ? root : null);
  }, [sectionId]);

  useEffect(() => {
    if (isActiveSection) {
      setPreviewData(null);
      setNeedsCapture(false);
      setStatus("idle");
    } else if (wasActiveSectionRef.current) {
      setPreviewData(null);
      setNeedsCapture(true);
    }
    wasActiveSectionRef.current = isActiveSection;
  }, [isActiveSection]);

  useEffect(() => {
    if (shouldWarmPreview && previewData === null) {
      setNeedsCapture(true);
    }
  }, [previewData, shouldWarmPreview]);

  useEffect(() => {
    if (
      !needsCapture ||
      !shouldWarmPreview ||
      showPreview ||
      isActiveSection ||
      previewHost === null ||
      liveBodyRootRef.current === null
    ) {
      return;
    }

    let cancelled = false;
    const cancelIdleCapture = scheduleIdleCapture(() => {
      void queuePreviewCapture(async () => {
        if (cancelled) {
          return;
        }

        await capturePreview({
          liveBodyRoot: liveBodyRootRef.current,
          previewHost,
          isCancelled: () => cancelled,
          onPending() {
            if (!cancelled) {
              setStatus("pending");
            }
          },
          onReady(nextPreviewData) {
            if (!cancelled) {
              setPreviewData(nextPreviewData);
              setNeedsCapture(false);
              setStatus("ready");
            }
          },
          onError() {
            if (!cancelled) {
              setPreviewData(null);
              setNeedsCapture(false);
              setStatus("error");
            }
          },
        });
      });
    });

    return () => {
      cancelled = true;
      cancelIdleCapture();
    };
  }, [
    isActiveSection,
    needsCapture,
    previewHost,
    sectionId,
    shouldWarmPreview,
    showPreview,
  ]);

  const shouldShowPreview =
    showPreview && !isActiveSection && previewData !== null && previewHost !== null;

  useLayoutEffect(() => {
    if (!shouldShowPreview) {
      return;
    }

    const liveChildren = getLiveBodyChildren(liveBodyRootRef.current);
    if (liveChildren.length === 0) {
      return;
    }

    const restoreEntries = liveChildren.map((child) => ({
      child,
      opacity: child.style.opacity,
      pointerEvents: child.style.pointerEvents,
      userSelect: child.style.userSelect,
      ariaHidden: child.getAttribute("aria-hidden"),
    }));

    for (const entry of restoreEntries) {
      entry.child.style.opacity = "0";
      entry.child.style.pointerEvents = "none";
      entry.child.style.userSelect = "none";
      entry.child.setAttribute("aria-hidden", "true");
    }

    return () => {
      for (const entry of restoreEntries) {
        entry.child.style.opacity = entry.opacity;
        entry.child.style.pointerEvents = entry.pointerEvents;
        entry.child.style.userSelect = entry.userSelect;
        if (entry.ariaHidden === null) {
          entry.child.removeAttribute("aria-hidden");
        } else {
          entry.child.setAttribute("aria-hidden", entry.ariaHidden);
        }
      }
    };
  }, [shouldShowPreview]);

  const previewOverlay =
    shouldShowPreview && previewData !== null && previewHost !== null
      ? createPortal(
          <SectionPreviewOverlay
            bodyBounds={previewData.bodyBounds}
            captureSize={previewData.captureSize}
            previewSrc={previewData.src}
            sectionId={sectionId}
          />,
          previewHost,
        )
      : null;

  return (
    <>
      <div
        className="contents"
        data-section-body-preview-root={sectionId}
        data-section-body-preview-status={status}
        ref={liveBodyRootRef}
      >
        {children}
      </div>
      {previewOverlay}
    </>
  );
};

async function capturePreview({
  liveBodyRoot,
  previewHost,
  isCancelled,
  onPending,
  onReady,
  onError,
}: {
  liveBodyRoot: HTMLDivElement | null;
  previewHost: HTMLElement;
  isCancelled: () => boolean;
  onPending: () => void;
  onReady: (previewData: PreviewData) => void;
  onError: () => void;
}) {
  if (liveBodyRoot === null || isCancelled()) {
    onError();
    return;
  }

  let cleanupCaptureHost: (() => void) | null = null;

  try {
    onPending();

    if (document.fonts !== undefined) {
      await document.fonts.ready;
    }

    await waitForStablePaint();
    if (isCancelled()) {
      return;
    }

    const initialCaptureSize = resolveCaptureSize(previewHost);
    const initialBodyBounds = resolveSectionBodyBounds(liveBodyRoot, previewHost);
    const { captureTarget, cleanup } = mountCaptureClone(
      previewHost,
      initialCaptureSize,
    );
    cleanupCaptureHost = cleanup;

    await waitForStablePaint();
    if (isCancelled()) {
      return;
    }

    const renderedCaptureSize = resolveCaptureSize(captureTarget);
    const { snapdom } = await import("@zumer/snapdom");
    const svgImage = await snapdom.toSvg(captureTarget, {
      cache: "full",
      fast: true,
      outerTransforms: false,
      width: renderedCaptureSize.width,
      height: renderedCaptureSize.height,
    });

    if (!svgImage.complete) {
      await svgImage.decode().catch(() => undefined);
    }
    if (isCancelled()) {
      return;
    }

    onReady({
      src: svgImage.src,
      captureSize: renderedCaptureSize,
      bodyBounds: initialBodyBounds,
    });
  } catch {
    onError();
  } finally {
    cleanupCaptureHost?.();
  }
}

function SectionPreviewOverlay({
  bodyBounds,
  captureSize,
  previewSrc,
  sectionId,
}: {
  bodyBounds: SectionBodyBounds;
  captureSize: CaptureSize;
  previewSrc: string;
  sectionId: string;
}) {
  const overlayStyle: CSSProperties = {
    left: `${bodyBounds.left}px`,
    top: `${bodyBounds.top}px`,
    width: `${bodyBounds.width}px`,
    height: `${bodyBounds.height}px`,
  };
  const imageStyle: CSSProperties = {
    width: `${captureSize.width}px`,
    height: `${captureSize.height}px`,
    maxWidth: "none",
    transform: `translate(${-bodyBounds.left}px, ${-bodyBounds.top}px)`,
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 overflow-hidden"
      data-section-body-preview-overlay={sectionId}
      style={overlayStyle}
    >
      <img
        alt=""
        aria-hidden="true"
        className="block select-none"
        data-section-body-preview-image="true"
        draggable={false}
        src={previewSrc}
        style={imageStyle}
      />
    </div>
  );
}

function scheduleIdleCapture(callback: () => void): () => void {
  if (
    typeof window !== "undefined" &&
    typeof window.requestIdleCallback === "function" &&
    typeof window.cancelIdleCallback === "function"
  ) {
    const handle = window.requestIdleCallback(callback, { timeout: 300 });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = window.setTimeout(callback, 120);
  return () => window.clearTimeout(handle);
}

async function waitForStablePaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function resolveCaptureSize(element: HTMLElement): CaptureSize {
  const rect = element.getBoundingClientRect();
  const viewportScale = getReactFlowViewportScale(element);
  const scaledWidth = rect.width / viewportScale;
  const scaledHeight = rect.height / viewportScale;
  const width = resolveFinitePositiveNumber(
    Math.max(element.offsetWidth, element.scrollWidth, scaledWidth),
  );
  const height = resolveFinitePositiveNumber(
    Math.max(element.offsetHeight, element.scrollHeight, scaledHeight),
  );

  return { width, height };
}

function resolveSectionBodyBounds(
  liveBodyRoot: HTMLElement,
  root: HTMLElement,
): SectionBodyBounds {
  const liveChildren = getLiveBodyChildren(liveBodyRoot);
  if (liveChildren.length === 0) {
    return { left: 0, top: 0, width: 1, height: 1 };
  }

  const viewportScale = getReactFlowViewportScale(root);
  const rootRect = root.getBoundingClientRect();
  let minLeft = Number.POSITIVE_INFINITY;
  let minTop = Number.POSITIVE_INFINITY;
  let maxRight = Number.NEGATIVE_INFINITY;
  let maxBottom = Number.NEGATIVE_INFINITY;

  for (const child of liveChildren) {
    const rect = child.getBoundingClientRect();
    const left = (rect.left - rootRect.left) / viewportScale;
    const top = (rect.top - rootRect.top) / viewportScale;
    const right = left + rect.width / viewportScale;
    const bottom = top + rect.height / viewportScale;
    minLeft = Math.min(minLeft, left);
    minTop = Math.min(minTop, top);
    maxRight = Math.max(maxRight, right);
    maxBottom = Math.max(maxBottom, bottom);
  }

  return {
    left: resolveFinitePositiveNumber(Math.max(0, minLeft)),
    top: resolveFinitePositiveNumber(Math.max(0, minTop)),
    width: resolveFinitePositiveNumber(Math.max(1, maxRight - minLeft)),
    height: resolveFinitePositiveNumber(Math.max(1, maxBottom - minTop)),
  };
}

function getReactFlowViewportScale(element: HTMLElement): number {
  const viewport = element.closest(".react-flow__viewport");
  if (!(viewport instanceof HTMLElement)) {
    return 1;
  }

  const transform = window.getComputedStyle(viewport).transform;
  if (transform === "none") {
    return 1;
  }

  const matrix = new DOMMatrixReadOnly(transform);
  const scaleX = Math.hypot(matrix.a, matrix.b);
  return resolveFinitePositiveNumber(scaleX);
}

function mountCaptureClone(
  root: HTMLElement,
  captureSize: CaptureSize,
): {
  captureTarget: HTMLDivElement;
  cleanup: () => void;
} {
  const captureHost = document.createElement("div");
  captureHost.setAttribute("aria-hidden", "true");
  captureHost.style.position = "fixed";
  captureHost.style.left = "-100000px";
  captureHost.style.top = "0";
  captureHost.style.width = `${captureSize.width}px`;
  captureHost.style.minWidth = `${captureSize.width}px`;
  captureHost.style.maxWidth = `${captureSize.width}px`;
  captureHost.style.opacity = "0";
  captureHost.style.pointerEvents = "none";
  captureHost.style.zIndex = "-1";
  captureHost.style.overflow = "visible";
  captureHost.style.contain = "layout style";

  const captureTarget = root.cloneNode(true) as HTMLDivElement;
  captureTarget.removeAttribute("aria-hidden");
  captureTarget.style.opacity = "1";
  captureTarget.style.pointerEvents = "none";
  captureTarget.style.transform = "none";
  captureTarget.style.width = `${captureSize.width}px`;
  captureTarget.style.minWidth = `${captureSize.width}px`;
  captureTarget.style.maxWidth = `${captureSize.width}px`;
  captureTarget.style.height = `${captureSize.height}px`;
  captureTarget.style.maxHeight = "none";
  captureTarget.style.contain = "none";

  for (const overlay of captureTarget.querySelectorAll(
    "[data-section-body-preview-overlay]",
  )) {
    overlay.remove();
  }

  for (const preview of captureTarget.querySelectorAll(
    "[data-section-body-preview-image]",
  )) {
    preview.remove();
  }

  for (const rootMarker of captureTarget.querySelectorAll<HTMLElement>(
    "[data-section-body-preview-root]",
  )) {
    rootMarker.style.opacity = "1";
    rootMarker.style.pointerEvents = "auto";
  }

  captureHost.appendChild(captureTarget);
  document.body.appendChild(captureHost);

  return {
    captureTarget,
    cleanup: () => {
      captureHost.remove();
    },
  };
}

function getLiveBodyChildren(root: HTMLElement | null): Array<HTMLElement> {
  if (root === null) {
    return [];
  }

  return Array.from(root.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
}

function queuePreviewCapture(task: () => Promise<void>): Promise<void> {
  const nextTask = previewCaptureQueueTail.then(task, task);
  previewCaptureQueueTail = nextTask.catch(() => undefined);
  return nextTask;
}

function resolveFinitePositiveNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return Math.round(value * 100) / 100;
}
