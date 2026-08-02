import type { SectionCapabilities } from "utils/generatedTypes";

export function isRunnableSectionForCustomRun(
  sectionCapabilities: SectionCapabilities | null | undefined,
): boolean {
  return Boolean(sectionCapabilities?.canRun);
}
