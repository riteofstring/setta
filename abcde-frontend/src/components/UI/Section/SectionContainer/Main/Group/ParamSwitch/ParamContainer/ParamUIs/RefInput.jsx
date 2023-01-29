import { useSectionInfos } from "models/info/sectionInfos";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export function RefInputConfig() {
  return null;
}

export function RefInput({ value, onBlur, className, sectionId }) {
  // TODO set an equalityFn here to reduce renders
  const availableSections = useSectionInfos((x) => x.x);
  const width = useSectionInfos((x) => x.x[sectionId].size.width);

  return (
    <IdNameCombobox
      allItems={Object.values(availableSections)}
      initialSelection={value}
      onSelectedItemChange={onBlur}
      className={className}
      width={`${width / 2}px`}
      small={true}
    />
  );
}
