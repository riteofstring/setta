import { useSectionInfos } from "state/definitions";
import { dummyRegExpObject } from "utils/utils";
import { getSectionPathFullName } from "./sectionInfos";

// input is state computed by keyword regex subscription
export function getTemplateVarsRegexAndColorMap(state) {
  const names = [];
  const fullNameToSectionId = {};
  const sectionState = useSectionInfos.getState();
  for (const sectionId of state.templateVarEligibleSections) {
    const fullName = getSectionPathFullName(sectionId, sectionState);
    names.push(fullName);
    fullNameToSectionId[fullName] = sectionId;
  }

  if (names.length === 0) {
    return {
      pattern: dummyRegExpObject(),
      fullNameToSectionId,
    };
  }

  const patternStr = `(?<![A-Za-z."'_])\\$(${names.join("|")})(?![A-Za-z"'_])`;
  const pattern = new RegExp(patternStr, "g");

  return { pattern, fullNameToSectionId };
}
