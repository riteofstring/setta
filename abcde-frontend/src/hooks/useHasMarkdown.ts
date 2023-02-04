import { useMarkdown } from "models/markdown";

export function useHasMarkdown(sectionId) {
  return useMarkdown((x) => !!x.x[sectionId]);
}
