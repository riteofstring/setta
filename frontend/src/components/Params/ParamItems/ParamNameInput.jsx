import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import { setCodeInfoName } from "state/actions/codeInfo";
import { updateKeywordRegex } from "state/actions/keywordRegex";
import {
  useCodeInfo,
  useParamShortcuts,
  useSectionInfos,
} from "state/definitions";
import { useCodeInfoHasChildren } from "state/hooks/codeInfoCols";
import { useSectionVariantIsFrozen } from "state/hooks/sectionVariants";

export function ParamNameInput({ sectionId, paramInfoId }) {
  const configLanguage = useSectionInfos((x) => x.x[sectionId].configLanguage);
  const value = useCodeInfo((x) => x.x[paramInfoId].name);
  const hasChildren = useCodeInfoHasChildren(sectionId, paramInfoId);

  function onChange(v) {
    setCodeInfoName({ id: paramInfoId, name: v });
  }

  function onBlur() {
    updateKeywordRegex();
  }

  const isSelectingParams = useParamShortcuts((x) => x.isSelectingParams);
  const variantIsDisabled = useSectionVariantIsFrozen(sectionId);
  const isDisabled = isSelectingParams || variantIsDisabled;

  return (
    <>
      <TextInputCodeMirror
        dataSectionId={sectionId}
        visualSectionId={sectionId}
        paramInfoId={paramInfoId}
        value={value}
        defaultVal={"Please Enter Key"}
        onChange={onChange}
        onBlur={onBlur}
        dummyCodeClassName={`min-w-0 self-end truncate placeholder:text-setta-300 dark:placeholder:text-setta-600 ${hasChildren ? "section-key-value grid-row-start-1" : "section-key"} nodrag peer/nameinput ${!isDisabled ? "cursor-text select-text" : ""} break-words py-[.125rem] font-mono text-xs [tab-size:4] [word-break:break-word] dark:focus-visible:border-blue-400`}
        realCodeClassName={`nodrag cursor-text self-end select-text [&_*]:!outline-0 [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs min-w-0 truncate placeholder:text-setta-300 dark:placeholder:text-setta-600 py-[.125rem] ${hasChildren ? "section-key-value grid-row-start-1" : "section-key"} peer/nameinput font-mono dark:focus-visible:border-blue-400`}
        color="green"
        language={configLanguage}
        keywordPositions={[]}
        setKeywordPositions={() => {}}
        initializeGenCode={false}
        autocomplete={false}
        isKeyName={true}
        isDisabled={isDisabled}
      />
      <span
        className={`${hasChildren ? "section-key-value grid-row-start-1" : "section-key"} border-box self-end border-b border-setta-200/50 peer-focus-within/nameinput:border-blue-400 dark:border-setta-600/30`}
      />
    </>
  );
}
