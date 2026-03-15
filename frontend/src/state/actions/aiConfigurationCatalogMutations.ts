import { res200 } from "utils/endpointUtils";
import {
  route_create_agent_profile,
  route_create_external_agent_config,
  route_create_prompt_template,
  route_delete_agent_profile,
  route_delete_external_agent_config,
  route_delete_prompt_template,
  route_update_agent_profile,
  route_update_engine_config,
  route_update_external_agent_config,
  route_update_prompt_template,
} from "utils/generatedEndpoints";
import {
  type AgentProfile,
  type CreateAgentProfileRequestInput,
  type CreateExternalAgentConfigRequestInput,
  type CreatePromptTemplateRequestInput,
  type DeleteAgentProfileRequestInput,
  type DeleteExternalAgentConfigRequestInput,
  type DeletePromptTemplateRequestInput,
  type EngineConfig,
  type ExternalAgentConfig,
  type PromptTemplate,
  type UpdateAgentProfileRequestInput,
  type UpdateEngineConfigRequestInput,
  type UpdateExternalAgentConfigRequestInput,
  type UpdatePromptTemplateRequestInput,
} from "utils/generatedTypes";
import {
  receiveAgentProfilesLoadFailure,
  receiveEngineConfigsLoadFailure,
  receiveExternalAgentConfigsLoadFailure,
  receivePromptTemplatesLoadFailure,
  removeAgentProfile,
  removeExternalAgentConfig,
  removePromptTemplate,
  upsertAgentProfile,
  upsertEngineConfig,
  upsertExternalAgentConfig,
  upsertPromptTemplate,
} from "./aiConfigurationCatalogState";

export async function createAgentProfile(
  payload: CreateAgentProfileRequestInput,
): Promise<AgentProfile | null> {
  const res = await route_create_agent_profile(payload);
  if (!res200(res)) {
    receiveAgentProfilesLoadFailure("Failed to create agent profile");
    return null;
  }
  const profile = res.data;
  upsertAgentProfile(profile);
  return profile;
}

export async function updateAgentProfile(
  payload: UpdateAgentProfileRequestInput,
): Promise<AgentProfile | null> {
  const res = await route_update_agent_profile(payload);
  if (!res200(res)) {
    receiveAgentProfilesLoadFailure("Failed to update agent profile");
    return null;
  }
  const profile = res.data;
  upsertAgentProfile(profile);
  return profile;
}

export async function deleteAgentProfile(
  payload: DeleteAgentProfileRequestInput,
): Promise<boolean> {
  const res = await route_delete_agent_profile(payload);
  if (!res200(res)) {
    receiveAgentProfilesLoadFailure("Failed to delete agent profile");
    return false;
  }
  removeAgentProfile(payload.profileId);
  return true;
}

export async function updateEngineConfig(
  payload: UpdateEngineConfigRequestInput,
): Promise<EngineConfig | null> {
  const res = await route_update_engine_config(payload);
  if (!res200(res)) {
    receiveEngineConfigsLoadFailure("Failed to update engine config");
    return null;
  }
  const config = res.data;
  upsertEngineConfig(config);
  return config;
}

export async function createPromptTemplate(
  payload: CreatePromptTemplateRequestInput,
): Promise<PromptTemplate | null> {
  const res = await route_create_prompt_template(payload);
  if (!res200(res)) {
    receivePromptTemplatesLoadFailure("Failed to create prompt template");
    return null;
  }
  const template = res.data;
  upsertPromptTemplate(template);
  return template;
}

export async function updatePromptTemplate(
  payload: UpdatePromptTemplateRequestInput,
): Promise<PromptTemplate | null> {
  const res = await route_update_prompt_template(payload);
  if (!res200(res)) {
    receivePromptTemplatesLoadFailure("Failed to update prompt template");
    return null;
  }
  const template = res.data;
  upsertPromptTemplate(template);
  return template;
}

export async function deletePromptTemplate(
  payload: DeletePromptTemplateRequestInput,
): Promise<boolean> {
  const res = await route_delete_prompt_template(payload);
  if (!res200(res)) {
    receivePromptTemplatesLoadFailure("Failed to delete prompt template");
    return false;
  }
  removePromptTemplate(payload.templateId);
  return true;
}

export async function createExternalAgentConfig(
  payload: CreateExternalAgentConfigRequestInput,
): Promise<ExternalAgentConfig | null> {
  const res = await route_create_external_agent_config(payload);
  if (!res200(res)) {
    receiveExternalAgentConfigsLoadFailure(
      "Failed to create external agent config",
    );
    return null;
  }
  const config = res.data;
  upsertExternalAgentConfig(config);
  return config;
}

export async function updateExternalAgentConfig(
  payload: UpdateExternalAgentConfigRequestInput,
): Promise<ExternalAgentConfig | null> {
  const res = await route_update_external_agent_config(payload);
  if (!res200(res)) {
    receiveExternalAgentConfigsLoadFailure(
      "Failed to update external agent config",
    );
    return null;
  }
  const config = res.data;
  upsertExternalAgentConfig(config);
  return config;
}

export async function deleteExternalAgentConfig(
  payload: DeleteExternalAgentConfigRequestInput,
): Promise<boolean> {
  const res = await route_delete_external_agent_config(payload);
  if (!res200(res)) {
    receiveExternalAgentConfigsLoadFailure(
      "Failed to delete external agent config",
    );
    return false;
  }
  removeExternalAgentConfig(payload.configId);
  return true;
}
