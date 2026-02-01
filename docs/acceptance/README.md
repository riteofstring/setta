# Acceptance Specs

Acceptance specs are human-readable, frontend-focused behavior descriptions. They are the source of truth for generated Playwright acceptance tests.

## Format

- Each file lives under `docs/acceptance/specs/`.
- Use `# Feature:` and `## Scenario:` headings.
- Steps start with `Given`, `When`, `Then`, or `And`.
- Doc strings use triple quotes and must follow a step ending with `:`.

Example:

```md
# Feature: Formatter errors are visible

## Scenario: formatting invalid code shows issues
Given the app is ready
And a new project config exists
When I create a code section named "Formatter Code"
And I focus the code area for "Formatter Code"
And I set the code to:
  """
  def bad(:
    pass
  """
And I press "Alt+Shift+F"
Then I should see "Failed to run formatter."
And I open the Issues panel for "Formatter Code"
And I should see "Problems"
```

## Workflow

- Edit specs only; generated tests should not be hand-edited.
- Run `pnpm -C frontend acceptance:generate` to regenerate tests.
- Run acceptance tests via:
  - `SETTA_ACCEPTANCE=1 ./scripts/run-playwright-e2e.sh -- --grep @acceptance`
  - or `./scripts/run-acceptance-e2e.sh`

## Notes

- Acceptance tests are opt-in via `SETTA_ACCEPTANCE=1`.
- Specs are validated before acceptance runs; mismatches fail early.
