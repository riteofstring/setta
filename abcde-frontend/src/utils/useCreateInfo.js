import { useStoreState, useStoreActions } from "easy-peasy";

import { createSectionInfo } from "../classes/infoFactory";

export function useCreateSectionInfo() {
  const available = useStoreState((x) => x.master.available);
  const setSectionInfo = useStoreActions((x) => x.sectionInfos.setSectionInfo);
  const setModuleInfo = useStoreActions((x) => x.moduleInfos.setModuleInfo);
  const setObjInfo = useStoreActions((x) => x.objInfos.setObjInfo);
  const setParamInfo = useStoreActions((x) => x.paramInfos.setParamInfo);
  const setModuleInfoIds = useStoreActions(
    (x) => x.sectionInfos.setModuleInfoIds
  );
  const setSectionParamInfoIds = useStoreActions(
    (x) => x.sectionInfos.setParamInfoIds
  );
  const setObjInfoIds = useStoreActions((x) => x.moduleInfos.setObjInfoIds);
  const setParamInfoIds = useStoreActions((x) => x.objInfos.setParamInfoIds);

  const createInfo = (name, specs) => {
    const infoFactoryOutput = createSectionInfo(name, specs, available);
    console.log("useCreateSectionInfo infoFactoryOutput", infoFactoryOutput);

    const { info, id, moduleInfos, parameterInfos } = infoFactoryOutput;
    setSectionInfo({
      sectionInfo: info,
      sectionInfoId: id,
    });
    setModuleInfoIds({
      sectionInfoId: id,
      moduleInfoIds: moduleInfos.map((x) => x.id),
    });
    setSectionParamInfoIds({
      sectionInfoId: id,
      paramInfoIds: parameterInfos.map((x) => x.id),
    });

    for (let m of moduleInfos) {
      setModuleInfo({ moduleInfo: m.info, moduleInfoId: m.id });
      setObjInfoIds({
        moduleInfoId: m.id,
        objInfoIds: m.objInfos.map((x) => x.id),
      });
      for (let o of m.objInfos) {
        setObjInfo({ objInfo: o.info, objInfoId: o.id });
        setParamInfoIds({
          objInfoId: o.id,
          paramInfoIds: o.parameterInfos.map((x) => x.id),
        });
        for (let p of o.parameterInfos) {
          setParamInfo({ paramInfo: p.info, paramInfoId: p.id });
        }
      }
    }
    for (let p of parameterInfos) {
      setParamInfo({ paramInfo: p.info, paramInfoId: p.id });
    }

    return id;
  };

  return createInfo;
}

// export function useCreateModuleInfo() {

//   const createInfo = (name, jsonInput) => {
//     const infoFactoryOutput = createModuleInfo(name, jsonInput);
//     console.log("useCreateModuleInfo infoFactoryOutput", infoFactoryOutput);

//     const { info, id } = infoFactoryOutput;
//     setModuleInfo({
//       sectionInfo: info,
//       sectionInfoId: id,
//     });
//     return id;
//   };

//   return createInfo;
// }

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
