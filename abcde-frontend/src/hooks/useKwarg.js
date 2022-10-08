import { KwargInfo } from "classes/mutableInfo";
import { useStoreActions } from "easy-peasy";
import { useGetParamChildId } from "hooks/useParamInfo";
import { createNewId } from "utils/utils";
import { useGetSectionConfig } from "./useSectionConfig";
import { useGetSectionTypeConfig } from "./useSectionType";

export function useAddKwarg(sectionId, objInfoId) {
  const { kwargCollectionId } = useGetSectionConfig(sectionId);
  const setKwargInfo = useStoreActions((x) => x.kwargInfos.setKwargInfo);
  const setKwargIds = useStoreActions((x) => x.objInfos.setKwargIds);
  return () => {
    const kwargInfo = new KwargInfo({ id: createNewId(), name: "" }, null);
    setKwargInfo({ kwargInfoId: kwargInfo.id, kwargInfo });
    setKwargIds({
      collectionId: kwargCollectionId,
      objInfoId,
      newStateFn: (x) => [...x, kwargInfo.id],
    });
  };
}

export function useDeleteKwarg(sectionId, objInfoId, kwargId) {
  const { paramCollectionId, kwargCollectionId } =
    useGetSectionConfig(sectionId);
  const { uiTypeColId } = useGetSectionTypeConfig(sectionId);
  const deleteChild = useStoreActions((x) => x.thunks.deleteChild);
  const setKwargIds = useStoreActions((x) => x.objInfos.setKwargIds);
  const deleteKwargInfo = useStoreActions((x) => x.kwargInfos.deleteKwargInfo);
  const deleteParamInfo = useStoreActions((x) => x.paramInfos.deleteParamInfo);
  const childId = useGetParamChildId(sectionId, kwargId);
  return () => {
    setKwargIds({
      collectionId: kwargCollectionId,
      objInfoId,
      newStateFn: (x) => x.filter((y) => y !== kwargId),
    });
    deleteKwargInfo({ ids: [kwargId] });
    deleteParamInfo({ paramCollectionId, uiTypeColId, ids: [kwargId] });
    if (childId) {
      deleteChild({ sectionId, startId: childId });
    }
  };
}
