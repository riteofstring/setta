import { Input } from "@chakra-ui/react";

export default function SimpleConfig({ options, onChange }) {
  return options.map((e, idx) => (
    <Input
      placeholder={e}
      key={`${e}-${idx}`}
      onChange={(v) => onChange(e, v.target.value)}
    />
  ));
}
