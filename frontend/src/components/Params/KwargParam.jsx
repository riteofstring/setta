import { changeKwargName } from "state/actions/kwargs/kwargs";
import { ParamContainer } from "./ParamContainer";
import { ParamNameInput } from "./ParamItems/ParamNameInput";

export function KwargParam(props) {
  const { sectionId, paramInfoId, setDidUpdate } = props;
  const onBlur = (v) => {
    changeKwargName({ sectionId, paramInfoId, name: v });
  };

  // className="section-w-full grid grid-cols-subgrid [&_>_.arg-close-btn]:hover:opacity-75 [&_>_.arg-pin-btn]:hover:bg-setta-200/50"
  return (
    <>
      <ParamContainer {...props}>
        <ParamNameInput
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          onBlur={onBlur}
          setDidUpdate={setDidUpdate}
        />
      </ParamContainer>
    </>
  );
}
