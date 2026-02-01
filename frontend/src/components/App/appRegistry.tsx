import "katex/dist/katex.min.css";
import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CodeBlock } from "components/Section/Layouts/TextBlock";
import { ParamInput } from "components/Params/ParamItems/ParamInput";
import { getParamDisplayName } from "state/actions/sectionInfos";
import { decodeExistingRawImages } from "state/hooks/artifacts";
import {
  useDecodedImages,
  useImages,
  useProjectState,
} from "state/definitions";
import { bumpRemoteRevisions } from "state/utils/revisions";
import { res200 } from "utils/endpointUtils";
import { route_load_cached_image_artifacts } from "utils/generatedEndpoints";
import {
  SectionTypeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";
import {
  resolveActionBinding,
  resolveImageOutputBinding,
  resolveParamBinding,
  resolveTextOutputBinding,
  resolveActionType,
} from "./appBindings";
import { useAppActionState, useAppRuntime } from "./appContext";

type RawElementProps = {
  key?: unknown;
  type?: unknown;
  props?: Record<string, unknown>;
  children?: unknown;
};

type AppComponentProps = {
  element: RawElementProps & { props?: Record<string, unknown> };
  children?: React.ReactNode;
  onAction?: (name: string, params?: Record<string, unknown>) => void;
};

const ALIGN_CLASS: Record<string, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

const JUSTIFY_CLASS: Record<string, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
};

function Stack({ element, children }: AppComponentProps) {
  const props = element.props ?? {};
  const direction = props.direction === "row" ? "flex-row" : "flex-col";
  const gap = typeof props.gap === "number" ? props.gap : 16;
  const align =
    typeof props.align === "string" ? props.align : "stretch";
  const justify =
    typeof props.justify === "string" ? props.justify : "start";
  const className = typeof props.className === "string" ? props.className : "";
  const alignClass = ALIGN_CLASS[align] ?? ALIGN_CLASS.stretch;
  const justifyClass = JUSTIFY_CLASS[justify] ?? JUSTIFY_CLASS.start;

  return (
    <div
      className={`flex ${direction} ${alignClass} ${justifyClass} ${className}`.trim()}
      style={{ gap }}
    >
      {children}
    </div>
  );
}

