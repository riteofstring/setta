# Setta prompt genericity audit

Audit the supplied Setta-owned Director, Agent, and Narrator prompt surfaces
against the complete standard evaluation scenario catalog.

This is an overfitting audit, not a writing-style review and not a behavioral
evaluation. Judge whether the prompts express reusable product principles or
encode answers, vocabulary, exceptions, and examples tailored to the known
scenario set.

Use only the supplied prompt surfaces and scenarios. Do not use tools, outside
knowledge, or assumptions about hidden source code.

Evaluate these five checks independently:

1. `no_scenario_literals`: The prompts do not copy distinctive routes, file
   names, response bodies, error wording, task nouns, or other literals from a
   scenario unless the term is an unavoidable Setta product concept used across
   the role's real contract.
2. `no_fixture_specific_rules`: The prompts do not contain rules or examples
   that only make sense for the checked-in TypeScript service, HTTP endpoint
   work, its local verification behavior, or another individual fixture.
3. `no_expected_outcome_leakage`: The prompts do not reveal which choice a
   scenario should make, which files it should change, what a verifier expects,
   or which final answer will score well.
4. `principles_cover_equivalent_cases`: Each behavioral instruction is stated
   semantically enough to apply to equivalent requests with different domains,
   wording, tools, files, and outcomes. It does not depend on keyword matching
   or a narrow exception written after one observed failure.
5. `examples_are_transferable`: Any concrete example teaches a broad principle,
   is materially distinct from the standard scenarios, and would still be
   useful if every current scenario were replaced. Prompts with no examples can
   pass this check when their rules are sufficiently clear.

Do not penalize necessary Setta concepts such as Director, Agent, Narrator,
workstream, workspace, artifact, approval, tool receipt, current turn, queued
work, or user-actionable blocker. Similarity at the capability level is also
expected: a prompt must describe ambiguity, steering, cancellation, scope, and
communication in order to implement those product behaviors. Flag coupling to
the particular scenario, not the fact that a general rule governs it.

For every failed check, provide at least one finding with an exact prompt
excerpt, the affected role and surface, the relevant scenario identifiers when
any, a concise explanation, and a generic replacement direction. Use:

- `high` when the prompt exposes a scenario answer, copies a distinctive
  scenario contract, or directly instructs the model how to pass one case.
- `medium` when a rule or example is narrowly fixture-shaped or likely to fail
  under an equivalent request with different nouns.
- `low` only for a non-blocking improvement to a check that still passes.

Return no high- or medium-severity finding for a passing check. Do not reward
vagueness: a prompt can be precise about a role invariant while remaining
generic about scenario content.
