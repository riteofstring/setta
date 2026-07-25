import { useEffect, useRef, useState, type RefObject } from "react";

import { registerRendererPageTeardown } from "../../renderer-page-lifecycle";

export interface PrototypeActivity {
  active: boolean;
  reducedMotion: boolean;
  stageRef: RefObject<HTMLElement | null>;
}

export function usePrototypeActivity(explicitlyRunning: boolean): PrototypeActivity {
  const stageRef = useRef<HTMLElement | null>(null);
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  const [windowFocused, setWindowFocused] = useState(
    () => typeof document === "undefined" || document.hasFocus(),
  );
  const [stageIntersecting, setStageIntersecting] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [tearingDown, setTearingDown] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateVisibility = () => setDocumentVisible(document.visibilityState === "visible");
    const updateMotion = () => setReducedMotion(media.matches);
    const handleFocus = () => setWindowFocused(true);
    const handleBlur = () => setWindowFocused(false);
    const unregisterTeardown = registerRendererPageTeardown(() => setTearingDown(true));

    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    media.addEventListener("change", updateMotion);
    return () => {
      unregisterTeardown();
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      media.removeEventListener("change", updateMotion);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof IntersectionObserver === "undefined") {
      return;
    }
    const minimumVisibleRatio = 0.15;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setStageIntersecting(
          (entry?.isIntersecting ?? false) &&
            (entry?.intersectionRatio ?? 0) >= minimumVisibleRatio,
        );
      },
      { threshold: [0, minimumVisibleRatio] },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  return {
    active:
      explicitlyRunning &&
      documentVisible &&
      windowFocused &&
      stageIntersecting &&
      !reducedMotion &&
      !tearingDown,
    reducedMotion,
    stageRef,
  };
}
