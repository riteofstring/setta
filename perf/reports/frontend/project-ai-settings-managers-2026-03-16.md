# Project AI Settings Managers

Date: 2026-03-16

## Scenario

- URL: `http://127.0.0.1:3002/wave_tiger`
- Surface: `Project AI Chat -> Project AI Settings -> AI Settings`
- State: default-open `LLM API Keys` and `Agent Profiles` sections

## Refactor Scope

- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
  now only owns hydration plus project-scoped accordion persistence.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsSections.tsx`
  now owns accordion section routing, deployment-mode LLM gating, and the
  `PaneAccordion` shell.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsGuardrails.tsx`,
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsAgentProfiles.tsx`,
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsTranscriptionProfiles.tsx`,
  `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsPromptTemplates.tsx`,
  and `frontend/src/components/Panes/Overview/ProjectLevelAI/projectAISettingsExternalAgents.tsx`
  now own the settings manager surfaces.

## Measurements

| Metric                        | Before | After |
| ----------------------------- | -----: | ----: |
| `ProjectAISettings.tsx` lines |   1471 |    64 |
| Settings region nodes         |    162 |   162 |
| Expanded section count        |      2 |     2 |
| Visible settings region count |      2 |     2 |
| Settings region width         |    246 |   246 |
| Settings region height        |    626 |   626 |

- First expanded accordion title stayed
  `LLM API KeysManage API keys for built-in LLM engines.`
- Whole-document node count drifted across reloads, so the isolated settings
  region metrics were used as the stable comparison point.

## Result

- The front-door file dropped by 1407 lines while preserving the same default
  open sections and settings-surface layout.
- CDP inspection showed the isolated settings subtree stayed flat after the
  extraction, so the new ownership split did not add extra UI shell weight in
  the measured surface.
