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
  id,
  parentSectionInfo,
  parentSectionType,
  paramUIType,
  paramUITypeConfig,
  uiSpecs,
  parentIsSection
) {
  const sectionType = new SectionType({
    id: createNewId(),
    allObjCollections,
    allParamCollections,
    parentSectionType,
    paramUIType,
    paramUITypeConfig,
    topLevelSpecs: uiSpecs.get(name),
    parentIsSection,
  });

  const sectionTypeId = sectionType.id;

  const info = new SectionInfo({
    id,
    name,
    sectionTypeId,
    parentSectionInfo,
  });

  return { info, id, sectionType, sectionTypeId };
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
