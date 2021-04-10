import RegularParam from "./ParamSwitchOptions/RegularParam";
import KwargParam from "./ParamSwitchOptions/KwargParam";

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
