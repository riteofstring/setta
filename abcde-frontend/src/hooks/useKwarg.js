import { KwargInfo } from "classes/mutableInfo";
import { useStoreActions } from "easy-peasy";
import { useGetParamChildId } from "hooks/useParamInfo";
import { NULL_OBJ_ID } from "utils/constants";
import { createNewId } from "utils/utils";
import { useGetSectionConfig } from "./useSectionConfig";
import { useGetSectionTypeConfig } from "./useSectionType";

export function maybeUseNullId(objInfoId) {
  return objInfoId ? objInfoId : NULL_OBJ_ID;
}

export function useAddKwarg(sectionId, objInfoId) {
  const { kwargCollectionId } = useGetSectionConfig(sectionId);
  const setKwargInfo = useStoreActions((x) => x.codeInfo.setCodeInfo);
  const setKwargIds = useStoreActions((x) => x.objInfos.setKwargIds);
  return () => {
    const kwargInfo = new KwargInfo({
      id: createNewId(),
      name: "",
      rcType: "parameter",
    });
    setKwargInfo({ id: kwargInfo.id, info: kwargInfo });
    setKwargIds({
      collectionId: kwargCollectionId,
      objInfoId: maybeUseNullId(objInfoId),
      newStateFn: (x) => [...x, kwargInfo.id],
    });
  };
}

export function useDeleteKwarg(sectionId, objInfoId, kwargId) {
  const { evColId, kwargCollectionId } = useGetSectionConfig(sectionId);
  const { uiTypeColId } = useGetSectionTypeConfig(sectionId);
  const deleteChild = useStoreActions((x) => x.thunks.deleteChild);
  const setKwargIds = useStoreActions((x) => x.objInfos.setKwargIds);
  const deleteKwargInfo = useStoreActions((x) => x.codeInfo.deleteInfos);
  const deleteParamInfo = useStoreActions((x) => x.paramInfos.deleteParamInfo);
  const childId = useGetParamChildId(sectionId, kwargId);
  return () => {
    setKwargIds({
      collectionId: kwargCollectionId,
      objInfoId: maybeUseNullId(objInfoId),
      newStateFn: (x) => x.filter((y) => y !== kwargId),
    });
    deleteKwargInfo({ ids: [kwargId] });
    deleteParamInfo({ evColId, uiTypeColId, ids: [kwargId] });
    if (childId) {
      deleteChild({ sectionId, startId: childId });
    }
  };
}
