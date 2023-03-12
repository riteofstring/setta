import { ATTRIBUTE_UI_TYPE_ID } from "abcde-utils/src/constants";
import { useSetReactFlowActiveSectionOnClick } from "hooks/useSetReactFlowActiveSectionOnClick";
import { useCodeInfo } from "models/info/codeInfo";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { useStoreApi } from "react-flow-renderer";
import { createDefaultSectionInfo } from "thunks/sections/createSectionInfo";
import { getSectionConfig, getSectionName } from "thunks/sections/sections";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";
import { cloneNewUIType } from "utils/uiTypeUtils";

export function RefInputConfig() {
  return null;
}

export function RefInput({ sectionId, value, onBlur, className }) {
  // TODO set an equalityFn here to reduce renders
  const availableSections = useSectionInfos((x) => x.x);
  const onClick = useSetReactFlowActiveSectionOnClick(sectionId);
  const allItems = [
    { group: "sections", items: Object.values(availableSections) },
  ];
  const reactFlowStore = useStoreApi();
  function onFnClick() {
    addAttrSection({
      sectionId,
      refSectionId: value,
      reactFlowStore,
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
        onClick={onClick}
      />
      <div>
        <button
          className="grid h-7 w-7 place-items-center rounded-full bg-slate-600 font-fancy text-sm font-bold italic text-slate-50 hover:cursor-pointer hover:bg-white hover:text-slate-500 hover:shadow-md"
          onClick={onFnClick}
        >
          f
        </button>
      </div>
    </div>
  );
}

function addAttrSection({
  sectionId,
  refSectionId,
  reactFlowStore,
  onCreation,
}) {
  const { selectedItem } = getSectionConfig(refSectionId);
  const { returnTypeId } = useCodeInfo.getState().allCodeInfo[selectedItem];
  const refSectionName = getSectionName(refSectionId);
  const { position: sectionPosition, width: sectionWidth } = reactFlowStore
    .getState()
    .nodeInternals.get(sectionId);

  const sectionProps = {
    name: `${refSectionName}.Attr`,
    initialPosition: {
      x: sectionPosition.x + sectionWidth,
      y: sectionPosition.y,
    },
  };

  const attrUIType = useUITypes.getState().x[ATTRIBUTE_UI_TYPE_ID];
  const uiType = cloneNewUIType({
    uiType: attrUIType,
    name: "",
    presetType: null,
  });
  uiType.config.collections = [returnTypeId];

  useUITypes.getState().x[uiType.id] = uiType;
  const configProps = {
    uiTypeId: uiType.id,
  };

  const [newId] = createDefaultSectionInfo({
    sectionProps,
    configProps,
    isTopLevel: true,
  });

  onCreation(newId);
}
