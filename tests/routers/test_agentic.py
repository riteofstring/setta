import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException

from setta.database.db_objs import DBE
from setta.routers.agentic import (
    CreateAgentProfileRequest,
    CreatePromptTemplateRequest,
    StartAgentRunRequest,
    UpdateAgentProfileRequest,
    UpdatePromptTemplateRequest,
    route_create_agent_profile,
    route_create_prompt_asset,
    route_delete_agent_profile,
    route_delete_prompt_asset,
    route_get_agent_profile,
    route_get_agent_run,
    route_get_prompt_asset,
    route_list_agent_profiles,
    route_list_agent_runs,
    route_list_prompt_assets,
    route_start_agent_run,
    route_stop_agent_run,
    route_update_agent_profile,
    route_update_prompt_asset,
)
from setta.server_state import SettaFastAPIState
from setta.types.agentic import AgentProfile, AgentRunStatus, PromptTemplate
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest, SharePolicy
from tests.utils.runtime_context import runtime_context


def _build_share_deployment_root(
    tmpdir: str,
    project_config_name: str,
    deployment_version: str = "v1",
) -> Path:
    root = (
        Path(tmpdir)
        / "share_deployments"
        / project_config_name
        / deployment_version
    )
    root.mkdir(parents=True, exist_ok=True)
    return root


def _write_share_project(
    root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
) -> ID:
    dbe = DBE(root)
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    deployment_name = root.parent.name
    manifest = ShareDeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config.id


def _write_share_policy(root: Path, policy: SharePolicy) -> None:
    dbe = DBE(root)
    dbe.write_json(root / "share_policy.json", policy.model_dump())


class AgenticRouterTests(unittest.IsolatedAsyncioTestCase):
    async def _build_state(self, root: Path) -> SettaFastAPIState:
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            share_mode=True,
            share_deployment_root=root,
        )
        await state.wait_until_ready()
        return state

    async def test_list_get_and_start_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "agentic-share-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowLLM=True))
            state = await self._build_state(root)
            profile = AgentProfile(
                id=ID("profile-1"),
                name="Navigator",
                llmConfigId="llm-default",
            )
            prompt = PromptTemplate(
                id=ID("prompt-1"),
                name="Greeting",
                template="Hello {{ name }}",
            )
            state.dbe.write_agent_profiles([profile])
            state.dbe.write_prompt(prompt)

            with runtime_context(state, "session-a") as ctx:
                profiles = await route_list_agent_profiles(ctx)
                self.assertEqual([profile], profiles)
                loaded_profile = await route_get_agent_profile(profile.id, ctx)
                self.assertEqual(profile, loaded_profile)

                prompts = await route_list_prompt_assets(ctx)
                self.assertEqual([prompt], prompts)
                loaded_prompt = await route_get_prompt_asset(prompt.id, ctx)
                self.assertEqual(prompt, loaded_prompt)

                run = await route_start_agent_run(
                    StartAgentRunRequest(
                        agentProfileId=profile.id,
                        inputs={"goal": "ship"},
                    ),
                    ctx,
                )
                self.assertEqual(AgentRunStatus.queued, run.status)
                self.assertEqual(profile.id, run.agentProfileId)

                fetched = await route_get_agent_run(run.id, ctx)
                self.assertEqual(run.id, fetched.id)

                runs = await route_list_agent_runs(ctx, agentProfileId=profile.id)
                self.assertEqual(1, len(runs))
                self.assertEqual(run.id, runs[0].id)

    async def test_share_mode_blocks_mutations(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "agentic-share-block-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowLLM=True))
            state = await self._build_state(root)
            profile = AgentProfile(
                id=ID("profile-2"),
                name="Editor",
                llmConfigId="llm-default",
            )
            prompt = PromptTemplate(
                id=ID("prompt-2"),
                name="Outline",
                template="Outline {{ topic }}",
            )
            state.dbe.write_agent_profiles([profile])

            with runtime_context(state, "session-a") as ctx:
                with self.assertRaises(HTTPException) as raised:
                    await route_create_agent_profile(
                        CreateAgentProfileRequest(profile=profile),
                        ctx,
                    )
                self.assertEqual(403, raised.exception.status_code)

                with self.assertRaises(HTTPException) as raised:
                    await route_update_agent_profile(
                        profile.id,
                        UpdateAgentProfileRequest(profile=profile),
                        ctx,
                    )
                self.assertEqual(403, raised.exception.status_code)

                with self.assertRaises(HTTPException) as raised:
                    await route_delete_agent_profile(profile.id, ctx)
                self.assertEqual(403, raised.exception.status_code)

                with self.assertRaises(HTTPException) as raised:
                    await route_create_prompt_asset(
                        CreatePromptTemplateRequest(prompt=prompt),
                        ctx,
                    )
                self.assertEqual(403, raised.exception.status_code)

                with self.assertRaises(HTTPException) as raised:
                    await route_update_prompt_asset(
                        prompt.id,
                        UpdatePromptTemplateRequest(prompt=prompt),
                        ctx,
                    )
                self.assertEqual(403, raised.exception.status_code)

                with self.assertRaises(HTTPException) as raised:
                    await route_delete_prompt_asset(prompt.id, ctx)
                self.assertEqual(403, raised.exception.status_code)

                run = await route_start_agent_run(
                    StartAgentRunRequest(agentProfileId=profile.id),
                    ctx,
                )
                with self.assertRaises(HTTPException) as raised:
                    await route_stop_agent_run(run.id, ctx)
                self.assertEqual(403, raised.exception.status_code)

    async def test_stop_agent_run_missing_returns_404(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "agentic-stop-missing-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowLLM=True))
            state = await self._build_state(root)
            original_share_mode = state.share_mode
            state.share_mode = False
            try:
                with runtime_context(state) as ctx:
                    with self.assertRaises(HTTPException) as raised:
                        await route_stop_agent_run(ID("missing-run"), ctx)
                    self.assertEqual(404, raised.exception.status_code)
            finally:
                state.share_mode = original_share_mode
