import { RiDragDropFill } from "react-icons/ri";
import {
  BehaviorDropType,
  PositionDropType,
} from "utils/DNDSortable/dropTypes";

export function DndSlot({ positionDropType, behaviorDropType, children }) {
  return (
    <>
      {positionDropType === PositionDropType.ABOVE && (
        <DndSlotTop
          text={behaviorDropType}
          behaviorDropType={behaviorDropType}
        />
      )}
      {positionDropType === PositionDropType.INTO && (
        <DndSlotMiddle
          text={behaviorDropType}
          behaviorDropType={behaviorDropType}
        />
      )}
      {children}
      {positionDropType === PositionDropType.BELOW && (
        <DndSlotBottom
          text={behaviorDropType}
          behaviorDropType={behaviorDropType}
        />
      )}
    </>
  );
}

function DndSlotMiddle({ text, behaviorDropType }) {
  return (
    <div className="absolute z-10 grid h-full w-full place-content-center justify-center">
      <DndSlotInner text={text} behaviorDropType={behaviorDropType} />
    </div>
  );
}

function DndSlotTop({ text, behaviorDropType }) {
  return (
    <div className="relative z-10 flex w-full justify-center">
      <div className="absolute -bottom-5 flex justify-center">
        <DndSlotInner text={text} behaviorDropType={behaviorDropType} />
      </div>
    </div>
  );
}

function DndSlotBottom({ text, behaviorDropType }) {
  return (
    <div className="relative z-10 flex w-full justify-center">
      <div className="absolute -bottom-5 flex justify-center">
        <DndSlotInner text={text} behaviorDropType={behaviorDropType} />
      </div>
    </div>
  );
}

function DndSlotInner({ text, behaviorDropType }) {
  const invalid = behaviorDropType === BehaviorDropType.INVALID;
  return (
    <div
      className={`grid h-10 w-72 select-none place-items-center rounded-full font-heading font-bold uppercase tracking-widest text-white shadow-md backdrop-blur-sm transition-opacity ${
        invalid
          ? "[background-color:rgba(220,_38,_38,_0.8)]"
          : "[background-color:rgba(37,_99,_235,_0.8)]"
      } `}
    >
      <div className="flex items-center gap-2">
        <RiDragDropFill />
        {text}
      </div>
    </div>
  );
}
