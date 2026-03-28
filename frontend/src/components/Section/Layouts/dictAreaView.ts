import { SectionTypeEnum } from "utils/generatedTypes";

export type DictAreaRenderMode = "benchmark" | "live";

type ResolveDictAreaRenderModeArgs = {
  benchmarkActive: boolean;
  renderFullSectionBody: boolean;
};

export type BenchmarkParamTreeItem = {
  depth: number;
  id: string;
  isParent: boolean;
};

export type BenchmarkParamRow = BenchmarkParamTreeItem & {
  label: string;
};

type BuildLiveDictAreaLayoutViewArgs = {
  bgColor: string;
  sectionId: string;
};

export type LiveDictAreaLayoutView = {
  kwargsControlsProps: {
    sectionId: string;
  };
  paramGroupContainerProps: {
    bgColor: string;
    sectionId: string;
    sectionTypeName: SectionTypeEnum.Dict;
  };
};

export function resolveDictAreaRenderMode({
  benchmarkActive,
  renderFullSectionBody,
}: ResolveDictAreaRenderModeArgs): DictAreaRenderMode {
  if (benchmarkActive && !renderFullSectionBody) {
    return "benchmark";
  }

  return "live";
}

export function buildBenchmarkParamRows({
  items,
  getLabel,
}: {
  items: BenchmarkParamTreeItem[];
  getLabel: (id: string) => string;
}): BenchmarkParamRow[] {
  return items.map((item) => ({
    depth: item.depth,
    id: item.id,
    isParent: item.isParent,
    label: getLabel(item.id),
  }));
}

export function buildLiveDictAreaLayoutView({
  bgColor,
  sectionId,
}: BuildLiveDictAreaLayoutViewArgs): LiveDictAreaLayoutView {
  return {
    kwargsControlsProps: {
      sectionId,
    },
    paramGroupContainerProps: {
      bgColor,
      sectionId,
      sectionTypeName: SectionTypeEnum.Dict,
    },
  };
}
