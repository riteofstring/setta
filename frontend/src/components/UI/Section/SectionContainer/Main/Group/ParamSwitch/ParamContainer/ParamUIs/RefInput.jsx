import { useSectionInfos } from "models/info/sectionInfos";
import { createSectionInfo } from "thunks/sections/createSectionInfo";
import { getSectionName } from "thunks/sections/getters";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";
import { REACT_FLOW_STORE } from "utils/constants";
import { newSectionPosition } from "z_utils/objs/sectionPosition";

export function RefInputConfig() {
  return null;
}

export function RefInput({ sectionId, value, onChange, className }) {
  // TODO set an equalityFn here to reduce renders
  const availableSections = useSectionInfos((x) => x.x);
  const allItems = [
    { group: "sections", items: Object.values(availableSections) },
  ];
  function onFnClick() {
    addAttrSection({
      sectionId,
      refSectionId: value,
    });
  }

  return (
    <div className="flex gap-1">
      <IdNameCombobox
        allItems={allItems}
        initialSelection={value}
        onSelectedItemChange={onChange}
        className={className}
        small={true}
      />
      <div>
        <button
          className="grid h-7 w-7 place-items-center rounded-full bg-slate-700 font-serif text-sm font-bold italic text-slate-50 hover:cursor-pointer hover:bg-white hover:text-slate-200 hover:shadow-md dark:bg-runcoder-900 dark:hover:bg-runcoder-800"
          onClick={onFnClick}
        >
          f
        </button>
      </div>
    </div>
  );
}

function addAttrSection({ sectionId, refSectionId }) {
  const reactFlowStore = REACT_FLOW_STORE.store;
  const refSectionName = getSectionName(refSectionId);
  const { position: sectionPosition, width: sectionWidth } = reactFlowStore
    .getState()
    .nodeInternals.get(sectionId);

  const sectionProps = {
    name: `${refSectionName}.Fn()`,
    chainedFrom: refSectionId,
  };

  createSectionInfo({
    sectionProps,
    topLevelPosition: newSectionPosition({
      x: sectionPosition.x + sectionWidth,
      y: sectionPosition.y,
    }),
  });
}
