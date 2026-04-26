# perf/artifacts/

Local-only artifacts (gitignored): DevTools traces, CPU profiles, heap snapshots, HARs, screenshots, exported logs.

Suggested layout:

- `perf/artifacts/YYYY-MM-DD_<area>_<slug>/...`

Retention:

- Keep artifacts until the associated PR is merged (or review is complete and the key numbers are captured in `perf/reports/`).
- After that, feel free to delete artifacts to reclaim disk space.
