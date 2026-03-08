import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import { createPortal } from "react-dom";
import {
  type CSSProperties,
  type PropsWithChildren,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useProjectState } from "state/definitions";

type SnapdomStatus = "pending" | "ready" | "error" | "live-active";
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
type HiddenLiveMode = "none" | "opacity" | "visibility";

type SettingsAllSettingsBenchmarkSnapdomSectionBodyProps = PropsWithChildren<{
  sectionId: string;
}>;

export function SettingsAllSettingsBenchmarkSnapdomSectionBody({
  children,
  sectionId,
}: SettingsAllSettingsBenchmarkSnapdomSectionBodyProps) {
  const benchmark = useSettingsAllSettingsBenchmark();
  const liveBodyRootRef = useRef<HTMLDivElement | null>(null);
  const [previewHost, setPreviewHost] = useState<HTMLElement | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [captureSize, setCaptureSize] = useState<CaptureSize | null>(null);
  const [bodyBounds, setBodyBounds] = useState<SectionBodyBounds | null>(null);
  const [status, setStatus] = useState<SnapdomStatus>("pending");

  const shouldUseSnapdomPreview =
    benchmark.active && benchmark.renderSectionBodySnapdomPreview;
  const hiddenOpacity = benchmark.sectionBodyHiddenOpacity ?? null;
  const shouldUseOpacityHidden =
    benchmark.active && hiddenOpacity !== null && hiddenOpacity >= 0;
  const shouldKeepMountedWithSnapdomPreview =
    benchmark.active &&
    benchmark.keepSectionBodyMountedWithSnapdomPreview === true;
  const shouldTrackActiveState =
    shouldUseSnapdomPreview ||
    shouldUseOpacityHidden ||
    shouldKeepMountedWithSnapdomPreview;
  const isActiveSection = useProjectState((x) =>
    shouldTrackActiveState && x.projectConfig.activeIds.includes(sectionId),
  );

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
    if (!shouldUseSnapdomPreview) {
      setPreviewSrc(null);
      setCaptureSize(null);
      setBodyBounds(null);
      setStatus(isActiveSection ? "live-active" : "pending");
      return;
    }

    if (isActiveSection) {
      setPreviewSrc(null);
      setCaptureSize(null);
      setBodyBounds(null);
      setStatus("live-active");
      return;
    }

    const liveBodyRoot = liveBodyRootRef.current;
    const root = previewHost;
    if (liveBodyRoot === null || root === null) {
      setStatus("error");
      return;
    }

    let cancelled = false;

    async function captureSnapshot() {
      setPreviewSrc(null);
      setCaptureSize(null);
      setBodyBounds(null);
      setStatus("pending");

      let cleanupCaptureHost: (() => void) | null = null;

      try {
        if (document.fonts !== undefined) {
          await document.fonts.ready;
        }

        const initialCaptureSize = resolveCaptureSize(root);
        const initialBodyBounds = resolveSectionBodyBounds(liveBodyRoot, root);
        const { captureTarget, cleanup } = mountCaptureClone(root, {
          captureSize: initialCaptureSize,
          bodyBounds: initialBodyBounds,
        });
        cleanupCaptureHost = cleanup;

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        });

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

        if (cancelled) {
          return;
        }

        setPreviewSrc(svgImage.src);
        setCaptureSize(renderedCaptureSize);
        setBodyBounds(initialBodyBounds);
        setStatus("ready");
      } catch {
        if (cancelled) {
          return;
        }
        setPreviewSrc(null);
        setCaptureSize(null);
        setBodyBounds(null);
        setStatus("error");
      } finally {
        cleanupCaptureHost?.();
      }
    }

    void captureSnapshot();

    return () => {
      cancelled = true;
    };
  }, [isActiveSection, previewHost, sectionId, shouldUseSnapdomPreview]);

  const effectiveStatus: SnapdomStatus = isActiveSection
    ? "live-active"
    : status;
  const shouldShowSnapdomPreview =
    shouldUseSnapdomPreview &&
    !isActiveSection &&
    previewSrc !== null &&
    captureSize !== null &&
    bodyBounds !== null &&
    status === "ready";
  const hiddenLiveStatus = isActiveSection
    ? "visible-active"
    : shouldShowSnapdomPreview
      ? "hidden-ready"
      : status === "error"
        ? "visible-error"
        : "visible-pending";
  const opacityStatus = isActiveSection ? "visible-active" : "hidden";
  const hiddenLiveMode = resolveHiddenLiveMode({
    isActiveSection,
    shouldUseOpacityHidden,
    shouldUseSnapdomPreview,
    shouldShowSnapdomPreview,
    shouldKeepMountedWithSnapdomPreview,
  });

  useLayoutEffect(() => {
    const liveBodyRoot = liveBodyRootRef.current;
    const liveChildren = getLiveBodyChildren(liveBodyRoot);
    if (liveChildren.length === 0 || hiddenLiveMode === "none") {
      return;
    }

    const restoreEntries = liveChildren.map((child) => ({
      child,
      opacity: child.style.opacity,
      visibility: child.style.visibility,
      pointerEvents: child.style.pointerEvents,
      userSelect: child.style.userSelect,
      ariaHidden: child.getAttribute("aria-hidden"),
    }));

    for (const entry of restoreEntries) {
      entry.child.style.pointerEvents = "none";
      entry.child.style.userSelect = "none";
      if (hiddenLiveMode === "opacity") {
        entry.child.style.opacity = String(hiddenOpacity ?? 0);
        entry.child.style.visibility = "";
      } else {
        entry.child.style.opacity = "";
        entry.child.style.visibility = "hidden";
      }
      entry.child.setAttribute("aria-hidden", "true");
    }

    return () => {
      for (const entry of restoreEntries) {
        entry.child.style.opacity = entry.opacity;
        entry.child.style.visibility = entry.visibility;
        entry.child.style.pointerEvents = entry.pointerEvents;
        entry.child.style.userSelect = entry.userSelect;
        if (entry.ariaHidden === null) {
          entry.child.removeAttribute("aria-hidden");
        } else {
          entry.child.setAttribute("aria-hidden", entry.ariaHidden);
        }
      }
    };
  }, [hiddenLiveMode, hiddenOpacity]);

  const previewOverlay =
    shouldShowSnapdomPreview &&
    previewHost !== null &&
    bodyBounds !== null &&
    captureSize !== null
      ? createPortal(
          <SectionSnapdomPreviewOverlay
            bodyBounds={bodyBounds}
            captureSize={captureSize}
            previewSrc={previewSrc}
            sectionId={sectionId}
          />,
          previewHost,
        )
      : null;

  return (
    <>
      <div
        className="contents"
        data-settings-benchmark-section-snapdom={
          shouldUseSnapdomPreview ? sectionId : undefined
        }
        data-settings-benchmark-section-snapdom-status={
          shouldUseSnapdomPreview ? effectiveStatus : undefined
        }
        data-settings-benchmark-section-snapdom-capture-width={
          shouldUseSnapdomPreview && captureSize !== null
            ? String(captureSize.width)
            : undefined
        }
        data-settings-benchmark-section-snapdom-capture-height={
          shouldUseSnapdomPreview && captureSize !== null
            ? String(captureSize.height)
            : undefined
        }
        data-settings-benchmark-section-snapdom-preview-left={
          shouldUseSnapdomPreview && bodyBounds !== null
            ? String(bodyBounds.left)
            : undefined
        }
        data-settings-benchmark-section-snapdom-preview-top={
          shouldUseSnapdomPreview && bodyBounds !== null
            ? String(bodyBounds.top)
            : undefined
        }
        data-settings-benchmark-section-snapdom-preview-width={
          shouldUseSnapdomPreview && bodyBounds !== null
            ? String(bodyBounds.width)
            : undefined
        }
        data-settings-benchmark-section-snapdom-preview-height={
          shouldUseSnapdomPreview && bodyBounds !== null
            ? String(bodyBounds.height)
            : undefined
        }
        data-settings-benchmark-section-opacity-hidden={
          shouldUseOpacityHidden || shouldKeepMountedWithSnapdomPreview
            ? sectionId
            : undefined
        }
        data-settings-benchmark-section-opacity-hidden-status={
          shouldUseOpacityHidden
            ? opacityStatus
            : shouldKeepMountedWithSnapdomPreview
              ? hiddenLiveStatus
              : undefined
        }
        ref={liveBodyRootRef}
      >
        {children}
      </div>
      {previewOverlay}
    </>
  );
}

