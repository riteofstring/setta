import { Input, InputGroup } from "@chakra-ui/react";

export default function FileNameInput() {
  return (
    <>
      <Input
        mt="1.25rem"
        variant="flushed"
        // value={enteredUIName}
        placeholder="Project Name"
        // onChange={(e) => setEnteredUIName(e.target.value)}
        size="lg"
      />
    </>
  );
}
