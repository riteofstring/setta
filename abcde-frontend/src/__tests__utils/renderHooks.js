import { renderHook } from "@testing-library/react";
import { useGetParamChildId } from "hooks/useEnteredValue";
import { useGetParamUIType } from "hooks/useParamUIType";
import { useGetSectionConfig } from "hooks/useSectionConfig";
import { useGetKwargInfos } from "hooks/useSectionContents";
import { useGetSectionType } from "hooks/useSectionType";

export function renderUseGetParamUIType(sectionId, paramInfoId) {
  return renderHook(() => useGetParamUIType(sectionId, paramInfoId));
}

export function renderUseGetParamChildId(sectionId, paramInfoId) {
  return renderHook(() => useGetParamChildId(sectionId, paramInfoId));
}

export function renderUseGetSectionType(sectionId, props) {
  return renderHook(() => useGetSectionType(sectionId, props));
}

export function renderUseGetSectionConfig(sectionId, props) {
  return renderHook(() => useGetSectionConfig(sectionId, props));
}

export function renderUseGetKwargInfos(sectionId, objInfoId) {
  return renderHook(() => useGetKwargInfos(sectionId, objInfoId));
}
