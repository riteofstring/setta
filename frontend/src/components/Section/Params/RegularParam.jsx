import { ParamContainer } from "../Main/Group/ParamSwitch/ParamContainer/ParamContainer";
import { ParamTextLabel } from "../Main/Group/ParamSwitch/ParamContainer/ParamItems/ParamTextLabel";

export function RegularParam(props) {
  return (
    <ParamContainer {...props} isKwarg={false}>
      <ParamTextLabel {...props} />
    </ParamContainer>
  );
}
