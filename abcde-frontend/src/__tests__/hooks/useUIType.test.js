import { act } from "@testing-library/react-hooks";
import _ from "lodash";
import { SLIDER } from "utils/constants";
import { createSectionInfoWithParam } from "__tests__utils/createSectionInfoWithParam";
import {
  changeUITypeConfig,
  renderUseGetParamUIType,
  renderUseGetSectionType,
  renderUseParamChildId,
  renderUseSetUIType,
} from "__tests__utils/renderHooks";
import {
  addUIType,
  createStore,
  getStoreProviderWrapper,
} from "__tests__utils/utils";

test("Create a section with a parameter that has a UI type. Then useGetParamUIType should return the correct uiType for that parameter.", () => {
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
  `Test the following:
1. Create section with parameter and uiType (call this "uiType1"). If param is nested, then useGetSectionType(param) should return the uiType.
2. Add a new uiType ("uiType2").
3. Make the existing param use "uiType2" via the useSetUIType hook.
4. useGetParamUIType should now return "uiType2"
5. Change the config of the param's uiType, via the useSetUIType hook.
6. Confirm that the param's current uiType has this config, via the useGetParamUIType hook.
7. If "uiType2" is a preset, and settingPreset is true, then "uiType2" should have this new config.
8. Also, if "uiType2" is *not* a preset, then it should also have this new config.
9. Otherwise, if "uiType2" is a preset but settingPreset is false, then it does not have the new config.
10. If step 9 is true, then there is a new uiType ("uiType3") with a default name "SomeParam".
11. If the param is nested, it's section type should be either uiType2 or uiType3, but not uiType1.
Trying setting: isPreset=%s, settingPreset=%s, paramIsNested=%s, settingSectionConfig=%s

`,
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

  // uiType + sectionType
  expect(_.size(store.getState().uiTypes.x)).toEqual(2);

  let result = null;
  ({ result } = renderUseParamChildId(si.id, paramInfoId, wrapper));
  const childId = result.current[0];

  if (paramIsNested) {
    // child section type should be uiType
    ({ result } = renderUseGetSectionType(childId, wrapper));
    expect(result.current).toEqual(uiType);
  }

  // defaultName is the default for the newly created ui type
  const defaultName = "SomeParam";
  const hookProps = {
    sectionId: si.id,
    paramInfoId,
    defaultName,
    childId,
    currUIType: uiType,
    settingPreset,
    settingSectionConfig,
  };

  ({ result } = renderUseSetUIType(hookProps, wrapper));

  // create new ui type
  const newUITypeName = "TheBestSlider";
  const newUIType = addUIType(store, {
    isPreset: newUITypeIsPreset,
    name: newUITypeName,
    type: SLIDER,
  });
  // uiType + sectionType + newUIType
  expect(_.size(store.getState().uiTypes.x)).toEqual(3);
  expect(uiType.id).not.toEqual(newUIType.id);

  // test setting ui type id
  act(() => result.current[0](newUIType.id));

  // get ui type
  ({ result } = renderUseGetParamUIType(si.id, paramInfoId, wrapper));
  expect(result.current).toEqual(newUIType);

  // test setting ui type config
  hookProps.currUIType = store.getState().uiTypes.x[newUIType.id];
  expect(hookProps.currUIType.config).toEqual({});

  changeUITypeConfig(hookProps, "maxValue", () => 634, wrapper);

  // get ui type
  const {
    result: { current: currentParamUIType },
  } = renderUseGetParamUIType(si.id, paramInfoId, wrapper);
  expect(currentParamUIType.config).toEqual({ maxValue: 634 });

  // uiType has no name.
  // newUIType was initialized with the name "TheBestSlider"
  expect(uiType.name).toEqual("");
  expect(newUIType.name).toEqual(newUITypeName);

  const newUITypeConfig = store.getState().uiTypes.x[newUIType.id].config;
  // check if newUIType.config is changed
  expect(newUITypeConfig).toEqual(
    (newUITypeIsPreset && settingPreset) || !newUITypeIsPreset
      ? { maxValue: 634 }
      : {}
  );

  const isPresetNotSettingPreset = newUITypeIsPreset && !settingPreset;

  // If newUIType is preset and we're not setting preset
  // then a new ui type *with a unique id* should have been created
  isPresetNotSettingPreset
    ? expect(currentParamUIType.id).not.toEqual(newUIType.id)
    : expect(currentParamUIType.id).toEqual(newUIType.id);

  // name should only be set if existing type was preset
  // and config was changed when settingPreset is false
  expect(currentParamUIType.name).toEqual(
    isPresetNotSettingPreset ? defaultName : newUITypeName
  );

  // uiType, section's uiType, and newUIType exist, plus one more
  // if newUIType is a preset and !settingPreset
  expect(_.size(store.getState().uiTypes.x)).toEqual(
    isPresetNotSettingPreset ? 4 : 3
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
