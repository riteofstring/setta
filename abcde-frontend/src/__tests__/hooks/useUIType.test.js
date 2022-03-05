import { renderHook, act } from "@testing-library/react-hooks";
import {
  addParamInfo,
  addSectionInfo,
  addUIType,
  createStore,
  getStoreProviderWrapper,
} from "__tests__utils/utils";
import { useGetSectionType } from "hooks/useSectionType";
import { useGetParamUIType, useSetUIType } from "hooks/useUIType";
import _ from "lodash";

test("useGetParamUIType", () => {
  const store = createStore();
  const wrapper = getStoreProviderWrapper(store);
  const { si, uiType, paramInfoId } = createSectionInfoWithParam(store);

  const { result } = renderUseGetParamUIType(si.id, paramInfoId, wrapper);
  expect(result.current).toEqual(uiType);
});

test("useSetUIType isPreset=true, settingPreset=true, paramIsNested=false", () => {
  testUseSetUIType(true, true, false);
});

test("useSetUIType isPreset=true, settingPreset=false, paramIsNested=false", () => {
  testUseSetUIType(true, false, false);
});

test("useSetUIType isPreset=false, settingPreset=false, paramIsNested=false", () => {
  testUseSetUIType(false, true, false);
});

test("useSetUIType isPreset=true, settingPreset=true, paramIsNested=true", () => {
  testUseSetUIType(true, true, true);
});

test("useSetUIType isPreset=true, settingPreset=false, paramIsNested=true", () => {
  testUseSetUIType(true, false, true);
});

test("useSetUIType isPreset=false, settingPreset=false, paramIsNested=true", () => {
  testUseSetUIType(false, true, true);
});

function testUseSetUIType(newUITypeIsPreset, settingPreset, paramIsNested) {
  const store = createStore();
  const wrapper = getStoreProviderWrapper(store);
  const { si, uiType, paramInfoId, childId } = createSectionInfoWithParam(
    store,
    paramIsNested
  );

  let result = null;
  if (paramIsNested) {
    // child section type should be uiType
    ({ result } = renderUseGetSectionType(childId, wrapper));
    expect(result.current).toEqual(uiType);
  }

  const hookProps = {
    sectionId: si.id,
    paramInfoId,
    defaultName: "SomeParam",
    childId,
    currUIType: uiType,
    settingPreset,
    settingSectionConfig: false,
  };

  ({ result } = renderUseSetUIType(hookProps, wrapper));

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
  const {
    result: { current: currentParamUIType },
  } = renderUseGetParamUIType(si.id, paramInfoId, wrapper);
  expect(currentParamUIType.config).toEqual({ maxValue: 634 });

  expect(uiType.name).toEqual("");
  expect(newUIType.name).toEqual("");

  const newUITypeConfig = store.getState().uiTypes.x[newUIType.id].config;
  // check if newUIType.config is changed
  expect(newUITypeConfig).toEqual(
    (newUITypeIsPreset && settingPreset) || !newUITypeIsPreset
      ? { maxValue: 634 }
      : {}
  );

  const isPresetNotSettingPreset = newUITypeIsPreset && !settingPreset;
  // name should only be set if existing type was preset
  // and config was changed when settingPreset is false
  expect(currentParamUIType.name).toEqual(
    isPresetNotSettingPreset ? "SomeParam" : ""
  );

  // uiType and newUIType exist, plus one more
  // if newUIType is a preset and !settingPreset
  expect(_.size(store.getState().uiTypes.x)).toEqual(
    isPresetNotSettingPreset ? 3 : 2
  );

  if (paramIsNested) {
    // child section type should be the same as the param ui type
    const {
      result: { current: currentChildUIType },
    } = renderUseGetSectionType(childId, wrapper);
    expect(currentChildUIType).toEqual(currentParamUIType);
    expect(currentChildUIType).not.toEqual(uiType);
  }
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

function renderUseGetSectionType(sectionId, wrapper) {
  return renderHook(() => useGetSectionType(sectionId), {
    wrapper,
  });
}

function createSectionInfoWithParam(store, paramIsNested = false) {
  const si = addSectionInfo(store);

  // create a UIType for a random parameter
  const uiType = addUIType(store);
  expect(uiType.id).toBeTruthy();
  const { uiTypeCollectionId, paramCollectionId, paramInfoId, childId } =
    addParamInfo(store, si, uiType, paramIsNested);

  // set the section's UIType's config's uiTypeCollectionId
  store.getActions().uiTypes.setOneConfig({
    uiTypeId: si.uiTypeId,
    configName: "uiTypeCollectionId",
    newValueFn: () => uiTypeCollectionId,
  });

  return {
    si,
    uiType,
    uiTypeCollectionId,
    paramCollectionId,
    paramInfoId,
    childId,
  };
}
