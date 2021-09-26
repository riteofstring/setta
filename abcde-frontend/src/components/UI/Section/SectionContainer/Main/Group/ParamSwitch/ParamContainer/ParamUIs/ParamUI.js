import { NestedObjectInputConfig } from "./NestedObjectInput";
import SliderInput, { SliderInputConfig } from "./SliderInput";
import TextInput, { TextInputConfig } from "./TextInput";

export function ParamUIConfig({ name, savedConfig, onChange }) {
  console.log("ParamUIConfig", name);
  switch (name) {
    default:
      return <TextInputConfig savedConfig={savedConfig} onChange={onChange} />;
    case "SLIDER":
      return (
        <SliderInputConfig savedConfig={savedConfig} onChange={onChange} />
      );
    case "NESTED_OBJECT":
    case "LIST_NESTED_OBJECT":
    case "DICT_NESTED_OBJECT":
      return (
        <NestedObjectInputConfig
          name={name}
          savedConfig={savedConfig}
          onChange={onChange}
        />
      );
  }
}

export default function ParamUI({ name, childProps }) {
  switch (name) {
    default:
      return <TextInput {...childProps} />;
    case "SLIDER":
      return <SliderInput {...childProps} />;
  }
}
