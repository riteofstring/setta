import { DropType } from "models/info/dndState";
import { RiDragDropFill } from "react-icons/ri";

export function DndSlot({ highlight, children }) {
  return (
    <>
      {highlight === DropType.ABOVE && <DndSlotTop />}
      {children}
      {highlight === DropType.BELOW && <DndSlotBottom />}
    </>
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
