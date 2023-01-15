import { useCodeInfo } from "models/info/codeInfo";
import { AiOutlineClose } from "react-icons/ai";
import { deleteKwarg } from "thunks/kwargs";
import { IconButton } from "utils/atoms/buttons/IconButton";
import ParamContainer from "../ParamContainer/ParamContainer";
import ParamNameInput from "../ParamContainer/ParamItems/ParamNameInput";

export default function KwargParam(props) {
  const { sectionId, objInfoId, paramInfo: kwargInfo } = props;
  const setName = useCodeInfo((x) => x.setName);
  const onBlur = (v) => {
    setName({ id: kwargInfo.id, name: v });
  };

  const onClick = () => {
    deleteKwarg({ sectionId, objInfoId, kwargId: kwargInfo.id });
  };

  return (
    <div className="flex flex-grow items-center">
      <IconButton
        onClick={onClick}
        icon={<AiOutlineClose />}
        bg="bg-transparent"
        color="text-gray-400 hover:text-gray-600"
        twClasses="pl-3"
      />
      <ParamContainer {...props} isKwarg={true}>
        <ParamNameInput value={kwargInfo.name} onBlur={onBlur} />
      </ParamContainer>
    </div>
  );
}
