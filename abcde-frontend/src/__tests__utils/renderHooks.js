import { renderHook } from "@testing-library/react";
import { useGetParamChildId, useGetParamUIType } from "hooks/useParamInfo";
import { useGetSectionConfig } from "hooks/useSectionConfig";
import { useGetKwargInfos } from "hooks/useSectionContents";
import { useGetSectionType } from "hooks/useSectionType";

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

export function renderUseGetSectionType(sectionId, props, wrapper) {
  return renderHook(() => useGetSectionType(sectionId, props), {
    wrapper,
  });
}

export function renderUseGetSectionConfig(sectionId, props, wrapper) {
  return renderHook(() => useGetSectionConfig(sectionId, props), {
    wrapper,
  });
}

export function renderUseGetKwargInfos(sectionId, objInfoId, wrapper) {
  return renderHook(() => useGetKwargInfos(sectionId, objInfoId), { wrapper });
}
