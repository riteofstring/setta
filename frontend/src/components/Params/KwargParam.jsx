import { ParamContainer } from "./ParamContainer";
import { ParamNameInput } from "./ParamItems/ParamNameInput";

export function KwargParam(props) {
  const { sectionId, paramInfoId } = props;

  return (
    <>
      <ParamContainer isKwarg={true} {...props}>
        <ParamNameInput sectionId={sectionId} paramInfoId={paramInfoId} />
      </ParamContainer>
    </>
  );
}
