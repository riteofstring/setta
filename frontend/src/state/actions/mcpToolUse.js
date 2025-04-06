import { addRegularSectionInEmptySpace } from "./sections/createSections";

export function mcpToolUse(details) {
  const { fnName, args } = details;

  if (fnName === "addRegularSectionInEmptySpace") {
    addRegularSectionInEmptySpace();
  }
}
