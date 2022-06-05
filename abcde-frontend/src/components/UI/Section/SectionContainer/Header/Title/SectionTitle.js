import {
  Editable,
  EditableInput,
  EditablePreview,
  Heading,
  Input,
} from "@chakra-ui/react";
import { useState } from "react";

export default function SectionTitle({
  heading,
  onTitleInputChange,
  isList,
  idxForList,
}) {
  const [inputValue, setInputValue] = useState(heading);

  const onBlur = (v) => {
    if (v != "") {
      onTitleInputChange(v);
    } else {
      setInputValue(heading);
    }
  };

  return isList ? (
    <Heading
      size="md"
      fontWeight="black"
      letterSpacing="tighter"
      color="gray.700"
      as="h2"
    >
      {idxForList}
    </Heading>
  ) : (
    <Editable
      value={inputValue}
      onChange={setInputValue}
      isPreviewFocusable={true}
      onSubmit={onBlur}
    >
      <EditablePreview />
      <Input as={EditableInput} />
    </Editable>
  );
}

// old:
// return (
//   <>
//     {requiresKeyInput ? (
//       <Input
//         placeholder="Please Enter Key"
//         value={inputValue}
//         width="50%"
//         onChange={(v) => setInputValue(v.target.value)}
//         onBlur={(v) => onBlur(v.target.value)}
//       />
//     ) : (
//       <Heading
//         size="md"
//         fontWeight="black"
//         letterSpacing="tighter"
//         color="gray.700"
//         as="h2"
//       >
//         {heading}
//       </Heading>
//     )}
//   </>
// );
