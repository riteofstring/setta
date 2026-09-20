![Setta logo](images/setta-github-light.png#gh-light-mode-only)
![Setta logo](images/setta-github-dark.png#gh-dark-mode-only)

# Setta

**Visual tools for local Python projects, reviews, and experiments.**

Setta turns work on your computer into focused browser workspaces. Your project files and Python
environment stay local while Setta gives you a visual interface for building, exploring, reviewing,
and handing work off. The same projects are available from the command line when you want to
automate a workflow.

## Four ways to work

| App                                               | What it helps you do                                                                                     |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [Python Canvas](apps/python-canvas/README.md)     | Compose and run Python visually, with generated code and diagnostics close at hand.                      |
| [Realtime](apps/realtime/README.md)               | Build responsive local interfaces powered by ordinary Python handlers.                                   |
| [Review](apps/review/README.md)                   | Compare claims and choices against exact evidence, then record a portable decision.                      |
| [Experiment Lens](apps/experiment-lens/README.md) | Find patterns in recorded results, inspect the observations behind them, and export a precise selection. |

## One shared foundation

The four apps use the same visual workspace and local backend foundation. Each app can stay focused
on its job while navigation, project access, live updates, and local execution feel consistent.

![Setta architecture: Python Canvas, Realtime, Review, and Experiment Lens share a Workspace frontend and local backend, which work with projects and files on your computer.](./setta-architecture.svg)

## Why Setta

- **Local by design.** Work directly with your own files and Python environments; no hosted account
  is required.
- **Visual where it helps.** Move between canvases, code, evidence, plots, and artifacts without
  flattening the work into a text-only flow.
- **Ready for automation.** Use the browser for hands-on work and the command line for scripts and
  agents.
- **Portable handoffs.** Keep results, decisions, and selections in explicit project files that
  another person or tool can continue from.

## Get started

Setta requires Python 3.12 or newer.

```sh
python -m pip install setta
setta apps
```

Use an app's help command to take the next step:

```sh
setta python-canvas --help
setta realtime --help
setta review --help
setta experiment-lens --help
```

For contributor guidance, see [AGENTS.md](AGENTS.md) and the current
[design notes](docs/design/). Setta is licensed under [Apache 2.0](LICENSE).
