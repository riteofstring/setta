import { useSectionInfos } from "models/info/sectionInfos";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export function RefInputConfig() {
  return null;
}

export function RefInput({ value, onBlur, className }) {
  // TODO set an equalityFn here to reduce renders
  const availableSections = useSectionInfos((x) => x.x);

  return (
    <IdNameCombobox
      allItems={Object.values(availableSections)}
      initialSelection={value}
      onSelectedItemChange={onBlur}
      className={className}
      // width="424px"
      small={true}
    />
  );
}
