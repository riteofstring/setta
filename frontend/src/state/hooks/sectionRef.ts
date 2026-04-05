import { useEffect, useRef, type MutableRefObject } from "react";
import {
  deleteSectionElementSize,
  setSectionElementSize,
} from "state/actions/sectionElementSizes";
import { deleteSectionRef, setSectionRef } from "state/actions/sectionRefs";
import { measureSectionElementSize } from "./sectionElementSizes";

type SectionRefType = "selfOnly" | "withNested";

export function useSectionRefAndInit(
  sectionId: string,
  type: SectionRefType,
): MutableRefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    setSectionRef({ sectionId, [type]: element });

    let resizeObserver: ResizeObserver | null = null;

    if (type === "selfOnly" && element instanceof HTMLElement) {
      syncSectionElementSize(sectionId, element);

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          syncSectionElementSize(sectionId, element);
        });
        resizeObserver.observe(element);
      }
    }

    return () => {
      resizeObserver?.disconnect();
      if (type === "selfOnly") {
        deleteSectionElementSize(sectionId);
      }
      deleteSectionRef({ sectionId });
    };
  }, [sectionId, type]);

  return ref;
}

function syncSectionElementSize(sectionId: string, element: HTMLElement) {
  const size = measureSectionElementSize(element);
  if (!size) {
    return;
  }

  setSectionElementSize({ sectionId, size });
}
