# Archived engineering evidence

[Documentation](../README.md) / Engineering evidence

This archive records engineering verification of the library extraction and renderer.
For the product story, start with the [history guide](../history/README.md).

The extraction milestones, reference screenshots, interaction traces, renderer-cutover comparisons,
and retired security assessments are preserved at
[commit 6a0b55005](https://github.com/riteofstring/setta/tree/6a0b550059bb6717bb605d5b88572d6ec23975af/docs/evidence).
That revision also contains the matching `scripts/xyflow-parity` capture and comparison tools and
their `scripts/lib` helpers.

Read a historical record directly from Git without restoring it to the working tree:

```sh
git show 6a0b550059bb6717bb605d5b88572d6ec23975af:docs/evidence/xyflow-12-cutover/README.md
```

To recover the complete evidence tree for inspection:

```sh
git archive --format=tar --output=/tmp/setta-historical-evidence.tar \
  6a0b550059bb6717bb605d5b88572d6ec23975af docs/evidence
```

Current implementation rationale lives in the [workspace](../design/workspace.md) and
[development tooling](../design/development-tooling.md) design notes, and active dependency assessments in
the [security assessment](../security/dependency-assessment-2026-10-09.md). Current package,
browser-interaction, packed-consumer, and performance checks run from the working tree; historical
captures are not inputs to those checks.
