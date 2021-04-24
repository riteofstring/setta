import { Editable, EditablePreview, EditableInput } from "@chakra-ui/react";
import { useState, useEffect } from "react";

export default function ParamNameInput({ value, onSubmit, takenNames }) {
  const [liveValue, setLiveValue] = useState(value);

  useEffect(() => {
    setLiveValue(value ? value : "");
  }, [value]);

  const onSubmitWrapper = (v) => {
    if (!takenNames.includes(v)) {
      onSubmit(v);
    } else {
      setLiveValue("");
    }
  };

  return (
    <Editable
      placeholder="enter keyword"
      value={liveValue}
      onChange={setLiveValue}
      onSubmit={onSubmitWrapper}
    >
      <EditablePreview />
      <EditableInput />
    </Editable>
  );
}
