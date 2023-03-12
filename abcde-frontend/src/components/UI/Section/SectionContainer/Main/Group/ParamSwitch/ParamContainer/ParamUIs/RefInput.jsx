import { ATTRIBUTE_UI_TYPE_ID } from "abcde-utils/src/constants";
import { useSetReactFlowActiveSectionOnClick } from "hooks/useSetReactFlowActiveSectionOnClick";
import { useSectionInfos } from "models/info/sectionInfos";
import { useStoreApi } from "react-flow-renderer";
import { createDefaultSectionInfo } from "thunks/sections/createSectionInfo";
import { getSectionName } from "thunks/sections/sections";
import { Button } from "utils/atoms/buttons/Button";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

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
    addAttrSection({ sectionId, refSectionId: value, reactFlowStore });
  }

  return (
    <>
      <IdNameCombobox
        allItems={allItems}
        initialSelection={value}
        onSelectedItemChange={onBlur}
        className={className}
        small={true}
        onClick={onClick}
      />
      <Button onClick={onFnClick}>Attr</Button>
    </>
  );
}

function addAttrSection({ sectionId, refSectionId, reactFlowStore }) {
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
  const configProps = { uiTypeId: ATTRIBUTE_UI_TYPE_ID };

  const [newId] = createDefaultSectionInfo({
    sectionProps,
    configProps,
    isTopLevel: true,
  });
}
