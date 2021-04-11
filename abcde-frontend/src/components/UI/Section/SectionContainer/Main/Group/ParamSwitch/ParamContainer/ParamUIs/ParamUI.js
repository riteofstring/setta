import TextInput, { TextInputConfig } from "./TextInput";
import SliderInput, { SliderInputConfig } from "./SliderInput";
import { NestedObjectInputConfig } from "./NestedObjectInput";
import { useStoreState } from "easy-peasy";

export function ParamUIConfig({ name, savedConfig, onChange }) {
  const availableModules = useStoreState(
    (state) => state.master.sections.available.modules
  );

  const availableModuleNames = Object.keys(availableModules)

  switch (name) {
    default:
      return <TextInputConfig savedConfig={savedConfig} onChange={onChange} />;
    case "SLIDER":
      return (
        <SliderInputConfig savedConfig={savedConfig} onChange={onChange} />
      );
    case "NESTED_OBJECT":
    case "LIST_NESTED_OBJECT":
      return (
        <NestedObjectInputConfig
          name={name}
          savedConfig={savedConfig}
          onChange={onChange}
          availableModules={availableModuleNames}
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
