import { getErrorDetail, res200 } from "utils/endpointUtils";
import {
  route_get_app_catalog,
  route_get_app_definition,
  route_set_app_definition,
  route_validate_app_definition,
} from "utils/generatedEndpoints";
import {
  type AppDefinition,
  type ValidateAppDefinitionResponse,
} from "utils/generatedTypes";
import { formatCatalogForPrompt } from "./appConfigPromptUtils";

export type AppConfigDefinitionResponsePayload = {
  appSpec: unknown;
  appDefinition: AppDefinition | null;
};

export type AppConfigDefinitionRequest = {
  appSpec: Record<string, unknown>;
  appSpecPath?: string;
  appSpecVersion?: string;
  catalogId?: string;
  theme: Record<string, unknown>;
  assets: unknown[];
};

type AppConfigApiSuccess<T> = {
  ok: true;
  value: T;
};

type AppConfigApiFailure = {
  ok: false;
  error: string;
};

function resolveAppConfigApiError(
  payload: unknown,
  fallback: string,
): AppConfigApiFailure {
  return {
    ok: false,
    error: getErrorDetail(payload) ?? fallback,
  };
}

export async function loadAppConfigDefinition(): Promise<
  AppConfigApiSuccess<AppConfigDefinitionResponsePayload> | AppConfigApiFailure
> {
  const res = await route_get_app_definition({});
  if (!res200(res)) {
    return resolveAppConfigApiError(res.data, "Failed to load app spec.");
  }
  return {
    ok: true,
    value: {
      appSpec: res.data.appSpec ?? null,
      appDefinition: res.data.appDefinition ?? null,
    },
  };
}

export async function saveAppConfigDefinition(
  request: AppConfigDefinitionRequest,
  failureMessage: string,
): Promise<
  AppConfigApiSuccess<AppConfigDefinitionResponsePayload> | AppConfigApiFailure
> {
  const res = await route_set_app_definition(request);
  if (!res200(res)) {
    return resolveAppConfigApiError(res.data, failureMessage);
  }
  return {
    ok: true,
    value: {
      appSpec: res.data.appSpec ?? null,
      appDefinition: res.data.appDefinition ?? null,
    },
  };
}

export async function validateAppConfigDefinition(request: {
  appSpec: Record<string, unknown>;
  appSpecVersion?: string;
  catalogId?: string;
  theme: Record<string, unknown>;
  assets: unknown[];
}): Promise<
  AppConfigApiSuccess<ValidateAppDefinitionResponse> | AppConfigApiFailure
> {
  const res = await route_validate_app_definition(request);
  if (!res200(res)) {
    return resolveAppConfigApiError(res.data, "Failed to validate app spec.");
  }
  return {
    ok: true,
    value: res.data,
  };
}

export async function loadAppCatalogPromptSummary(): Promise<
  | AppConfigApiSuccess<{
      catalogSummary: string;
      catalogId: string | null;
    }>
  | AppConfigApiFailure
> {
  const res = await route_get_app_catalog();
  if (!res200(res)) {
    return resolveAppConfigApiError(res.data, "Failed to load app catalog.");
  }
  return {
    ok: true,
    value: {
      catalogSummary: formatCatalogForPrompt(res.data),
      catalogId: typeof res.data.id === "string" ? res.data.id : null,
    },
  };
}
