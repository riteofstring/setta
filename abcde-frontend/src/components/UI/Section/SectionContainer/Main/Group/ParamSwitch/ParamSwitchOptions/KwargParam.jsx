import { useCodeInfo } from "models/info/codeInfo";
import { AiOutlineClose } from "react-icons/ai";
import { deleteKwarg } from "thunks/kwargs";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { ParamContainer } from "../ParamContainer/ParamContainer";
import { ParamNameInput } from "../ParamContainer/ParamItems/ParamNameInput";

export function KwargParam(props) {
  const { sectionId, objInfoId, paramInfo: kwargInfo } = props;
  const setName = useCodeInfo((x) => x.setName);
  const onBlur = (v) => {
    setName({ id: kwargInfo.id, name: v });
  };

  const onClick = () => {
    deleteKwarg({ sectionId, objInfoId, kwargId: kwargInfo.id });
  };

  return (
    <div className="flex items-center">
      <IconButton
        onClick={onClick}
        icon={<AiOutlineClose />}
        bg="bg-transparent"
        color="text-slate-400 hover:text-slate-600"
        twClasses="ml-1"
      />
      <ParamContainer {...props} isKwarg={true}>
        <ParamNameInput value={kwargInfo.name} onBlur={onBlur} />
      </ParamContainer>
    </div>
  );
}
