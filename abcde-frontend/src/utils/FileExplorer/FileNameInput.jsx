import { Input } from "@chakra-ui/react";

export default function FileNameInput({ value, placeholder, onChange }) {
  return (
    <Input
      mt="1.25rem"
      variant="flushed"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      size="lg"
    />
  );
}
