# How this history was reconstructed

This page explains the Git reconstruction and its limits. Start with the
[visual tour](README.md) for the evolution of the product, or the
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

Use a separate checkout for exploring a tag. The revision links in these pages
target the reconstructed repository at github.com/riteofstring/setta; before
publication, the same commit IDs and tags resolve in the local candidate.

## External dependencies and preservation

A historical `.code-policy` Git submodule points to a separate tooling repository. Its pointer and `.gitmodules` declaration remain historical source evidence; that external project's history is not bundled here. No Git LFS pointers occur in the selected source history. Full footage and restored cloud environments remain in separate private preservation archives.

## Screenshots

The visual tour combines captures of restored historical builds with a current
library example. The historical applications were run separately during preservation;
importing their source into this lineage does not itself reproduce those environments.
Captions name the build being shown, not the first implementation of every visible feature.
Demonstration projects and provider substitutions are documented in the
[image provenance](images.md).

[Visual tour](README.md) · [Composition timeline](timeline.md)
