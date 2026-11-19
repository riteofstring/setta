# Changelog

Notable changes to Setta will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-18

### Added

- First npm release of `@riteofstring/setta`, a React workspace library.
- Tag-triggered npm publishing with GitHub Actions and npm trusted publishing.
- Visual history with original screenshots from the preserved examples collection.
- Browser worker pipelines with dependent stages, bounded latest-input queuing, cancellation,
  timeout recovery, and retained successful output.
- setta.dev showcase, built only on the same public APIs as downstream consumers.
- Initial open-source project documentation and package metadata.
- Apache-2.0 attribution for Kevin Musgrave and Jeff Musgrave and bundled dependency notices.
- Source setup instructions and hosted frontend, browser, and security checks.
- Browser `localStorage` helpers that restore workspace shell pane layout and saved views.
- Bundled CodeMirror editors and React Icons, so consumers install neither, and type
  declarations for package-exports-aware TypeScript resolution (Bundler, Node16 and NodeNext).

### Changed

- Use the canonical `riteofstring/setta` repository path.

### Removed

- Historical example applications and the `setta` Python package from the current checkout;
  their source remains in Git history. setta.dev demonstrates the current library.
- The local Go backend.
