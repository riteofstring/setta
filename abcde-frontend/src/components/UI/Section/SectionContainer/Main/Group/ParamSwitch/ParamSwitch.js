import ParamContainer from "./ParamContainer/ParamContainer";
import ParamNameInput from "./ParamContainer/ParamItems/ParamNameInput";
import ParamTextLabel from "./ParamContainer/ParamItems/ParamTextLabel";

export default function ParamSwitch(props) {
  switch (props.metaUIType) {
    case "ARGS":
      throw 'ARGS is not implemented yet'
    case "KWARGS":
      return (
        <ParamContainer {...props}>
          <ParamNameInput {...props} />
        </ParamContainer>
      );
    default:
      return (
        <ParamContainer {...props}>
          <ParamTextLabel {...props} />
        </ParamContainer>
      );
  }
}
