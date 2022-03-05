import { renderHook, act } from "@testing-library/react-hooks";
import {
  addMutableParamUITypeInfo,
  addSectionInfo,
  addUIType,
  createStore,
  getStoreProviderWrapper,
} from "__tests__utils/utils";
import { useGetParamUIType, useSetUIType } from "hooks/useUIType";

test("useGetParamUIType", () => {
  const store = createStore();
  const wrapper = getStoreProviderWrapper(store);
  const { si, uiType, paramInfoId } = createSectionInfoWithParamUIType(store);

  const { result } = renderHook(() => useGetParamUIType(si.id)(paramInfoId), {
    wrapper,
  });
  expect(result.current).toEqual(uiType);
});

test("useSetUIType", () => {
  const store = createStore();
  const wrapper = getStoreProviderWrapper(store);
  const { si, uiType, collectionId, paramInfoId } =
    createSectionInfoWithParamUIType(store);

  const hookProps = {
    sectionId: si.id,
    paramInfoId,
    defaultName: "SomeSection",
    childId: null,
    currUIType: uiType,
    settingSectionConfig: false,
  };

  let { result } = renderHook(() => useSetUIType(hookProps), {
    wrapper,
  });

  // test setting ui type id
  const newUIType = addUIType(store);
  expect(uiType.id).not.toEqual(newUIType.id);
  act(() => result.current[0](newUIType.id));

  // get ui type
  ({ result } = renderHook(() => useGetParamUIType(si.id)(paramInfoId), {
    wrapper,
  }));
  expect(result.current).toEqual(newUIType);

  // test setting ui type config
  hookProps.currUIType = store.getState().uiTypes.x[newUIType.id];
  expect(hookProps.currUIType.config).toEqual({});

  ({ result } = renderHook(() => useSetUIType(hookProps), {
    wrapper,
  }));
  act(() =>
    result.current[1]({ configName: "maxValue", newValueFn: () => 634 })
  );

  // get ui type
  ({ result } = renderHook(() => useGetParamUIType(si.id)(paramInfoId), {
    wrapper,
  }));
  expect(result.current.config).toEqual({maxValue: 634});
});

function createSectionInfoWithParamUIType(store) {
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

  return { si, uiType, collectionId, paramInfoId };
}
