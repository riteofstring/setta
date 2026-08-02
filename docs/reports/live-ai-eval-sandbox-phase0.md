# Live AI Evaluation Sandbox Phase 0

<!-- setta-eval-phase0-evidence:v6 -->
```json
{
  "schemaVersion": 6,
  "outcome": "PASS",
  "probedAt": "2026-08-02T20:30:30.323619Z",
  "topology": {
    "name": "host-app-server/container-exec-server",
    "hostOwnership": "Setta probe, authenticated Codex app-server, model network, and evidence",
    "containerOwnership": "Codex exec-server, AI-controlled filesystem and process tools, and disposable workspace",
    "authenticationBoundary": "ChatGPT authentication remains in the host app-server; no credential is mounted, forwarded, or copied into the container",
    "controlPath": "capability-authenticated host-loopback WebSocket relay to Docker-managed stdin/stdout for the container exec-server stdio transport; no Agent port is published"
  },
  "repository": {
    "commit": "aed96923dd91054a75a8b276632ff282e53dfe6f",
    "clean": true
  },
  "docker": {
    "clientVersion": "28.0.4",
    "serverVersion": "28.0.4",
    "serverOS": "linux",
    "serverArch": "arm64",
    "cpus": 8,
    "memoryBytes": 8218316800
  },
  "codex": {
    "hostVersion": "0.146.0",
    "bundleVersion": "0.146.0",
    "bundleTarget": "aarch64-unknown-linux-musl",
    "model": "gpt-5.6-sol",
    "reasoningEffort": "high",
    "fileSha256": {
      "Dockerfile": "cbc75f3cd78e71a3ec1360bebff9ad25bf4d0557aa855f8c20f50b58a06482dd",
      "bwrap": "c547cbdc762a70ed216789ffaa4c6c0e7d2beabe32245a498f8e365a9fc8dab4",
      "codex": "cb5e8cb8a333a408ce6adbe0d4fad1845c69772c2216af7c1f88c98a11460dc6",
      "control-relay": "d5ddd50efde04ba4b69c859bd091fc1dfa02116d87933af7a22a50406c6fa989",
      "rg": "e36d0eb52e70696bdf1781392722e05a21bb91d3b7b762ef5ec20e5df2ec687b",
      "sandbox-helper": "aaae66d7f6c7d8599cfef6c4fe329069de555211720d6ab073920d45de8d81ae",
      "zsh": "7feeacd883e1dc749847936948c378653c80a69ec4a9542f0f126b411882c179"
    },
    "imageId": "sha256:bf8206a3b51fafe6aeb578fbcb177683141543c4b1eb496c121796930c63d41a"
  },
  "boundary": {
    "containerUser": "65532:65532",
    "readOnlyRootFilesystem": true,
    "workspaceVolumeWritable": true,
    "workspaceDiskLimitBytes": 67108864,
    "temporaryFilesystemMountOptions": "rw,noexec,nosuid,nodev,size=67108864,mode=1777",
    "rootWriteDenied": true,
    "hostCanaryVisible": false,
    "internalNetwork": true,
    "fakeHostEndpointBlocked": true,
    "controlTransport": "host-loopback-websocket/docker-attach-stdio",
    "hostControlAddress": "127.0.0.1:56626",
    "containerStdioAttached": true,
    "hostPortPublicationAbsent": true,
    "mountDestinations": [
      "/tmp",
      "/workspace"
    ],
    "containerEnvironmentNames": [
      "HOME",
      "LANG",
      "PATH",
      "SHELL"
    ],
    "boundaryHelperEnvironmentNames": [
      "HOME",
      "HOSTNAME",
      "LANG",
      "PATH",
      "SHELL"
    ],
    "shellEnvironmentPolicyInherit": "none",
    "shellEnvironmentPolicySetNames": [
      "HOME",
      "LANG",
      "PATH",
      "SHELL"
    ],
    "droppedCapabilities": [
      "ALL"
    ],
    "noNewPrivileges": true,
    "privileged": false,
    "pidsLimit": 128,
    "memoryLimitBytes": 1073741824,
    "nanoCpus": 2000000000
  },
  "tools": {
    "allowedActivityKinds": [
      "command",
      "file_change",
      "image_view"
    ],
    "disabledFeatureNames": [
      "apply_patch_freeform",
      "apply_patch_streaming_events",
      "apps",
      "apps_mcp_path_override",
      "artifact",
      "auth_elicitation",
      "browser_use",
      "browser_use_external",
      "browser_use_full_cdp_access",
      "chronicle",
      "code_mode",
      "code_mode_host",
      "code_mode_only",
      "codex_git_commit",
      "collaboration_modes",
      "computer_use",
      "deferred_executor",
      "deferred_tool_world_state",
      "enable_fanout",
      "enable_mcp_apps",
      "exec_permission_approvals",
      "executor_capability_discovery",
      "external_agent_memory_import",
      "external_migration",
      "goals",
      "guardian_approval",
      "guardianv2",
      "hooks",
      "image_generation",
      "in_app_browser",
      "js_repl",
      "js_repl_tools_only",
      "mcp_2026_07_28",
      "memories",
      "mentions_v2",
      "multi_agent",
      "multi_agent_v2",
      "network_proxy",
      "non_prefixed_mcp_tool_names",
      "plugin_hooks",
      "plugins",
      "plugin_sharing",
      "personality",
      "prevent_idle_sleep",
      "realtime_conversation",
      "remote_control",
      "remote_plugin",
      "request_permissions_tool",
      "request_rule",
      "respect_system_proxy",
      "search_tool",
      "secret_auth_storage",
      "shell_snapshot",
      "shell_zsh_fork",
      "skill_env_var_dependency_prompt",
      "skill_mcp_dependency_install",
      "skill_search",
      "standalone_web_search",
      "terminal_visualization_instructions",
      "tool_call_mcp_elicitation",
      "tool_search",
      "tool_search_always_defer_mcp_tools",
      "tool_suggest",
      "unavailable_dummy_tools",
      "undo",
      "unified_exec_zsh_fork",
      "use_agent_identity",
      "web_search_cached",
      "web_search_request",
      "workspace_dependencies"
    ],
    "enabledFeatureNames": [
      "shell_tool",
      "unified_exec",
      "default_mode_request_user_input"
    ],
    "dynamicToolsEmpty": true,
    "effectiveMcpServersDisabled": true,
    "orchestratorMcpDisabled": true,
    "orchestratorSkillsDisabled": true,
    "projectDocumentationDisabled": true,
    "selectedCapabilityRootsEmpty": true,
    "webSearchDisabled": true
  },
  "turns": {
    "readOnly": {
      "outcome": "completed",
      "attempts": 1,
      "fixtureTokenMatched": true,
      "workspaceUnchanged": true,
      "onlyExpectedMutation": true
    },
    "workspaceWrite": {
      "outcome": "completed",
      "attempts": 1,
      "fixtureTokenMatched": true,
      "workspaceUnchanged": false,
      "onlyExpectedMutation": true,
      "outputSha256": "6184ace842217b0b29307fa3afcfb4918f3ae93e0e5a8b16f7085cc37e47814c"
    }
  },
  "teardown": {
    "hostAppServerStopped": true,
    "controlRelayStopped": true,
    "containerRemoved": true,
    "volumeRemoved": true,
    "networkRemoved": true,
    "imageTagRemoved": true,
    "hostCanaryRemoved": true
  }
}
```
<!-- /setta-eval-phase0-evidence -->

