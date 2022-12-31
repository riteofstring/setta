import { useSectionInfos } from "models/info/sectionInfos";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export function RefInputConfig() {
  return null;
}

export default function RefInput({ value, onBlur, className }) {
  const availableSections = useSectionInfos((x) => x.x);

  return (
    <IdNameCombobox
      allItems={Object.values(availableSections)}
      initialSelection={value}
      onSelectedItemChange={onBlur}
      className={className}
      width="424px"
    />
  );
}
