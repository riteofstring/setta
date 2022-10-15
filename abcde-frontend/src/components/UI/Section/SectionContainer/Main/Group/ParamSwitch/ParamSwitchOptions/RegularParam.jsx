import ParamContainer from "../ParamContainer/ParamContainer";
import ParamTextLabel from "../ParamContainer/ParamItems/ParamTextLabel";

export default function RegularParam(props) {
  return (
    <ParamContainer {...props}>
      <ParamTextLabel {...props} />
    </ParamContainer>
  );
}
