import React, {
  useEffect,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import { updateSettingsGraphSubstrateCanaryInstrumentationSnapshot } from "./settingsGraphSubstrateCanaryInstrumentation";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  resolveSettingsGraphSubstrateCanarySectionBody,
  SettingsGraphSubstrateCanarySectionBodyDomAdapter,
} from "./settingsGraphSubstrateCanarySectionBodyAdapter";
import type { SettingsGraphSubstrateCanarySectionDragController } from "./settingsGraphSubstrateCanarySectionDragController";
import { SettingsGraphSubstrateCanarySectionShell } from "./settingsGraphSubstrateCanarySectionShell";

type SettingsGraphSubstrateCanarySectionsLayerProps = {
  draggingSectionId: string | null;
  onHoveredSectionChange: (sectionId: string | null) => void;
  sceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
  sectionDragController: SettingsGraphSubstrateCanarySectionDragController;
};

function _SettingsGraphSubstrateCanarySectionsLayer({
  draggingSectionId,
  onHoveredSectionChange,
  sceneSections,
  sectionDragController,
}: SettingsGraphSubstrateCanarySectionsLayerProps) {
  useEffect(() => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      mountedSectionBodyCount: sceneSections.length,
    });
  }, [sceneSections.length]);

  function handleSectionPointerDown(
    section: SettingsGraphSubstrateCanarySceneSection,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (
      !sectionDragController.handleSectionPointerDown({
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        section,
        target: event.target,
      })
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSectionPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !sectionDragController.handleSectionPointerMove({
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
      })
    ) {
      return;
    }
    event.preventDefault();
  }

  function finishSectionDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    persistLayout: boolean,
  ) {
    if (
      !sectionDragController.finishSectionDrag({
        persistLayout,
        pointerId: event.pointerId,
      })
    ) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <>
      {sceneSections.map((section) => {
        const sectionBody = resolveSettingsGraphSubstrateCanarySectionBody({
          positionAndSizeLocked: section.positionAndSizeLocked,
          sectionId: section.sectionId,
          sectionTypeName: section.sectionTypeName ?? SectionTypeEnum.Code,
          shellChromeOwner: "shell-layer",
          styleColor: section.styleColor ?? null,
          textBlockMetaControlStyle: section.textBlockMetaControlStyle ?? false,
        });
        return (
          <SettingsGraphSubstrateCanarySectionShell
            key={section.sectionId}
            draggingSectionId={draggingSectionId}
            finishSectionDrag={finishSectionDrag}
            handleSectionPointerDown={handleSectionPointerDown}
            handleSectionPointerMove={handleSectionPointerMove}
            onHoveredSectionChange={onHoveredSectionChange}
            section={section}
          >
            <SettingsGraphSubstrateCanarySectionBodyDomAdapter
              sectionBody={sectionBody}
            />
          </SettingsGraphSubstrateCanarySectionShell>
        );
      })}
    </>
  );
}

export const SettingsGraphSubstrateCanarySectionsLayer = React.memo(
  _SettingsGraphSubstrateCanarySectionsLayer,
);
