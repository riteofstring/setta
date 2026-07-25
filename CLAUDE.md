# Claude Instructions

Read and follow `AGENTS.md` in the repository root for all project guidelines and workflows.

# Implementation

Claude implements changes directly and stays responsible for the whole task:
scope it, write the code, review the diff, run the relevant tests, build, and
linters, and report the outcome accurately — including what was verified and any
remaining concerns.

Subagents are optional. Use them when they materially help, such as broad
parallel search or independent review, not as a required step for every change.
