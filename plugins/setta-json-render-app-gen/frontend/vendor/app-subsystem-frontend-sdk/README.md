# Vendored App-Subsystem Frontend SDK

This folder carries the packaged `@setta/app-subsystem-frontend-sdk` surface
used by standalone app-plugin frontend builds.

The canonical SDK source remains under
`frontend/plugin-sdk/app-subsystem`. The vendored `dist/` output is generated
from that source by `frontend/scripts/materialize-vendored-app-subsystem-sdk.mjs`
for repo builds and source distributions; it is not checked into git.
