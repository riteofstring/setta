import { useSettingsAllSettingsBenchmark } from "components/Pages/Project/settingsAllSettingsBenchmark";
import {
  type PropsWithChildren,
  useEffect,
  useRef,
  useState,
} from "react";

type SnapdomStatus = "pending" | "ready" | "error" | "live-active";

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
  const [status, setStatus] = useState<SnapdomStatus>(
    isActiveSection ? "live-active" : "pending",
  );

  const shouldUseSnapdomPreview =
    benchmark.active && benchmark.renderSectionBodySnapdomPreview;

  useEffect(() => {
    if (!shouldUseSnapdomPreview) {
      setPreviewSrc(null);
      setStatus(isActiveSection ? "live-active" : "pending");
      return;
    }

    if (isActiveSection) {
      setPreviewSrc(null);
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
      setStatus("pending");

      try {
        if (document.fonts !== undefined) {
          await document.fonts.ready;
        }

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        });

        const { snapdom } = await import("@zumer/snapdom");
        const svgImage = await snapdom.toSvg(liveBody, {
          cache: "full",
          fast: true,
        });

        if (!svgImage.complete) {
          await svgImage.decode().catch(() => undefined);
        }

        if (cancelled) {
          return;
        }

        setPreviewSrc(svgImage.src);
        setStatus("ready");
      } catch {
        if (cancelled) {
          return;
        }
        setStatus("error");
      }
    }

    void captureSnapshot();

    return () => {
      cancelled = true;
    };
  }, [isActiveSection, sectionId, shouldUseSnapdomPreview]);

  if (!shouldUseSnapdomPreview) {
    return children;
  }

  const showLiveBody = previewSrc === null;

  return (
    <div
      className="w-full min-w-0"
      data-settings-benchmark-section-snapdom={sectionId}
      data-settings-benchmark-section-snapdom-status={status}
    >
      {showLiveBody ? (
        <div
          ref={liveBodyRef}
          className="w-full min-w-0"
          data-settings-benchmark-section-snapdom-live={status}
        >
          {children}
        </div>
      ) : (
        <img
          alt=""
          aria-hidden="true"
          className="block h-auto w-full select-none"
          data-settings-benchmark-section-snapdom-preview="true"
          draggable={false}
          src={previewSrc}
        />
      )}
    </div>
  );
}
