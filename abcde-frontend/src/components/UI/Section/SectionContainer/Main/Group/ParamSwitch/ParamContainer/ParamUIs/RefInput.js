import { useStoreState } from "easy-peasy";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export function RefInputConfig() {
  return null;
}

export default function RefInput({ value, onChangeEnd, className }) {
  const availableSections = useStoreState((x) => x.sectionInfos.x);

  return (
    <IdNameCombobox
      allItems={_.values(availableSections)}
      initialSelection={value}
      onSelectedItemChange={onChangeEnd}
      className={className}
      width="424px"
    />
  );
}
