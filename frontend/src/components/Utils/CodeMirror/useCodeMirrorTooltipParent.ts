import { useLayoutEffect, useState } from "react";

export function resolveCodeMirrorTooltipParent(
  parentDivId?: string | null,
): HTMLElement | null {
  if (!parentDivId || typeof document === "undefined") {
    return null;
  }
  return document.getElementById(parentDivId);
}

export function useCodeMirrorTooltipParent(
  parentDivId?: string | null,
): HTMLElement | null {
  const [parent, setParent] = useState<HTMLElement | null>(() =>
    resolveCodeMirrorTooltipParent(parentDivId),
  );

  useLayoutEffect(() => {
    const nextParent = resolveCodeMirrorTooltipParent(parentDivId);
    setParent((currentParent) => {
      if (currentParent === nextParent) {
        return currentParent;
      }
      return nextParent;
    });
  }, [parentDivId]);

  return parent;
}
