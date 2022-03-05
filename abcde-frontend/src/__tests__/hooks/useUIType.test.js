import { renderHook } from "@testing-library/react-hooks";
import {
  addMutableParamUITypeInfo,
  addSectionInfo,
  addUIType,
  createStore,
  getStoreProviderWrapper,
} from "__tests__utils/utils";
import { useGetParamUIType } from "hooks/useUIType";

test("useGetParamUIType", () => {
  const store = createStore();
  const wrapper = getStoreProviderWrapper(store);
  const si = addSectionInfo(store);

  // create a UIType for a random parameter
  const uiType = addUIType(store);
  expect(uiType.id).toBeTruthy();
  const [collectionId, paramInfoId] = addMutableParamUITypeInfo(
    store,
    uiType.id
  );

  // set the section's UIType's config's uiTypeCollectionId
  store.getActions().uiTypes.setOneConfig({
    uiTypeId: si.uiTypeId,
    configName: "uiTypeCollectionId",
    newValueFn: () => collectionId,
  });

  const { result } = renderHook(() => useGetParamUIType(si.id)(paramInfoId), {
    wrapper,
  });
  expect(result.current).toEqual(uiType);
});
