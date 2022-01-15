import { Select } from "@chakra-ui/react";

export function PrettyDropDown({ prettyToX, xToPretty, currX, ...props }) {
  return (
    <Select value={xToPretty.get(currX)} {...props}>
      {[...prettyToX.keys()].map((e, idx) => (
        <option value={e} key={`${e}-${idx}`}>
          {e}
        </option>
      ))}
    </Select>
  );
}
