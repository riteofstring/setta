import { renderHook } from "@testing-library/react";
import { SectionInfo } from "classes/mutableInfo";
import { UIType } from "classes/uiType";
import { StoreProvider } from "easy-peasy";
import { useAddChild } from "hooks/useAddDeleteChild";
import _ from "lodash";
import { act } from "react-dom/test-utils";
import store, { resetEntireState } from "store/store";
import { SECTION } from "utils/constants";
import { createNewId } from "utils/utils";

export function createStore() {
  resetEntireState();
  return store;
}

export function addSectionInfo(store, inputUIType = null) {
  let uiType = inputUIType;
  if (!uiType) {
    uiType = addUIType(store, { type: SECTION });
  }
  const si = new SectionInfo({ uiTypeId: uiType.id });
  store
    .getActions()
    .sectionInfos.setSectionInfo((x) => ({ ...x, [si.id]: si }));
  return si;
}

export function addUIType(store, props = {}) {
  const uiType = new UIType(props);
  store.getActions().uiTypes.setUIType({ uiType });
  return uiType;
}

export function addParamInfo(
  store,
  wrapper,
  sectionInfo,
  uiType,
  isNested = false
) {
  const [uiTypeCollectionId, paramInfoId] = [createNewId(), createNewId()];
  const { paramCollectionId } = sectionInfo;
  const actions = store.getActions().paramInfos;
  act(() => {
    actions.setUITypeId({
      collectionId: uiTypeCollectionId,
      paramInfoId,
      uiTypeId: uiType.id,
    });
  });
  if (isNested) {
    const { result } = renderHook(() => useAddChild(sectionInfo.id), {
      wrapper,
    });
    act(() =>
      result.current({
        uiTypeId: uiType.id,
        collectionId: paramCollectionId,
        parentParamInfoId: paramInfoId,
      })
    );
  }
  return { uiTypeCollectionId, paramInfoId };
}

export function getStoreProviderWrapper(store) {
  return ({ children }) => (
    <StoreProvider store={store}>{children}</StoreProvider>
  );
}

export function sectionIdFromName(store, name) {
  const sections = store.getState().sectionInfos.x;
  return _.filter(sections, (x) => x.name === name)[0].id;
}
