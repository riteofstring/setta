import {
  NULL_PROJECT_CONFIG_ID,
  useImages,
  useProjectState,
  type ZustandProjectState,
} from "state/definitions";
import { bumpRemoteRevisions } from "state/utils/revisions";
import {
  ArtifactTypeEnum,
  BaseDependencyValueUnion,
  DependencyKeyTypeEnum,
  ListenerFrontendEmitResolvedContent,
  SectionParamDependencyKey,
  SectionTypeEnum,
  isBaseChildlessCodeObjImpl,
} from "utils/generatedTypes";
import {
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
  setCurrEffectiveSectionImplValue,
} from "./sectionInfos";

type ListenerEmitSideEffects = {
  imageArtifacts: Record<string, string>;
};

export function handleListenerFrontendEmitForward(
  content: ListenerFrontendEmitResolvedContent,
) {
  const projectConfigId = getCurrProjectConfigId();
  if (
    projectConfigId === NULL_PROJECT_CONFIG_ID ||
    projectConfigId !== content.projectConfigId
  ) {
    return;
  }
  if (content.dependencyValues.length === 0) {
    return;
  }

  const sideEffects: ListenerEmitSideEffects = { imageArtifacts: {} };
  useProjectState.setState((state) => {
    for (const entry of content.dependencyValues) {
      applyListenerDependencyOverride(state, entry, sideEffects);
    }
  });
  applyImageArtifactUpdates(sideEffects.imageArtifacts);
}

function applyListenerDependencyOverride(
  state: ZustandProjectState,
  entry: ListenerFrontendEmitResolvedContent["dependencyValues"][number],
  sideEffects: ListenerEmitSideEffects,
) {
  const { dependencyKey, value } = entry;
  switch (dependencyKey.type) {
    case DependencyKeyTypeEnum.SectionParam:
      applySectionParamOverride(state, dependencyKey, value);
      return;
    case DependencyKeyTypeEnum.Section:
      applySectionOverride(state, dependencyKey.sectionId, value, sideEffects);
      return;
    default:
      return dependencyKey satisfies never;
  }
}

function applySectionParamOverride(
  state: ZustandProjectState,
  dependencyKey: SectionParamDependencyKey,
  value: BaseDependencyValueUnion,
) {
  try {
    getCurrEffectiveCodeObjImplWithTypeGuard(
      state,
      dependencyKey.sectionId,
      dependencyKey.codeObjId,
      isBaseChildlessCodeObjImpl,
    );
  } catch (error) {
    console.warn(
      "listener emit targeted missing or unsupported parameter",
      dependencyKey,
      error,
    );
    return;
  }

  setCurrEffectiveCodeObjImplValue<"BaseChildlessCodeObj">(
    state,
    dependencyKey.sectionId,
    dependencyKey.codeObjId,
    {
      value: value.payload,
    },
  );
}

function applySectionOverride(
  state: ZustandProjectState,
  sectionId: string,
  value: BaseDependencyValueUnion,
  sideEffects: ListenerEmitSideEffects,
) {
  let impl;
  try {
    impl = getCurrEffectiveSectionImpl(state, sectionId);
  } catch (error) {
    console.warn("listener emit targeted missing section", sectionId, error);
    return;
  }

  switch (impl.type) {
    case SectionTypeEnum.Callable:
      setCurrEffectiveSectionImplValue<"CallableSection">(state, sectionId, {
        callable: value.payload,
      });
      return;
    case SectionTypeEnum.TextBlock:
      setCurrEffectiveSectionImplValue<"TextBlockSection">(state, sectionId, {
        text: value.payload,
      });
      return;
    case SectionTypeEnum.Draw:
      setCurrEffectiveSectionImplValue<"DrawSection">(state, sectionId, {
        renderedValue: value.payload,
      });
      return;
    case SectionTypeEnum.Image: {
      const dataUrl = normalizeImagePayload(value.payload);
      let imagePath = impl.imagePath;
      if (!imagePath) {
        imagePath = buildListenerImagePath(sectionId);
        setCurrEffectiveSectionImplValue<"ImageSection">(state, sectionId, {
          imagePath,
        });
      }
      if (imagePath) {
        sideEffects.imageArtifacts[imagePath] = dataUrl;
      }
      return;
    }
    default:
      console.warn(
        "listener emit received unsupported section type",
        impl.type,
      );
  }
}

function applyImageArtifactUpdates(updates: Record<string, string>) {
  const entries = Object.entries(updates);
  if (entries.length === 0) {
    return;
  }

  useImages.setState((state) => {
    const next = { ...state.x };
    const changedIds: string[] = [];
    for (const [id, dataUrl] of entries) {
      const existing = state.x[id];
      if (existing?.value === dataUrl) {
        continue;
      }
      next[id] = { id, type: ArtifactTypeEnum.Image, value: dataUrl };
      changedIds.push(id);
    }

    if (changedIds.length === 0) {
      return state;
    }

    const revisions = bumpRemoteRevisions(
      {
        revisionById: state.revisionById,
        localRevisionById: state.localRevisionById,
      },
      changedIds,
    );

    return {
      x: next,
      ...revisions,
    };
  });
}

function normalizeImagePayload(payload: string): string {
  if (!payload) {
    return "";
  }
  if (payload.startsWith("data:image/")) {
    return payload;
  }
  return `data:image/png;base64,${payload}`;
}

function buildListenerImagePath(sectionId: string): string {
  return `listener://${sectionId}`;
}
