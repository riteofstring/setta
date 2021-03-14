import { Input } from "@chakra-ui/react";
import { useState } from "react";

export default function FileNameInput() {
  const [value, setValue] = useState("");
  const handleChange = (event) => {
    console.log("event.target.value", event.target.value)
    setValue(event.target.value);
  }

  console.log("value", value)

  return (
    <>
      <Input
        value={value}
        onChange={handleChange}
        size="sm"
      />
    </>
  );
}
