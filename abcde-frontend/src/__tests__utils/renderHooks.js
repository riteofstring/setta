import { renderHook, waitFor } from "@testing-library/react";
import { useCreateDefaultSectionInfo } from "hooks/useCreateInfo";
import { useParamEnteredValue } from "hooks/useEnteredValue";
import { useIdsOverview } from "hooks/useIdsOverview";
import { useGetParamChildId, useGetParamUIType } from "hooks/useParamInfo";
import { useAvailablePresetUITypes } from "hooks/usePresetUIType";
import { useGetSectionConfig } from "hooks/useSectionConfig";
import { useGetSectionType } from "hooks/useSectionType";
import { useSetUIType } from "hooks/useUIType";
import { isBasePreset } from "utils/uiTypeConstants";

export function renderUseAvailablePresetUITypes(hookProps, wrapper) {
  return renderHook(() => useAvailablePresetUITypes(hookProps), {
    wrapper,
  });
}

export function renderUseIdsOverview(sectionId, wrapper) {
  return renderHook(() => useIdsOverview(sectionId), {
    wrapper,
  });
}

export function renderUseParamEnteredValue(sectionId, paramInfoId, wrapper) {
  return renderHook(() => useParamEnteredValue(sectionId, paramInfoId), {
    wrapper,
  });
}

export function renderUseSetUIType(hookProps, wrapper) {
  return renderHook(() => useSetUIType(hookProps), {
    wrapper,
  });
}

export function renderUseGetParamUIType(sectionId, paramInfoId, wrapper) {
  return renderHook(() => useGetParamUIType(sectionId, paramInfoId), {
    wrapper,
  });
}

export function renderUseGetParamChildId(sectionId, paramInfoId, wrapper) {
  return renderHook(() => useGetParamChildId(sectionId, paramInfoId), {
    wrapper,
  });
}

export function renderUseGetSectionType(sectionId, wrapper) {
  return renderHook(() => useGetSectionType(sectionId), {
    wrapper,
  });
}

export function renderUseGetSectionConfig(sectionId, wrapper) {
  return renderHook(() => useGetSectionConfig(sectionId), {
    wrapper,
  });
}

export function renderUseCreateDefaultSectionInfo(wrapper) {
  return renderHook(() => useCreateDefaultSectionInfo(), { wrapper });
}

export function changeUITypeConfig(hookProps, configName, newValueFn, wrapper) {
  let result = null;
  ({ result } = renderUseSetUIType(hookProps, wrapper));
  waitFor(() =>
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
  expect(isBasePreset(newUIType)).toEqual(false);
}
