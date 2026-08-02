import { SectionType, SectionTypeEnum } from "utils/generatedTypes";

const rootTypes = new Set([SectionTypeEnum.ListRoot, SectionTypeEnum.Group]);
const topLevelOnlyTypes = new Set([
  SectionTypeEnum.StateMachineStart,
  SectionTypeEnum.StateMachineGate,
  SectionTypeEnum.StateMachineEnd,
]);

export function getIsRoot(type: SectionType) {
  // @ts-expect-error 'has' is not well typed
  return rootTypes.has(type);
}

export function getIsTopLevelOnlySectionType(type: SectionType) {
  // @ts-expect-error 'has' is not well typed
  return topLevelOnlyTypes.has(type);
}
