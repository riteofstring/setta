import { StandardDropDown } from "utils/StandardDropdown/StandardDropdown";
import { prettyToSectionTypes, sectionTypesToPretty } from "utils/constants";

export default function SectionConfigTypeSelection({ onChange, currType }) {
  const localOnChange = (e) => {
    const name = prettyToSectionTypes.get(e.target.value);
    onChange(name);
  };

  return (
    <StandardDropDown
      placeholder="Select Section Type"
      onChange={localOnChange}
      prettyToX={prettyToSectionTypes}
      xToPretty={sectionTypesToPretty}
      currX={currType}
    />
  );
}
