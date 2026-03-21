import React from "react";
import type { SectionType } from "utils/generatedTypes";
import { SectionTypeEnum } from "utils/generatedTypes";

type Tier1DenseParamSectionType = Extract<
  SectionType,
  "Callable" | "Dict" | "GlobalVariables"
>;

type Tier1DenseParamSectionPreviewProps = {
  sectionId: string;
  sectionTypeName: Tier1DenseParamSectionType;
};

const PREVIEW_ROW_WIDTHS: Record<
  Tier1DenseParamSectionType,
  Array<{ label: string; value: string }>
> = {
  Callable: [
    { label: "82%", value: "48%" },
    { label: "67%", value: "58%" },
    { label: "74%", value: "44%" },
  ],
  Dict: [
    { label: "72%", value: "52%" },
    { label: "64%", value: "46%" },
    { label: "78%", value: "56%" },
  ],
  GlobalVariables: [
    { label: "76%", value: "42%" },
    { label: "69%", value: "49%" },
    { label: "71%", value: "38%" },
  ],
};

export const Tier1DenseParamSectionPreview = React.memo(
  function Tier1DenseParamSectionPreview({
    sectionId,
    sectionTypeName,
  }: Tier1DenseParamSectionPreviewProps) {
    const rows = PREVIEW_ROW_WIDTHS[sectionTypeName];
    const showSearch = sectionTypeName === SectionTypeEnum.Callable;

    return (
      <div
        className="pointer-events-none flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 pb-3 pt-2"
        data-testid="tier1-dense-param-preview"
        data-section-id={sectionId}
        data-section-type={sectionTypeName}
      >
        {showSearch ? (
          <div className="flex items-center gap-2">
            <div className="h-6 min-w-0 flex-1 rounded-md border border-setta-200/80 bg-white/80 shadow-[0_1px_0_rgba(255,255,255,0.5)] dark:border-setta-700/70 dark:bg-setta-900/40" />
            <div className="h-6 w-12 rounded-md bg-setta-200/70 dark:bg-setta-700/70" />
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <div className="h-5 w-12 rounded-md bg-setta-200/80 dark:bg-setta-700/80" />
          <div className="h-5 w-16 rounded-md bg-setta-150/90 dark:bg-setta-800/90" />
          <div className="h-5 w-10 rounded-md bg-setta-150/70 dark:bg-setta-800/80" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          {rows.map((row, index) => (
            <div
              key={`${sectionTypeName}-${index}`}
              className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)] items-center gap-3"
            >
              <div
                className="h-3 rounded-full bg-setta-200/80 dark:bg-setta-700/80"
                style={{ width: row.label }}
              />
              <div
                className="h-3 justify-self-end rounded-full bg-setta-150/90 dark:bg-setta-800/90"
                style={{ width: row.value }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  },
);