function resolveHiddenLiveMode({
  isActiveSection,
  shouldUseOpacityHidden,
  shouldUseSnapdomPreview,
  shouldShowSnapdomPreview,
  shouldKeepMountedWithSnapdomPreview,
}: {
  isActiveSection: boolean;
  shouldUseOpacityHidden: boolean;
  shouldUseSnapdomPreview: boolean;
  shouldShowSnapdomPreview: boolean;
  shouldKeepMountedWithSnapdomPreview: boolean;
}): HiddenLiveMode {
  if (isActiveSection) {
    return "none";
  }
  if (shouldUseOpacityHidden) {
    return "opacity";
  }
  if (!shouldUseSnapdomPreview || !shouldShowSnapdomPreview) {
    return "none";
  }
  if (shouldKeepMountedWithSnapdomPreview) {
    return "opacity";
  }
  return "visibility";
}

function SectionSnapdomPreviewOverlay({
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
      data-settings-benchmark-section-snapdom-preview-overlay={sectionId}
      style={overlayStyle}
    >
      <img
        alt=""
        aria-hidden="true"
        className="block select-none"
        data-settings-benchmark-section-snapdom-preview="true"
        draggable={false}
        src={previewSrc}
        style={imageStyle}
      />
    </div>
  );
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
  {
    captureSize,
    bodyBounds,
  }: {
    captureSize: CaptureSize;
    bodyBounds: SectionBodyBounds;
  },
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
    "[data-settings-benchmark-section-snapdom-preview-overlay]",
  )) {
    overlay.remove();
  }

  for (const preview of captureTarget.querySelectorAll(
    "[data-settings-benchmark-section-snapdom-preview]",
  )) {
    preview.remove();
  }

  for (const rootMarker of captureTarget.querySelectorAll<HTMLElement>(
    "[data-settings-benchmark-section-snapdom], [data-settings-benchmark-section-opacity-hidden]",
  )) {
    rootMarker.style.opacity = "1";
    rootMarker.style.visibility = "visible";
    rootMarker.style.pointerEvents = "auto";
  }

  for (const hiddenChild of captureTarget.querySelectorAll<HTMLElement>(
    ".section-args, .section-row-pin-main",
  )) {
    hiddenChild.style.opacity = "1";
    hiddenChild.style.visibility = "visible";
    hiddenChild.style.pointerEvents = "auto";
  }

  const overlayMask = document.createElement("div");
  overlayMask.setAttribute("aria-hidden", "true");
  overlayMask.style.position = "absolute";
  overlayMask.style.left = "0";
  overlayMask.style.top = "0";
  overlayMask.style.width = `${captureSize.width}px`;
  overlayMask.style.height = `${bodyBounds.top}px`;
  overlayMask.style.background = "transparent";
  overlayMask.style.pointerEvents = "none";
  captureTarget.appendChild(overlayMask);

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

function resolveFinitePositiveNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return Math.round(value * 100) / 100;
}
