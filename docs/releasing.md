# Releasing Setta

Release the libraries as the primary product. The four local apps are bundled examples.
The website is an independent static consumer in `setta-site`; promotional sources live in
`rite-of-string-videos/setta`. The retired docs site is replaced by the guides in this repository.

## Versions and artifacts

| Distribution              | Version source                    | Release artifact                             |
| ------------------------- | --------------------------------- | -------------------------------------------- |
| npm `@riteofstring/setta` | `packages/workspace/package.json` | `riteofstring-setta-0.1.0.tgz`               |
| Go local backend          | nested Git tag                    | `packages/local-backend/v0.1.0`              |
| PyPI `setta` example apps | `pyproject.toml`                  | Five platform wheels, no source distribution |
| setta.dev                 | `setta-site` commit               | Static `dist/` directory                     |

The Python launcher needs Python 3.12+; wheels contain native servers and production browser assets.
Supported release targets are macOS 13+ arm64/amd64, manylinux 2.28 arm64/amd64, and Windows amd64.
The npm library supports React 19 and ESM package exports. Go requires 1.26.9+.

## Local verification

Follow [source setup](../CONTRIBUTING.md#source-setup). At the actual merge/release checkpoint,
run the locally owned gate against the merge target:

```sh
./code-polishyw merge-gate --base main
```

Use the gate's exact command logs for failures; do not duplicate successful gates or run unselected
supplemental suites. Dependency findings have scoped assessments in `.code-polishy.json` and
[`docs/security`](security/); review their expiration before releasing a later candidate.

Build the npm artifact and verify an unrelated consumer:

```sh
pnpm consumer:check
pnpm --dir packages/workspace pack --pack-destination ../../dist
```

The tarball contains compiled ESM, the independent browser worker entry, TypeScript declarations,
scoped styles, API guides, and licenses. It must contain no source aliases or private build setup.

Build and smoke-test the host-platform example-app wheel:

```sh
python3 packages/setta-runtime/scripts/build_setta_wheel.py
python3 packages/setta-runtime/scripts/smoke_setta_wheel.py --wheel dist/REPLACE_WITH_WHEEL.whl
```

Use `--go /absolute/path/to/go` when the pinned Go binary is not on PATH. The build prints the exact
wheel path; substitute it in the smoke command. The smoke creates a clean environment and exercises
all four packaged applications. Local success covers the current platform only.

After the maintainer pushes the candidate, `.github/workflows/setta-wheels.yml` builds and tests
all five release wheels. Download those CI artifacts and inspect their smoke results before PyPI
publication. Do not relabel a local Linux wheel as manylinux or substitute untested cross-built
binaries. Workflows build artifacts and do not publish packages.

## Maintainer-operated publication

The following are manual release operations, after local review and the platform checks. Release
preparation does not execute them.

1. Transfer the GitHub repository to `riteofstring/setta`, update its description and website,
   and push the verified local `main`. Confirm links and repository permissions after the transfer.
2. Publish the reviewed npm tarball under the `@riteofstring` scope, using an account with access:
   `npm publish dist/riteofstring-setta-0.1.0.tgz --access public`.
3. Tag the same library tree with `packages/local-backend/v0.1.0` and push that tag so the Go proxy
   can resolve the nested module. Create the main `v0.1.0` release with the changelog and artifacts.
4. Publish only the five verified wheel artifacts to PyPI. Verify ownership of the `setta` project
   and its trusted publisher or upload credentials. `uv publish` can upload the selected wheels;
   do not upload temporary development wheels or a source archive.
5. Deploy `setta-site/dist/` to Cloudflare Pages for setta.dev, following that repository's README.
   Verify both captured scenes, `.splat` import, cancellation, cut export/re-import, and PNG capture
   on the production origin. The site includes its tested compiled library artifact, so the site
   build does not depend on registry publication timing.
6. Attach the promo MP4/poster to the release or social announcement. Retire the old docs hosting
   with redirects to the repository guides where useful; the old site configuration is not in
   this checkout.

The website needs no backend credentials, Go server, Python installation, database, or Cloudflare
Worker. Package publication, GitHub pushes, DNS changes, and website deployment remain maintainer
operations.
