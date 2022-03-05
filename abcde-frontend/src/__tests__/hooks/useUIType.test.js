import { renderHook, act } from "@testing-library/react-hooks";
import {
  addParamInfo,
  addSectionInfo,
  addUIType,
  createStore,
  getStoreProviderWrapper,
} from "__tests__utils/utils";
import { useParamChildId } from "hooks/useParamInfo";
import { useGetSectionType } from "hooks/useSectionType";
import { useGetParamUIType, useSetUIType } from "hooks/useUIType";
import _ from "lodash";

test("useGetParamUIType", () => {
  const store = createStore();
  const wrapper = getStoreProviderWrapper(store);
  const { si, uiType, paramInfoId } = createSectionInfoWithParam(
    store,
    wrapper
  );

  const { result } = renderUseGetParamUIType(si.id, paramInfoId, wrapper);
  expect(result.current).toEqual(uiType);
});

test.each(useSetUITypeTestCases())(
  "useSetUIType: isPreset=%s, settingPreset=%s, paramIsNested=%s, settingSectionConfig=%s",
  (isPreset, settingPreset, paramIsNested, settingSectionConfig) => {
    testUseSetUIType(
      isPreset,
      settingPreset,
      paramIsNested,
      settingSectionConfig
    );
  }
);

function useSetUITypeTestCases() {
  const output = [];
  for (let isPreset of [true, false]) {
    for (let settingPreset of [true, false]) {
      for (let paramIsNested of [true, false]) {
        for (let settingSectionConfig of [true, false]) {
          if (!paramIsNested && settingSectionConfig) {
            continue;
          }
          output.push([
            isPreset,
            settingPreset,
            paramIsNested,
            settingSectionConfig,
          ]);
        }
      }
    }
  }
  return output;
}

function testUseSetUIType(
  newUITypeIsPreset,
  settingPreset,
  paramIsNested,
  settingSectionConfig
) {
  const store = createStore();
  const wrapper = getStoreProviderWrapper(store);
  const { si, uiType, paramInfoId } = createSectionInfoWithParam(
    store,
    wrapper,
    paramIsNested
  );

  let result = null;

  ({ result } = renderUseParamChildId(si.id, paramInfoId, wrapper));
  const childId = result.current[0];

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
    settingSectionConfig,
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

function renderUseParamChildId(sectionId, paramInfoId, wrapper) {
  return renderHook(() => useParamChildId(sectionId)(paramInfoId), {
    wrapper,
  });
}

function renderUseGetSectionType(sectionId, wrapper) {
  return renderHook(() => useGetSectionType(sectionId), {
    wrapper,
  });
}

function createSectionInfoWithParam(store, wrapper, paramIsNested = false) {
  const si = addSectionInfo(store);

  // create a UIType for a random parameter
  const uiType = addUIType(store);
  expect(uiType.id).toBeTruthy();
  const { uiTypeCollectionId, paramInfoId } = addParamInfo(
    store,
    wrapper,
    si,
    uiType,
    paramIsNested
  );

  // set the section's UIType's config's uiTypeCollectionId
  act(() => {
    store.getActions().uiTypes.setOneConfig({
      uiTypeId: si.uiTypeId,
      configName: "uiTypeCollectionId",
      newValueFn: () => uiTypeCollectionId,
    });
  });

  return {
    si,
    uiType,
    uiTypeCollectionId,
    paramInfoId,
  };
}
