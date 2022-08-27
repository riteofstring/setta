import { renderHook } from "@testing-library/react-hooks";
import { useAddChild } from "hooks/useAddDeleteChild";
import { useCreateDefaultSectionInfo } from "hooks/useCreateInfo";
import {
  useInitializeEnteredValue,
  useParamEnteredValue,
} from "hooks/useEnteredValue";
import { useIdsOverview } from "hooks/useIdsOverview";
import { useParamChildId } from "hooks/useParamInfo";
import { useAvailablePresetUITypes } from "hooks/usePresetUIType";
import { useGetSectionType } from "hooks/useSectionType";
import {
  useGetParamUIType,
  useInitializeUIType,
  useSetUIType,
} from "hooks/useUIType";
import { act } from "react-dom/test-utils";

export function renderUseAvailablePresetUITypes(hookProps, wrapper) {
  return renderHook(() => useAvailablePresetUITypes(hookProps), {
    wrapper,
  });
}

export function renderUseInitializeUIType(sectionId, paramInfo, wrapper) {
  return renderHook(() => useInitializeUIType(sectionId)(paramInfo), {
    wrapper,
  });
}

export function renderUseAddChild(sectionId, wrapper) {
  return renderHook(() => useAddChild(sectionId), {
    wrapper,
  });
}

export function renderUseIdsOverview(sectionId, wrapper) {
  return renderHook(() => useIdsOverview(sectionId), {
    wrapper,
  });
}

export function renderUseParamEnteredValue(sectionId, paramInfoId, wrapper) {
  return renderHook(() => useParamEnteredValue(sectionId)(paramInfoId), {
    wrapper,
  });
}

export function renderUseSetUIType(hookProps, wrapper) {
  return renderHook(() => useSetUIType(hookProps), {
    wrapper,
  });
}

export function renderUseGetParamUIType(sectionId, paramInfoId, wrapper) {
  return renderHook(() => useGetParamUIType(sectionId)(paramInfoId), {
    wrapper,
  });
}

export function renderUseParamChildId(sectionId, paramInfoId, wrapper) {
  return renderHook(() => useParamChildId(sectionId)(paramInfoId), {
    wrapper,
  });
}

export function renderUseGetSectionType(sectionId, wrapper) {
  return renderHook(() => useGetSectionType(sectionId), {
    wrapper,
  });
}

export function renderUseCreateDefaultSectionInfo(wrapper) {
  return renderHook(() => useCreateDefaultSectionInfo(), { wrapper });
}

export function renderUseInitializeEnteredValue(
  sectionId,
  paramInfoId,
  wrapper
) {
  return renderHook(() => useInitializeEnteredValue(sectionId)(paramInfoId), {
    wrapper,
  });
}

export function changeUITypeConfig(hookProps, configName, newValueFn, wrapper) {
  let result = null;
  ({ result } = renderUseSetUIType(hookProps, wrapper));
  act(() =>
    result.current[1]({
      configName,
      newValueFn,
    })
  );
  // A forked preset can never be a base preset
  if (hookProps.settingSectionConfig) {
    ({ result } = renderUseGetSectionType(hookProps.childId, wrapper));
  } else {
    ({ result } = renderUseGetParamUIType(
      hookProps.sectionId,
      hookProps.paramInfoId,
      wrapper
    ));
  }
  const newUIType = result.current;
  expect(newUIType.isBasePreset).toEqual(false);
}
