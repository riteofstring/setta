import _ from "lodash";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";

const MINIMIZED_DATA_EDGE_HANDLE_GUARD_CLASSES = `${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;

export function MinimizedDataEdgeHandles({ sectionId }: { sectionId: string }) {
  const { isMinimized, inputPortIds, outputPortIds } = useProjectState(
    (state) => {
      const impl = getCurrEffectiveSectionImpl(state, sectionId);
      if (
        !isBaseSectionWithParamsImpl(
          impl as unknown as Parameters<typeof isBaseSectionWithParamsImpl>[0],
        )
      ) {
        return {
          isMinimized: impl.isMinimized,
          inputPortIds: [],
          outputPortIds: [],
        };
      }
      return {
        isMinimized: impl.isMinimized,
        inputPortIds: impl.edgeInputParams ?? [],
        outputPortIds: (impl.edgeOutputPorts ?? []).map((port) => port.id),
      };
    },
    _.isEqual,
  );

  if (!isMinimized) {
    return null;
  }

  const hasInputPorts = inputPortIds.length > 0;
  const hasOutputPorts = outputPortIds.length > 0;
  if (!hasInputPorts && !hasOutputPorts) {
    return null;
  }

  return (
    <>
      {hasInputPorts && (
        <div
          aria-hidden="true"
          className={`setta-gpu-flow__handle setta-gpu-flow__handle-left arg-edge-handle arg-edge-handle--minimized arg-edge-handle--target ${MINIMIZED_DATA_EDGE_HANDLE_GUARD_CLASSES}`}
        />
      )}
      {hasOutputPorts && (
        <div
          aria-hidden="true"
          className={`setta-gpu-flow__handle setta-gpu-flow__handle-right arg-edge-handle arg-edge-handle--minimized arg-edge-handle--source ${MINIMIZED_DATA_EDGE_HANDLE_GUARD_CLASSES}`}
        />
      )}
    </>
  );
}