## Supported boundary

- Topology: host-app-server/container-exec-server
- Host ownership: Setta probe, authenticated Codex app-server, model network, and evidence
- Container ownership: Codex exec-server, AI-controlled filesystem and process tools, and disposable workspace
- Authentication boundary: ChatGPT authentication remains in the host app-server; no credential is mounted, forwarded, or copied into the container
- Allowed control path: capability-authenticated host-loopback WebSocket relay to Docker-managed stdin/stdout for the container exec-server stdio transport; no Agent port is published

## Benign probe evidence

- Probe time: `2026-08-02T20:30:30.323619Z`
- Repository commit: `aed96923dd91054a75a8b276632ff282e53dfe6f`
- Codex version and target: `0.146.0` / `aarch64-unknown-linux-musl`
- Release Agent model and reasoning effort: `gpt-5.6-sol` / `high`
- The read-only model task observed the fixture without mutation after 1 attempt(s).
- The workspace-write model task made only the declared throwaway mutation after 1 attempt(s).
- The host canary and fake host endpoint were unreachable from the sandbox.
- Docker inspection and the boundary helper observed only allowlisted environment names; the strict remote shell policy inherited none.
- The turn config disabled every effective MCP server and external feature; only remote shell execution, internal user-input requests, and container-confined image viewing were accepted.
- The app-server, host control relay, container, volume, network, image tag, and canary were removed.
