#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./scripts/run-codex-deadcode-authority-loop.sh [options] [-- <extra codex exec args>]

Run Codex in a fresh-session loop with three strict phases:
1. run the repo dead-code report, audit the candidates, and delete confirmed dead code across Go, Python, and TypeScript
2. remove useless pass-through constant aliases that merely restate authoritative constants
3. remove unjustified duplicated logic across Go, Python, and TypeScript while keeping Go authoritative

Defaults:
- Maximum iterations: 1000
- New Codex session every iteration
- Model: `gpt-5.5`
- Reasoning effort: `xhigh`
- Yolo mode: on
- Terminal output: quiet status/progress logs only
- Progress log interval: 60 seconds
- Inactivity timeout: 1800 seconds without transcript updates
- Stop only when Codex explicitly reports audited completion of all three phases
- Require every non-stop iteration to leave a clean worktree and either advance HEAD or advance the checklist to the next phase

Options:
  --iterations N         Maximum loop iterations. Default: 1000
  --output-dir PATH      Directory for prompts, checklist, logs, and loop runs.
                         Default: mktemp dir under TMPDIR
  --state-dir PATH       Directory for checklist and loop state.
                         Default: <output-dir>/state
  --model NAME           Model override passed to codex exec.
                         Default: gpt-5.5
  --inactivity-timeout-seconds N
                         Abort and retry an iteration if Codex produces no
                         transcript output for N seconds. Default: 1800
  --progress-log-interval-seconds N
                         Print quiet-mode progress logs at most once every N
                         seconds while Codex is still running. Default: 60
  --post-commit-settle-seconds N
                         Wait N seconds after each successful iteration and
                         verify the repo is still clean before marking that
                         iteration successful. Default: 20
  --no-yolo              Disable --dangerously-bypass-approvals-and-sandbox
  --help                 Show this help text

Examples:
  ./scripts/run-codex-deadcode-authority-loop.sh
  ./scripts/run-codex-deadcode-authority-loop.sh --model gpt-5.5
  ./scripts/run-codex-deadcode-authority-loop.sh -- --config reasoning_effort=\"xhigh\"
EOF
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

iterations="1000"
output_dir=""
state_dir=""
model="gpt-5.5"
yolo_mode="1"
inactivity_timeout_seconds="1800"
progress_log_interval_seconds="60"
post_commit_settle_seconds="20"
complete_exit_code="42"
complete_stop_sentinel="CODEX_LOOP_STOP: DEADCODE_ALIAS_AUTHORITY_AUDITED_STOP"
codex_extra_args=()
default_codex_extra_args=(
  --config
  'reasoning_effort="xhigh"'
)

require_value() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "${value}" ]]; then
    echo "Missing value for ${flag}" >&2
    exit 1
  fi
}

shell_join() {
  local result=""
  local quoted=""
  for argument in "$@"; do
    printf -v quoted '%q' "${argument}"
    if [[ -n "${result}" ]]; then
      result+=" "
    fi
    result+="${quoted}"
  done
  printf '%s\n' "${result}"
}

