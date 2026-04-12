import {
  setCodeSectionDiagnosticCodeSuppression as setCodeSectionDiagnosticCodeSuppressionRequest,
  setCodeSectionDiagnosticsMute as setCodeSectionDiagnosticsMuteRequest,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import {
  useLspDiagnostics,
  useProjectState,
  useShareSession,
  useTypeErrors,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  LSPDiagnosticsPayload,
  SectionTypeEnum,
  type LSPDiagnostic,
} from "utils/generatedTypes";
import { postChromeReproEvent } from "./chromeRepro";
import {
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "./sectionInfos";
import { processTypeErrors } from "./typeCheck";
export const FORMATTER_DIAGNOSTIC_SOURCE = "Formatter";
function getFormatterDiagnostics(diagnostics: Array<LSPDiagnostic>) {
  if (diagnostics.length === 0) {
    return [];
  }
  const formatter: Array<LSPDiagnostic> = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.source === FORMATTER_DIAGNOSTIC_SOURCE) {
      formatter.push(diagnostic);
    }
  }
  return formatter;
}
function areDiagnosticRangesEqual(
  left: LSPDiagnostic["range"],
  right: LSPDiagnostic["range"],
) {
  return (
    left.start.line === right.start.line &&
    left.start.character === right.start.character &&
    left.end.line === right.end.line &&
    left.end.character === right.end.character
  );
}
function areDiagnosticsEqual(left: LSPDiagnostic, right: LSPDiagnostic) {
  if (left === right) {
    return true;
  }
  return (
    left.message === right.message &&
    left.severity === right.severity &&
    left.code === right.code &&
    left.source === right.source &&
    left.uri === right.uri &&
    areDiagnosticRangesEqual(left.range, right.range)
  );
}
function areDiagnosticsListEqual(
  left: Array<LSPDiagnostic>,
  right: Array<LSPDiagnostic>,
) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let idx = 0; idx < left.length; idx += 1) {
    if (!areDiagnosticsEqual(left[idx], right[idx])) {
      return false;
    }
  }
  return true;
}
function mergeFormatterDiagnostics(
  previous: Array<LSPDiagnostic>,
  incoming: Array<LSPDiagnostic>,
) {
  if (incoming.length === 0) {
    return [];
  }
  if (getFormatterDiagnostics(incoming).length > 0) {
    return incoming;
  }
  const previousFormatter = getFormatterDiagnostics(previous);
  if (previousFormatter.length === 0) {
    return incoming;
  }
  return incoming.concat(previousFormatter);
}
function mergeDiagnosticsList(
  previous: Array<LSPDiagnostic> | undefined,
  incoming: Array<LSPDiagnostic>,
) {
  const previousDiagnostics = previous ?? [];
  const mergedDiagnostics = mergeFormatterDiagnostics(
    previousDiagnostics,
    incoming,
  );
  if (mergedDiagnostics.length === 0) {
    return {
      diagnostics: mergedDiagnostics,
      changed: previousDiagnostics.length > 0,
    };
  }
  if (previous && areDiagnosticsListEqual(previous, mergedDiagnostics)) {
    return { diagnostics: previous, changed: false };
  }
  return { diagnostics: mergedDiagnostics, changed: true };
}
function hasRemovedSectionDiagnostics(
  previous: Record<string, Array<LSPDiagnostic>>,
  incoming: Record<string, Array<LSPDiagnostic>>,
) {
  for (const [sectionId, diagnostics] of Object.entries(previous)) {
    if (
      !Object.prototype.hasOwnProperty.call(incoming, sectionId) &&
      diagnostics.length > 0
    ) {
      return true;
    }
  }
  return false;
}
function mergeDiagnosticsBySection(
  previous: Record<string, Array<LSPDiagnostic>>,
  incoming: Record<string, Array<LSPDiagnostic>>,
) {
  let changed = hasRemovedSectionDiagnostics(previous, incoming);
  const codeSections: Record<string, Array<LSPDiagnostic>> = {};
  for (const [sectionId, nextDiagnostics] of Object.entries(incoming)) {
    const merged = mergeDiagnosticsList(previous[sectionId], nextDiagnostics);
    if (merged.changed) {
      changed = true;
    }
    if (merged.diagnostics.length === 0) {
      continue;
    }
    codeSections[sectionId] = merged.diagnostics;
  }
  return { codeSections, changed };
}
function mergeUnmappedGenCode(
  previous: Array<LSPDiagnostic>,
  incoming: Array<LSPDiagnostic>,
) {
  const merged = mergeDiagnosticsList(previous, incoming);
  return {
    unmappedGenCode: merged.diagnostics,
    changed: merged.changed,
  };
}
export function processLspDiagnostics(payload: LSPDiagnosticsPayload) {
  if (useShareSession.getState().isDeploymentMode) {
    return;
  }
  const projectConfigId = useProjectState.getState().projectConfig.id;
  if (payload.projectConfigId !== projectConfigId) {
    return;
  }
  processTypeErrors(payload.genCode);
  const prevState = useLspDiagnostics.getState();
  const merged = mergeDiagnosticsBySection(
    prevState.codeSections,
    payload.codeSections,
  );
  const mergedUnmapped = mergeUnmappedGenCode(
    prevState.unmappedGenCode,
    payload.unmappedGenCode,
  );
  if (merged.changed || mergedUnmapped.changed) {
    useLspDiagnostics.setState({
      codeSections: merged.codeSections,
      unmappedGenCode: mergedUnmapped.unmappedGenCode,
    });
  }
  const lspState = useLspDiagnostics.getState();
  postChromeReproEvent("lsp-diagnostics", {
    projectConfigId: payload.projectConfigId,
    stateChanged: merged.changed || mergedUnmapped.changed,
    incoming: payload,
    applied: {
      codeSections: lspState.codeSections,
      unmappedGenCode: lspState.unmappedGenCode,
      typeErrors: useTypeErrors.getState().errors,
    },
  });
}
export function setCodeSectionDiagnosticsMuted(
  sectionId: string,
  mute: boolean,
) {
  if (useShareSession.getState().isDeploymentMode) {
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  return callOpenAPI(
    setCodeSectionDiagnosticsMuteRequest({
      body: {
        projectConfigId,
        sectionId,
        mute,
      },
    } as Parameters<typeof setCodeSectionDiagnosticsMuteRequest>[0]),
  ).then((res) => {
    if (res200(res)) {
      updateLocalCodeSectionDiagnosticsIgnoreState(sectionId, (curr) => ({
        muted: mute,
        suppressedCodes: [...curr.suppressedCodes],
      }));
    }
    return res;
  });
}
export function setCodeSectionDiagnosticCodeSuppression(
  sectionId: string,
  code: LSPDiagnostic["code"],
  suppress: boolean,
) {
  if (useShareSession.getState().isDeploymentMode) {
    return;
  }
  if (code === null || code === undefined) {
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  return callOpenAPI(
    setCodeSectionDiagnosticCodeSuppressionRequest({
      body: {
        projectConfigId,
        sectionId,
        code,
        suppress,
      },
    } as Parameters<typeof setCodeSectionDiagnosticCodeSuppressionRequest>[0]),
  ).then((res) => {
    if (res200(res)) {
      updateLocalCodeSectionDiagnosticsIgnoreState(sectionId, (curr) => {
        const nextCodes = curr.suppressedCodes.filter(
          (entry) => entry !== code,
        );
        if (suppress) {
          nextCodes.push(code);
        }
        return {
          muted: curr.muted,
          suppressedCodes: nextCodes,
        };
      });
    }
    return res;
  });
}
function updateLocalCodeSectionDiagnosticsIgnoreState(
  sectionId: string,
  update: (curr: {
    muted: boolean;
    suppressedCodes: Array<string | number>;
  }) => {
    muted: boolean;
    suppressedCodes: Array<string | number>;
  },
) {
  useProjectState.setState((state) => {
    const variantId = state.projectConfig.sectionVariantMap[sectionId];
    if (!variantId) {
      return;
    }
    const section = state.sections[sectionId];
    if (!section) {
      return;
    }
    const variant = state.sectionVariants[variantId];
    if (!variant) {
      return;
    }
    const impl = state.sectionImpls[variant.impl];
    if (!impl) {
      return;
    }
    const effective = getCurrEffectiveSectionImpl(state, sectionId);
    if (effective.type !== SectionTypeEnum.Code) {
      return;
    }
    setCurrEffectiveSectionImplValue(state, sectionId, {
      diagnosticsIgnoreState: (curr) => update(curr),
    });
  });
}
