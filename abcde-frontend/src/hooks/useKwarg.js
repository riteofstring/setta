import { useStoreActions } from "easy-peasy";
import { useParamChildId } from "hooks/useParamInfo";

import { useDeleteChild } from "./useAddDeleteChild";
import { useGetSectionInfo } from "./useSectionInfo";
import { useGetSectionType } from "./useSectionType";

export function useAddKwarg(sectionId, objInfo) {
  const { kwargCollectionId } = useGetSectionInfo(sectionId);
  const setKwargInfo = useStoreActions((x) => x.kwargInfos.setKwargInfo);
  const setKwargIds = useStoreActions((x) => x.objInfos.setKwargIds);
  return () => {
    const kwargInfo = new KwargInfo({ id: createNewId(), name: "" }, null);
    setKwargInfo({ kwargInfoId: kwargInfo.id, kwargInfo });
    setKwargIds({
      collectionId: kwargCollectionId,
      objInfoId: objInfo.id,
      newStateFn: (x) => [...x, kwargInfo.id],
    });
  };
}

export function useDeleteKwarg(sectionId, objInfo) {
  const { paramCollectionId, kwargCollectionId } = useGetSectionInfo(sectionId);
  const { uiTypeCollectionId } = useGetSectionType(sectionId);
  const deleteChild = useDeleteChild(sectionId);
  const setKwargIds = useStoreActions((x) => x.objInfos.setKwargIds);
  const deleteKwargInfo = useStoreActions((x) => x.kwargInfos.deleteKwargInfo);
  const deleteParamInfo = useStoreActions((x) => x.paramInfos.deleteParamInfo);
  const childIdFn = useParamChildId(sectionId);
  return (kwargInfo) => {
    const { id } = kwargInfo;
    const childId = childIdFn(id)[0];
    return () => {
      setKwargIds({
        collectionId: kwargCollectionId,
        objInfoId: objInfo.id,
        newStateFn: (x) => x.filter((y) => y !== id),
      });
      deleteKwargInfo({ ids: [id] });
      deleteParamInfo({ paramCollectionId, uiTypeCollectionId, ids: [id] });
      if (childId) {
        deleteChild({ startId: childId });
      }
    };
  };
}