function Card({ element, children }: AppComponentProps) {
  const props = element.props ?? {};
  const title = typeof props.title === "string" ? props.title : null;
  const description =
    typeof props.description === "string" ? props.description : null;
  const className = typeof props.className === "string" ? props.className : "";

  return (
    <section
      className={`flex flex-col gap-3 rounded-xl border border-setta-200/80 bg-white/80 p-4 shadow-sm dark:border-setta-800/80 dark:bg-setta-900/60 ${className}`}
    >
      {(title || description) && (
        <header className="flex flex-col gap-1">
          {title && (
            <h3 className="text-sm font-semibold text-setta-800 dark:text-setta-100">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-xs text-setta-500 dark:text-setta-400">
              {description}
            </p>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

function Heading({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const text = typeof props.text === "string" ? props.text : "";
  const level =
    typeof props.level === "number" ? props.level : 2;
  const className = typeof props.className === "string" ? props.className : "";
  const HeadingTag = (`h${Math.min(Math.max(level, 1), 4)}`) as keyof JSX.IntrinsicElements;
  const sizeClassByLevel: Record<number, string> = {
    1: "text-2xl",
    2: "text-xl",
    3: "text-lg",
    4: "text-base",
  };
  const sizeClass =
    sizeClassByLevel[Math.min(Math.max(level, 1), 4)] ?? "text-base";

  return (
    <HeadingTag
      className={`font-semibold tracking-tight text-setta-900 dark:text-setta-100 ${sizeClass} ${className}`.trim()}
    >
      {text}
    </HeadingTag>
  );
}

function Text({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const text = typeof props.text === "string" ? props.text : "";
  const className = typeof props.className === "string" ? props.className : "";
  return (
    <p className={`text-sm text-setta-600 dark:text-setta-300 ${className}`.trim()}>
      {text}
    </p>
  );
}

function ParamInputBlock({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const { sectionId, paramId, label, description } = resolveParamBinding(
    props,
    runtime?.dataBindings,
  );
  const displayName = useProjectState((state) => {
    if (!sectionId || !paramId) {
      return null;
    }
    if (!state.codeObjs[paramId]) {
      return null;
    }
    return getParamDisplayName(state, sectionId, paramId);
  });
  const canEditParams = runtime?.canEditParams ?? true;
  if (!sectionId || !paramId) {
    return (
      <div className="rounded-md border border-dashed border-setta-200 bg-setta-50/80 px-3 py-2 text-xs text-setta-500 dark:border-setta-700 dark:bg-setta-900/60 dark:text-setta-400">
        Missing param binding.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          {label ?? displayName ?? paramId}
        </span>
        {description && (
          <span className="text-[11px] text-setta-500 dark:text-setta-400">
            {description}
          </span>
        )}
      </div>
      <div className="rounded-md border border-setta-200 bg-white px-2 py-1 dark:border-setta-700 dark:bg-setta-900">
        <div className={canEditParams ? "" : "pointer-events-none opacity-60"}>
          <ParamInput sectionId={sectionId} paramInfoId={paramId} />
        </div>
        {!canEditParams && (
          <div className="mt-2 text-[11px] text-setta-500 dark:text-setta-400">
            Param edits are disabled by policy.
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({ element, onAction }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const { action, sectionId, label } = resolveActionBinding(
    props,
    runtime?.dataBindings,
  );
  const resolvedLabel = label ?? "Run";
  const actionName = action ?? "";
  const actionDefinition = runtime?.actions[actionName] ?? null;
  const actionType = resolveActionType(actionName, actionDefinition ?? undefined);
  const { canRun, isRunning, runDisabledReason } = useAppActionState();
  const isRunAction = actionName === "run" || actionType === "run";
  const isDownloadAction = actionType === "downloadArtifact" || actionType === "downloadBinary";
  const isExternalLink = actionType === "openExternalLink";
  const allowDownloads = runtime?.allowFileDownloads ?? true;
  const allowLinks = runtime?.allowExternalLinks ?? true;
  let isDisabled = false;
  if (isRunAction) {
    isDisabled = !canRun || isRunning;
  } else if (isDownloadAction) {
    isDisabled = !allowDownloads;
  } else if (isExternalLink) {
    isDisabled = !allowLinks;
  }

  let disabledReason: string | null = null;
  if (isRunAction && isDisabled) {
    disabledReason = runDisabledReason ?? "Run disabled";
  } else if (isDownloadAction && isDisabled) {
    disabledReason = "File downloads are disabled by policy.";
  } else if (isExternalLink && isDisabled) {
    disabledReason = "External links are disabled by policy.";
  }

  return (
    <button
      type="button"
      className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        isDisabled
          ? "cursor-not-allowed bg-setta-200 text-setta-400 dark:bg-setta-800 dark:text-setta-500"
          : "bg-blue-600 text-white hover:bg-blue-700"
      }`}
      title={isDisabled ? disabledReason ?? undefined : undefined}
      onClick={() => {
        if (!actionName || !onAction || isDisabled) {
          return;
        }
        const params = sectionId ? { sectionId } : {};
        onAction(actionName, params);
      }}
      disabled={isDisabled}
    >
      {isRunning && isRunAction ? "Running..." : resolvedLabel}
    </button>
  );
}

function TextOutput({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const { sectionId, label } = resolveTextOutputBinding(
    props,
    runtime?.dataBindings,
  );
  const textBlock = useProjectState((state) => {
    if (!sectionId) {
      return null;
    }
    const impl = state.sectionImpls[sectionId];
    if (!impl || impl.type !== SectionTypeEnum.TextBlock) {
      return null;
    }
    return impl;
  });
  const textData = useProjectState((state) => {
    if (!sectionId) {
      return null;
    }
    const impl = state.sectionImpls[sectionId];
    if (!impl || impl.type !== SectionTypeEnum.TextBlock) {
      return null;
    }
    return { text: impl.text, format: impl.format };
  });

  if (!sectionId || !textBlock || !textData) {
    return (
      <div className="rounded-md border border-dashed border-setta-200 bg-setta-50/80 px-3 py-2 text-xs text-setta-500 dark:border-setta-700 dark:bg-setta-900/60 dark:text-setta-400">
        Missing text output.
      </div>
    );
  }

  const { text, format } = textData;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-setta-200 bg-white/90 p-3 dark:border-setta-700 dark:bg-setta-900/60">
      {label && (
        <div className="text-xs font-semibold uppercase tracking-wide text-setta-500 dark:text-setta-400">
          {label}
        </div>
      )}
      {format === TextBlockFormatEnum.Markdown ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          className="prose prose-sm max-w-none text-setta-700 dark:prose-invert dark:text-setta-200"
          components={{ code: CodeBlock }}
        >
          {text}
        </ReactMarkdown>
      ) : (
        <pre className="whitespace-pre-wrap text-xs text-setta-700 dark:text-setta-200">
          {text}
        </pre>
      )}
    </div>
  );
}

async function loadCachedImagesById(paths: Array<string>) {
  if (paths.length === 0) {
    return;
  }
  const res = await route_load_cached_image_artifacts({ paths });
  if (res200(res)) {
    useImages.setState((state) => {
      const next = { ...state.x };
      const changedIds: Array<string> = [];
      for (const img of res.data) {
        if (img) {
          const existing = state.x[img.id];
          if (!existing) {
            next[img.id] = img;
            changedIds.push(img.id);
          }
        }
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
}

function useImageArtifactById(artifactId: string | null) {
  const imageArtifact = useImages((state) =>
    artifactId ? state.x[artifactId] : null,
  );
  React.useEffect(() => {
    if (!artifactId || imageArtifact) {
      return;
    }
    void loadCachedImagesById([artifactId]);
  }, [artifactId, imageArtifact]);
  return imageArtifact;
}

function ImageOutput({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const { artifactId, alt } = resolveImageOutputBinding(
    props,
    runtime?.dataBindings,
  );
  const resolvedAlt = alt ?? "App output image";
  const imageArtifact = useImageArtifactById(artifactId);
  const decodedImage = useDecodedImages((state) =>
    imageArtifact ? state.x[imageArtifact.id] : null,
  );

  React.useEffect(() => {
    if (!imageArtifact) {
      return;
    }
    const currentContentId = imageArtifact.value.contentId;
    if (!decodedImage || decodedImage.dataset.contentId !== currentContentId) {
      void decodeExistingRawImages([imageArtifact.id]);
    }
  }, [imageArtifact, decodedImage]);

  if (!artifactId) {
    return (
      <div className="rounded-md border border-dashed border-setta-200 bg-setta-50/80 px-3 py-2 text-xs text-setta-500 dark:border-setta-700 dark:bg-setta-900/60 dark:text-setta-400">
        Missing image binding.
      </div>
    );
  }

  return (
    <figure className="flex min-h-[120px] items-center justify-center rounded-lg border border-setta-200 bg-white/90 p-3 dark:border-setta-700 dark:bg-setta-900/60">
      {decodedImage ? (
        <img
          src={decodedImage.src}
          alt={resolvedAlt}
          className="h-auto max-h-[320px] w-full object-contain"
        />
      ) : (
        <div className="text-xs text-setta-400 dark:text-setta-500">
          Waiting for image output…
        </div>
      )}
    </figure>
  );
}

function Divider({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const className = typeof props.className === "string" ? props.className : "";
  return (
    <hr
      className={`border-setta-200/70 dark:border-setta-700/70 ${className}`.trim()}
    />
  );
}

export const appRegistry: Record<string, React.ComponentType<AppComponentProps>> =
  {
    Stack,
    Card,
    Heading,
    Text,
    ParamInput: ParamInputBlock,
    ActionButton,
    TextOutput,
    ImageOutput,
    Divider,
  };
