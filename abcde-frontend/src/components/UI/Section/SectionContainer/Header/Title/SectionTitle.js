import { Heading, Input } from "@chakra-ui/react";
import { useState } from "react";

export default function SectionTitle({
  heading,
  requiresKeyInput,
  onTitleInputChange,
}) {
  const [inputValue, setInputValue] = useState(heading);

  const onBlur = (v) => {
    onTitleInputChange(v);
  };

  return (
    <>
      {requiresKeyInput ? (
        <Input
          placeholder="Please Enter Key"
          value={inputValue}
          width="50%"
          onChange={(v) => setInputValue(v.target.value)}
          onBlur={(v) => onBlur(v.target.value)}
        />
      ) : (
        <Heading
          size="md"
          fontWeight="black"
          letterSpacing="tighter"
          color="gray.700"
          as="h2"
        >
          {heading}
        </Heading>
      )}
    </>
  );
}
