from fastapi import HTTPException
from pydantic import BaseModel, Field

from setta.llm.capabilities_config import (
    get_global_capability_defaults,
    get_project_chat_capability_policy,
    get_skill_sources,
    set_global_capability_defaults,
    set_project_chat_capability_policy,
    set_skill_sources,
)
from setta.llm.config import save_llm_config
from setta.llm.skills_catalog import (
    delete_skills,
    get_skill_details,
    get_skills_catalog,
    import_skill_markdown,
)
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.capabilities import (
    CapabilityPolicy,
    GlobalCapabilityDefaults,
    McpServersRuntimeStateResponse,
    SkillCatalogResponse,
    SkillDetailsResponse,
    SkillEntry,
    SkillSource,
)
from setta.types.chat import APIKeys
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs
from setta.types.notifications import SettaBackendLogEventSeverity
from setta.types.routes import Route

router = SettaAPIRouter()


class UpdateAPIKeysRequest(BaseModel):
    apiKeys: APIKeys = Field(default_factory=dict)


class SetSkillSourcesRequest(BaseModel):
    skillSources: list[SkillSource] = Field(default_factory=list)


class GetSkillDetailsRequest(BaseModel):
    skillRef: str


class ImportSkillMarkdownRequest(BaseModel):
    markdown: str
    sourceId: str | None = None
    slug: str | None = None


class DeleteSkillsRequest(BaseModel):
    skillRefs: list[str] = Field(default_factory=list)


class GetProjectChatCapabilityPolicyRequest(BaseModel):
    projectConfigId: ID
    chatId: ID | None = None


class SetProjectChatCapabilityPolicyRequest(BaseModel):
    projectConfigId: ID
    chatId: ID | None = None
    capabilityPolicy: CapabilityPolicy


@router.get(Route.LLM_CONFIG)
async def route_get_llm_config(
    ctx: RuntimeContextFromRequest,
) -> AllLLMConfigs:
    await ctx.enforce_llm_allowed()
    return ctx.state.agent_runner.config


@router.post(Route.LLM_CONFIG)
async def route_set_llm_config(
    config: AllLLMConfigs,
    ctx: RuntimeContextFromRequest,
) -> AllLLMConfigs:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating LLM configs.")
    save_llm_config(config, ctx.state.dbe)
    ctx.state.agent_runner.update_config(config)
    return ctx.state.agent_runner.config


@router.get(Route.GET_SKILL_SOURCES)
async def route_get_skill_sources(
    ctx: RuntimeContextFromRequest,
) -> list[SkillSource]:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow reading skill sources.")
    return get_skill_sources(ctx.state.dbe)


@router.post(Route.SET_SKILL_SOURCES)
async def route_set_skill_sources(
    payload: SetSkillSourcesRequest,
    ctx: RuntimeContextFromRequest,
) -> list[SkillSource]:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating skill sources.")
    try:
        return set_skill_sources(ctx.state.dbe, payload.skillSources)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get(Route.GET_SKILLS_CATALOG)
async def route_get_skills_catalog(
    ctx: RuntimeContextFromRequest,
) -> SkillCatalogResponse:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow reading the skills catalog.")
    return get_skills_catalog(ctx.state.dbe)


@router.post(Route.GET_SKILL_DETAILS)
async def route_get_skill_details(
    payload: GetSkillDetailsRequest,
    ctx: RuntimeContextFromRequest,
) -> SkillDetailsResponse:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow reading skill details.")
    try:
        return get_skill_details(ctx.state.dbe, payload.skillRef)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(Route.IMPORT_SKILL_MARKDOWN)
