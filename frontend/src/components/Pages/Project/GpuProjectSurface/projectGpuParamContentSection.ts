import {
  SectionTypeEnum,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";

export type ProjectGpuParamContentSectionImpl = BaseSectionImplUnion & {
  readonly codeObjVariantMap: Record<string, string>;
  readonly columnWidth?: number | null | undefined;
  readonly edgeInputParams: readonly string[] | null;
  readonly edgeOutputPorts: readonly { readonly id: string }[] | null;
  readonly hideUnpinnedParams: boolean;
  readonly isFrozen: boolean;
  readonly paramFilter: string;
  readonly selectedParams: readonly string[] | null;
};

export function isProjectGpuParamContentSectionImpl(
  sectionImpl: BaseSectionImplUnion,
): sectionImpl is ProjectGpuParamContentSectionImpl {
  return (
    sectionImpl.type === SectionTypeEnum.Callable ||
    sectionImpl.type === SectionTypeEnum.Dict ||
    sectionImpl.type === SectionTypeEnum.GlobalVariables
  );
}

export function getProjectGpuParamContentEdgeStripPortCounts(
  sectionImpl: ProjectGpuParamContentSectionImpl,
): {
  readonly edgeInputPortCount: number;
  readonly edgeOutputPortCount: number;
} {
  return {
    edgeInputPortCount: sectionImpl.edgeInputParams?.length ?? 0,
    edgeOutputPortCount: sectionImpl.edgeOutputPorts?.length ?? 0,
  };
}
