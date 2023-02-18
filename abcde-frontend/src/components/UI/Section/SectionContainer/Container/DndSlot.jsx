import { RiDragDropFill } from "react-icons/ri";
import {
  BehaviorDropType,
  PositionDropType,
} from "utils/DNDSortable/dropTypes";

export function DndSlot({ positionDropType, behaviorDropType, children }) {
  return (
    <>
      {behaviorDropType !== BehaviorDropType.NONE && (
        <DndSlotMiddle text={behaviorDropType} />
      )}
      {positionDropType === PositionDropType.ABOVE && <DndSlotTop />}
      {children}
      {positionDropType === PositionDropType.BELOW && <DndSlotBottom />}
    </>
  );
}

function DndSlotMiddle({ text }) {
  return (
    <div className="relative flex w-full justify-center">
      <div className="absolute -bottom-6 flex justify-center">
        <DndSlotInner text={text} />
      </div>
    </div>
  );
}

function DndSlotTop() {
  return (
    <div className="relative flex w-full justify-center">
      <div className="absolute -bottom-6 flex justify-center">
        <DndSlotInner text="DROP" />
      </div>
    </div>
  );
}

function DndSlotBottom() {
  return (
    <div className="relative flex w-full justify-center">
      <div className="absolute -bottom-6 flex justify-center">
        <DndSlotInner text="DROP" />
      </div>
    </div>
  );
}

function DndSlotInner({ text }) {
  return (
    <div className="grid h-10 w-72 select-none place-items-center rounded-full font-heading font-bold uppercase tracking-widest text-white shadow-md backdrop-blur-sm transition-opacity [background-color:rgba(37,_99,_235,_0.8)]">
      <div className="flex items-center gap-2">
        <RiDragDropFill />
        {text}
      </div>
    </div>
  );
}
