# Vendored App-Subsystem Frontend SDK

This folder carries the packaged `@setta/app-subsystem-frontend-sdk` build
surface used by standalone app-plugin frontend builds.

The canonical SDK source remains under
`frontend/plugin-sdk/app-subsystem`. This vendored copy stays limited to the
packaged build artifact so a staged copy of this plugin can build without
repo-root frontend package resolution.