async def route_import_skill_markdown(
    payload: ImportSkillMarkdownRequest,
    ctx: RuntimeContextFromRequest,
) -> SkillEntry:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow importing skills.")
    try:
        return import_skill_markdown(
            ctx.state.dbe,
            markdown=payload.markdown,
            source_id=payload.sourceId,
            slug=payload.slug,
        )
    except (ValueError, KeyError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(Route.DELETE_SKILLS)
async def route_delete_skills(
    payload: DeleteSkillsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[str]:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow deleting skills.")
    try:
        return delete_skills(ctx.state.dbe, payload.skillRefs)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(Route.GET_GLOBAL_CAPABILITY_DEFAULTS)
async def route_get_global_capability_defaults(
    ctx: RuntimeContextFromRequest,
) -> GlobalCapabilityDefaults:
    await ctx.enforce_llm_allowed()
    return get_global_capability_defaults(ctx.state.dbe)


@router.post(Route.SET_GLOBAL_CAPABILITY_DEFAULTS)
async def route_set_global_capability_defaults(
    payload: GlobalCapabilityDefaults,
    ctx: RuntimeContextFromRequest,
) -> GlobalCapabilityDefaults:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode(
        "Share mode does not allow updating global capability defaults."
    )
    return set_global_capability_defaults(ctx.state.dbe, payload)


@router.post(Route.GET_PROJECT_CHAT_CAPABILITY_POLICY)
async def route_get_project_chat_capability_policy(
    payload: GetProjectChatCapabilityPolicyRequest,
    ctx: RuntimeContextFromRequest,
) -> CapabilityPolicy:
    await ctx.enforce_llm_allowed()
    return get_project_chat_capability_policy(
        ctx.state.dbe,
        project_config_id=payload.projectConfigId,
        chat_id=payload.chatId,
    )


@router.post(Route.SET_PROJECT_CHAT_CAPABILITY_POLICY)
async def route_set_project_chat_capability_policy(
    payload: SetProjectChatCapabilityPolicyRequest,
    ctx: RuntimeContextFromRequest,
) -> CapabilityPolicy:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode(
        "Share mode does not allow updating project chat capability policy."
    )
    return set_project_chat_capability_policy(
        ctx.state.dbe,
        project_config_id=payload.projectConfigId,
        chat_id=payload.chatId,
        policy=payload.capabilityPolicy,
    )


@router.get(Route.GET_MCP_SERVERS_RUNTIME_STATE)
async def route_get_mcp_servers_runtime_state(
    ctx: RuntimeContextFromRequest,
) -> McpServersRuntimeStateResponse:
    await ctx.enforce_llm_allowed()
    return ctx.state.mcp_client.get_runtime_state()


@router.get(Route.LLM_API_KEYS)
async def route_get_llm_api_keys(
    ctx: RuntimeContextFromRequest,
) -> APIKeys:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow reading LLM API keys.")
    return ctx.state.agent_runner.api_keys


@router.post(Route.LLM_API_KEYS)
async def route_set_llm_api_keys(
    payload: UpdateAPIKeysRequest,
    ctx: RuntimeContextFromRequest,
) -> APIKeys:
    await ctx.enforce_llm_allowed()
    ctx.require_ide_mode("Share mode does not allow updating LLM API keys.")
    try:
        env_vars = ctx.state.dbe.read_dot_env()
        mutated = False
        for key, value in payload.apiKeys.items():
            normalized_key = key.strip()
            normalized_value = value.strip()
            if not normalized_key:
                continue
            if normalized_value:
                previous = env_vars.get(normalized_key)
                env_vars[normalized_key] = normalized_value
                mutated = mutated or previous != normalized_value
            else:
                if normalized_key in env_vars:
                    env_vars.pop(normalized_key)
                    mutated = True
        if mutated:
            ctx.state.dbe.write_dot_env(env_vars)
            ctx.state.dbe.reload_dot_env()
        await ctx.state.wmh_frontend_sender.log_and_broadcast_backend_log_event(
            "Saved LLM API keys",
            severity=SettaBackendLogEventSeverity.info,
        )
        ctx.state.agent_runner.update_api_keys(env_vars)
        return ctx.state.agent_runner.api_keys
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail="Failed to save LLM API keys"
        ) from exc
