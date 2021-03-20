import { Input } from "@chakra-ui/react";

export default function FileNameInput(props) {
  return (
    <>
      <Input
        mt="1.25rem"
        variant="flushed"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        size="lg"
      />
    </>
  );
}
