import { Editable, EditablePreview, EditableInput } from "@chakra-ui/react";
import { useState, useEffect } from "react";

export default function ParamNameInput({ value, onSubmit }) {
  const [liveValue, setLiveValue] = useState(value);

  useEffect(() => {
    setLiveValue(value ? value: "");
  }, [value]);

  return (
    <Editable
      placeholder="enter keyword"
      value={liveValue}
      onChange={setLiveValue}
      onSubmit={onSubmit}
    >
      <EditablePreview />
      <EditableInput />
    </Editable>
  );
}
