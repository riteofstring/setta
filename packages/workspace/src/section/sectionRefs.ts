import { useEffect, useRef } from "react";
import { createWithEqualityFn } from "zustand/traditional";
import { withResetFn } from "../state/storeUtils";

// The reference's `useSectionRefs` store plus `state/actions/sectionRefs.ts` and
// `state/hooks/sectionRef.ts`. `withNested` holds the outer container element (group chrome
// included); `selfOnly` holds the leaf section shell. DOM measurement fallbacks (marquee
// hit-testing, selection bounds) read whichever is registered.
type SectionRefsState = {
  withNested: Record<string, HTMLElement | null>;
  selfOnly: Record<string, HTMLElement | null>;
};

export const useSectionRefs = createWithEqualityFn(
  withResetFn<SectionRefsState>(() => ({
    withNested: {},
    selfOnly: {},
  })),
);

function setSectionRef({
  sectionId,
  withNested,
  selfOnly,
}: {
  sectionId: string;
  withNested?: HTMLElement | null;
  selfOnly?: HTMLElement | null;
}) {
  useSectionRefs.setState((state) => {
    if (withNested) {
      return { withNested: { ...state.withNested, [sectionId]: withNested } };
    }
    return { selfOnly: { ...state.selfOnly, [sectionId]: selfOnly ?? null } };
  });
}

function deleteSectionRef({ sectionId }: { sectionId: string }) {
  useSectionRefs.setState((state) => {
    const withNested = { ...state.withNested };
    const selfOnly = { ...state.selfOnly };
    delete withNested[sectionId];
    delete selfOnly[sectionId];
    return { withNested, selfOnly };
  });
}

export function useSectionRefAndInit(
  sectionId: string,
  type: "withNested" | "selfOnly",
) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSectionRef({ sectionId, [type]: ref.current });
    return () => deleteSectionRef({ sectionId });
  }, [sectionId, type]);

  return ref;
}
