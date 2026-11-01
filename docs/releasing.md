# Releasing Setta

Release the `@riteofstring/setta` library.
The website is an independent static consumer in `setta-site`; promotional sources live in
`rite-of-string-videos/setta`. The retired docs site is replaced by the guides in this repository.

## Versions and artifacts

| Distribution              | Version source                    | Release artifact               |
| ------------------------- | --------------------------------- | ------------------------------ |
| npm `@riteofstring/setta` | `packages/workspace/package.json` | `riteofstring-setta-0.1.0.tgz` |
| setta.dev                 | `setta-site` commit               | Static `dist/` directory       |

The npm library supports React 19 and ESM package exports.

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

## Maintainer-operated publication

The following are manual release operations, after local review and CI. Release
preparation does not execute them.

1. Transfer the GitHub repository to `riteofstring/setta`, update its description and website,
   and push the verified local `main`. Confirm links and repository permissions after the transfer.
2. Publish the reviewed npm tarball under the `@riteofstring` scope, using an account with access:
   `npm publish dist/riteofstring-setta-0.1.0.tgz --access public`.
3. Tag the verified library tree with `v0.1.0` and create the release with the changelog and artifacts.
4. Deploy `setta-site/dist/` to Cloudflare Pages for setta.dev, following that repository's README.
   Verify object proposals and positive/negative selection prompts, cutout controls, WebGPU
   generation, model integrity and cache behavior, cancellation, field slicing, extraction controls,
   linked raw/final cameras, both captures, meta controls, animation/pause, stage bypass, `.splat` import, edited export/re-import,
   and PNG capture on the production origin. The site includes its tested compiled library
   artifact, so the site build does not depend on registry publication timing.
5. Attach the promo MP4/poster to the release or social announcement. Retire the old docs hosting
   with redirects to the repository guides where useful; the old site configuration is not in
   this checkout.

The website needs no backend credentials, application server, database, or Cloudflare
Worker. Package publication, GitHub pushes, DNS changes, and website deployment remain maintainer
operations.
