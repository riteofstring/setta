import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import _ from "lodash";
import {
  dispatchOptimisticProjectStateUpdate,
  getCodeObjCore,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { NO_PAN_CLASS_NAME } from "utils/constants";
import {
  route_set_code_obj_display_name,
  route_set_code_obj_name,
} from "utils/generatedEndpoints";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import { focusOnSection } from "utils/tabbingLogic";

export function ParamNameInput({
  border,
  bg,
  sectionId,
  paramInfoId,
  hasChildren,
  onMouseDown,
}) {
  const {
    configLanguage,
    displayName,
    name,
    showParamDisplayNames,
    // variantIsFrozen,
  } = useProjectState((x) => {
    // const { isFrozen, configLanguage } = getSectionVariant(sectionId, x);
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const codeObjCore = getCodeObjCore(x, paramInfoId);
    return {
      // variantIsFrozen: isFrozen,
      configLanguage: impl.configLanguage,
      displayName: codeObjCore.displayName,
      name: codeObjCore.name,
      showParamDisplayNames: x.projectConfig.showParamDisplayNames,
    };
  }, _.isEqual);

  let value = name;
  if (showParamDisplayNames && displayName) {
    value = displayName;
  }

  function onChange(v: string) {
    if (showParamDisplayNames) {
      debouncedSetParamDisplayName(paramInfoId, v);
      return;
    }
    debouncedSetParamName(paramInfoId, v);
  }

  function onEscape(completionResult) {
    if (!completionResult) {
      focusOnSection(null, sectionId, false);
    }
  }

  // const isSelectingParams = useMisc((x) => x.isSelectingParams);
  // const isDisabled = isSelectingParams || variantIsFrozen;
  const isDisabled = false;

  return (
    <>
      <TextInputCodeMirror
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        value={value}
        defaultVal={"Please Enter Key"}
        onChange={onChange}
        onEscape={onEscape}
        dummyCodeClassName={`${NO_PAN_CLASS_NAME} ${bg} ${border} min-w-0 self-end truncate placeholder:text-setta-300 dark:placeholder:text-setta-600 ${hasChildren ? "section-key-value grid-row-start-1 px-[2px]" : "section-key"} nodrag peer/nameinput ${!isDisabled ? "cursor-text select-text" : ""} break-words py-[.125rem] font-mono text-xs [tab-size:4] [word-break:break-word] dark:focus-visible:border-blue-400`}
        realCodeClassName={`${NO_PAN_CLASS_NAME} nodrag cursor-text self-end select-text [&_*]:!outline-0 [&_.cm-activeLine]:!px-0 [&_.cm-activeLine]:!bg-setta-200/10 [&_.cm-content]:!py-0 [&_.cm-content]:!px-0 [&_.cm-line]:!px-0 [&_.cm-content]:text-xs min-w-0 truncate placeholder:text-setta-300 dark:placeholder:text-setta-600 py-[.125rem] ${hasChildren ? "section-key-value grid-row-start-1 px-[2px]" : "section-key"} peer/nameinput font-mono dark:focus-visible:border-blue-400`}
        color="green"
        language={configLanguage}
        autocomplete={false}
        isKeyName={true}
        // isDisabled={isDisabled}
        onMouseDown={onMouseDown}
      />
      <span
        className={`${hasChildren ? "section-key-value grid-row-start-1 mx-[2px]" : "section-key"} border-box self-end border-b border-setta-200/50 peer-focus-within/nameinput:border-blue-400 dark:border-setta-600/30`}
      />
    </>
  );
}

const debouncedSetParamName = _.debounce((codeObjId: string, name: string) => {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      const codeObj = state.codeObjs[codeObjId];
      if (!codeObj) {
        return;
      }
      codeObj.name = name;
    },
    send: (frontendOpId) =>
      route_set_code_obj_name({
        projectConfigId: getCurrProjectConfigId(),
        codeObjId,
        name,
        frontendOpId,
      }),
  });
}, 200);

const debouncedSetParamDisplayName = _.debounce(
  (codeObjId: string, displayName: string) => {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        const codeObj = state.codeObjs[codeObjId];
        if (!codeObj) {
          return;
        }
        codeObj.displayName = displayName;
      },
      send: (frontendOpId) =>
        route_set_code_obj_display_name({
          projectConfigId: getCurrProjectConfigId(),
          codeObjId,
          displayName,
          frontendOpId,
        }),
    });
  },
  200,
);
