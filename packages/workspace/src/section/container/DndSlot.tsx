import { useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RiDragDropFill } from "react-icons/ri";
import { useReactFlow } from "../../canvas/store";
import { clamp } from "../../canvas/utils";
import {
  BehaviorDropTypeEnum,
  behaviorToPretty,
  type BehaviorDropType,
} from "../../dnd/dropTypes";
import { DROP_FEEDBACK_Z_INDEX } from "../../dnd/layers";
import {
  getElementTextDirection,
  type WorkspaceTextDirection,
} from "../../styles/textDirection";
import { useWorkspaceScopeClassName } from "../../styles/workspaceScope";
import { useSectionRefs } from "../sectionRefs";

type DropIndicatorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function DndSlot({
  behaviorDropType,
  children,
  isGroup,
  sectionId,
}: {
  behaviorDropType: BehaviorDropType | null;
  children: ReactNode;
  isGroup: boolean;
  sectionId: string;
}) {
  const target = useSectionRefs(
    (state) => state.withNested[sectionId] ?? state.selfOnly[sectionId] ?? null,
  );
  const targetRect = useDropIndicatorRect(target, behaviorDropType !== null);

  return (
    <>
      {behaviorDropType && targetRect && target && (
        <DndSlotMiddle
          text={behaviorToPretty[behaviorDropType]}
          behaviorDropType={behaviorDropType}
          direction={getElementTextDirection(target)}
          isGroup={isGroup}
          targetRect={targetRect}
        />
      )}
      {children}
    </>
  );
}

function DndSlotMiddle({
  text,
  behaviorDropType,
  direction,
  isGroup,
  targetRect,
}: {
  text: string;
  behaviorDropType: BehaviorDropType;
  direction: WorkspaceTextDirection;
  isGroup: boolean;
  targetRect: DropIndicatorRect;
}) {
  const workspaceScopeClassName = useWorkspaceScopeClassName();
  return createPortal(
    <div
      className={`${workspaceScopeClassName} grid justify-center ${
        isGroup ? "[place-content:end_center]" : "place-content-center"
      }`}
      data-dnd-slot-overlay="true"
      dir={direction}
      style={{
        position: "fixed",
        top: targetRect.top,
        left: targetRect.left,
        width: targetRect.width,
        height: targetRect.height,
        pointerEvents: "none",
        zIndex: DROP_FEEDBACK_Z_INDEX,
      }}
    >
      <DndSlotInner
        text={text}
        behaviorDropType={behaviorDropType}
        isGroup={isGroup}
      />
    </div>,
    document.body,
  );
}

function useDropIndicatorRect(target: HTMLElement | null, active: boolean) {
  const [targetRect, setTargetRect] = useState<DropIndicatorRect | null>(null);

  useLayoutEffect(() => {
    if (!active || !target) {
      setTargetRect(null);
      return undefined;
    }
    const observedTarget = target;

    function updateTargetRect() {
      const next = observedTarget.getBoundingClientRect();
      setTargetRect((current) => {
        if (
          current?.top === next.top &&
          current.left === next.left &&
          current.width === next.width &&
          current.height === next.height
        ) {
          return current;
        }
        return {
          top: next.top,
          left: next.left,
          width: next.width,
          height: next.height,
        };
      });
    }

    updateTargetRect();
    const resizeObserver = new ResizeObserver(updateTargetRect);
    resizeObserver.observe(observedTarget);
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("pointermove", updateTargetRect);
    document.addEventListener("scroll", updateTargetRect, true);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("pointermove", updateTargetRect);
      document.removeEventListener("scroll", updateTargetRect, true);
    };
  }, [active, target]);

  return targetRect;
}

function DndSlotInner({
  text,
  behaviorDropType,
  isGroup,
}: {
  text: string;
  behaviorDropType: BehaviorDropType;
  isGroup: boolean;
}) {
  const invalid = behaviorDropType === BehaviorDropTypeEnum.INVALID;
  const scale = useReactFlow((state) => clamp(state.transform[2], 0.35, 1));
  return (
    <div
      className={`grid h-8 min-w-60 select-none place-items-center rounded-full  text-sm font-bold uppercase tracking-widest text-white shadow-md backdrop-blur-sm motion-safe:transition-opacity ${
        invalid
          ? "[background-color:rgba(185,_28,_28,_0.65)]"
          : "[background-color:rgba(37,_99,_235,_0.8)]"
      } ${isGroup && "mb-8"}`}
      style={{ transform: `scale(${scale})`, transformOrigin: "center" }}
    >
      <div className="flex items-center gap-2">
        <RiDragDropFill />
        {text}
      </div>
    </div>
  );
}
