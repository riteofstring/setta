import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import { type PropsWithChildren, useEffect, useRef, useState } from "react";

type SnapdomStatus = "pending" | "ready" | "error" | "live-active";
type CaptureSize = {
  width: number;
  height: number;
};

type SettingsAllSettingsBenchmarkSnapdomSectionBodyProps = PropsWithChildren<{
  sectionId: string;
  isActiveSection: boolean;
}>;

export function SettingsAllSettingsBenchmarkSnapdomSectionBody({
  children,
  sectionId,
  isActiveSection,
}: SettingsAllSettingsBenchmarkSnapdomSectionBodyProps) {
  const benchmark = useSettingsAllSettingsBenchmark();
  const liveBodyRef = useRef<HTMLDivElement | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [captureSize, setCaptureSize] = useState<CaptureSize | null>(null);
  const [status, setStatus] = useState<SnapdomStatus>(
    isActiveSection ? "live-active" : "pending",
  );

  const shouldUseSnapdomPreview =
    benchmark.active && benchmark.renderSectionBodySnapdomPreview;
  const shouldUseOpacityHidden =
    benchmark.active && benchmark.renderSectionBodyOpacityHidden === true;
  const shouldKeepMountedWithSnapdomPreview =
    benchmark.active &&
    benchmark.keepSectionBodyMountedWithSnapdomPreview === true;

  useEffect(() => {
    if (!shouldUseSnapdomPreview) {
      setPreviewSrc(null);
      setCaptureSize(null);
      setStatus(isActiveSection ? "live-active" : "pending");
      return;
    }

    if (isActiveSection) {
      setPreviewSrc(null);
      setCaptureSize(null);
      setStatus("live-active");
      return;
    }

    const liveBody = liveBodyRef.current;
    if (liveBody === null) {
      setStatus("error");
      return;
    }

    let cancelled = false;

    async function captureSnapshot() {
      setPreviewSrc(null);
      setCaptureSize(null);
      setStatus("pending");

      let cleanupCaptureHost: (() => void) | null = null;

      try {
        if (document.fonts !== undefined) {
          await document.fonts.ready;
        }

        const initialCaptureSize = resolveCaptureSize(liveBody);
        const { captureTarget, cleanup } = mountCaptureClone(
          liveBody,
          initialCaptureSize,
        );
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
        setStatus("ready");
      } catch {
        if (cancelled) {
          return;
        }
        setCaptureSize(null);
        setStatus("error");
      } finally {
        cleanupCaptureHost?.();
      }
    }

    void captureSnapshot();

    return () => {
      cancelled = true;
    };
  }, [isActiveSection, sectionId, shouldUseSnapdomPreview]);

  if (!shouldUseSnapdomPreview && !shouldUseOpacityHidden) {
    return children;
  }

  if (shouldUseOpacityHidden) {
    const opacityStatus = isActiveSection ? "visible-active" : "hidden";
    return (
      <div
        className="w-full min-w-0"
        data-settings-benchmark-section-opacity-hidden={sectionId}
        data-settings-benchmark-section-opacity-hidden-status={opacityStatus}
      >
        <div
          aria-hidden={isActiveSection ? undefined : "true"}
          className={
            isActiveSection
              ? "w-full min-w-0 opacity-100"
              : "pointer-events-none w-full min-w-0 opacity-0"
          }
          data-settings-benchmark-section-opacity-hidden-live={opacityStatus}
        >
          {children}
        </div>
      </div>
    );
  }

  const effectiveStatus: SnapdomStatus = isActiveSection
    ? "live-active"
    : status;
  const isSnapdomHiddenLiveReady =
    shouldKeepMountedWithSnapdomPreview &&
    !isActiveSection &&
    previewSrc !== null &&
    status === "ready";
  const hiddenLiveStatus = isActiveSection
    ? "visible-active"
    : isSnapdomHiddenLiveReady
      ? "hidden-ready"
      : status === "error"
        ? "visible-error"
        : "visible-pending";
  const showLiveBody = shouldKeepMountedWithSnapdomPreview
    ? true
    : isActiveSection || previewSrc === null;

  return (
    <div
      className={
        shouldKeepMountedWithSnapdomPreview
          ? "relative w-full min-w-0"
          : "w-full min-w-0"
      }
      data-settings-benchmark-section-snapdom={sectionId}
      data-settings-benchmark-section-snapdom-status={effectiveStatus}
      data-settings-benchmark-section-snapdom-capture-width={
        captureSize !== null ? String(captureSize.width) : undefined
      }
      data-settings-benchmark-section-snapdom-capture-height={
        captureSize !== null ? String(captureSize.height) : undefined
      }
      data-settings-benchmark-section-opacity-hidden={
        shouldKeepMountedWithSnapdomPreview ? sectionId : undefined
      }
      data-settings-benchmark-section-opacity-hidden-status={
        shouldKeepMountedWithSnapdomPreview ? hiddenLiveStatus : undefined
      }
    >
      {showLiveBody ? (
        <div
          ref={liveBodyRef}
          aria-hidden={isSnapdomHiddenLiveReady ? "true" : undefined}
          className={
            isSnapdomHiddenLiveReady
              ? "pointer-events-none w-full min-w-0 opacity-0"
              : "w-full min-w-0 opacity-100"
          }
          data-settings-benchmark-section-snapdom-live={effectiveStatus}
          data-settings-benchmark-section-opacity-hidden-live={
            shouldKeepMountedWithSnapdomPreview ? hiddenLiveStatus : undefined
          }
        >
          {children}
        </div>
      ) : (
        <img
          alt=""
          aria-hidden="true"
          className={
            shouldKeepMountedWithSnapdomPreview
              ? "pointer-events-none absolute inset-x-0 top-0 z-10 block h-auto w-full select-none"
              : "block h-auto w-full select-none"
          }
          data-settings-benchmark-section-snapdom-preview="true"
          draggable={false}
          src={previewSrc}
        />
      )}
      {shouldKeepMountedWithSnapdomPreview &&
      previewSrc !== null &&
      !isActiveSection ? (
        <img
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 block h-auto w-full select-none"
          data-settings-benchmark-section-snapdom-preview="true"
          draggable={false}
          src={previewSrc}
        />
      ) : null}
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
  liveBody: HTMLElement,
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

  const captureTarget = liveBody.cloneNode(true) as HTMLDivElement;
  captureTarget.removeAttribute("aria-hidden");
  captureTarget.style.opacity = "1";
  captureTarget.style.pointerEvents = "none";
  captureTarget.style.transform = "none";
  captureTarget.style.width = `${captureSize.width}px`;
  captureTarget.style.minWidth = `${captureSize.width}px`;
  captureTarget.style.maxWidth = `${captureSize.width}px`;
  captureTarget.style.height = "auto";
  captureTarget.style.maxHeight = "none";
  captureTarget.style.contain = "none";

  captureHost.appendChild(captureTarget);
  document.body.appendChild(captureHost);

  return {
    captureTarget,
    cleanup: () => {
      captureHost.remove();
    },
  };
}

function resolveFinitePositiveNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return Math.round(value * 100) / 100;
}
