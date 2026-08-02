# Codegen Targets

`projectConfig.codegenTargets` is an ordered list of enabled generators for a
project config. The list can be empty (settings-only configs or projects that
should skip generated code), and each entry must have a unique `language`.

## Target list rules

- Every entry is a `ProjectCodegenTarget` (a discriminated union keyed by
  `language`).
- Duplicate languages are rejected during validation and via
  `set_project_config_codegen_targets`.
- The default project config starts with a single Python target.

## Supported targets

### Python

`language`: `"python"`

- `genCodePrefix`: text prepended to generated code; defaults to `""`.
- `genCodeSuffix`: text appended after generated code; defaults to
  `state = SettaState()`.

Example config snippet:

```json
{
  "codegenTargets": [
    {
      "language": "python",
      "genCodePrefix": "import numpy as np\n",
      "genCodeSuffix": "state = SettaState()"
    }
  ]
}
```

## Generated Python layout

When the Python target is enabled, the generator builds a dependency graph and
emits a `SettaState` wrapper class. The final code written to disk is:

```
<genCodePrefix>

<generated body>

<genCodeSuffix>
```

Two blank lines separate each block. The generated body includes helper imports
when needed, followed by:

```
class SettaState:
    def __init__(state):
        state.<path> = <value>
        ...
```

## GenPythonCode section

- A singleton `GenPythonCode` section exists only when the Python target is
  enabled.
- The section stores the generated body only; prefix/suffix live on the target.
- The UI renders `prefix + separator + body + separator + suffix`, with the
  generated body read-only. Editing the prefix/suffix updates the target fields.

## Bindings and run behavior

- The generated code file is bound to
  `setta_files/code/sections/<projectName>/setta_gen.py` with write-only access.
- Disabling the Python target clears the binding, removes the GenPythonCode
  section, and clears `entryCodeBlockId` if it pointed at the generated section.
- When Python codegen is enabled, `entryCodeBlockId = null` means "run generated
  code"; selecting a manual Code section runs that section instead.
- When Python codegen is disabled, runs must target a manual Code section; an
  unset `entryCodeBlockId` triggers a backend error and the UI prompts you to
  select one.
