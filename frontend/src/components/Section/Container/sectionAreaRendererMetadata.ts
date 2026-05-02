import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";

export const GPU_FLOW_SECTION_AREA_RENDERER_TYPES = Object.values(
  SectionTypeEnum,
) as readonly SectionType[];

export function getGpuFlowSectionAreaRendererTypes(): readonly SectionType[] {
  return GPU_FLOW_SECTION_AREA_RENDERER_TYPES;
}
