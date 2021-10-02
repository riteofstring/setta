import {
  SectionInfo,
  AllModuleInfo,
  AllObjCollectionInfo,
  AllParamCollectionInfo,
} from "./jsonParser";

function getCollectionIds(specs, allCollections) {
  return specs ? Object.keys(specs).map((x) => allCollections.nameToId[x]) : [];
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

// export function createParameterInfo(name, jsonInput) {
//   const { info, id } = createInfo(ParameterInfo, name, jsonInput);
//   const uiType = new UIType({
//     id: createNewId(),
//     name: jsonInput.uiType,
//   });
//   return {
//     info,
//     id,
//     uiType,
//     config: { id: createNewId(), config: info.specs },
//   };
// }

export const createAllInfo = (available) => {
  const allModuleInfo = new AllModuleInfo(available);
  const allObjCollections = new AllObjCollectionInfo(available, allModuleInfo);
  const allParamCollections = new AllParamCollectionInfo(available);
  return { allModuleInfo, allObjCollections, allParamCollections };
};
