import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { setSectionSizes } from "openapi/http";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState, type ZustandProjectState } from "state/definitions";
import type { SectionSize } from "utils/generatedTypes";
import { setSelfParentSiblingChildrenWidths } from "./sectionSizes";

export function applyLocalSectionSizeChange(
  sectionId: string,
  nextSize: Partial<SectionSize>,
): Record<string, SectionSize> {
  let updatedSectionSizes: Record<string, SectionSize> = {};
  useProjectState.setState((state) => {
    updatedSectionSizes = applySectionSizeChange(sectionId, nextSize, state);
  });
  return updatedSectionSizes;
}

export function applySectionSizeChange(
  sectionId: string,
  nextSize: Partial<SectionSize>,
  state: ZustandProjectState,
): Record<string, SectionSize> {
  return setSelfParentSiblingChildrenWidths(sectionId, nextSize, state);
}

export function persistSectionSizeChange(
  sectionId: string,
  nextSize: Partial<SectionSize>,
) {
  let updatedSectionSizes: Record<string, SectionSize> = {};
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      updatedSectionSizes = applySectionSizeChange(sectionId, nextSize, state);
    },
    send: (frontendOpId) =>
      callOpenAPI(
        setSectionSizes({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            sectionSizes: updatedSectionSizes,
            frontendOpId,
          },
        } as unknown as Parameters<typeof setSectionSizes>[0]) as Parameters<
          typeof callOpenAPI
        >[0],
      ),
  });
}
