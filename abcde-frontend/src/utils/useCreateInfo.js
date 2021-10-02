import { useStoreState, useStoreActions } from "easy-peasy";

import { createSectionInfo } from "../classes/infoFactory";

export function useCreateSectionInfo() {
  const allObjCollections = useStoreState((x) => x.master.allObjCollections);
  const allParamCollections = useStoreState(
    (x) => x.master.allParamCollections
  );
  const setSectionInfo = useStoreActions((x) => x.sectionInfos.setSectionInfo);
  const setParamInfo = useStoreActions((x) => x.paramInfos.setParamInfo);
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
  const setConfig = useStoreActions((x) => x.uiTypeConfigs.setConfig);
  const setObjCollectionIds = useStoreActions(
    (x) => x.sectionInfos.setObjCollectionIds
  );
  const setParamCollectionIds = useStoreActions(
    (x) => x.sectionInfos.setParamCollectionIds
  );
  const setUITypeId = useStoreActions((x) => x.paramInfos.setUITypeId);
  const setConfigId = useStoreActions((x) => x.uiTypes.setConfigId);

  const createInfo = (name, specs) => {
    const infoFactoryOutput = createSectionInfo(
      name,
      specs,
      allObjCollections,
      allParamCollections
    );
    console.log("useCreateSectionInfo infoFactoryOutput", infoFactoryOutput);

    const { info, id, objCollectionIds, paramCollectionIds } =
      infoFactoryOutput;

    setSectionInfo((x) => {
      return { ...x, [id]: info };
    });
    setObjCollectionIds((x) => {
      return { ...x, [id]: objCollectionIds };
    });
    setParamCollectionIds((x) => {
      return { ...x, [id]: paramCollectionIds };
    });

    const newParamInfos = {};
    const newParamUITypeIds = {};
    const newUITypes = {};
    const newUITypeConfigIds = {};
    const newUITypeConfigs = {};
    for (let m of moduleInfos) {
      newModuleInfos[m.id] = m.info;
      newModuleObjInfos[m.id] = m.objInfos.map((x) => x.id);
      for (let o of m.objInfos) {
        newObjInfos[o.id] = o.info;
        newObjParamInfos[o.id] = o.parameterInfos.map((x) => x.id);
        for (let p of o.parameterInfos) {
          newParamInfos[p.id] = p.info;
          newParamUITypeIds[p.id] = p.uiType.id;
          newUITypes[p.uiType.id] = p.uiType;
          newUITypeConfigIds[p.uiType.id] = p.config.id;
          newUITypeConfigs[p.config.id] = {
            id: p.config.id,
            ...p.config.config,
          };
        }
      }
    }
    for (let p of parameterInfos) {
      newParamInfos[p.id] = p.info;
      newParamUITypeIds[p.id] = p.uiType.id;
      newUITypes[p.uiType.id] = p.uiType;
      newUITypeConfigIds[p.uiType.id] = p.config.id;
      newUITypeConfigs[p.config.id] = {
        id: p.config.id,
        ...p.config.config,
      };
    }

    setParamInfo((x) => {
      return { ...x, ...newParamInfos };
    });
    setUITypeId((x) => {
      return { ...x, ...newParamUITypeIds };
    });
    setUIType((x) => {
      return { ...x, ...newUITypes };
    });
    setConfigId((x) => {
      return { ...x, ...newUITypeConfigIds };
    });
    setConfig((x) => {
      return { ...x, ...newUITypeConfigs };
    });

    return id;
  };

  return createInfo;
}

export function useGetSectionInfo(sectionId) {
  const sectionInfoId = useStoreState(
    (x) => x.sections.sectionInfoId[sectionId]
  );
  const sectionInfo = useStoreState(
    (x) => x.sectionInfos.sectionInfo[sectionInfoId]
  );

  return sectionInfo;
}

export function useGetModuleInfos(sectionInfoId) {
  const moduleInfoIds = useStoreState(
    (x) => x.sectionInfos.moduleInfoIds[sectionInfoId]
  );
  const moduleInfos = useStoreState((x) => x.moduleInfos.moduleInfo);
  return moduleInfoIds.map((x) => moduleInfos[x]);
}

export function useGetObjInfos(moduleInfoIds) {
  const objInfoIds = useStoreState((x) => x.moduleInfos.objInfoIds);
  const objInfos = useStoreState((x) => x.objInfos.objInfo);

  const output = [];
  for (let m of moduleInfoIds) {
    const currIds = objInfoIds[m];
    output.push(...currIds.map((x) => objInfos[x]));
  }
  return output;
}

export function useGetParamInfos(objInfoId) {
  const paramInfoIds = useStoreState((x) => x.objInfos.paramInfoIds[objInfoId]);
  const paramInfos = useStoreState((x) => x.paramInfos.paramInfo);
  if (paramInfoIds) {
    return paramInfoIds.map((x) => paramInfos[x]);
  }
  return [];
}

export function useGetSectionParamInfos(sectionInfoId) {
  const paramInfoIds = useStoreState(
    (x) => x.sectionInfos.paramInfoIds[sectionInfoId]
  );
  const paramInfos = useStoreState((x) => x.paramInfos.paramInfo);
  return paramInfoIds.map((x) => paramInfos[x]);
}

export function useGetAllParamInfos(sectionInfoId, objInfoId) {
  const objParamInfos = useGetParamInfos(objInfoId);
  const sectionParamInfos = useGetSectionParamInfos(sectionInfoId);
  return [...objParamInfos, ...sectionParamInfos];
}

export function useGetUIType(paramInfoId) {
  const uiTypeId = useStoreState((x) => x.paramInfos.uiTypeId[paramInfoId]);
  const uiType = useStoreState((x) => x.uiTypes.uiType[uiTypeId]);
  return uiType;
}

export function useGetUITypeConfig(uiTypeId) {
  const uiTypeConfigId = useStoreState((x) => x.uiTypes.configId[uiTypeId]);
  const uiTypeConfig = useStoreState(
    (x) => x.uiTypeConfigs.config[uiTypeConfigId]
  );
  return uiTypeConfig;
}
