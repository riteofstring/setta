import { readFileSync } from "node:fs";

import {
  buildBinaryDownloadUrl,
  buildTextBlockTypographyScale,
  CODEMIRROR_TOOLTIP_PARENT_ID,
  createAppSubsystemFrontendHost,
  createRandomName,
  createDefaultAppPolicy as createSdkDefaultAppPolicy,
  createSingleConfig,
  getCurrentEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrentEffectiveSectionImpl,
  getCurrentSectionVariantId,
  getParamDisplayNameIfPresent,
  getCurrentEffectiveCodeObjImplIfPresent as getSdkCurrentEffectiveCodeObjImplIfPresent,
  getCurrentEffectiveSectionImplIfPresent as getSdkCurrentEffectiveSectionImplIfPresent,
  getCurrentSectionVariantIdIfPresent as getSdkCurrentSectionVariantIdIfPresent,
  isAppSubsystemFrontendRegistration,
  NO_PAN_CLASS_NAME,
  registerAppSubsystemPlugin,
  resolveAppPolicy as resolveSdkAppPolicy,
  resolveMainRunRequest as resolveSdkMainRunRequest,
  resolveRunRequest as resolveSdkRunRequest,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  shouldShowPasswordReveal,
  type DropzoneStatelessAttachment,
} from "@setta/app-subsystem-frontend-sdk";
import {
  getAttachmentPolicy as getHostAttachmentPolicy,
  isAttachmentMimeAllowed as isHostAttachmentMimeAllowed,
} from "utils/attachmentPolicy";
import {
  isGeneratedPythonIdentifier as isHostGeneratedPythonIdentifier,
  normalizeGeneratedOrigin as normalizeHostGeneratedOrigin,
  normalizeGeneratedToolName as normalizeHostGeneratedToolName,
  sanitizeGeneratedSimpleNameSlug as sanitizeHostGeneratedSimpleNameSlug,
  validateGeneratedParamNameInput as validateHostGeneratedParamNameInput,
  validateGeneratedSimpleNameInput as validateHostGeneratedSimpleNameInput,
} from "utils/bindingRuntime";
import {
  createDefaultAppPolicy as createHostDefaultAppPolicy,
  resolveAppPolicy as resolveHostAppPolicy,
} from "utils/deploymentPolicies";
import {
  createDropzoneFileArtifactId as createHostDropzoneFileArtifactId,
  createDropzoneTextAttachmentId as createHostDropzoneTextAttachmentId,
  parseDropzoneValue as parseHostDropzoneValue,
  serializeDropzoneValue as serializeHostDropzoneValue,
} from "utils/dropzone";
import {
  createNewId as createHostNewId,
  createRandomName as createHostRandomName,
} from "utils/idNameCreation";
import { shouldShowPasswordReveal as shouldShowHostPasswordReveal } from "utils/paramValue";
import {
  getCurrentEffectiveCodeObjImplIfPresent as getHostCurrentEffectiveCodeObjImplIfPresent,
  getCurrentEffectiveSectionImpl as getHostCurrentEffectiveSectionImpl,
  getCurrentEffectiveSectionImplIfPresent as getHostCurrentEffectiveSectionImplIfPresent,
  getCurrentSectionVariantId as getHostCurrentSectionVariantId,
  getCurrentSectionVariantIdIfPresent as getHostCurrentSectionVariantIdIfPresent,
  getParamDisplayNameIfPresent as getHostParamDisplayNameIfPresent,
} from "utils/projectStateSelectors";
import {
  resolveMainRunRequest as resolveHostMainRunRequest,
  resolveRunRequest as resolveHostRunRequest,
} from "utils/runCapabilities";
import {
  resolveEndpointOriginForMode as resolveHostEndpointOriginForMode,
  resolveServerModeCapabilities as resolveHostServerModeCapabilities,
  resolveWorkspaceLaunchRouteKind as resolveHostWorkspaceLaunchRouteKind,
} from "utils/serverModeBoundaryPolicy";
import {
  buildTextBlockTypographyScale as buildHostTextBlockTypographyScale,
  clampTextBlockMasterFontSize as clampHostTextBlockMasterFontSize,
} from "utils/textBlockTypography";
import { describe, expect, it, vi } from "vitest";
import {
  getAttachmentPolicy as getSdkSourceAttachmentPolicy,
  isAttachmentMimeAllowed as isSdkSourceAttachmentMimeAllowed,
} from "../../plugin-sdk/app-subsystem/src/attachmentPolicy";
import {
  isGeneratedPythonIdentifier as isSdkSourceGeneratedPythonIdentifier,
  normalizeGeneratedOrigin as normalizeSdkSourceGeneratedOrigin,
  normalizeGeneratedToolName as normalizeSdkSourceGeneratedToolName,
  sanitizeGeneratedSimpleNameSlug as sanitizeSdkSourceGeneratedSimpleNameSlug,
  validateGeneratedParamNameInput as validateSdkSourceGeneratedParamNameInput,
  validateGeneratedSimpleNameInput as validateSdkSourceGeneratedSimpleNameInput,
} from "../../plugin-sdk/app-subsystem/src/bindingRuntime";
import {
  createDropzoneFileArtifactId as createSdkSourceDropzoneFileArtifactId,
  createDropzoneTextAttachmentId as createSdkSourceDropzoneTextAttachmentId,
  parseDropzoneValue as parseSdkSourceDropzoneValue,
  serializeDropzoneValue as serializeSdkSourceDropzoneValue,
} from "../../plugin-sdk/app-subsystem/src/dropzone";
import {
  createNewId as createSdkSourceNewId,
  createRandomName as createSdkSourceRandomName,
} from "../../plugin-sdk/app-subsystem/src/idNameCreation";
import {
  resolveServerModeCapabilities as resolveSdkSourceServerModeCapabilities,
  resolveWorkspaceLaunchRouteKind as resolveSdkSourceWorkspaceLaunchRouteKind,
} from "../../plugin-sdk/app-subsystem/src/serverModeBoundaryPolicy";
import {
  buildTextBlockTypographyScale as buildSdkSourceTextBlockTypographyScale,
  clampTextBlockMasterFontSize as clampSdkSourceTextBlockMasterFontSize,
} from "../../plugin-sdk/app-subsystem/src/textBlockTypography";

