import { FN_UI_TYPE_ID } from "abcde-utils/src/constants";
import { newSectionPosition } from "abcde-utils/src/objs/sectionPosition";
import { useCodeInfo } from "models/info/codeInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import { createDefaultSectionInfo } from "thunks/sections/createSectionInfo";
import { getSectionInfo, getSectionName } from "thunks/sections/sections";
import { setSectionUITypeConfig } from "thunks/uiTypes/setSectionUITypeConfig";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";
import { REACT_FLOW_STORE } from "utils/constants";

export function RefInputConfig() {
  return null;
}

export function RefInput({ sectionId, value, onBlur, className }) {
  // TODO set an equalityFn here to reduce renders
  const availableSections = useSectionInfos((x) => x.x);
  const allItems = [
    { group: "sections", items: Object.values(availableSections) },
  ];
  function onFnClick() {
    addAttrSection({
      sectionId,
      refSectionId: value,
      onCreation: onBlur,
    });
  }

  return (
    <div className="flex gap-1">
      <IdNameCombobox
        allItems={allItems}
        initialSelection={value}
        onSelectedItemChange={onBlur}
        className={className}
        small={true}
      />
      <div>
        <button
          className="grid h-7 w-7 place-items-center rounded-full bg-slate-700 font-fancy text-sm font-bold italic text-slate-50 hover:cursor-pointer hover:bg-white hover:text-slate-200 hover:shadow-md dark:bg-slate-900 dark:hover:bg-slate-800"
          onClick={onFnClick}
        >
          f
        </button>
      </div>
    </div>
  );
}

function addAttrSection({ sectionId, refSectionId, onCreation }) {
  const reactFlowStore = REACT_FLOW_STORE.store;
  const refSectionName = getSectionName(refSectionId);
  const { position: sectionPosition, width: sectionWidth } = reactFlowStore
    .getState()
    .nodeInternals.get(sectionId);

  const sectionProps = {
    name: `${refSectionName}.Fn()`,
    chainedFrom: refSectionId,
    uiTypeId: FN_UI_TYPE_ID,
  };

  const [newId] = createDefaultSectionInfo({
    sectionProps,
    topLevelPosition: newSectionPosition({
      x: sectionPosition.x + sectionWidth,
      y: sectionPosition.y,
    }),
  });

  const { selectedItem } = getSectionInfo(refSectionId);
  const { returnTypeId } = useCodeInfo.getState().allCodeInfo[selectedItem];
  setSectionUITypeConfig({
    sectionId: newId,
    configProps: {
      configName: "collections",
      newValueFn: () => [returnTypeId],
    },
  });

  onCreation(newId);
}
