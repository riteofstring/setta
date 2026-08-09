import type { ReactNode } from "react";
import { RiDragDropFill } from "react-icons/ri";
import { BehaviorDropTypeEnum, behaviorToPretty, type BehaviorDropType } from "../../dnd/dropTypes";

export function DndSlot({
  behaviorDropType,
  children,
  isGroup,
}: {
  behaviorDropType: BehaviorDropType | null;
  children: ReactNode;
  isGroup: boolean;
}) {
  return (
    <>
      {behaviorDropType && (
        <DndSlotMiddle
          text={behaviorToPretty[behaviorDropType]}
          behaviorDropType={behaviorDropType}
          isGroup={isGroup}
        />
      )}
      {children}
    </>
  );
}

function DndSlotMiddle({
  text,
  behaviorDropType,
  isGroup,
}: {
  text: string;
  behaviorDropType: BehaviorDropType;
  isGroup: boolean;
}) {
  return (
    <div
      className={`absolute z-20 grid h-full w-full justify-center ${
        isGroup ? "[place-content:end_center]" : "place-content-center"
      }`}
    >
      <DndSlotInner text={text} behaviorDropType={behaviorDropType} isGroup={isGroup} />
    </div>
  );
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
  return (
    <div
      className={`grid h-8 min-w-60 select-none place-items-center rounded-full  text-sm font-bold uppercase tracking-widest text-white shadow-md backdrop-blur-sm transition-opacity ${
        invalid
          ? "[background-color:rgba(185,_28,_28,_0.65)]"
          : "[background-color:rgba(37,_99,_235,_0.8)]"
      } ${isGroup && "mb-8"}`}
    >
      <div className="flex items-center gap-2">
        <RiDragDropFill />
        {text}
      </div>
    </div>
  );
}
