import {
  DICT_ROOT,
  LIST_ROOT,
  SECTION,
  SLIDER,
  SWITCH,
} from "z_utils/constants";
import { SliderInput, SliderInputConfig } from "./SliderInput/SliderInput";
import { SwitchInput, SwitchInputConfig } from "./SwitchInput/SwitchInput";
import { TextInput, TextInputConfig } from "./TextInput";

export function ParamUIConfig({ name, ...props }) {
  switch (name) {
    default:
      return <TextInputConfig {...props} />;
    case SLIDER:
      return <SliderInputConfig {...props} />;
    case SWITCH:
      return <SwitchInputConfig {...props} />;
    case SECTION:
    case LIST_ROOT:
    case DICT_ROOT:
      return null;
  }
}

export function ParamUI({ name, childProps }) {
  switch (name) {
    default:
      return <TextInput {...childProps} />;
    case SLIDER:
      return <SliderInput {...childProps} />;
    case SWITCH:
      return <SwitchInput {...childProps} />;
  }
}
