import { RiDragDropFill } from "react-icons/ri";
import { PositionDropType } from "utils/DNDSortable/dropTypes";

export function DndSlot({ positionDropType, behaviorDropType, children }) {
  return (
    <>
      {/* {positionDropType === PositionDropType.INTO && <DndSlotTop />} */}
      {positionDropType === PositionDropType.ABOVE && <DndSlotTop />}
      {children}
      {positionDropType === PositionDropType.BELOW && <DndSlotBottom />}
    </>
  );
}

function DndSlotMiddle() {
  return (
    <div className="relative flex w-full justify-center">
      <div className="absolute -bottom-6 flex justify-center">
        <div className="grid h-10 w-72 select-none place-items-center rounded-full font-heading font-bold uppercase tracking-widest text-white shadow-md backdrop-blur-sm transition-opacity [background-color:rgba(37,_99,_235,_0.8)]">
          <div className="flex items-center gap-2">
            <RiDragDropFill />
            INTO
          </div>
        </div>
      </div>
    </div>
  );
}

function DndSlotTop() {
  return (
    <div className="relative flex w-full justify-center">
      <div className="absolute -bottom-6 flex justify-center">
        <DndSlotInner />
      </div>
    </div>
  );
}

function DndSlotBottom() {
  return (
    <div className="relative flex w-full justify-center">
      <div className="absolute -bottom-6 flex justify-center">
        <DndSlotInner />
      </div>
    </div>
  );
}

function DndSlotInner() {
  return (
    <div className="grid h-10 w-72 select-none place-items-center rounded-full font-heading font-bold uppercase tracking-widest text-white shadow-md backdrop-blur-sm transition-opacity [background-color:rgba(37,_99,_235,_0.8)]">
      <div className="flex items-center gap-2">
        <RiDragDropFill />
        Drop
      </div>
    </div>
  );
}
