import {
  DICT_ROOT,
  LIST_ROOT,
  REF,
  SECTION,
  SLIDER,
  SWITCH,
} from "utils/constants";

import { NestedObjectInputConfig } from "./NestedObjectInput";
import RefInput, { RefInputConfig } from "./RefInput";
import SliderInput, { SliderInputConfig } from "./SliderInput";
import SwitchInput, { SwitchInputConfig } from "./SwitchInput";
import TextInput, { TextInputConfig } from "./TextInput";

export function ParamUIConfig({ name, ...props }) {
  console.log("ParamUIConfig", name);
  switch (name) {
    default:
      return <TextInputConfig {...props} />;
    case SLIDER:
      return <SliderInputConfig {...props} />;
    case SWITCH:
      return <SwitchInputConfig {...props} />;
    case REF:
      return <RefInputConfig {...props} />;
    case SECTION:
    case LIST_ROOT:
    case DICT_ROOT:
      return <NestedObjectInputConfig {...props} />;
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
    case REF:
      return <RefInput {...childProps} />;
  }
}
