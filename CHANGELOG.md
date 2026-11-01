# Changelog

Notable changes to Setta will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases use
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Publishable `@riteofstring/setta` React library.
- Browser worker pipelines with dependent stages, bounded latest-input queuing, cancellation,
  timeout recovery, and retained successful output.
- Browser-only print studio at setta.dev, using the same public APIs as downstream consumers.
- Initial open-source project documentation and package metadata.
- Apache-2.0 attribution for Kevin Musgrave and Jeff Musgrave and bundled dependency notices.
- Source setup instructions and hosted frontend, browser, and security checks.
- Browser `localStorage` helpers that restore workspace shell pane layout and saved views.

### Changed

- Upgrade the pinned Code Polishy release to 0.29.3.
- Use the canonical `riteofstring/setta` repository path.

### Removed

- The four example applications and the `setta` Python package. The library is the product;
  setta.dev is the showcase.
