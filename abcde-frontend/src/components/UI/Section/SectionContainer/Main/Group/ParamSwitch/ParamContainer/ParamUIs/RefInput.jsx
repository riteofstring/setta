import { useStoreState } from "easy-peasy";
import _ from "lodash";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export function RefInputConfig() {
  return null;
}

export default function RefInput({ value, onBlur, className }) {
  const availableSections = useStoreState((x) => x.sectionInfos.x);

  return (
    <IdNameCombobox
      allItems={_.values(availableSections)}
      initialSelection={value}
      onSelectedItemChange={onBlur}
      className={className}
      width="424px"
    />
  );
}
