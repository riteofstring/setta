// Owns config-bound TextOutput and ImageOutput blocks registered by appRegistry.tsx.
import { CodeBlock } from "components/Section/Layouts/TextBlock";
import "katex/dist/katex.min.css";
import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { ensureAppProjectConfigLoaded } from "state/actions/appDeploymentState";
import { useDecodedImages, useImages } from "state/definitions";
import { decodeExistingRawImages } from "state/hooks/artifactTransport";
import { useAppConfigs } from "state/stores/appStores";
import { useServerMode } from "state/stores/sessionStores";
import { bumpRemoteRevisions } from "state/utils/revisions";
import { res200 } from "utils/endpointUtils";
import { route_load_cached_image_artifacts } from "utils/generatedEndpoints";
import {
  type BaseSectionImplUnion,
  type ProjectStateSingleConfig,
  SectionTypeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";
import { buildTextBlockTypographyScale } from "utils/textBlockTypography";
import {
  resolveImageOutputBinding,
  resolveTextOutputBinding,
} from "./appBindings";
import { useAppConfigScope, useAppRuntime } from "./appContext";
import { type AppComponentProps, resolveConfigId } from "./appRegistryShared";

type AppOutputConfigState = ProjectStateSingleConfig & {
  previewSectionVariantMap: Record<string, string>;
};

type AppTextOutputData = {
  text: string;
  format: TextBlockFormatEnum;
  masterFontSizePx: number;
};

function OutputStatusBox({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] px-3 py-2 text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
      {message}
    </div>
  );
}

export function resolveTextOutputData(
  configState: AppOutputConfigState | null | undefined,
  sectionId: string | null,
): AppTextOutputData | null {
  if (!configState || !sectionId) {
    return null;
  }
  const variantId =
    configState.previewSectionVariantMap[sectionId] ??
    configState.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = configState.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = configState.sectionImpls[variant.impl];
  if (!impl) {
    return null;
  }
  const core = configState.sections[sectionId];
  if (!core) {
    return null;
  }
  const effectiveImpl: BaseSectionImplUnion = {
    ...impl,
    ...core.sharedModifier,
    ...variant.modifier,
  };
  if (effectiveImpl.type !== SectionTypeEnum.TextBlock) {
    return null;
  }
  return {
    text: effectiveImpl.text,
    format: effectiveImpl.format,
    masterFontSizePx: effectiveImpl.masterFontSizePx,
  };
}

export function TextOutputBlock({ element }: AppComponentProps) {
  const props = element.props ?? {};
  const runtime = useAppRuntime();
  const scope = useAppConfigScope();
  const { configId, sectionId, label } = resolveTextOutputBinding(
    props,
    runtime?.dataBindings,
  );
  const resolvedConfigId = resolveConfigId(
    configId,
    runtime?.defaultConfigId ?? null,
    scope.configId,
  );
  const configState = useAppConfigs((state) =>
    resolvedConfigId ? state.configs[resolvedConfigId] : null,
  );
  const serverMode = useServerMode((state) => state.mode);
  const modeResolved = useServerMode((state) => state.modeResolved);

  React.useEffect(() => {
    if (!resolvedConfigId || configState) {
      return;
    }
    if (!modeResolved || serverMode !== "app") {
      return;
    }
    void ensureAppProjectConfigLoaded(resolvedConfigId);
  }, [configState, modeResolved, resolvedConfigId, serverMode]);

  const textData = React.useMemo(
    () => resolveTextOutputData(configState, sectionId),
    [configState, sectionId],
  );

  if (!resolvedConfigId || !sectionId || !textData) {
    return <OutputStatusBox message="Missing text output." />;
  }

  const typography = buildTextBlockTypographyScale(textData.masterFontSizePx);
  const markdownTypographyStyle: React.CSSProperties = {
    "--setta-textblock-body-size": `${typography.bodyPx}px`,
    "--setta-textblock-code-size": `${typography.codePx}px`,
    "--setta-textblock-h1-size": `${typography.h1Px}px`,
    "--setta-textblock-h2-size": `${typography.h2Px}px`,
    "--setta-textblock-h3-size": `${typography.h3Px}px`,
    "--setta-textblock-h4-size": `${typography.h4Px}px`,
    "--setta-textblock-h5-size": `${typography.h5Px}px`,
    "--setta-textblock-h6-size": `${typography.h6Px}px`,
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-3">
      {label && (
        <div className="font-semibold uppercase tracking-wide text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
          {label}
        </div>
      )}
      {textData.format === TextBlockFormatEnum.Markdown ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          className="prose max-w-none text-[color:var(--app-text)] dark:prose-invert prose-h1:text-[length:var(--setta-textblock-h1-size)] prose-h2:text-[length:var(--setta-textblock-h2-size)] prose-h3:text-[length:var(--setta-textblock-h3-size)] prose-h4:text-[length:var(--setta-textblock-h4-size)] prose-h5:text-[length:var(--setta-textblock-h5-size)] prose-h6:text-[length:var(--setta-textblock-h6-size)] prose-p:text-[length:var(--setta-textblock-body-size)] prose-code:text-[length:var(--setta-textblock-code-size)] prose-pre:text-[length:var(--setta-textblock-code-size)] prose-li:text-[length:var(--setta-textblock-body-size)]"
          style={markdownTypographyStyle}
          components={{ code: CodeBlock }}
        >
          {textData.text}
        </ReactMarkdown>
      ) : (
        <pre
          className="whitespace-pre-wrap text-[color:var(--app-text)]"
          style={{ fontSize: `${typography.bodyPx}px` }}
        >
          {textData.text}
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
  if (!res200(res)) {
    return;
  }
  useImages.setState((state) => {
    const nextImages = { ...state.x };
    const changedIds: Array<string> = [];
    for (const imageArtifact of res.data) {
      if (!imageArtifact || state.x[imageArtifact.id]) {
        continue;
      }
      nextImages[imageArtifact.id] = imageArtifact;
      changedIds.push(imageArtifact.id);
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
      x: nextImages,
      ...revisions,
    };
  });
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

export function ImageOutputBlock({ element }: AppComponentProps) {
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
  }, [decodedImage, imageArtifact]);

  if (!artifactId) {
    return <OutputStatusBox message="Missing image binding." />;
  }

  return (
    <figure className="flex min-h-[120px] items-center justify-center rounded-lg border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-3">
      {decodedImage ? (
        <img
          src={decodedImage.src}
          alt={resolvedAlt}
          className="h-auto max-h-[320px] w-full object-contain"
        />
      ) : (
        <div className="text-[color:var(--app-muted)] [font-size:var(--app-text-xs)]">
          Waiting for image output…
        </div>
      )}
    </figure>
  );
}
