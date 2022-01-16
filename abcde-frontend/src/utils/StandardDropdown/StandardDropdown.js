import { Select } from "@chakra-ui/react";

export function StandardDropDown({ options, curr, ...props }) {
  return (
    <Select value={curr} {...props}>
      {_.map(options, (v, k) => (
        <option value={k} key={`${v}-${k}`}>
          {v}
        </option>
      ))}
    </Select>
  );
}
