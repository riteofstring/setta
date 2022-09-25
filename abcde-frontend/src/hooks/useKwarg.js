import { KwargInfo } from "classes/mutableInfo";
import { useStoreActions } from "easy-peasy";
import { useParamChildId } from "hooks/useParamInfo";
import { createNewId } from "utils/utils";

import { useDeleteChild } from "./useAddDeleteChild";
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

export function useDeleteKwarg(sectionId, objInfoId) {
  const { paramCollectionId, kwargCollectionId } =
    useGetSectionConfig(sectionId);
  const { uiTypeCollectionId } = useGetSectionTypeConfig(sectionId);
  const deleteChild = useDeleteChild(sectionId);
  const setKwargIds = useStoreActions((x) => x.objInfos.setKwargIds);
  const deleteKwargInfo = useStoreActions((x) => x.kwargInfos.deleteKwargInfo);
  const deleteParamInfo = useStoreActions((x) => x.paramInfos.deleteParamInfo);
  const childIdFn = useParamChildId(sectionId);
  return (id) => {
    const childId = childIdFn(id)[0];
    return () => {
      setKwargIds({
        collectionId: kwargCollectionId,
        objInfoId,
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
