import { DICT_ROOT, LIST_ROOT, SECTION, SLIDER, SWITCH } from "utils/constants";

import { NestedObjectInputConfig } from "./NestedObjectInput";
import SliderInput, { SliderInputConfig } from "./SliderInput";
import SwitchInput, { SwitchInputConfig } from "./SwitchInput";
import TextInput, { TextInputConfig } from "./TextInput";

export function ParamUIConfig({ name, savedConfig, onChange }) {
  console.log("ParamUIConfig", name);
  switch (name) {
    default:
      return <TextInputConfig savedConfig={savedConfig} onChange={onChange} />;
    case SLIDER:
      return (
        <SliderInputConfig savedConfig={savedConfig} onChange={onChange} />
      );
    case SWITCH:
      return (
        <SwitchInputConfig savedConfig={savedConfig} onChange={onChange} />
      );
    case SECTION:
    case LIST_ROOT:
    case DICT_ROOT:
      return <NestedObjectInputConfig />;
  }
}

export default function ParamUI({ name, childProps }) {
  switch (name) {
    default:
      return <TextInput {...childProps} />;
    case SLIDER:
      return <SliderInput {...childProps} />;
    case SWITCH:
      return <SwitchInput {...childProps} />;
  }
}
