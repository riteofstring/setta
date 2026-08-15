import { createContext, useContext } from "react";

// The reference paints a code section's header icon from the section itself (its
// `renderCodeLanguageIcon` reads the section's language). A registered icon component receives
// only its class name, so the header names the section it is painting through this
// package-internal context instead of widening the public icon contract.
const SectionKindIconContext = createContext<string | null>(null);

export const SectionKindIconProvider = SectionKindIconContext.Provider;

export function useSectionKindIconSectionId(): string {
  const sectionId = useContext(SectionKindIconContext);
  if (sectionId === null) {
    throw new Error("A section kind icon rendered outside a section header.");
  }
  return sectionId;
}
