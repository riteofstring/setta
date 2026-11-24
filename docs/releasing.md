# Publishing Setta

[Documentation](README.md) / Package maintenance

Setta publishes one public package: [`@riteofstring/setta`](https://www.npmjs.com/package/@riteofstring/setta).
Its version lives in `packages/workspace/package.json`; the private monorepo version is unrelated.

## One-time npm setup

The first version must be published by an npm organization member before npm can attach a trusted
publisher to the package. From a verified release checkout, publish the built tarball:

```sh
npm login
npm publish ./packages/workspace/setta.tgz --access public --ignore-scripts
```

In the npm package's **Settings → Trusted publishing**, select **GitHub Actions** and enter:

| Field                | Value          |
| -------------------- | -------------- |
| Organization or user | `riteofstring` |
| Repository           | `setta`        |
| Workflow filename    | `release.yml`  |
| Environment          | `npm`          |

The GitHub workflow uses the `npm` environment and OIDC; no npm token is stored in GitHub.
Protect that environment with required reviewers if publication should require a human approval.
The first manual publication has no GitHub Actions provenance; subsequent workflow publications
include provenance automatically.

## Publish a new version

1. Update `packages/workspace/package.json` and add a dated `CHANGELOG.md` entry. Use a stable
   `MAJOR.MINOR.PATCH` version. Update versioned installation examples in the two READMEs.
2. Follow [contributor setup](../CONTRIBUTING.md#source-setup), build with `pnpm build`, and commit
   the release candidate. Run the locally owned final gate, `./code-polishyw merge-gate --base origin/main`,
   before pushing. Fix failures and commit the verified candidate before continuing.
3. Push the candidate to `main` and confirm its **Setta checks** workflow passes.
4. Create an annotated tag matching the package version and push that tag. For example, when
   the next version is `0.1.1`:

   ```sh
   git tag -a v0.1.1 -m "Setta 0.1.1"
   git push origin v0.1.1
   ```

5. Watch **Publish to npm** in GitHub Actions. It validates the tag and changelog, installs the
   frozen dependencies without lifecycle scripts, builds, checks dependencies and source,
   runs component and packed-consumer tests, and publishes the verified tarball.
6. Confirm `npm view @riteofstring/setta@0.1.1 version dist.integrity` and check the npm package page.

The workflow also accepts an existing annotated tag through **Run workflow**. Use this to retry
an unpublished version after resolving an infrastructure or trusted-publisher setup failure.
Published versions are immutable: never move a release tag or overwrite a version. A code
correction requires a new patch version. The workflow currently accepts stable versions only
and publishes to npm's `latest` dist-tag.

For the first manual publication, push its annotated `v0.1.0` tag after publishing. The workflow
verifies the package, downloads the published tarball, authenticates it against npm's registry
integrity, and compares the decompressed tar archives. Gzip headers can differ between macOS
and Linux while the complete package archive remains identical. Matching archives succeed
without republishing; different archives fail and need a new version.
The same rule makes retries safe when publication succeeded but a workflow result was interrupted.
