import { useLayoutEffect, useState } from "react";

export function useCodeMirrorTooltipParent(
  parentDivId?: string | null,
): HTMLElement | null {
  const [parent, setParent] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!parentDivId) {
      setParent(null);
      return;
    }
    const element = document.getElementById(parentDivId);
    setParent(element);
  }, [parentDivId]);

  return parent;
}
