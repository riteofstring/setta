import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { changeKwargName, deleteKwarg } from "state/actions/kwargs/kwargs";
import { ParamContainer } from "./ParamContainer";
import { ParamNameInput } from "./ParamItems/ParamNameInput";

export function KwargParam(props) {
  const { sectionId, parentId, paramInfo: kwargInfo, setDidUpdate } = props;
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

  const hasChildren = kwargInfo.children.length > 0;

  return (
    <>
      <IconButton
        onClick={onClick}
        icon={<i className="gg-close" />}
        bg="bg-transparent"
        color="text-setta-100 dark:text-setta-700 hover:text-setta-500 dark:hover:text-setta-200"
        twClasses={`opacity-75 section-left-gutter cursor-pointer ${kwargInfo.children.length > 0 ? "self-start justify-self-center mt-[0.3rem]" : "place-self-center"} z-20`}
        padding=""
        size="h-[.5rem] w-[.5rem]"
        tabIndex="-1"
      />
      <ParamContainer {...props} isKwarg={true}>
        <ParamNameInput
          sectionId={sectionId}
          paramInfoId={kwargInfo.id}
          value={kwargInfo.name}
          hasChildren={hasChildren}
          onBlur={onBlur}
          onClick={props.onNameClick}
          setDidUpdate={setDidUpdate}
        />
      </ParamContainer>
    </>
  );
}
