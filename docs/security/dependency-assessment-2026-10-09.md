# Dependency assessment, 2026-10-09

Assessor: Codex. Scope: the four bundled Setta applications, their checked-in build and test
commands, `pnpm-lock.yaml`, and the five Go modules. Reassess by 2026-11-07, or immediately if the
callers described here change. These conclusions do not cover arbitrary applications embedding
Workspace or executing third-party build plugins. Advisory findings remain visible in Code Polishy.

## Go 1.26.9 security admission

All native servers move together from Go 1.26.6 to the official Go 1.26.9 patch release. The
[release announcement](https://groups.google.com/g/golang-announce/c/U2fTuyDJznI) and
[download inventory](https://go.dev/dl/?mode=json&include=all) identify the release and archive
checksums. It was released on October 8 and reaches the repository's 30-day minimum on November 7.
Each toolchain pin has an exact, expiring `security-fix` assessment; this is a release-age admission,
not a vulnerability suppression.

[GO-2026-6604](https://pkg.go.dev/vuln/GO-2026-6604) affects `projectfs.Root.EnsureDirectory`, which
calls `os.Root.MkdirAll` before inspecting the resulting directory tree. A Windows project can
contain a dangling junction at the final path component. Creating Setta state can then create a
directory outside the admitted root. This does not establish arbitrary file overwrite or code
execution, but violates the application's filesystem confinement promise. Local-only HTTP does
not prevent an author of a project directory from supplying that junction. There is no known
exploitation evidence in this review.

A preliminary `Lstat` would handle a static junction but leave a replacement race. Disabling
directory creation would break ordinary project opening and creation; implementing Windows NT
directory operations ourselves would add a second, less-tested confinement implementation. The
[upstream fix](https://go.dev/cl/847305) adds `FILE_OPEN_REPARSE_POINT` to directory creation itself,
closing the issue at the system operation. No aged fixed release exists: the advisory lists
1.26.9 and 1.27.2 as its first fixed versions. Staying on the same minor line is the smallest
supported update. Waiting another 29 days would leave newly public source builds and Windows
wheels with a known, reachable confinement defect.

[GO-2026-6609](https://pkg.go.dev/vuln/GO-2026-6609) also reaches `http.ServeContent` in `localweb`
and `artifacthttp`: a client can send many tiny byte ranges and consume excessive CPU. A bounded
Range-header filter would mitigate this issue, but would not repair Windows confinement. The
[upstream fix](https://go.dev/cl/847309) bounds range parsing while retaining ordinary downloads.
Use the corrected standard library rather than adding a temporary application filter.

The source comparison of `go1.26.8` and `go1.26.9` confirms the directory-creation flag change and
also includes an older-Windows no-follow fallback; the release contains other standard-library
security corrections. Moving from 1.26.6 additionally includes the intervening patch fixes. This
is a compiler/runtime update, not just a one-line application patch. It introduces no npm or Python
dependency and no package lifecycle script. Official archive checksums and Go's authenticated
toolchain distribution establish provenance, not the absence of a compromised release or a new
regression. Native boundary suites, production builds, and installed-wheel smoke tests bound the
regression risk; Windows and Linux execution remains owned by the existing platform CI matrix.
The known confinement failure and the lack of a safe small mitigation outweigh admitting this
fresh official patch. Remove the age assessments once the release becomes eligible.

The other October 8 Go advisories concern HTTP/2, TLS ECH, MIME multipart parsing, or CONNECT
proxying. The local server is plain HTTP/1 on IPv4 loopback and does not enable h2c or TLS. Setta
does not implement an HTTP proxy or parse multipart uploads. Updating the toolchain also removes
these standard-library findings without pretending that every reported symbol is exploitable.

## Retained npm releases

The following exact releases remain under `not-affected` assessments. Each row gives the missing
prerequisite, not merely the dependency's presence or development classification. The assessments
expire within 30 days. Prefer an aged fixed patch at the next dependency review; do not extend an
assessment without retracing its callers. Registry publication times, source changes, lock changes,
and lifecycle hooks must be reviewed before installing a replacement.

| Package and advisory                                              | Actual caller and absent prerequisite                                                                                                                                                                                                                                                                                                                                                                                   | Remediation                                                                                   |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `fast-uri@3.1.6`: GHSA-hrr3-gc8f-f4qj                             | AJV 8.20.0 uses its URI resolver to resolve checked-in schema IDs and references during validator compilation. Setta does not use the parsed host for a case-sensitive host allowlist or network authorization. Percent-encoded host case cannot bypass an authorization decision here.                                                                                                                                 | Review 3.1.8 once aged.                                                                       |
| `fast-uri@3.1.6`: GHSA-58mr-gqgx-xq4g                             | The same AJV resolver is not a request router or SSRF filter. Schema inputs are generated from repository-owned Go contracts; runtime JSON is validated by generated validators, not compiled as a caller-supplied schema.                                                                                                                                                                                              | Review 3.1.8 once aged.                                                                       |
| `fast-uri@3.1.6`: GHSA-qw65-cvwx-89v3                             | Setta does not serialize attacker-controlled URI component objects into network destinations. AJV reference resolution is the enabled caller, with no security-sensitive network sink.                                                                                                                                                                                                                                  | Review 3.1.8 once aged.                                                                       |
| `postcss-selector-parser@6.0.10` and `6.1.4`: GHSA-rj75-hqrm-r3gf | Tailwind/PostCSS processes repository-owned styles and selectors at build time. Runtime Markdown, project JSON, drawing text, and filenames are not submitted as CSS selector source to this parser. Unbounded attacker-supplied selectors cannot reach the quadratic parser path.                                                                                                                                      | Review 7.1.6 and its owning toolchain once aged.                                              |
| `source-map-js@1.2.1`: GHSA-68fv-2mgg-jv7q                        | PostCSS consumes source maps produced by the local build. Setta has no source-map upload or server-side map consumer for project artifacts. Attacker-controlled indexed-map section offsets are absent.                                                                                                                                                                                                                 | Review 1.2.2 once aged.                                                                       |
| `braces@3.0.3`: GHSA-vfj7-8cjw-p6xm                               | Build and test tools supply fixed repository-owned glob patterns. Matching a filename does not make that filename a brace pattern. Setta does not pass project input to the brace-pattern parser.                                                                                                                                                                                                                       | Review the upstream fix when available; no fixed version was listed at review time.           |
| `katex@0.16.21`: GHSA-238p-pmpm-9mq7                              | `WorkspaceMarkdown.tsx` supplies a text string to React Markdown and `rehype-katex`, without caller-supplied KaTeX options or macros. The advisory requires an already polluted object prototype or attacker-controlled option prototype; it does not itself provide prototype pollution. The four apps expose no such option or prototype-mutating input path. Markdown text alone does not satisfy that prerequisite. | Review 0.18.2 once aged; re-evaluate before adding host plugins or configurable math options. |

The primary records are the corresponding `https://osv.dev/vulnerability/GHSA-…` pages. The
checked-in assessments link each exact advisory and refer back to this application-specific record.

### Undici 7.29.0

The installed caller is jsdom 28.1.0 in component tests, reached through its default resource
dispatcher. The tests use authored fixtures, default-disabled automatic subresource loading, mocked
application clients, and no user-provided resource interceptors. XMLHttpRequest remains available
in jsdom; disabling automatic subresources alone is not a claim that all networking is disabled.
No Setta test feeds remote untrusted compressed responses into that dispatcher. jsdom's local copy
of a decompression interceptor is separate from Undici's export and would need its own review if
remote fixtures were introduced.

Fabric 7.4.0 declares optional Node dependencies, but the apps import `fabric`'s browser entry,
`dist/index.min.mjs`, not `fabric/node`. The wheel contains built browser assets, Python, and native
Go servers; it does not run a Node/jsdom server. The browser acceptance CDP client uses Node's own
WebSocket against its isolated local Chrome endpoint, not the npm Undici WebSocket export.

| Advisory            | Vulnerable feature that is not enabled in these callers                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GHSA-2gqq-gqf2-x968 | `interceptors.dump` returning a silently truncated chunked response.                                                         |
| GHSA-2jfj-6hjv-fm6j | `interceptors.cache` sharing a response containing Set-Cookie.                                                               |
| GHSA-8436-99hf-9mmv | `interceptors.cache` replaying an unsafe-method response.                                                                    |
| GHSA-3xpg-4rpp-hhhm | Undici's `interceptors.decompress` on an untrusted compressed response.                                                      |
| GHSA-pmjh-fq2x-6v4x | `RetryHandler` with an orphaned response body.                                                                               |
| GHSA-r53p-7pc4-xj5r | Retry interception plus forwarding upstream headers unchanged into a downstream HTTP response. Setta has no such Node proxy. |
| GHSA-3wwx-pv8p-q78v | Undici WebSocket with malicious permessage-deflate data.                                                                     |
| GHSA-rfgv-xxqx-mfg5 | Undici WebSocket receiving an unrequested subprotocol from a server.                                                         |
| GHSA-rx4f-c7p8-82vq | Undici WebSocketStream and abrupt remote connection close.                                                                   |
| GHSA-w293-vg96-wgc3 | BalancedPool cloning a caller's custom TLS `checkServerIdentity` callback.                                                   |

None of these APIs is selected by Setta's jsdom options or application imports. The missing APIs
and attacker-controlled inputs make these findings unreachable in the assessed commands. Review
Undici 7.29.1 once aged, preferably through its dependency owner. Reassess immediately if adding
Node-side rendering, remote resource fixtures, custom dispatchers, caching, retries, or npm Undici
WebSocket usage. A clean scanner result is not a substitute for this reachability review.

## Addendum, 2026-10-19: example applications removed

Assessor: Claude. The four example applications, the Python runtime, and their Go modules were
removed from the repository. No remaining caller gained a new path to any assessed API, so the
conclusions above still hold for the published `@riteofstring/setta` package, the
`local-backend` Go module, the Workspace Playground, and the checked-in build and test commands.
KaTeX remains reachable only through `WorkspaceMarkdown.tsx` as described. The three `fast-uri`
findings no longer apply because AJV and `fast-uri` left the dependency graph with the
applications' generated validators; their assessments were retired. Only the `local-backend`
Go toolchain admission remains.

## Addendum, 2026-10-23: supported Node and development-server advisories

Assessor: Codex. The development runtime is Node 26.10.0, published on September 21, 2026.
The [official release inventory](https://nodejs.org/dist/index.json) establishes its age; the
[Node release schedule](https://github.com/nodejs/Release/blob/main/schedule.json) keeps the Node 26
line supported through April 30, 2029. Node 25 reached end of life on June 1, 2026. The selected
release exceeds the 30-day admission minimum and needs no release-age exception. `.node-version`
owns the pin used by CI; the root engine declaration and packed-consumer template agree with it.

### Vite 6.4.3

The supported interactive development entry is `pnpm workspace:playground`, which invokes Vite
in `examples/workspace-playground`. Workspace and packed-consumer commands use Vite for builds;
browser interaction and performance harnesses use `vite preview` bound to `127.0.0.1`. Those
static previews do not install Vite's development editor middleware or import-analysis pipeline.

The resolved Vite 6.4.3 bundle installs `launchEditorMiddleware` at `/__open-in-editor` and passes
the request's `file` parameter through `path.resolve` to `launchEditor`. On Windows the latter
constructs a shell command; on WSL it can turn an absolute path into a relative editor argument.
Loopback binding alone is not a sufficient claim of non-exposure for this process-launch route.
The Playground's Vite configuration now registers an HTTP 403 handler at that path before Vite
registers its own handler, using Vite's configured URL base. Requests cannot reach filename
parsing, editor discovery, or process
creation on any supported host. The executable boundary test loads that configuration, serves
temporary HTML successfully, and verifies editor requests are rejected at both root and nested
URL bases.

| Advisory                                                                 | Reachability decision                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GHSA-587h-7wmj-h5pm](https://osv.dev/vulnerability/GHSA-587h-7wmj-h5pm) | The Windows `existsSync` bypass cannot reach the shell sink because the HTTP editor route is rejected first.                                                                                                                                                            |
| [GHSA-698v-4r3x-3vcv](https://osv.dev/vulnerability/GHSA-698v-4r3x-3vcv) | Request filenames cannot reach Windows command construction or percent-variable expansion.                                                                                                                                                                              |
| [GHSA-r825-w8mm-5pxw](https://osv.dev/vulnerability/GHSA-r825-w8mm-5pxw) | Neither the rejected route nor any direct repository caller passes attacker filenames to an editor's CLI argument parser. This includes the WSL relative-path case.                                                                                                     |
| [GHSA-9jrq-w75r-8gcw](https://osv.dev/vulnerability/GHSA-9jrq-w75r-8gcw) | The Playground uses default SPA handling and an external `/src/main.tsx` entry. There is no SSR/custom middleware caller passing an unchanged request URL to `transformIndexHtml`.                                                                                      |
| [GHSA-rq7h-c2jc-7f22](https://osv.dev/vulnerability/GHSA-rq7h-c2jc-7f22) | The authored dev command keeps Vite's default loopback listener and repository-owned `/src` imports. Explicit `--host` options belong to static previews, not dev import analysis. Setta does not admit attacker-created import paths through this development command. |

All five findings retain exact `not-affected/unreachable` assessments, including the high-severity
Windows finding. This is not acceptance of a reachable high-severity issue. It relies on the
checked-in development commands and their configuration, not the assessor's current operating
system. Reassess immediately if adding another Vite dev entry, direct editor invocation, SSR
middleware, remote dev-server exposure, or untrusted source imports.

The [npm release metadata](https://registry.npmjs.org/vite) dates Vite 6.4.4, the same-line fix for
these findings, to October 6, 2026 at 05:49 UTC. It is only 17 days old at this review. The small
route restriction removes the demonstrated editor exposure while preserving page serving,
reloads, and direct use of a desktop editor. No exception for a fresh release is justified when
that mitigation suffices and the other advisory prerequisites are absent. Review the 6.4.4 source
delta and frozen lock on November 5 after its exact publication timestamp plus 30 days, updating
all three direct Vite pins and the packed-consumer template together. These assessments expire
at the end of November 5 UTC; the expiry requires that follow-up rather than silently retaining
the old release. Registry versions remain unchanged in this assessment.

### Vitest and @vitest/mocker 4.1.11

The resolved `@vitest/mocker/dist/node.js` implements both vulnerable paths inside
`interceptorPlugin.configureServer`, which registers `vitest:interceptor:register` on Vite's
WebSocket server. A manual registration reaches generated module source; a redirect registration
can reach a file read after the Windows path-allowlist mismatch. `mockerPlugin` enables that
interceptor, but Setta installs neither public plugin. Its Vitest 4.1.11 Node runner imports
`hoistMocksPlugin` and `automockPlugin` instead. The checked-in suites use Node and jsdom; a jsdom
environment is not Vitest Browser Mode and does not register the vulnerable WebSocket handlers.
Importing the mocker module alone does not register its plugin.

Consequently [GHSA-qxg6-89mg-rqv8](https://osv.dev/vulnerability/GHSA-qxg6-89mg-rqv8) has no
attacker-controlled manual-mock URL source, and
[GHSA-xp26-3454-mjgp](https://osv.dev/vulnerability/GHSA-xp26-3454-mjgp) has no remote redirect
registration path to the file-read sink, including on Windows. Each has an exact
`not-affected/unreachable` assessment. Reassess before enabling either public mocker plugin or
changing the test-server integration.

The [mocker registry metadata](https://registry.npmjs.org/@vitest%2Fmocker) dates 4.1.12 to October
15, 2026 at 14:40 UTC; [Vitest 4.1.12](https://registry.npmjs.org/vitest) followed at 14:51 UTC.
Both remain inside the 30-day minimum. The alternative fixed 5.0.3 line was published September
30 and is also too young, besides requiring a major-version change. Retain the aged 4.1.11 graph
while these APIs are absent. Review a coordinated Vitest 4.1.12 update after November 14 at
14:51 UTC; the exact assessments expire at the end of that UTC day. This adds no release-age
admission and does not suppress the original scanner identities.
