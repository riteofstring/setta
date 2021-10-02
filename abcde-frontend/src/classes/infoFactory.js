import {
  SectionInfo,
  AllModuleInfo,
  AllObjCollectionInfo,
  AllParamCollectionInfo,
} from "./jsonParser";

function createInfo(infoType, name, jsonInput, ...otherArgs) {
  const info = new infoType(createNewId(), name, jsonInput, ...otherArgs);
  return { info, id: info.id };
}

export function createSectionInfo(name, specs, available) {
  const jsonInput = createJson(specs, available);
  const { info, id } = createInfo(SectionInfo, name, jsonInput, specs);
  const moduleInfos = getInfos(jsonInput, createModuleInfo, true);
  const parameterInfos = getInfos(jsonInput, createParameterInfo, true);
  return { info, id, moduleInfos, parameterInfos };
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
  console.log("allModuleInfo", allModuleInfo);
  console.log("allObjCollections", allObjCollections);
  console.log("allParamCollections", allParamCollections);

  // const newModuleInfos = {};
  // const newModuleObjInfos = {};
  // const newObjInfos = {};
  // const newObjParamInfos = {};
  // const newParamInfos = {};
  // const newParamUITypeIds = {};
  // const newUITypes = {};
  // const newUITypeConfigIds = {};
  // const newUITypeConfigs = {};

  // for (let m of Object.keys(allModules)) {
  //   const { info, id, objInfos } = createModuleInfo(m, allModules[m]);
  //   newModuleInfos[id] = info;
  //   newModuleObjInfos[id] = objInfos.map((x) => x.id);
  //   for (let o of objInfos) {
  //     newObjInfos[o.id] = o.info;
  //     newObjParamInfos[o.id] = o.parameterInfos.map((x) => x.id);
  //     for (let p of o.parameterInfos) {
  //       newParamInfos[p.id] = p.info;
  //       newParamUITypeIds[p.id] = p.uiType.id;
  //       newUITypes[p.uiType.id] = p.uiType;
  //       newUITypeConfigIds[p.uiType.id] = p.config.id;
  //       newUITypeConfigs[p.config.id] = {
  //         id: p.config.id,
  //         ...p.config.config,
  //       };
  //     }
  //   }
  // }
  // for (let p of Object.keys(allParameters)) {

  //   const { info, id, uiType, config } = createParameterInfo(
  //     name,
  //     allParameters
  //   );
  //   newParamInfos[p.id] = p.info;
  //   newParamUITypeIds[p.id] = p.uiType.id;
  //   newUITypes[p.uiType.id] = p.uiType;
  //   newUITypeConfigIds[p.uiType.id] = p.config.id;
  //   newUITypeConfigs[p.config.id] = {
  //     id: p.config.id,
  //     ...p.config.config,
  //   };
  // }

  // console.log("newModuleInfos", newModuleInfos);
  // console.log("newObjInfos", newObjInfos);
  // console.log("newParamInfos", newParamInfos);
};
