import _ from "lodash";

import { isRoot } from "../utils/constants";
import { createNewId } from "../utils/sectionIds";
import {
  AllObjCollectionInfo,
  AllPackageInfo,
  AllParamCollectionInfo,
} from "./immutableInfo";
import { SectionInfo } from "./mutableInfo";
import { SectionType } from "./sectionType";

export function createSectionInfo(
  name,
  sectionTypeName,
  parentSectionInfo,
  parentSectionType,
  sectionSpecs,
  paramInfoId
) {
  let sectionType = null;
  if (isRoot(parentSectionType?.name)) {
    sectionType = parentSectionType.childType;
  } else {
    sectionType = new SectionType({
      id: createNewId(),
      name: sectionTypeName,
      sectionSpecs,
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
    paramInfoId,
  });

  return { info, sectionType };
}

export const createAllInfo = (available) => {
  const allPackageInfo = Object.freeze(new AllPackageInfo(available.packages));
  const allModuleInfo = createDirectMapping(allPackageInfo.children);
  const allObjInfo = createDirectMapping(allModuleInfo);
  const allObjCollections = Object.freeze(
    new AllObjCollectionInfo(available.objCollections, allObjInfo)
  );
  const allParamCollections = Object.freeze(
    new AllParamCollectionInfo(available.paramCollections)
  );
  return {
    allPackageInfo,
    allModuleInfo,
    allObjInfo,
    allObjCollections,
    allParamCollections,
  };
};

function createDirectMapping(sourceInfo) {
  const output = {};
  _.values(sourceInfo).forEach((x) =>
    _.values(x.children).forEach((y) => (output[y.id] = y))
  );
  return output;
}
