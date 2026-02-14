# Skill Source Install Plan (Git/NPM Catalog)

## Goal

Ship a first-class "install from source" flow so users can pull skills from curated upstreams (for example OpenAI Codex skills and Vercel skills) without manual copy/paste.

## Scope

- Add install flows for:
  - Git repository URL (public first)
  - NPM package source (read-only extraction)
  - Curated source presets (OpenAI Codex skills, Vercel skills)
- Keep per-chat capability selection unchanged.
- Treat this as source ingestion and local mirroring into workspace skills.

## UX

1. Add `Install Source` modal in Project Chat `Capabilities > Skills`.
2. Source types:
   - `Git URL`
   - `NPM package`
   - `Preset catalog`
3. Show preview before install:
   - discovered skill count
   - skill ids
   - parse warnings/errors
4. User confirms install; backend writes skills under workspace-managed source path.
5. Catalog refreshes and new skills are selectable immediately.

## Backend

1. New endpoints:
   - `previewSkillSourceInstall`
   - `installSkillSource`
   - `removeInstalledSkillSource`
   - `listInstalledSkillSources`
2. Add source manifest file under `setta_files`:
   - origin (`git|npm|preset`)
   - source locator (url/package/preset id)
   - installed skill refs
   - installed at timestamp
3. Install adapters:
   - Git:
     - shallow clone to temp dir
     - scan `**/SKILL.md`
   - NPM:
     - fetch tarball
     - extract to temp dir
     - scan `**/SKILL.md`
   - Preset:
     - map preset id to canonical source locator, then reuse git/npm path
4. Validation:
   - fail on duplicate skill ref collisions unless overwrite is explicitly requested
   - surface parse errors in preview and final report
5. Security:
   - no arbitrary script execution
   - size/file-count guardrails for downloads/extracts
   - timeout and cleanup for temp dirs

## Frontend

1. Add `Installed Sources` panel in `ProjectChatCapabilities`.
2. Add install modal with:
   - source type selector
   - source input fields
   - `Preview` and `Install` actions
3. Show install report:
   - imported count
   - skipped count
   - conflicts
   - parse warnings
4. Add remove action per installed source (with confirmation), which removes mirrored local skills and refreshes catalog.

## Data Model

1. `InstalledSkillSource`:
   - `id`
   - `type`
   - `locator`
   - `label`
   - `installedSkillRefs`
   - `installedAtMs`
2. `SkillInstallPreview`:
   - candidate skills
   - conflicts
   - parse errors
3. `SkillInstallResult`:
   - installed refs
   - skipped refs
   - warnings/errors

## Testing

1. Backend tests:
   - preview/install/remove for git and npm
   - collision handling
   - parse-error reporting
   - manifest persistence
2. Frontend tests:
   - modal flows (`Preview`, `Install`, `Remove`)
   - error states
3. Playwright:
   - install from preset, enable a new skill in project chat, and verify persistence
   - remove installed source and verify unavailable-state messaging

## Rollout

1. Backend preview/install primitives + manifest.
2. Frontend install modal + installed sources list.
3. Preset catalog entries for OpenAI/Vercel.
4. Follow-up hardening (auth/private repos, caching, retries).
