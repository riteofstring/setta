import { useStoreActions, useStoreState } from "easy-peasy";
import { defaultState } from "utils/utils";

import { getXInfos } from "./useSectionContents";
import { useGetSectionInfo } from "./useSectionInfo";
import { getNewUIType } from "./useUIType";
import { getInfo } from "./utils";

export function useGetSectionType(sectionId) {
  const uiTypeId = useGetSectionInfo(sectionId).uiTypeId;
  return defaultState(
    useStoreState((x) => getInfo(x.uiTypes)[uiTypeId]),
    () => ({})
  );
}

export function useGetManySectionTypeNames(sectionIds) {
  const uiTypeIds = useStoreState(
    (x) => sectionIds.map((y) => getInfo(x.sectionInfos)[y]?.uiTypeId),
    _.isEqual
  );
  return useStoreState(
    (x) => uiTypeIds.map((y) => getInfo(x.uiTypes)[y]?.name),
    _.isEqual
  );
}

export function useReinitSectionType(sectionId) {
  const reinitSectionType = useStoreActions(
    (x) => x.sectionTypes.reinitSectionType
  );
  const allParamCollections = useStoreState(
    (x) => x.master["allParamCollections"]
  );
  const { id: sectionTypeId, uiTypeCollectionId } =
    useGetSectionType(sectionId);
  const existingUITypeIds = defaultState(
    useStoreState((x) => x.paramInfos.y[uiTypeCollectionId]),
    () => ({})
  );
  const setManyUITypeIds = useStoreActions(
    (x) => x.paramInfos.setManyUITypeIds
  );
  const setManyUITypes = useStoreActions((x) => x.uiTypes.setManyUITypes);

  return (props) => {
    const { paramCollectionIds } = reinitSectionType({
      sectionTypeId,
      ...props,
    });
    // The following code is to address the problem that arises
    // when multiple sections get populated with a paramCollection.
    // Without this, they will end up making unused uiTypes.
    const paramInfos = getXInfos(paramCollectionIds, allParamCollections);
    const needsNewUIType = paramInfos.filter((x) => !existingUITypeIds[x.id]);
    const newUITypes = needsNewUIType.map((x) => getNewUIType());
    const paramInfoIds = needsNewUIType.map((x) => x.id);
    const newUITypeIds = newUITypes.map((x) => x.id);
    setManyUITypeIds({
      collectionId: uiTypeCollectionId,
      paramInfoIds,
      uiTypeIds: newUITypeIds,
    });
    setManyUITypes({ uiTypes: newUITypes });
  };
}
