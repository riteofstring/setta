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

  const { result } = renderUseGetParamUIType(si.id, paramInfoId, wrapper);
  expect(result.current).toEqual(uiType);
});

test("useSetUIType UnNested ui type, isPreset=true, settingPreset=true", () => {
  testUnNestedUIType(true, true);
});

test("useSetUIType UnNested ui type, isPreset=true, settingPreset=false", () => {
  testUnNestedUIType(true, false);
});

test("useSetUIType UnNested ui type, isPreset=false, settingPreset=false", () => {
  testUnNestedUIType(false, true);
});

function testUnNestedUIType(newUITypeIsPreset, settingPreset) {
  const store = createStore();
  const wrapper = getStoreProviderWrapper(store);
  const { si, uiType, paramInfoId } = createSectionInfoWithParamUIType(store);

  const hookProps = {
    sectionId: si.id,
    paramInfoId,
    defaultName: "SomeParam",
    childId: null,
    currUIType: uiType,
    settingPreset,
    settingSectionConfig: false,
  };

  let { result } = renderUseSetUIType(hookProps, wrapper);

  // test setting ui type id
  const newUIType = addUIType(store, { isPreset: newUITypeIsPreset });
  expect(uiType.id).not.toEqual(newUIType.id);
  act(() => result.current[0](newUIType.id));

  // get ui type
  ({ result } = renderUseGetParamUIType(si.id, paramInfoId, wrapper));
  expect(result.current).toEqual(newUIType);

  // test setting ui type config
  hookProps.currUIType = store.getState().uiTypes.x[newUIType.id];
  expect(hookProps.currUIType.config).toEqual({});

  ({ result } = renderUseSetUIType(hookProps, wrapper));
  act(() =>
    result.current[1]({ configName: "maxValue", newValueFn: () => 634 })
  );

  // get ui type
  ({ result } = renderUseGetParamUIType(si.id, paramInfoId, wrapper));
  expect(result.current.config).toEqual({ maxValue: 634 });

  expect(uiType.name).toEqual("");
  expect(newUIType.name).toEqual("");

  const newUITypeConfig = store.getState().uiTypes.x[newUIType.id].config;
  // check if newUIType.config is changed
  expect(newUITypeConfig).toEqual(
    (newUITypeIsPreset && settingPreset) || !newUITypeIsPreset
      ? { maxValue: 634 }
      : {}
  );

  // name should only be set if existing type was preset
  // and config was changed when settingPreset is false
  expect(result.current.name).toEqual(
    newUITypeIsPreset && !settingPreset ? "SomeParam" : ""
  );
}

function renderUseSetUIType(hookProps, wrapper) {
  return renderHook(() => useSetUIType(hookProps), {
    wrapper,
  });
}

function renderUseGetParamUIType(sectionId, paramInfoId, wrapper) {
  return renderHook(() => useGetParamUIType(sectionId)(paramInfoId), {
    wrapper,
  });
}

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
