import { HStack, Heading, Input } from "@chakra-ui/react";
import {useState} from "react"

export default function SectionTitle({
  sectionHeading,
  requiresKeyInput,
  onTitleInputChange,
}) {

  const [inputValue, setInputValue] = useState(sectionHeading)

  const onBlur = (v) => {
    onTitleInputChange(v)
  }

  return (
    <>
      {requiresKeyInput ? (
        <Input
          placeholder="Please Enter Key"
          value={inputValue}
          width="50%"
          onChange={(v)=>setInputValue(v.target.value)}
          onBlur={(v)=>onBlur(v.target.value)}
        />
      ) : (
        <Heading
          size="md"
          fontWeight="medium"
          letterSpacing="tighter"
          color="gray.500"
          as="h2"
        >
          {sectionHeading}
        </Heading>
      )}
    </>
  );
}
