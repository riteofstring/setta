import { useSectionRefs } from "state/definitions";

export function setSectionRef({
  sectionId,
  withNested,
  selfOnly,
  overflowElement,
}: {
  sectionId: string;
  withNested?: HTMLElement;
  selfOnly?: HTMLElement;
  overflowElement?: HTMLElement;
}) {
  useSectionRefs.setState((state) => {
    if (withNested) {
      state.withNested[sectionId] = withNested;
    }
    if (selfOnly) {
      state.selfOnly[sectionId] = selfOnly;
    }
    if (overflowElement) {
      state.overflowElement = state.overflowElement || {};
      state.overflowElement[sectionId] = overflowElement;
    }
  });
}

export function deleteSectionRef({ sectionId }: { sectionId: string }) {
  useSectionRefs.setState((state) => {
    delete state.withNested[sectionId];
    delete state.selfOnly[sectionId];
    if (state.overflowElement) {
      delete state.overflowElement[sectionId];
    }
  });
}
