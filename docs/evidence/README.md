# Historical evidence

The extraction milestones, reference screenshots, interaction traces, renderer-cutover comparisons,
and retired security assessments are preserved at
[commit c191a9bb9](https://github.com/riteofstring/setta/tree/c191a9bb9d7e43e963b54fee3c77126e4d31a442/docs/evidence).
That revision also contains the matching `scripts/xyflow-parity` capture and comparison tools and
their `scripts/lib` helpers.

Read a historical record directly from Git without restoring it to the working tree:

```sh
git show c191a9bb9d7e43e963b54fee3c77126e4d31a442:docs/evidence/xyflow-12-cutover/README.md
```

To recover the complete evidence tree for inspection:

```sh
git archive --format=tar --output=/tmp/setta-historical-evidence.tar \
  c191a9bb9d7e43e963b54fee3c77126e4d31a442 docs/evidence
```

Current implementation rationale lives in [design](../design/), active dependency assessments in
[security](../security/), and release procedures in [releasing](../releasing.md). Current package,
browser-interaction, packed-consumer, and performance checks run from the working tree; historical
captures are not inputs to those checks.
