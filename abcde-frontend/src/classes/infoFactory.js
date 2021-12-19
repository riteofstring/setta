import { isRoot } from "../utils/constants";
import { createNewId } from "../utils/sectionIds";
import {
  AllModuleInfo,
  AllObjCollectionInfo,
  AllParamCollectionInfo,
} from "./immutableInfo";
import { SectionInfo } from "./mutableInfo";
import { SectionType } from "./sectionType";

export function createSectionInfo(
  name,
  allObjCollections,
  allParamCollections,
  parentSectionInfo,
  parentSectionType,
  paramUIType,
  paramUITypeConfig,
  uiSpecs,
  parentIsSection
) {
  let sectionType = null;
  if (isRoot(parentSectionType?.name)) {
    sectionType = parentSectionType.childType;
  } else {
    sectionType = new SectionType({
      id: createNewId(),
      allObjCollections,
      allParamCollections,
      parentSectionType,
      paramUIType,
      paramUITypeConfig,
      topLevelSpecs: uiSpecs.get(name),
      parentIsSection,
    });
  }

  const info = new SectionInfo({
    id: createNewId(),
    name,
    sectionTypeId: sectionType.id,
    parentSectionInfo,
    paramCollectionId: createNewId(),
    kwargCollectionId: createNewId(),
  });

  return { info, sectionType };
}

export const createAllInfo = (available) => {
  const allModuleInfo = Object.freeze(new AllModuleInfo(available));
  const allObjCollections = Object.freeze(
    new AllObjCollectionInfo(available, allModuleInfo)
  );
  const allParamCollections = Object.freeze(
    new AllParamCollectionInfo(available)
  );
  return { allModuleInfo, allObjCollections, allParamCollections };
};
