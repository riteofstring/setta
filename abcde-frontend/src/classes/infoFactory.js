import {
  AllModuleInfo,
  AllObjCollectionInfo,
  AllParamCollectionInfo,
} from "./immutableInfo";
import { SectionInfo } from "./mutableInfo";

function getCollectionIds(specs, allCollections) {
  return specs ? specs.map((x) => allCollections.nameToId[x]) : [];
}

export function createSectionInfo(
  name,
  specs,
  allObjCollections,
  allParamCollections,
  id
) {
  const info = new SectionInfo({ id, name, specs });
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
  const allModuleInfo = Object.freeze(new AllModuleInfo(available));
  const allObjCollections = Object.freeze(
    new AllObjCollectionInfo(available, allModuleInfo)
  );
  const allParamCollections = Object.freeze(
    new AllParamCollectionInfo(available)
  );
  return { allModuleInfo, allObjCollections, allParamCollections };
};
