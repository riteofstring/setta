import {
  SectionInfo,
  AllModuleInfo,
  AllObjCollectionInfo,
  AllParamCollectionInfo,
  createInfo,
} from "./jsonParser";

function getCollectionIds(specs, allCollections) {
  return specs ? specs.map((x) => allCollections.nameToId[x]) : [];
}

export function createSectionInfo(
  name,
  specs,
  allObjCollections,
  allParamCollections
) {
  const { info, id } = createInfo(SectionInfo)(name, specs);
  const objCollectionIds = getCollectionIds(
    info.specs.objects,
    allObjCollections
  );
  const paramCollectionIds = getCollectionIds(
    info.specs.parameters,
    allParamCollections
  );
  return { info, id, objCollectionIds, paramCollectionIds };
}

export const createAllInfo = (available) => {
  const allModuleInfo = new AllModuleInfo(available);
  const allObjCollections = new AllObjCollectionInfo(available, allModuleInfo);
  const allParamCollections = new AllParamCollectionInfo(available);
  return { allModuleInfo, allObjCollections, allParamCollections };
};
