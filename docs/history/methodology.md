# How this history was reconstructed

[Documentation](../README.md) / [History](README.md)

This page explains the Git reconstruction and its limits. Start with the
[illustrated timeline](tour.md) for the evolution of the product, or the
[composition timeline](timeline.md) to locate a particular source tree.

## Reading the lineage

This is a reconstruction, not the original development graph. Original merges
are represented by changes against their first parent. `History transition:`
commits restore the source baseline before a branch detour or change of
application generation. `Recovered WIP:` identifies selected unfinished saved
work. Ordinary empty commits remain. Empty stash snapshots, already represented
stash content and generated stash artifacts are excluded with private records.

Imported human attribution uses Kevin Musgrave's and Jeff Musgrave's GitHub
noreply addresses; GitHub remains the committer where appropriate. Synthetic
reconstruction commits use **Kevin Musgrave** and his noreply address. Their
`History transition:` messages distinguish import operations from original
development work. Claude AI co-author trailers, private project references and reviewed credential
values are removed. Third-party notices and attribution are retained. Original commit
identities and signatures changed; independent private originals preserve them.

Private hosting usernames are removed from merge messages. Setta repository URLs,
module paths and related fixtures use the publication namespace. These are
publication edits; they do not establish the original hosting location or make
historical branch and CI links available in the reconstructed repository.

A component snapshot is not a claim that every adjacent component was tested
together. These landmarks identify source evidence, not public release dates.
This import does not rerun historical application environments.

## Browse locally

```sh
git tag --list 'source/*'
git tag --list 'milestone/*'
git show source/abcde-frontend:abcde-frontend/README.md
git log --all --oneline --grep='Recovered WIP:'
```

Use a separate checkout for exploring a tag. Revision links target the reconstructed repository at github.com/riteofstring/setta.

## External dependencies and preservation

A historical `.code-policy` Git submodule points to a separate tooling repository. Its pointer and `.gitmodules` declaration remain historical source evidence; that external project's history is not bundled here. No Git LFS pointers occur in the selected source history. Full footage and restored cloud environments remain in separate private preservation archives.

## Screenshots

The visual tour combines original example previews, captures of restored historical builds,
and a current library example. The historical applications were run separately during preservation;
importing their source into this lineage does not itself reproduce those environments.
Captions name the build being shown, not the first implementation of every visible feature.
Demonstration projects and provider substitutions are documented in the
[image provenance](images.md).

## The preserved retrospective film

The November 24 edit contains seventy feature shots across twelve dated chapters,
followed by a four-example gallery. The [film guide](film.md) transcribes its
on-screen captions, gives chapter times and retains the source notes. The
[webpage](https://setta.dev/history/) presents individual feature demonstrations.
The overview film, its original 1080p master and raw takes remain preserved
in the video collection; the overview is no longer included on the webpage.

The summer captures distinguish actual local-model work from prepared research
data, workflow drafts and Setta 4’s built-in demonstrations. An authored graph
does not establish automatic cartography, a validated draft does not establish
workflow execution, and a replay does not establish live agent orchestration.

Historical dependencies, builds and application execution stayed on the cloud
capture machines. Editing, frame extraction and the web encode use retained
pixels on the workstation. Cloud compute was stopped after capture while
retaining the disks, restored environments and originals.

[Illustrated timeline](tour.md) · [Composition timeline](timeline.md)

[History guide](README.md) · [All documentation](../README.md)
