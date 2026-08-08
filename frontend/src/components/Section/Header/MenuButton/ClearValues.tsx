import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setParamEnteredValue } from "openapi/http";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrProjectConfigId,
  getCurrSectionVariantId,
  setCodeObjVariantImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  isBaseChildlessCodeObjImpl,
  isBaseSectionWithParamsImpl,
  type BaseChildlessCodeObjImplUnion,
} from "utils/generatedTypes";

type ClearValueTarget = {
  codeObjType: BaseChildlessCodeObjImplUnion["type"];
  codeObjVariantId: string;
  paramInfoId: string;
};

function setParamEnteredValueRequest(
  args: Parameters<typeof setParamEnteredValue>[0],
): Promise<Awaited<ReturnType<typeof setParamEnteredValue>>> {
  return Promise.resolve(setParamEnteredValue(args));
}

function getClearValueTargets(sectionId: string): {
  projectConfigId: string;
  sectionVariantId: string;
  targets: ClearValueTarget[];
} {
  const state = useProjectState.getState();
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const targets: ClearValueTarget[] = [];
  for (const [paramInfoId, codeObjVariantId] of Object.entries(
    sectionImpl.codeObjVariantMap,
  )) {
    const paramImpl = getCurrEffectiveCodeObjImpl(
      state,
      sectionId,
      paramInfoId,
    );
    if (!isBaseChildlessCodeObjImpl(paramImpl)) {
      continue;
    }
    targets.push({
      codeObjType: paramImpl.type,
      codeObjVariantId,
      paramInfoId,
    });
  }
  return {
    projectConfigId: getCurrProjectConfigId(),
    sectionVariantId: getCurrSectionVariantId(state, sectionId),
    targets,
  };
}

function clearChildlessParamValue(args: {
  codeObjVariantId: string;
  paramInfoId: string;
  projectConfigId: string;
  sectionId: string;
  sectionVariantId: string;
}) {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      setCodeObjVariantImplValue<BaseChildlessCodeObjImplUnion>(
        state,
        args.paramInfoId,
        args.codeObjVariantId,
        {
          value: "",
        },
      );
    },
    projectConfigId: args.projectConfigId,
    send: (frontendOpId) =>
      callOpenAPI(
        setParamEnteredValueRequest({
          body: {
            projectConfigId: args.projectConfigId,
            sectionId: args.sectionId,
            sectionVariantId: args.sectionVariantId,
            paramInfoId: args.paramInfoId,
            value: "",
            frontendOpId,
          },
        } as Parameters<typeof setParamEnteredValue>[0]),
      ),
  });
}

function clearPasswordParamValue(args: {
  paramInfoId: string;
  projectConfigId: string;
  sectionId: string;
  sectionVariantId: string;
}) {
  void callOpenAPI(
    setParamEnteredValueRequest({
      body: {
        projectConfigId: args.projectConfigId,
        sectionId: args.sectionId,
        sectionVariantId: args.sectionVariantId,
        paramInfoId: args.paramInfoId,
        value: "",
      },
    } as Parameters<typeof setParamEnteredValue>[0]),
  );
}

export function ClearValues({ sectionId }) {
  function onClick() {
    const { projectConfigId, sectionVariantId, targets } =
      getClearValueTargets(sectionId);
    for (const target of targets) {
      if (target.codeObjType === CodeObjTypeEnum.PasswordParam) {
        clearPasswordParamValue({
          paramInfoId: target.paramInfoId,
          projectConfigId,
          sectionId,
          sectionVariantId,
        });
        continue;
      }
      clearChildlessParamValue({
        codeObjVariantId: target.codeObjVariantId,
        paramInfoId: target.paramInfoId,
        projectConfigId,
        sectionId,
        sectionVariantId,
      });
    }
  }

  return <MenuItem onClick={onClick}>Clear Values</MenuItem>;
}
