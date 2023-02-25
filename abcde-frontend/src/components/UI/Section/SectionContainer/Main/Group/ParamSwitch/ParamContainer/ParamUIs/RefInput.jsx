import { useSetReactFlowActiveSectionOnClick } from "hooks/useSetReactFlowActiveSectionOnClick";
import { useSectionInfos } from "models/info/sectionInfos";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export function RefInputConfig() {
  return null;
}

export function RefInput({ sectionId, value, onBlur, className }) {
  // TODO set an equalityFn here to reduce renders
  const availableSections = useSectionInfos((x) => x.x);
  const onClick = useSetReactFlowActiveSectionOnClick(sectionId);

  return (
    <IdNameCombobox
      allItems={Object.values(availableSections)}
      initialSelection={value}
      onSelectedItemChange={onBlur}
      className={className}
      small={true}
      onClick={onClick}
    />
  );
}
