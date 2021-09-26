import KwargParam from "./ParamSwitchOptions/KwargParam";
import RegularParam from "./ParamSwitchOptions/RegularParam";

export default function ParamSwitch(props) {
  switch (props.metaUIType) {
    case "ARGS":
      throw "ARGS is not implemented yet";
    case "KWARGS":
      return <KwargParam {...props} />;
    default:
      return <RegularParam {...props} />;
  }
}