resolve_path_without_creating() {
  local candidate="$1"
  local suffix=""

  if [[ "${candidate}" != /* ]]; then
    candidate="${PWD}/${candidate}"
  fi

  while [[ ! -e "${candidate}" ]]; do
    suffix="/$(basename "${candidate}")${suffix}"
    candidate="$(dirname "${candidate}")"
  done

  candidate="$(cd "${candidate}" && pwd)"
  printf '%s%s\n' "${candidate}" "${suffix}"
}

repo_is_clean() {
  if ! git -C "${ROOT_DIR}" diff --quiet --no-ext-diff --exit-code --; then
    return 1
  fi

  if ! git -C "${ROOT_DIR}" diff --cached --quiet --no-ext-diff --exit-code --; then
    return 1
  fi

  if git -C "${ROOT_DIR}" ls-files --others --exclude-standard | grep -q .; then
    return 1
  fi

  return 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --iterations)
      require_value "$1" "${2:-}"
      iterations="$2"
      shift 2
      ;;
    --output-dir)
      require_value "$1" "${2:-}"
      output_dir="$2"
      shift 2
      ;;
    --state-dir)
      require_value "$1" "${2:-}"
      state_dir="$2"
      shift 2
      ;;
    --model)
      require_value "$1" "${2:-}"
      model="$2"
      shift 2
      ;;
    --inactivity-timeout-seconds)
      require_value "$1" "${2:-}"
      inactivity_timeout_seconds="$2"
      shift 2
      ;;
    --progress-log-interval-seconds)
      require_value "$1" "${2:-}"
      progress_log_interval_seconds="$2"
      shift 2
      ;;
    --post-commit-settle-seconds)
      require_value "$1" "${2:-}"
      post_commit_settle_seconds="$2"
      shift 2
      ;;
    --no-yolo)
      yolo_mode="0"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      codex_extra_args=("$@")
      break
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! "${iterations}" =~ ^[0-9]+$ ]] || [[ "${iterations}" -lt 1 ]]; then
  echo "--iterations must be a positive integer" >&2
  exit 1
fi

if [[ ! "${inactivity_timeout_seconds}" =~ ^[0-9]+$ ]] || [[ "${inactivity_timeout_seconds}" -lt 1 ]]; then
  echo "--inactivity-timeout-seconds must be a positive integer" >&2
  exit 1
fi

if [[ ! "${progress_log_interval_seconds}" =~ ^[0-9]+$ ]]; then
  echo "--progress-log-interval-seconds must be a non-negative integer" >&2
  exit 1
fi

if [[ ! "${post_commit_settle_seconds}" =~ ^[0-9]+$ ]]; then
  echo "--post-commit-settle-seconds must be a non-negative integer" >&2
  exit 1
fi

if ! repo_is_clean; then
  echo "Refusing to start: repository is not clean." >&2
  exit 1
fi

if [[ -z "${output_dir}" ]]; then
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  output_dir="$(mktemp -d "${TMPDIR:-/tmp}/codex-deadcode-authority-loop.${timestamp}.XXXXXX")"
else
  output_dir="$(resolve_path_without_creating "${output_dir}")"
  if [[ "${output_dir}" == "${ROOT_DIR}" ]] || [[ "${output_dir}" == "${ROOT_DIR}/"* ]]; then
    echo "--output-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
    exit 1
  fi
  mkdir -p "${output_dir}"
fi

if [[ "${output_dir}" == "${ROOT_DIR}" ]] || [[ "${output_dir}" == "${ROOT_DIR}/"* ]]; then
  echo "--output-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
  exit 1
fi

if [[ -z "${state_dir}" ]]; then
  state_dir="${output_dir}/state"
else
  state_dir="$(resolve_path_without_creating "${state_dir}")"
  if [[ "${state_dir}" == "${ROOT_DIR}" ]] || [[ "${state_dir}" == "${ROOT_DIR}/"* ]]; then
    echo "--state-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
    exit 1
  fi
  mkdir -p "${state_dir}"
fi

if [[ "${state_dir}" == "${ROOT_DIR}" ]] || [[ "${state_dir}" == "${ROOT_DIR}/"* ]]; then
  echo "--state-dir must be outside the repository so loop artifacts do not dirty the worktree." >&2
  exit 1
fi

mkdir -p "${output_dir}" "${state_dir}"

deadcode_report_command="$(
  shell_join \
    "./scripts/deadcode/report.sh"
)"
deadcode_candidates_command="$(
  shell_join \
    "./scripts/deadcode/list_candidates.sh" \
    --limit "400"
)"
alias_candidates_command="$(
  shell_join \
    "./scripts/report_pass_through_constant_aliases.sh" \
    --limit "400"
)"
deadcode_report_file="${ROOT_DIR}/reports/deadcode/aggregate.json"
checklist_file="${state_dir}/checklist.md"
prompt_file="${state_dir}/prompt.md"
deadcode_candidates_file="${state_dir}/deadcode-candidates.txt"
deadcode_audit_file="${state_dir}/deadcode-audit.md"
alias_candidates_file="${state_dir}/alias-constant-candidates.txt"
alias_constant_audit_file="${state_dir}/alias-constant-audit.md"
duplication_audit_file="${state_dir}/duplication-audit.md"
status_file="${state_dir}/status.txt"
head_file="${state_dir}/last-observed-head.txt"

if [[ ! -f "${deadcode_audit_file}" ]]; then
  cat > "${deadcode_audit_file}" <<EOF
# Phase 1 Dead Code Audit

Keep this file compact and current-state only during Phase 1.
Overwrite stale notes instead of appending an iteration diary.

## Latest report notes
- Keep this section to at most 8 bullets about the current repo state.

## Remaining actionable deletions

## Remaining retained candidates
- Add file references plus concrete rationale for every remaining retained candidate.
EOF
fi

if [[ ! -f "${deadcode_candidates_file}" ]]; then
  cat > "${deadcode_candidates_file}" <<EOF
# Phase 1 Dead Code Candidate Summary

Refresh this file during Phase 1 with:
${deadcode_candidates_command}
EOF
fi

if [[ ! -f "${alias_constant_audit_file}" ]]; then
  cat > "${alias_constant_audit_file}" <<EOF
# Phase 2 Alias Constant Audit

Keep this file compact and current-state only during Phase 2.
Overwrite stale notes instead of appending an iteration diary.

## Remaining actionable aliases

## Remaining justified aliases
- Add file references plus concrete rationale for every remaining justified alias.
EOF
fi

if [[ ! -f "${alias_candidates_file}" ]]; then
  cat > "${alias_candidates_file}" <<EOF
# Phase 2 Alias Constant Candidate Summary

Refresh this file during Phase 2 with:
${alias_candidates_command}
EOF
fi

if [[ ! -f "${duplication_audit_file}" ]]; then
  cat > "${duplication_audit_file}" <<EOF
# Phase 3 Duplication Audit

Keep this file compact and current-state only during Phase 3.
Overwrite stale notes instead of appending an iteration diary.

## Remaining unjustified duplication

## Remaining justified duplication
- Add file references plus concrete rationale for every remaining justified case.
EOF
fi

if [[ ! -f "${checklist_file}" ]]; then
  cat > "${checklist_file}" <<EOF
# Dead Code And Authority Cleanup Checklist

Keep this file accurate while the loop runs.

Rules:
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase. Do not start a later phase early.
- If a later-phase change reopens an earlier-phase issue, change that earlier item back to \`[ ]\` and return to it immediately.
- Mark a phase item \`[x]\` only after a fresh targeted audit or report proves it is complete.
- Do not delete items.
- The latest saved Phase 1 candidate summary should live at: ${deadcode_candidates_file}
- The latest saved Phase 1 dead-code audit should live at: ${deadcode_audit_file}
- The latest saved Phase 2 alias candidate summary should live at: ${alias_candidates_file}
- The latest saved Phase 2 alias-constant audit should live at: ${alias_constant_audit_file}
- The latest saved Phase 3 duplication audit should live at: ${duplication_audit_file}

## Phase 1: Delete Dead Code
- [ ] Run \`${deadcode_report_command}\` at the start of every Phase 1 iteration.
- [ ] Refresh the Phase 1 candidate summary at ${deadcode_candidates_file} on every Phase 1 iteration.
- [ ] Update the Phase 1 dead-code audit at ${deadcode_audit_file} on every Phase 1 iteration.
- [ ] Review current Go, Python, and TypeScript candidates before deletion instead of trusting raw tool output blindly.
- [ ] When a symbol is referenced only by tests, treat dead exported visibility or a dead convenience wrapper as the likely cleanup target before assuming the covered behavior itself is dead.
- [ ] Delete every currently confirmed dead-code candidate and remove dead tests, dead files, and dead compatibility shims instead of leaving transitional stubs.
- [ ] Preserve or strengthen focused coverage when removing test-only exports or wrappers. Do not delete a test solely because its helper became file-local or non-exported unless equal-or-stronger replacement coverage lands in the same iteration.
- [ ] Record every remaining retained candidate in ${deadcode_audit_file} with file references and concrete rationale such as dynamic reachability, public/package surface, tooling-only roots, test-only roots, or a temporary override requirement.
- [ ] Mark Phase 1 complete only after a fresh report and audit find no remaining actionable dead-code deletions under the repo rules.

## Phase 2: Remove Pass-Through Constant Aliases
- [ ] Refresh the Phase 2 alias candidate summary at ${alias_candidates_file} on every Phase 2 iteration.
- [ ] Update the Phase 2 alias-constant audit at ${alias_constant_audit_file} on every Phase 2 iteration.
- [ ] Audit for useless pass-through constant aliases only after Phase 1 is complete.
- [ ] Remove aliases that merely restate another authoritative constant or variable, such as \`AUTH_COOKIE_MAX_AGE_SECONDS = go_shared_constants.AUTH_COOKIE_MAX_AGE_SECONDS\`.
- [ ] Replace call sites so they reference the authoritative symbol directly instead of wrapper aliases such as \`C.AUTH_COOKIE_MAX_AGE_SECONDS\`.
- [ ] Record every remaining justified alias in ${alias_constant_audit_file} with file references and concrete rationale.
- [ ] Mark Phase 2 complete only after ${alias_constant_audit_file} reflects the current repo state and a fresh audit finds no remaining actionable pass-through constant aliases.

## Phase 3: Remove Unjustified Cross-Language Duplication
- [ ] Update the Phase 3 duplication audit at ${duplication_audit_file} on every Phase 3 iteration.
- [ ] Audit duplicated logic across Go, Python, and TypeScript only after Phase 2 is complete and identify the highest-leverage unjustified duplication still remaining.
- [ ] Remove unjustified duplication while keeping Go as the source of truth for canonical behavior, validation, metadata, contracts, and correctness-sensitive runtime behavior.
- [ ] Regenerate any affected downstream artifacts when Go-owned contracts, frontend generation inputs, backend endpoints, or Go-owned shared types change.
- [ ] Record every remaining justified duplication in ${duplication_audit_file} with file references and concrete rationale.
- [ ] Mark Phase 3 complete only after ${duplication_audit_file} reflects the current repo state and a fresh audit finds no remaining actionable unjustified duplication under the repo rules.

## Completion
- [ ] Before every non-stop commit, run focused verification, \`./gcf.sh\`, and \`./scripts/quality/check.sh\`.
- [ ] Every non-stop iteration ends with a clean worktree and a commit whose message starts with \`codex-cleanup:\`.
EOF
fi

cat > "${prompt_file}" <<EOF
You are running inside an automated Codex loop for this repository.

Mission:
Complete these three phases in strict order:
1. run \`${deadcode_report_command}\`, audit current candidates, and delete confirmed dead code across Go, Python, and TypeScript
2. remove useless pass-through constant aliases that merely restate authoritative constants
3. remove unjustified duplicated logic across Go, Python, and TypeScript while keeping Go as the source of truth

Read first, in this order:
- ${ROOT_DIR}/AGENTS.md
- ${ROOT_DIR}/docs/notes/repo_dead_code_detection_proposal.md
- ${ROOT_DIR}/docs/reference/go-backed-python.md
- ${ROOT_DIR}/docs/reference/generation-contracts.md
- \`git log --oneline --decorate -n 8\`
- ${checklist_file}
- the current-state sections in ${deadcode_audit_file} if it exists
- ${alias_candidates_file} if it exists
- the current-state sections in ${alias_constant_audit_file} if it exists
- the current-state sections in ${duplication_audit_file} if it exists
- the most recent prior session response under \`${output_dir}/run-*/last-message.txt\`, if any exist

Phase-order rules:
- Treat the checklist at ${checklist_file} as the source of truth.
- The active phase is the earliest phase with any unchecked item.
- Work only on the active phase. Do not do Phase 2 work before Phase 1 is complete. Do not do Phase 3 work before Phase 2 is complete.
- If a later edit reopens an earlier-phase issue, set that earlier checklist item back to \`[ ]\` and return to that phase immediately.
- Start each iteration by refreshing the checklist so it matches the actual repo state before you choose the next task.
- Treat this session as standalone. Do not rely on follow-up prompts.
- For any ad hoc Python or package-inspection command, explicitly activate the repo environment first with \`source activate.sh && ...\`. Do not assume bare \`python\` is available on PATH in this loop environment.

Execution rules for every iteration:
- Start with a fresh targeted audit of the active phase.
- Pick one actionable issue or tightly-related cluster inside the active phase that you can complete confidently in this session.
- Keep checklist and audit files compact and current-state only. Overwrite stale notes instead of appending a long running diary.
- Cap \`## Latest report notes\` in each audit file to at most 8 bullets that describe the current repo state, not historical narration.
- Prefer checked-in repo scripts and current saved summaries over ad hoc report-parsing snippets when they already expose the information you need.
- Prefer deleting dead code or duplicated logic over moving it into wrappers, compatibility shims, tiny templates, or helper layers.
- If a symbol is only referenced by tests, distinguish between a dead exported visibility/wrapper surface and still-live behavior. Prefer making the helper file-local or deleting only the dead wrapper surface before deleting coverage.
- Never delete a focused test solely because the target helper became non-exported or file-local. Replace it in the same iteration with equal-or-stronger coverage through the owner API, component, runtime path, or an extracted non-exported helper module.
- If replacement coverage would be materially weaker, more brittle, or much slower in the current iteration, keep the helper/test for now, record the rationale in the audit, and choose a different candidate instead of deleting coverage.
- Do not make a large extraction mainly so tests can import internals directly. If removing one or two findings would require moving more than roughly 300 lines of production code, creating a new helper/internal module over roughly 200 lines, or broadening an internal boundary mainly for tests, treat that work as low leverage unless it also clearly improves the production ownership boundary for multiple live callers.
- Low leverage by itself is not a loop stop condition. If a fresh audit shows the current phase has no remaining actionable work under the repo rules, update the relevant audit file, mark that phase complete in the checklist, leave the repo clean, and let the next iteration continue with the next phase.
- Prefer Go-owned logic, metadata, and generation over duplicated Python or TypeScript logic.
- Regenerate affected downstream artifacts before cleanup when Go-owned contracts, shared types, backend endpoints, or frontend generation inputs change.
- Run focused verification for the behavior you changed.
- Do not use Chrome DevTools, browser MCP, or other browser-driven verification unless the active change genuinely modifies frontend runtime behavior and non-browser verification is insufficient.
- For dead-code cleanup, alias cleanup, and duplication cleanup, prefer code inspection, generation checks, focused tests, and scriptable verification over browser workflows.
- If browser verification is genuinely required, use an already-running developer-started session only. Do not spend this loop iteration starting, waiting on, or debugging browser MCP processes.
- Before every non-stop commit, run \`./gcf.sh\` and then \`./scripts/quality/check.sh\`. If either fails, fix the failure or stop without committing.
- When you launch a long-running shell command such as \`./gcf.sh\`, treat partial streamed output as still in progress. Do not inspect diffs, run follow-up commands, or commit until that command has fully exited successfully.
- Treat \`No supported files to check.\` from \`./scripts/quality/check.sh\` as acceptable only when the current git diff contains no Go, Python, or frontend source files that \`./scripts/quality/check.sh\` would normally inspect.
- If you make repo changes, end the session with a clean worktree and a commit whose message starts with \`codex-cleanup:\`.
- Do not create a commit if you made no repo changes.
- Do not ask for follow-up.

Phase 1 rules:
- At the start of every Phase 1 iteration, run:
  \`${deadcode_report_command}\`
- Refresh the saved candidate summary with:
  \`${deadcode_candidates_command} > ${deadcode_candidates_file}\`
- Read the saved report at ${deadcode_report_file} and the saved summary at ${deadcode_candidates_file} before choosing work.
- If you inspect ${deadcode_report_file} directly, use the current schema: top-level summary data is under \`.summary\` and individual findings are under \`.findings\`. Do not assume legacy keys such as \`.candidates\` or \`.items\`.
- Update ${deadcode_audit_file} during every Phase 1 iteration.
- The dead-code report is a candidate generator, not a blanket deletion order. Review candidates before deletion.
- Respect prod, tooling, test, and public/package reachability. Do not treat "not imported in this repo" as sufficient proof that something is dead.
- Treat dynamic imports, runtime loaders, documented hooks, and external plugin bundles according to ${ROOT_DIR}/docs/notes/repo_dead_code_detection_proposal.md.
- Keep generated Go files out of dead-code cleanup unless the deletion is a direct consequence of authoritative generator or contract changes.
- When a helper or method is only test-referenced, treat the exported visibility or convenience wrapper as the likely dead surface by default. Do not assume the underlying behavior or its focused tests are dead.
- Delete confirmed dead code across Go, Python, and TypeScript, including dead files, dead tests, dead declarations, dead imports, dead routes, and dead compatibility shims that no supported root needs.
- Only delete a focused test when the behavior itself is confirmed dead or redundant after replacement coverage is already in place in the same iteration.
- Treat extraction into a shared production helper as acceptable only when the extracted surface is small and production-oriented or when multiple live production callers benefit. Do not create large \`*Core\` or \`*Internal\` modules mainly to preserve direct test imports.
- Record every remaining retained candidate in ${deadcode_audit_file} with file references and concrete rationale.
- Mark Phase 1 complete only after a fresh report and audit find no remaining actionable dead-code deletions under the repo rules.

Phase 2 rules:
- Enter Phase 2 only after Phase 1 is complete in the checklist.
- Refresh the saved alias candidate summary with:
  \`${alias_candidates_command} > ${alias_candidates_file}\`
- Read the saved summary at ${alias_candidates_file} before choosing work.
- Update ${alias_constant_audit_file} during every Phase 2 iteration.
- Audit for useless pass-through constant aliases that merely restate another authoritative constant or variable.
- Especially target class-level Python \`C.*\` aliases and TypeScript exported aliases like:
  \`AUTH_COOKIE_MAX_AGE_SECONDS = go_shared_constants.AUTH_COOKIE_MAX_AGE_SECONDS\`
- When an alias is purely pass-through, delete the alias declaration entirely and update every call site to reference the authoritative symbol directly. For example, replace \`C.AUTH_COOKIE_MAX_AGE_SECONDS\` with \`go_shared_constants.AUTH_COOKIE_MAX_AGE_SECONDS\`.
- Do not keep pass-through aliases for convenience, style, or compatibility with an internal wrapper shape alone.
- If an alias must remain, there must be a concrete documented reason such as an external API surface, a package/public compatibility contract, or an unavoidable local shape constraint.
- Before marking Phase 2 complete, make sure ${alias_constant_audit_file} lists every remaining justified alias with file references and concrete rationale.
- Mark Phase 2 complete only after a fresh audit finds no remaining actionable pass-through constant aliases.

Phase 3 rules:
- Enter Phase 3 only after Phase 2 is complete in the checklist.
- Update ${duplication_audit_file} during every Phase 3 iteration.
- Audit for duplicated logic across Go, Python, and TypeScript and remove unjustified duplication.
- Go is authoritative for canonical behavior, validation, derived metadata, shared contracts, endpoint shapes, and correctness-sensitive local runtime behavior unless the repo explicitly says otherwise.
- Any remaining non-trivial Python or TypeScript duplication must have a concrete justification such as latency, offline requirements, or a platform constraint, and that reason must be documented near the implementation or in relevant design notes.
- Do not count work as progress if it merely moves duplicated downstream structure into helper calls, templates, or per-type builder functions without making Go the authoritative source.
- Prefer deleting duplicated logic over moving it into wrappers.
- Before marking Phase 3 complete, make sure ${duplication_audit_file} lists every remaining justified duplication with file references and concrete rationale.
- Mark Phase 3 complete only after a fresh audit finds no remaining actionable unjustified duplication.

If a fresh audit shows all three phases are complete under these rules, make no repo changes, leave the worktree clean, state that the stop reason is complete, and end your final response with this exact line:
  ${complete_stop_sentinel}

Completion discipline:
- Any session that does not emit the final stop sentinel must either produce a new clean commit or leave the repo unchanged while advancing the checklist and audit state needed for the next phase.
- Never end the session with uncommitted, unstaged, or untracked repo changes.
EOF

if [[ ! -f "${status_file}" ]]; then
  printf 'pending\n' > "${status_file}"
fi

if [[ ! -f "${head_file}" ]]; then
  git -C "${ROOT_DIR}" rev-parse HEAD > "${head_file}"
fi

pre_iteration_command="$(
  shell_join \
    "${ROOT_DIR}/scripts/codex-authority-cleanup-loop-check.sh" \
    --root-dir "${ROOT_DIR}" \
    --output-dir "${output_dir}" \
    --state-dir "${state_dir}" \
    --complete-exit-code "${complete_exit_code}" \
    --sentinel "${complete_stop_sentinel}" \
    --progress-file "${checklist_file}" \
    --allow-clean-failures "3"
)"

post_iteration_command="$(
  shell_join \
    "${ROOT_DIR}/scripts/codex-authority-post-iteration-clean-check.sh" \
    --root-dir "${ROOT_DIR}" \
    --settle-seconds "${post_commit_settle_seconds}"
)"

loop_args=(
  "${ROOT_DIR}/scripts/run-codex-loop.sh"
  --prompt-file "${prompt_file}"
  --followup-prompt-file "${prompt_file}"
  --iterations "${iterations}"
  --new-session-every "1"
  --output-dir "${output_dir}"
  --workdir "${ROOT_DIR}"
  --inactivity-timeout-seconds "${inactivity_timeout_seconds}"
  --watchdog-interval-seconds "30"
  --quiet
  --progress-log-interval-seconds "${progress_log_interval_seconds}"
  --continue-on-inactivity-timeout
  --pre-iteration-command "${pre_iteration_command}"
  --post-iteration-command "${post_iteration_command}"
  --stop-on-pre-iteration-exit-code "${complete_exit_code}"
  --stop-on-error
)

if [[ -n "${model}" ]]; then
  loop_args+=(--model "${model}")
fi

if [[ "${yolo_mode}" == "1" ]]; then
  loop_args+=(--yolo)
fi

combined_codex_extra_args=("${default_codex_extra_args[@]}")
if [[ ${#codex_extra_args[@]} -gt 0 ]]; then
  combined_codex_extra_args+=("${codex_extra_args[@]}")
fi

if [[ ${#combined_codex_extra_args[@]} -gt 0 ]]; then
  loop_args+=(-- "${combined_codex_extra_args[@]}")
fi

echo "Checklist: ${checklist_file}"
echo "Phase 1 candidate summary: ${deadcode_candidates_file}"
echo "Phase 1 dead-code audit file: ${deadcode_audit_file}"
echo "Phase 2 alias candidate summary: ${alias_candidates_file}"
echo "Phase 2 alias-constant audit file: ${alias_constant_audit_file}"
echo "Phase 3 duplication audit file: ${duplication_audit_file}"
echo "Dead-code report path: ${deadcode_report_file}"
echo "Loop output directory: ${output_dir}"
echo "Loop state directory: ${state_dir}"
echo "Iterations: ${iterations}"
echo "New session every: 1"
echo "Model: ${model}"
echo 'Reasoning effort: xhigh'
echo "Terminal output mode: quiet status/progress logs"
echo "Quiet progress log interval: ${progress_log_interval_seconds}s"
echo "Inactivity timeout: ${inactivity_timeout_seconds}s"
echo "Post-commit settle check: ${post_commit_settle_seconds}s"
if [[ "${yolo_mode}" == "1" ]]; then
  echo "Yolo mode: enabled"
else
  echo "Yolo mode: disabled"
fi

exec "${loop_args[@]}"
