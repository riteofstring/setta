# How this history was reconstructed

[Documentation](../README.md) / [History](README.md)

The repository brings several related projects into one browsable history.
Start with the [illustrated timeline](tour.md) for the product's evolution or the
[composition timeline](timeline.md) to locate a source tree.

## Reading the lineage

The Git lineage was reconstructed, so commit IDs and merge topology differ from
the original repositories. Original merges are represented by their changes
against the first parent.

- `History transition:` marks a source baseline change between projects or branches.
- `Recovered WIP:` marks unfinished saved work.
- Historical checkpoints identify source states, not necessarily public releases
  or combinations of components that were tested together.

## Browse locally

The [tag guide](tags.md) lists useful checkpoints and explains the `source/*` and
`milestone/*` namespaces. These can be inspected without building the applications:

```sh
git tag --list 'source/*'
git tag --list 'milestone/*'
git log --all --oneline --grep='Recovered WIP:'
```

Use a separate checkout when exploring a tag. Historical dependencies and external
services may no longer be available.

## Screenshots and demonstrations

The [visual history](https://setta.dev/) combines original previews,
captures of restored historical builds, and current library examples. A capture's
date identifies the build shown, not the first appearance of every visible feature.

Some demonstrations use prepared projects or replacement model providers.
[Image provenance](images.md) identifies their source revisions and substitutions;
the [walkthroughs](feature-demos.md) explain the actions and results. Prepared data,
workflow drafts, and built-in replays are distinguished from live execution.

[History guide](README.md) · [All documentation](../README.md)
