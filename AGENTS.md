<!-- code-policy:managed:start -->

## Shared engineering policy

- The pinned `.code-policy` checkout owns shared enforcement. Do not edit files
  inside the submodule from this repository; update the pinned policy commit
  intentionally.
- `.code-policy.json` owns this project's modules, dependency direction,
  capabilities, project-specific commands, test suites, artifact targets, and
  temporary exceptions. Shared conditional modules detect supported language,
  framework, and dependency evidence automatically. Target configuration cannot
  weaken the pinned shared baseline.
- Never add backward compatibility, legacy support, migrations, or transitional
  code unless the user explicitly asks for it.
- Pin direct dependencies and the package manager exactly. Use frozen lockfiles
  for normal setup; refresh them only during intentional dependency updates.
- Keep one authoritative owner for each concept and generate cross-language or
  downstream contract surfaces from it. Parse external data once at a boundary
  and expose validated internal types.
- Keep delivery and external adapters thin. Domain modules must not import UI,
  HTTP, persistence, provider, or process details unless the checked-in
  architecture contract explicitly allows it.
- Declare separately owned repositories, directories, files, and services as
  external inputs. Make resolution precedence and the resolved source visible;
  validate compatibility, and never turn an unavailable integration into a
  plausible empty result.
- Validate an entire multi-resource mutation before writing and use one atomic
  or transactional boundary. Prefer explicit typed failures over silent
  fallbacks, broad catches, fake success, or keyword heuristics.
- Every module has a quick focused boundary suite. Recommended adds applicable
  quick and standard cross-module suites; full covers the complete declared
  product surface. Tests assert observable behavior and use temporary state.
- Mutation and acceptance-mutation suites are optional, separately authorized
  hardening. When declared, they must run a real pinned engine and remain
  supplemental. Checked-in Gherkin must be executable. Do not use no-op,
  pass-with-no-tests, coverage-only, or tautological tests as proof.
- Run exact suite or module tests as useful during implementation. Near task
  completion, run `./check_policy.sh test --changed`; routine focused tests do
  not need a separate permission prompt.
- Before merging, run `./check_policy.sh test-levels --base <merge-target>`.
  This read-only command renders a terminal-safe table and is always safe.
  Unless broader verification is already authorized, present exactly the
  listed recommended and full ordinary choices, including suite names and
  costs, identify the planner's suggestion, and wait before running either
  choice, `verify`, or `gate`.
- A checked-in CI or lifecycle workflow may explicitly authorize
  `./check_policy.sh merge-gate --base <trusted-base>`. This command chooses
  only between the configured recommended merge profile and the complete full
  gate; it accepts no file, module, suite, or quick-mode override. When it is
  run, reproduce the emitted `MERGE POLICY LEVEL`, `MERGE POLICY BASE`, and
  every `MERGE POLICY REASON` line verbatim in the user-facing result. Never
  hide, soften, or infer a different level from those lines.
- After the authorized ordinary set passes, request separate authorization for
  impact-relevant supplemental mutation or risk suites. `test --all`, `verify`,
  and `gate` deliberately exclude `test --supplemental`.
- Vulnerability assessments, dependency-override governance, and general policy
  exceptions are distinct. Each must be exact, visible, owned, justified, and
  expiring. Do not add broad or silent ignores.

<!-- code-policy:managed:end -->

<!-- code-policy:project:start -->

## Setta workspace package

- This repository contains the standalone `@setta/workspace` TypeScript/React package and a
  backend-free playground. It contains no application or backend implementation.
- Package source lives in `packages/workspace/`; `apps/playground/` is the consumer;
  package-focused tooling lives in `scripts/`; and accepted evidence lives in `docs/evidence/`.
- Visual and interaction milestones use developer-accepted live evidence. Baselines are regression
  locks for previously accepted behavior.
- The distribution consists of compiled ESM, TypeScript declarations, source maps, and one scoped
  stylesheet. React and React DOM are host-provided peers; consumers do not require Tailwind or
  repository-specific configuration.
- The public API excludes application and backend concepts, implementation stores, XYFlow and
  dnd-kit internals, Tailwind names, and private selectors.
- Publishing, public-repository creation, licensing, and the final package name remain undecided.

<!-- code-policy:project:end -->
