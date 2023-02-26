import { useSetReactFlowActiveSectionOnClick } from "hooks/useSetReactFlowActiveSectionOnClick";
import { useSectionInfos } from "models/info/sectionInfos";
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
  function onFnClick() {
    addAttrSection({ refSectionId: value });
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
      <Button onClick={onFnClick}>{"Attr"}</Button>
    </>
  );
}

function addAttrSection({ refSectionId }) {
  console.log(refSectionId);

  const refSectionName = getSectionName(refSectionId);
  const sectionProps = { name: `${refSectionName}.Attr` };
  const configProps = {};

  const [newId] = createDefaultSectionInfo({
    sectionProps,
    configProps,
    isTopLevel: true,
  });
  console.log("newId", newId);
}
