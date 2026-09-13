# Setta

Setta is an extensible local application platform. Its installable Python distribution provides the
`setta` umbrella command; Python Canvas is its first app. This repository also contains the
backend-free `@setta/workspace` package and its playground consumer.

`@setta/workspace` uses the exact-pinned upstream `@xyflow/react` package behind its private canvas
adapter. The repository contains no vendored XYFlow fork, and downstream applications consume only
the Workspace API.

```sh
python -m pip install setta
setta apps
setta python-canvas --help
```

Python Canvas uses `main` at `043d3b2e9` as its frozen behavior and presentation reference.

## Repository map

- Contributor workflow: [AGENTS.md](AGENTS.md)
- Current implementation rationale: [`docs/design/`](docs/design/)
- Workspace package and public API: [packages/workspace/README.md](packages/workspace/README.md)
- Python Canvas installation, browser UI, and AI-native CLI: [apps/python-canvas/README.md](apps/python-canvas/README.md)
- Accepted reference, review, and parity evidence: [`docs/evidence/`](docs/evidence/)

Implementation plans live in `docs/plans` only while they are active. Completed plans are removed
from the working tree and remain available in Git history. Evidence under `docs/evidence` is a
historical acceptance record, not current implementation guidance.