describe("appSubsystemFrontendSdk", () => {
  it("registers app subsystem providers through the typed SDK host", () => {
    const registration = {
      previewSurface: {
        renderer: {
          mount: () => undefined,
        },
      },
    };
    const registerAppSubsystem = vi.fn();

    const host = registerAppSubsystemPlugin(
      {
        apiVersion: 1,
        pluginId: "acme.plugin",
        registerAppSubsystem,
      },
      registration,
    );

    expect(host.pluginId).toBe("acme.plugin");
    expect(registerAppSubsystem).toHaveBeenCalledWith(registration);
  });

  it("rejects hosts that do not expose the app subsystem registration capability", () => {
    expect(() =>
      registerAppSubsystemPlugin(
        {
          apiVersion: 1,
          pluginId: "acme.plugin",
        },
        {
          previewSurface: {
            renderer: {
              mount: () => undefined,
            },
          },
        },
      ),
    ).toThrow(
      "Plugin host does not support registerAppSubsystem for app-subsystem providers.",
    );
  });

  it("provides default typed frontend-host services for plugin renderers", () => {
    const frontendHost = createAppSubsystemFrontendHost();

    expect(frontendHost.apiVersion).toBe(1);
    expect(frontendHost.getProjectContext()).toEqual({
      defaultProjectConfigId: null,
      projectMetadata: [],
      projectConfig: {
        id: null,
        name: "",
        entryCodeBlockId: null,
      },
    });
    expect(frontendHost.subscribeProjectContext(() => undefined)).toBeTypeOf(
      "function",
    );
    expect(frontendHost.getProjectStateSnapshot()).toMatchObject({
      projectConfig: {
        id: "",
        name: "",
        entryCodeBlockId: null,
      },
      previewSectionVariantMap: {},
    });
    expect(
      frontendHost.subscribeProjectStateSnapshot(() => undefined),
    ).toBeTypeOf("function");
    expect(frontendHost.getRuntimeContext()).toEqual({
      isAppDeploymentMode: false,
      shareSessionId: null,
      sessionRunCount: 0,
      sharePolicy: null,
      defaultRunSnapshotMode: "ephemeral",
      runSnapshotModeByProjectConfigId: {},
    });
    expect(frontendHost.subscribeRuntimeContext(() => undefined)).toBeTypeOf(
      "function",
    );
    expect(frontendHost.getAppDeploymentSession()).toBeNull();
    expect(frontendHost.getServerModeState()).toEqual({
      mode: null,
      modeResolved: false,
      modeError: null,
    });
    expect(frontendHost.subscribeServerModeState(() => undefined)).toBeTypeOf(
      "function",
    );
    expect(() => frontendHost.setAppDeploymentSession(null)).not.toThrow();
    expect(() =>
      frontendHost.incrementAppDeploymentSessionRunCount(),
    ).not.toThrow();
    expect(() =>
      frontendHost.setServerModeState({
        mode: "app",
        modeResolved: true,
        modeError: null,
      }),
    ).not.toThrow();
    expect(() =>
      frontendHost.setProjectLoadState({
        projectIsLoading: true,
        projectIs404: false,
      }),
    ).not.toThrow();
    expect(() => frontendHost.resetProjectRuntimeState()).not.toThrow();
    expect(() => frontendHost.notify({ message: "hello" })).not.toThrow();
    expect(() =>
      frontendHost.emitRealtimeDependencyEvent({
        dependencyKey: {
          type: "Section",
          sectionId: "section-1",
        } as never,
      }),
    ).not.toThrow();
    expect(() =>
      frontendHost.emitRealtimeSectionParamLiteral(
        "section-1",
        "param-1",
        "value",
      ),
    ).not.toThrow();
  });

  it("validates the renderer-based app subsystem registration contract", () => {
    expect(
      isAppSubsystemFrontendRegistration({
        overviewTab: {
          renderer: {
            mount: () => undefined,
            update: () => undefined,
            unmount: () => undefined,
          },
          titleQuickInfo: "Title",
          moreMenuQuickInfo: "Quick info",
          moreMenuLabel: "Menu",
        },
        chat: {
          slashCommands: [
            {
              command: "/app",
              action: "custom_prompt",
              summary: "Generate an app",
              appGenerationMode: "json_render",
            },
          ],
          imageRequiredModes: ["json_render_image"],
          customSlashCommandModes: {
            options: [{ id: "plain_chat", name: "Plain chat" }],
            defaultMode: "plain_chat",
          },
        },
      }),
    ).toBe(true);

    expect(
      isAppSubsystemFrontendRegistration({
        previewSurface: {
          renderer: {
            mount: "not-a-function",
          },
        },
      }),
    ).toBe(false);
  });

  it("exposes plugin-safe project-state helpers through the SDK", () => {
    const projectState = {
      ...createSingleConfig({
        projectConfig: {
          id: "config-1",
          sectionVariantMap: {
            "section-1": "section-variant",
          },
          showParamDisplayNames: true,
        },
        sections: {
          "section-1": {
            id: "section-1",
            name: "Section Core",
            displayName: "",
            defaultVariant: null,
            sharedModifier: {
              name: "Shared Section",
            },
            unsharedKeys: [],
            variants: [],
          },
        },
        sectionVariants: {
          "section-variant": {
            id: "section-variant",
            impl: "section-impl",
            isFrozen: false,
            modifier: {
              name: "Published Section",
            },
            name: "",
            nonPresetImpls: [],
          },
          "section-preview-variant": {
            id: "section-preview-variant",
            impl: "section-impl",
            isFrozen: false,
            modifier: {
              name: "Preview Section",
            },
            name: "",
            nonPresetImpls: [],
          },
        },
        sectionImpls: {
          "section-impl": {
            type: "Dict",
            id: "section-impl",
            name: "Base Section",
            codeObjVariantMap: {
              "param-1": "param-variant",
            },
          },
        },
        codeObjs: {
          "param-1": {
            id: "param-1",
            name: "Fallback Param Name",
            displayName: "Display Param Name",
            defaultVariant: null,
            sharedModifier: {},
            unsharedKeys: [],
            variants: [],
          },
        },
        codeObjVariants: {
          "param-variant": {
            id: "param-variant",
            impl: "param-impl",
            isFrozen: false,
            modifier: {
              value: "effective-value",
            },
            name: "",
            nonPresetImpls: [],
          },
        },
        codeObjImpls: {
          "param-impl": {
            type: "TextParam",
            value: "base-value",
            coreNameEditable: true,
          },
        },
      }),
      previewSectionVariantMap: {
        "section-1": "section-preview-variant",
      },
    };

    expect(getCurrentSectionVariantId(projectState, "section-1")).toBe(
      "section-variant",
    );
    expect(getCurrentSectionVariantId(projectState, "section-1", true)).toBe(
      "section-preview-variant",
    );
    expect(
      getCurrentEffectiveSectionImpl(projectState, "section-1", true),
    ).toMatchObject({
      name: "Preview Section",
    });
    expect(
      getCurrentEffectiveCodeObjImplWithTypeGuardIfPresent(
        projectState,
        "section-1",
        "param-1",
        (
          value,
        ): value is {
          type: "TextParam";
          value: string;
        } => value.type === "TextParam",
      ),
    ).toMatchObject({
      type: "TextParam",
      value: "effective-value",
    });
    expect(
      getParamDisplayNameIfPresent(projectState, "section-1", "param-1"),
    ).toBe("Fallback Param Name");
  });

  it("keeps host helper entrypoints wired to SDK-owned implementations", () => {
    expect(resolveHostMainRunRequest).toBe(resolveSdkMainRunRequest);
    expect(resolveHostRunRequest).toBe(resolveSdkRunRequest);
    expect(createHostDefaultAppPolicy).toBe(createSdkDefaultAppPolicy);
    expect(resolveHostAppPolicy).toBe(resolveSdkAppPolicy);
    expect(getHostAttachmentPolicy).toBe(getSdkSourceAttachmentPolicy);
    expect(isHostAttachmentMimeAllowed).toBe(isSdkSourceAttachmentMimeAllowed);
    expect(parseHostDropzoneValue).toBe(parseSdkSourceDropzoneValue);
    expect(serializeHostDropzoneValue).toBe(serializeSdkSourceDropzoneValue);
    expect(createHostDropzoneFileArtifactId).toBe(
      createSdkSourceDropzoneFileArtifactId,
    );
    expect(createHostDropzoneTextAttachmentId).toBe(
      createSdkSourceDropzoneTextAttachmentId,
    );
    expect(createHostNewId).toBe(createSdkSourceNewId);
    expect(createHostRandomName).toBe(createSdkSourceRandomName);
    expect(normalizeHostGeneratedOrigin).toBe(
      normalizeSdkSourceGeneratedOrigin,
    );
    expect(normalizeHostGeneratedToolName).toBe(
      normalizeSdkSourceGeneratedToolName,
    );
    expect(validateHostGeneratedSimpleNameInput).toBe(
      validateSdkSourceGeneratedSimpleNameInput,
    );
    expect(sanitizeHostGeneratedSimpleNameSlug).toBe(
      sanitizeSdkSourceGeneratedSimpleNameSlug,
    );
    expect(isHostGeneratedPythonIdentifier).toBe(
      isSdkSourceGeneratedPythonIdentifier,
    );
    expect(validateHostGeneratedParamNameInput).toBe(
      validateSdkSourceGeneratedParamNameInput,
    );
    expect(shouldShowHostPasswordReveal).toBe(shouldShowPasswordReveal);
    expect(buildHostTextBlockTypographyScale).toBe(
      buildSdkSourceTextBlockTypographyScale,
    );
    expect(clampHostTextBlockMasterFontSize).toBe(
      clampSdkSourceTextBlockMasterFontSize,
    );
    expect(resolveHostServerModeCapabilities).toBe(
      resolveSdkSourceServerModeCapabilities,
    );
    expect(resolveHostWorkspaceLaunchRouteKind).toBe(
      resolveSdkSourceWorkspaceLaunchRouteKind,
    );
    expect(resolveHostEndpointOriginForMode("/", "launcher")).toBe("backend");
    expect(getHostCurrentEffectiveCodeObjImplIfPresent).toBe(
      getSdkCurrentEffectiveCodeObjImplIfPresent,
    );
    expect(getHostCurrentEffectiveSectionImpl).toBe(
      getCurrentEffectiveSectionImpl,
    );
    expect(getHostCurrentEffectiveSectionImplIfPresent).toBe(
      getSdkCurrentEffectiveSectionImplIfPresent,
    );
    expect(getHostCurrentSectionVariantId).toBe(getCurrentSectionVariantId);
    expect(getHostCurrentSectionVariantIdIfPresent).toBe(
      getSdkCurrentSectionVariantIdIfPresent,
    );
    expect(getHostParamDisplayNameIfPresent).toBe(getParamDisplayNameIfPresent);
  });

  it("keeps the source SDK package detached from host-private imports", () => {
    const projectStateSource = readFileSync(
      new URL(
        "../../plugin-sdk/app-subsystem/src/projectState.ts",
        import.meta.url,
      ),
      "utf-8",
    );
    const helpersSource = readFileSync(
      new URL("../../plugin-sdk/app-subsystem/src/helpers.ts", import.meta.url),
      "utf-8",
    );
    const openapiSource = readFileSync(
      new URL("../../plugin-sdk/app-subsystem/src/openapi.ts", import.meta.url),
      "utf-8",
    );
    const generatedValuesSource = readFileSync(
      new URL(
        "../../plugin-sdk/app-subsystem/src/generatedValues.ts",
        import.meta.url,
      ),
      "utf-8",
    );
    const hostProjectStateSelectorSource = readFileSync(
      new URL("../utils/projectStateSelectors.ts", import.meta.url),
      "utf-8",
    );

    expect(projectStateSource).not.toContain('from "utils/');
    expect(projectStateSource).not.toContain("cloneDeep");
    expect(hostProjectStateSelectorSource).toContain(
      'from "@setta/app-subsystem-frontend-sdk"',
    );
    expect(hostProjectStateSelectorSource).not.toContain("WeakMap");
    expect(helpersSource).not.toContain('from "utils/');
    expect(openapiSource).not.toContain('from "utils/');
    expect(openapiSource).not.toContain('from "openapi/');
    expect(generatedValuesSource).not.toContain("../../../generation/");
  });

  it("re-exports narrow helper surfaces needed by plugin frontends", () => {
    const attachment: DropzoneStatelessAttachment = {
      kind: "text",
      name: "notes.txt",
      text: "hello",
    };

    expect(CODEMIRROR_TOOLTIP_PARENT_ID).toBe("setta-codemirror-tooltips");
    expect(NO_PAN_CLASS_NAME).toBe("nopan");
    expect(SETTA_PREVENT_SECTION_ACTIVE_CSS).toBe(
      "setta-prevent-section-active-css",
    );
    expect(SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION).toBe(
      "setta-prevent-arrow-keys-moving-section",
    );
    expect(buildTextBlockTypographyScale(20)).toEqual({
      bodyPx: 20,
      codePx: 18.4,
      h1Px: 40,
      h2Px: 32,
      h3Px: 27,
      h4Px: 23.6,
      h5Px: 20.8,
      h6Px: 19,
    });
    expect(shouldShowPasswordReveal({ value: "", hasSecret: true })).toBe(true);
    expect(createRandomName()).toMatch(/^[a-z]+_[a-z]+$/);
    expect(attachment.text).toBe("hello");
  });

  it("builds binary download urls from explicit server-mode input", () => {
    const url = new URL(buildBinaryDownloadUrl("artifact-1", "share-1", null));

    expect(url.pathname).toBe("/binary/artifact-1");
    expect(url.searchParams.get("shareSessionId")).toBe("share-1");
  });
});
