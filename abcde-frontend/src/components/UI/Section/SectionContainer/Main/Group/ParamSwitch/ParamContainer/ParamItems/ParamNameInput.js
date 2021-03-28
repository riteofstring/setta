import { useState } from "react";
import { Input } from "@chakra-ui/react";

export default function ParamNameInput(props) {
  const [name, setName] = useState("");
  return (
    <Input
      type=""
      variant="flushed"
      placeholder=""
      size="xs"
      maxWidth="10rem"
      value={name}
      onChange={(e) => setName(e.target.value)}
    />
  );
}
