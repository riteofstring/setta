import { type ZustandProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  SectionTypeEnum,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";

function resolvePromptDisplayName(core: unknown, fallback: string) {
  if (!core || typeof core !== "object") {
    return fallback;
  }
  const record = core as Record<string, unknown>;
  const displayName =
    typeof record.displayName === "string" ? record.displayName.trim() : "";
  if (displayName) {
    return displayName;
  }
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name) {
    return name;
  }
  return fallback;
}

export function formatCatalogForPrompt(catalog: unknown): string {
  if (!catalog || typeof catalog !== "object") {
    return "Catalog unavailable.";
  }
  const record = catalog as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "unknown";
  const version =
    typeof record.version === "string" ? record.version : "unknown";
  const components = Array.isArray(record.components) ? record.components : [];
  const actions = Array.isArray(record.actions) ? record.actions : [];
  const componentLines = components
    .map((component) => {
      if (!component || typeof component !== "object") {
        return null;
      }
      const componentRecord = component as Record<string, unknown>;
      const type = componentRecord.type;
      if (typeof type !== "string") {
        return null;
      }
      const props = componentRecord.props;
      const propNames =
        props && typeof props === "object" ? Object.keys(props).join(", ") : "";
      return propNames ? `- ${type} (props: ${propNames})` : `- ${type}`;
    })
    .filter(Boolean)
    .join("\n");
  const actionLines = actions
    .map((action) => {
      if (!action || typeof action !== "object") {
        return null;
      }
      const actionRecord = action as Record<string, unknown>;
      const name = actionRecord.name;
      if (typeof name !== "string") {
        return null;
      }
      const params = actionRecord.params;
      const paramNames =
        params && typeof params === "object"
          ? Object.keys(params).join(", ")
          : "";
      return paramNames ? `- ${name} (params: ${paramNames})` : `- ${name}`;
    })
    .filter(Boolean)
    .join("\n");
  return [
    `Catalog: ${id} (version ${version})`,
    "Components:",
    componentLines || "- (none)",
    "Actions:",
    actionLines || "- (none)",
  ].join("\n");
}

export function formatSectionsForAppPrompt(state: ZustandProjectState) {
  const entries: Array<{
    sectionId: string;
    label: string;
    sectionType: string | null;
    params: Array<{ id: string; name: string; type: string | null }>;
  }> = [];

  for (const [sectionId, core] of Object.entries(state.sections)) {
    const variantId = state.projectConfig.sectionVariantMap[sectionId];
    const variant = variantId ? state.sectionVariants[variantId] : null;
    const impl = variant ? state.sectionImpls[variant.impl] : null;
    const sectionType = impl ? impl.type : null;

    // These are generated UI mirrors, not meaningful app targets.
    if (
      sectionType === SectionTypeEnum.GenPythonCode ||
      sectionType === SectionTypeEnum.GenPythonMetadata
    ) {
      continue;
    }

    const params: Array<{ id: string; name: string; type: string | null }> = [];
    if (impl && impl.type === SectionTypeEnum.MetaControl) {
      const metaControlParamId =
        typeof impl.metaControlParamId === "string"
          ? impl.metaControlParamId
          : null;
      if (metaControlParamId) {
        const metaControlVariantId =
          impl.codeObjVariantMap?.[metaControlParamId] ?? null;
        const metaControlVariant = metaControlVariantId
          ? state.codeObjVariants[metaControlVariantId]
          : null;
        const metaControlImpl = metaControlVariant
          ? state.codeObjImpls[metaControlVariant.impl]
          : null;
        params.push({
          id: metaControlParamId,
          name: resolvePromptDisplayName(
            state.codeObjs[metaControlParamId],
            metaControlParamId,
          ),
          type: metaControlImpl?.type ?? null,
        });
      }
    } else if (impl && isBaseSectionWithParamsImpl(impl)) {
      for (const [codeObjId, codeObjVariantId] of Object.entries(
        impl.codeObjVariantMap,
      )) {
        const codeObjVariant = state.codeObjVariants[codeObjVariantId];
        if (!codeObjVariant) {
          continue;
        }
        const codeObjImpl = state.codeObjImpls[codeObjVariant.impl];
        if (!codeObjImpl) {
          continue;
        }
        if (codeObjImpl.type === CodeObjTypeEnum.CodeCallable) {
          continue;
        }
        params.push({
          id: codeObjId,
          name: resolvePromptDisplayName(state.codeObjs[codeObjId], codeObjId),
          type: codeObjImpl.type ?? null,
        });
      }
    }

    entries.push({
      sectionId,
      label: resolvePromptDisplayName(core, sectionId),
      sectionType: typeof sectionType === "string" ? sectionType : null,
      params,
    });
  }

  if (entries.length === 0) {
    return "";
  }

  const maxSections = 40;
  const maxParams = 20;

  entries.sort((a, b) => a.label.localeCompare(b.label));
  const slice = entries.slice(0, maxSections);

  return slice
    .map((entry) => {
      const typeSuffix = entry.sectionType ? ` type=${entry.sectionType}` : "";
      const params =
        entry.params.length > 0
          ? ` params: ${entry.params
              .slice(0, maxParams)
              .map((param) => {
                const paramTypeSuffix = param.type
                  ? `, type=${param.type}`
                  : "";
                return `${param.name} (${param.id}${paramTypeSuffix})`;
              })
              .join(
                ", ",
              )}${entry.params.length > maxParams ? ` (+${entry.params.length - maxParams} more)` : ""}`
          : "";
      return `- ${entry.label} (${entry.sectionId})${typeSuffix}${params}`;
    })
    .join("\n");
}
