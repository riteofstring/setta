# Codegen Targets

Each project config defines `codegenTargets`, an ordered list of code generation
targets. The list can be empty for settings-only configs or other projects that
should skip generated code.

## Supported targets

- `python`
  - `genCodePrefix`: imports and helpers prepended to generated code.
  - `genCodeSuffix`: postamble appended after the generated body.

## Behavior

- When `codegenTargets` does not include `python`, generated Python code is
  skipped and no GenPythonCode section is created.
- Manual Code sections still run; you must select an entry code section when
  Python codegen is disabled.
