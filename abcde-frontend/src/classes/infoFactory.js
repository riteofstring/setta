import _ from "lodash";

import { isRoot } from "../utils/constants";
import { createNewId } from "../utils/sectionIds";
import { AllObjCollectionInfo, AllPackageInfo } from "./immutableInfo";
import { SectionInfo } from "./mutableInfo";
import { SectionType } from "./sectionType";

function emptySpecs() {
  return { objects: [], parameters: [] };
}

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
      topLevelSpecs: uiSpecs ? uiSpecs.get(name) : emptySpecs(),
      parentIsSection,
      uiTypeCollectionId: createNewId(),
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
  const allPackageInfo = Object.freeze(new AllPackageInfo(available.packages));
  const allObjs = {};
  _.values(allPackageInfo.children).forEach((x) =>
    _.values(x.children).forEach((y) =>
      _.values(y.children).forEach((z) => (allObjs[z.id] = z))
    )
  );
  const allObjCollections = Object.freeze(
    new AllObjCollectionInfo(available.objCollections, allObjs)
  );
  // const allParamCollections = Object.freeze(
  //   new AllParamCollectionInfo(available)
  // );
  // return { allModuleInfo, allObjCollections, allParamCollections };
};
