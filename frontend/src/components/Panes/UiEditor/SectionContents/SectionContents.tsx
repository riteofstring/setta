import React from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import {
  useLocalStorage,
  useProjectState,
  useTemporaryMiscState,
} from "state/definitions";
import { getSectionStylePreviewColorKey } from "utils/constants";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { buildSectionStyleVars } from "utils/sectionStyleVars";
import { CallableArea } from "../../../Section/Layouts/CallableArea";
import { DictArea } from "../../../Section/Layouts/DictArea";

type SectionContentsSnapshot = {
  sectionTypeName: SectionType;
  styleColor: string | null;
};

function getSectionContentsSnapshot(
  state: ReturnType<typeof useProjectState.getState>,
  sectionId: string,
): SectionContentsSnapshot {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  return {
    sectionTypeName: impl.type,
    styleColor: impl.styleColor ?? null,
  };
}

function SectionContentsBody({
  sectionId,
  sectionTypeName,
  bgColor,
}: {
  sectionId: string;
  sectionTypeName: SectionType;
  bgColor: string;
}) {
  if (sectionTypeName === SectionTypeEnum.Callable) {
    return (
      <CallableArea
        sectionId={sectionId}
        bgColor={bgColor}
        isMinimized={false}
        contentSurface="pane"
      />
    );
  }
  if (sectionTypeName === SectionTypeEnum.Dict) {
    return (
      <DictArea sectionId={sectionId} bgColor={bgColor} contentSurface="pane" />
    );
  }
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-4 text-xs text-setta-500 dark:text-setta-500">
      No detached contents for this section type.
    </div>
  );
}

function _SectionContents({ sectionId }: { sectionId: string }) {
  const { sectionTypeName, styleColor } = useProjectState((state) =>
    getSectionContentsSnapshot(state, sectionId),
  );
  const darkMode = useLocalStorage((state) => state.darkMode);
  const styleColorPreviewKey = getSectionStylePreviewColorKey(sectionId);
  const previewStyleColor = useTemporaryMiscState(
    (state) => state[styleColorPreviewKey] as string | null | undefined,
  );
  const resolvedStyleColor =
    previewStyleColor === undefined ? styleColor : previewStyleColor;
  const sectionStyleVars = resolvedStyleColor
    ? buildSectionStyleVars(resolvedStyleColor, darkMode)
    : undefined;
  const bgColor = "bg-transparent";

  return (
    <section
      className="setta-pane-scroll flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="section-contents-pane"
    >
      <div
        className="section-grid-cols section-grid-rows section-grid-areas relative grid min-h-0 flex-1 overflow-hidden bg-transparent"
        style={sectionStyleVars}
      >
        <SectionContentsBody
          sectionId={sectionId}
          sectionTypeName={sectionTypeName}
          bgColor={bgColor}
        />
      </div>
    </section>
  );
}

export const SectionContents = React.memo(_SectionContents);
