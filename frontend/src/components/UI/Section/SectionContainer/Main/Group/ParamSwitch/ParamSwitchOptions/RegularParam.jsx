import { ParamContainer } from "../ParamContainer/ParamContainer";
import { ParamTextLabel } from "../ParamContainer/ParamItems/ParamTextLabel";

export function RegularParam(props) {
  return (
    <ParamContainer {...props} isKwarg={false}>
      <ParamTextLabel {...props} />
    </ParamContainer>
  );
}
