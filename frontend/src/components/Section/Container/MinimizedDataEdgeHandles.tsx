import { HandlePosition, type HandleType } from "forks/xyflow/core/types";
import { useLayoutEffect, useRef } from "react";
import {
  registerEdgeHandlesWithSharedElement,
  unregisterEdgeHandle,
} from "state/actions/edgeHandles";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";

type MinimizedDataEdgeHandlesState = {
  isMinimized: boolean;
  inputPortIds: string[];
  outputPortIds: string[];
};

function arePortIdsEqual(previousIds: string[], nextIds: string[]) {
  if (previousIds.length !== nextIds.length) {
    return false;
  }
  for (let index = 0; index < previousIds.length; index += 1) {
    if (previousIds[index] !== nextIds[index]) {
      return false;
    }
  }
  return true;
}

function areMinimizedDataEdgeHandlesStateEqual(
  previousState: MinimizedDataEdgeHandlesState,
  nextState: MinimizedDataEdgeHandlesState,
) {
  return (
    previousState.isMinimized === nextState.isMinimized &&
    arePortIdsEqual(previousState.inputPortIds, nextState.inputPortIds) &&
    arePortIdsEqual(previousState.outputPortIds, nextState.outputPortIds)
  );
}

export function MinimizedDataEdgeHandles({ sectionId }: { sectionId: string }) {
  const { isMinimized, inputPortIds, outputPortIds } = useProjectState(
    (state): MinimizedDataEdgeHandlesState => {
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
    areMinimizedDataEdgeHandlesStateEqual,
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
          className={`react-flow__handle react-flow__handle-left arg-edge-handle arg-edge-handle--minimized arg-edge-handle--target ${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS}`}
          ref={leftDotRef}
        />
      )}
      {hasOutputPorts && (
        <div
          aria-hidden="true"
          className={`react-flow__handle react-flow__handle-right arg-edge-handle arg-edge-handle--minimized arg-edge-handle--source ${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS}`}
          ref={rightDotRef}
        />
      )}
    </>
  );
}
