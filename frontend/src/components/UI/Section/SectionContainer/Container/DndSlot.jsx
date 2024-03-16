import { RiDragDropFill } from "react-icons/ri";
import {
  BehaviorDropType,
  behaviorToPretty,
  PositionDropType,
} from "utils/DNDSortable/dropTypes";

export function DndSlot({
  positionDropType,
  behaviorDropType,
  children,
  isDeck,
}) {
  const text = behaviorToPretty[behaviorDropType];

  return (
    <>
      {positionDropType === PositionDropType.INTO && (
        <DndSlotMiddle
          text={text}
          behaviorDropType={behaviorDropType}
          isDeck={isDeck}
        />
      )}
      {children}
    </>
  );
}

function DndSlotMiddle({ text, behaviorDropType, isDeck }) {
  return (
    <div
      className={`absolute z-20 grid h-full w-full justify-center ${
        isDeck ? "[place-content:end_center]" : "place-content-center"
      }`}
    >
      <DndSlotInner
        text={text}
        behaviorDropType={behaviorDropType}
        isDeck={isDeck}
      />
    </div>
  );
}

function DndSlotInner({ text, behaviorDropType, isDeck }) {
  const invalid = behaviorDropType === BehaviorDropType.INVALID;
  return (
    <div
      className={`grid h-8 min-w-60 select-none place-items-center rounded-full font-heading text-sm font-bold uppercase tracking-widest text-white shadow-md backdrop-blur-sm transition-opacity ${
        invalid
          ? "[background-color:rgba(220,_38,_38,_0.8)]"
          : "[background-color:rgba(37,_99,_235,_0.8)]"
      } ${isDeck && "mb-8"}`}
    >
      <div className="flex items-center gap-2">
        <RiDragDropFill />
        {text}
      </div>
    </div>
  );
}
