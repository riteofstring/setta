![Setta logo](images/setta-github-light.png#gh-light-mode-only)
![Setta logo](images/setta-github-dark.png#gh-dark-mode-only)

# Setta

**Building blocks for interactive tools.**

Compose React workspaces with typed controls, nested sections, editors, graphs, saved views,
and floating windows. Run live computations in browser workers on static hosting.

[**Play the instrument →**](https://setta.dev) ·
[Frontend API](packages/workspace/README.md) ·
[Browser pipelines](packages/workspace/BROWSER.md)

[![The setta.dev ambient instrument: grouped sound modules with live displays, cables between ports, typed controls, and saved view tabs.](images/instrument.png)](https://setta.dev)

## The library

| Entry point                                                    | What it provides                                                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [`@riteofstring/setta`](packages/workspace/README.md)          | A composable React workspace: controls, sections, navigation, editors, graph presentation, and managed windows.                 |
| [`@riteofstring/setta/browser`](packages/workspace/BROWSER.md) | Worker pipelines with dependent stages, latest-input queuing, progress, cancellation, and failure recovery. No server required. |

Use them together or independently. Your application owns its data, computations, persistence,
and routes. Setta supplies the workspace and execution building blocks.

The [ambient instrument](https://setta.dev) is a native Setta workspace whose layout is the
patch. Horizontal groups chain audio, vertical groups layer it, minimizing a module bypasses it,
saved views are scenes, and cables between ports carry notes, modulation, and sends. Typed
sliders, dropdowns, switches, and code editors set each module's parameters, and custom section
bodies draw what every module does to the sound. The independent site owns its audio engine; the
library acquires no audio dependencies. Everything runs on static hosting.

## Start building

The frontend requires React 19 and an ESM bundler such as Vite:

```sh
npm install @riteofstring/setta@0.1.0 react@19.1.1 react-dom@19.1.1
```

```tsx
import {
  createWorkspaceHost,
  WorkspaceProvider,
  WorkspaceShell,
} from "@riteofstring/setta";
import "@riteofstring/setta/styles.css";
```

Follow the [frontend getting started guide](packages/workspace/README.md#getting-started) for a
complete component, or start with a [browser worker pipeline](packages/workspace/BROWSER.md).
For a checkout before registry publication, build and pack the library using the
[contributor setup](CONTRIBUTING.md#source-setup), then install the resulting local tarball.

## Development

The public ambient instrument is at [setta.dev](https://setta.dev), maintained in the separate
`setta-site` repository. Private [browser fixtures](fixtures/packed-consumer/src/main.tsx) exercise the package
with `pnpm workspace:browser:test` and `pnpm consumer:check`.

See [contributing](CONTRIBUTING.md), [support](SUPPORT.md), [security](SECURITY.md), and the
[release procedure](docs/releasing.md). Setta is alpha software; APIs may change before 1.0.
Licensed under [Apache 2.0](LICENSE), copyright Kevin Musgrave and Jeff Musgrave.
