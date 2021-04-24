import TextInput, { TextInputConfig } from "./TextInput";
import SliderInput, { SliderInputConfig } from "./SliderInput";
import { NestedObjectInputConfig } from "./NestedObjectInput";
import { useStoreState } from "easy-peasy";

export function ParamUIConfig({ name, savedConfig, onChange }) {
  const available = useStoreState((state) => state.master.sections.available);

  const availableModules = Object.keys(available.modules);
  const availableParameters = Object.keys(available.parameters);

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
          availableModules={availableModules}
          availableParameters={availableParameters}
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
