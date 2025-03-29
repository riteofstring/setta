import C from "constants/constants.json";
import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import { escapeRegExp, templatePrefix } from "utils/utils";
import { getSectionPathFullName } from "./sectionInfos";

// input is state computed by keyword regex subscription
export function getTemplateVarsRegexAndColorMap(state) {
  const namesForRegex = [
    C.SETTA_GENERATED_PYTHON,
    C.SETTA_GENERATED_PYTHON_IMPORTS,
  ];
  const fullRawNameToSectionId = {};
  for (const n of namesForRegex) {
    fullRawNameToSectionId[n] = null;
  }

  const sectionState = useSectionInfos.getState();
  // TODO: make this better instead of 3 for loops
  for (const [sectionId, suffixes] of Object.entries(
    state.templateVarEligibleSections,
  )) {
    const sectionFullName = getSectionPathFullName(sectionId, sectionState);
    for (const suffix of suffixes) {
      const fullName = sectionFullName + `${C.TEMPLATE_PREFIX}${suffix}`;
      namesForRegex.push(escapeRegExp(fullName));
      fullRawNameToSectionId[fullName] = sectionId;
    }
  }

  const fullNameToSectionId = _.mapKeys(fullRawNameToSectionId, (v, k) =>
    templatePrefix(k),
  );

  return { namesForRegex, fullNameToSectionId };
}
