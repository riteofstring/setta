import { PrettyDropDown } from "utils/PrettyDropdown/prettyDropdown";
import { prettyToSectionTypes, sectionTypesToPretty } from "utils/constants";

export default function SectionConfigTypeSelection({ onChange, currType }) {
  const localOnChange = (e) => {
    const name = prettyToSectionTypes.get(e.target.value);
    onChange(name);
  };

  return (
    <PrettyDropDown
      placeholder="Select Section Type"
      onChange={localOnChange}
      prettyToX={prettyToSectionTypes}
      xToPretty={sectionTypesToPretty}
      currX={currType}
    />
  );
}
