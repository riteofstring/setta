# Live AI Evaluation Sandbox Phase 0

<!-- setta-eval-phase0-evidence:v4 -->
```json
{
  "schemaVersion": 4,
  "outcome": "PASS",
  "probedAt": "2026-08-01T10:08:52.543665Z",
  "topology": {
    "name": "host-app-server/container-exec-server",
    "hostOwnership": "Setta probe, authenticated Codex app-server, model network, and evidence",
    "containerOwnership": "Codex exec-server, AI-controlled filesystem and process tools, and disposable workspace",
    "authenticationBoundary": "ChatGPT authentication remains in the host app-server; no credential is mounted, forwarded, or copied into the container",
    "controlPath": "capability-authenticated host-loopback WebSocket relay to Docker-managed stdin/stdout for the container exec-server stdio transport; no Agent port is published"
  },
  "repository": {
    "commit": "1bc05a916c456c33d8db15dea1aa35f832be7c1f",
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
    "fileSha256": {
      "Dockerfile": "cbc75f3cd78e71a3ec1360bebff9ad25bf4d0557aa855f8c20f50b58a06482dd",
      "bwrap": "c547cbdc762a70ed216789ffaa4c6c0e7d2beabe32245a498f8e365a9fc8dab4",
      "codex": "cb5e8cb8a333a408ce6adbe0d4fad1845c69772c2216af7c1f88c98a11460dc6",
      "control-relay": "d5ddd50efde04ba4b69c859bd091fc1dfa02116d87933af7a22a50406c6fa989",
      "rg": "e36d0eb52e70696bdf1781392722e05a21bb91d3b7b762ef5ec20e5df2ec687b",
      "sandbox-helper": "78b45db042c9f992625b2391e414e02b373c6ff1627f938b0d5a37eb20fd30cf",
      "zsh": "7feeacd883e1dc749847936948c378653c80a69ec4a9542f0f126b411882c179"
    },
    "imageId": "sha256:3b1e2eefc35092cad9b7e76f478e902fca6dc25fd06e9522e31f3c8225ea318a"
  },
  "boundary": {
    "containerUser": "65532:65532",
    "readOnlyRootFilesystem": true,
    "workspaceVolumeWritable": true,
    "workspaceDiskLimitBytes": 67108864,
    "rootWriteDenied": true,
    "hostCanaryVisible": false,
    "internalNetwork": true,
    "fakeHostEndpointBlocked": true,
    "controlTransport": "host-loopback-websocket/docker-attach-stdio",
    "hostControlAddress": "127.0.0.1:60541",
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
      "outputSha256": "bd84b41b07bed1e681bbc85d1f79215ccb5e048b40724dcb4d461cc332f1d10c"
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

- Probe time: `2026-08-01T10:08:52.543665Z`
- Repository commit: `1bc05a916c456c33d8db15dea1aa35f832be7c1f`
- Codex version and target: `0.146.0` / `aarch64-unknown-linux-musl`
- The read-only model task observed the fixture without mutation after 1 attempt(s).
- The workspace-write model task made only the declared throwaway mutation after 1 attempt(s).
- The host canary and fake host endpoint were unreachable from the sandbox.
- Docker inspection and the boundary helper observed only allowlisted environment names; the strict remote shell policy inherited none.
- The app-server, host control relay, container, volume, network, image tag, and canary were removed.
