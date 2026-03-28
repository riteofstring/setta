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
