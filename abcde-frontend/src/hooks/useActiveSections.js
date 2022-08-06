import { useStoreState } from "easy-peasy";

export function useIsActiveSection(sectionId) {
  const topLevel = useStoreState((x) => x.activeSections.topLevel);
  const nested = useStoreState((x) => x.activeSections.nested);
  console.log("useIsActiveSection")
  return nested === sectionId || topLevel.has(sectionId);
}
