import { changeKwargName, deleteKwarg } from "thunks/kwargs";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { ParamContainer } from "../ParamContainer/ParamContainer";
import { ParamNameInput } from "../ParamContainer/ParamItems/ParamNameInput";

export function KwargParam(props) {
  const { sectionId, parentId, paramInfo: kwargInfo } = props;
  const onBlur = (v) => {
    changeKwargName({ sectionId, paramInfoId: kwargInfo.id, name: v });
  };

  const onClick = () => {
    deleteKwarg({
      sectionId,
      parentId,
      kwargId: kwargInfo.id,
      incrementVersion: true,
    });
  };

  return (
    <>
      <IconButton
        onClick={onClick}
        icon={<i className="gg-close" />}
        bg="bg-transparent"
        color="text-setta-400 dark:text-setta-700 hover:text-setta-700 dark:hover:text-setta-200"
        twClasses={`card-close-arg-group ${kwargInfo.children.length > 0 ? "self-start justify-self-center mt-[.15rem]" : "place-self-center"} ml-1 z-20`}
        padding=""
        size="h-[.66rem] w-[.66rem]"
      />
      <ParamContainer {...props} isKwarg={true}>
        <ParamNameInput
          value={kwargInfo.name}
          hasChildren={kwargInfo.children.length > 0}
          onBlur={onBlur}
          onClick={props.onNameClick}
        />
      </ParamContainer>
    </>
  );
}
