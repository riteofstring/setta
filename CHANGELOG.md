# Changelog

Notable changes to Setta will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial open-source project documentation and package metadata.
- Apache-2.0 attribution for Kevin Musgrave and Jeff Musgrave and bundled dependency notices.
- Source setup instructions and hosted frontend, browser, and security checks.

### Fixed

- Keep Experiment Lens selection drafts after failed saves and offer explicit conflict recovery.
- Preserve Review feedback, claim notes, and drawing drafts across refreshes in the same tab.
- Retry initial app loads and show recoverable Python Canvas errors in the workspace.
- Skip suggestions for stale Python completion drafts without reporting a failed project edit.
- Create Realtime projects with an editable code section and a working Python entrypoint.
- Invalidate local builds after shared backend edits and support local Linux wheel builds.
- Update native builds to Go 1.26.9 for Windows directory confinement and HTTP range fixes.

### Changed

- Upgrade the pinned Code Polishy release to 0.28.2.
- Keep PyPI publication deferred while the source preview is prepared.
