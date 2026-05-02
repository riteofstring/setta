import { HandlePosition, type HandleType } from "gpuFlow/flowTypes";
import _ from "lodash";
import { useLayoutEffect, useRef } from "react";
import {
  registerEdgeHandlesWithSharedElement,
  unregisterEdgeHandle,
} from "state/actions/edgeHandles";
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
      if (!isBaseSectionWithParamsImpl(impl)) {
        return {
          isMinimized: impl.isMinimized,
          inputPortIds: [],
          outputPortIds: [],
        };
      }
      return {
        isMinimized: impl.isMinimized,
        inputPortIds: impl.edgeInputParams,
        outputPortIds: impl.edgeOutputPorts.map((port) => port.id),
      };
    },
    _.isEqual,
  );

  const leftDotRef = useRef<HTMLDivElement | null>(null);
  const rightDotRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!isMinimized) {
      return;
    }
    const leftEl = leftDotRef.current;
    const rightEl = rightDotRef.current;
    if (!leftEl && !rightEl) {
      return;
    }

    const registered: Array<{ portId: string; type: HandleType }> = [];

    if (leftEl) {
      registerEdgeHandlesWithSharedElement({
        sectionId,
        portIds: inputPortIds,
        type: "target",
        side: HandlePosition.Left,
        element: leftEl,
      });
      for (const portId of inputPortIds) {
        registered.push({ portId, type: "target" });
      }
    }

    if (rightEl) {
      registerEdgeHandlesWithSharedElement({
        sectionId,
        portIds: outputPortIds,
        type: "source",
        side: HandlePosition.Right,
        element: rightEl,
      });
      for (const portId of outputPortIds) {
        registered.push({ portId, type: "source" });
      }
    }

    return () => {
      for (const entry of registered) {
        unregisterEdgeHandle(sectionId, entry.portId, entry.type);
      }
    };
  }, [inputPortIds, isMinimized, outputPortIds, sectionId]);

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
          className={`react-flow__handle react-flow__handle-left arg-edge-handle arg-edge-handle--minimized arg-edge-handle--target ${MINIMIZED_DATA_EDGE_HANDLE_GUARD_CLASSES}`}
          ref={leftDotRef}
        />
      )}
      {hasOutputPorts && (
        <div
          aria-hidden="true"
          className={`react-flow__handle react-flow__handle-right arg-edge-handle arg-edge-handle--minimized arg-edge-handle--source ${MINIMIZED_DATA_EDGE_HANDLE_GUARD_CLASSES}`}
          ref={rightDotRef}
        />
      )}
    </>
  );
}
