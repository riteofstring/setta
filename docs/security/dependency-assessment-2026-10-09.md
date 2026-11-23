# Dependency assessment, 2026-10-09

Assessor: Codex. Retained scope: the published `@riteofstring/setta` package, the private browser
fixture, the checked-in build and test commands, and `pnpm-lock.yaml`. Dated addenda update the
initial review below; `.code-polishy.json` declares the active versions and individual expiry dates.
Reassess immediately if the callers described here change. These conclusions do not cover arbitrary applications embedding
Workspace or executing third-party build plugins. Advisory findings remain visible in Code Polishy.

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

Fabric 7.4.0 declares optional Node dependencies, but the removed apps imported `fabric`'s browser
entry, `dist/index.min.mjs`, not `fabric/node`, and did not run a Node/jsdom server.
The browser acceptance CDP client uses Node's own
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
conclusions above still hold for the published `@riteofstring/setta` package, the private browser
fixture, and the checked-in build and test commands.
KaTeX remains reachable only through `WorkspaceMarkdown.tsx` as described. The three `fast-uri`
findings no longer apply because AJV and `fast-uri` left the dependency graph with the
applications' generated validators; their assessments were retired.

## Addendum, 2026-10-23: supported Node and development-server advisories

Assessor: Codex. The development runtime is Node 26.10.0, published on September 21, 2026.
The [official release inventory](https://nodejs.org/dist/index.json) establishes its age; the
[Node release schedule](https://github.com/nodejs/Release/blob/main/schedule.json) keeps the Node 26
line supported through April 30, 2029. Node 25 reached end of life on June 1, 2026. The selected
release exceeds the 30-day admission minimum and needs no release-age exception. `.node-version`
owns the pin used by CI; the root engine declaration and packed-consumer template agree with it.

### Vite 6.4.3

The repository uses Vite for library and fixture builds and the packed-consumer template's
optional static preview. The browser interaction, performance, and packed-consumer checks share
`scripts/lib/browser-fixture.mjs`: a loopback Node HTTP server over a fixed map of compiled files.
There is no authored Vite development-server command, source-transform request path, or direct
editor launcher.

The resolved Vite 6.4.3 development server installs `launchEditorMiddleware` at
`/__open-in-editor` and passes a request's `file` parameter through `path.resolve` to
`launchEditor`. On Windows that can reach shell construction; on WSL it can become a relative
editor argument. The checked-in build commands and fixture server do not install that middleware.

| Advisory                                                                 | Reachability decision                                                                                           |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| [GHSA-587h-7wmj-h5pm](https://osv.dev/vulnerability/GHSA-587h-7wmj-h5pm) | No HTTP editor route reaches the Windows shell sink.                                                            |
| [GHSA-698v-4r3x-3vcv](https://osv.dev/vulnerability/GHSA-698v-4r3x-3vcv) | Request filenames cannot reach editor command construction or percent-variable expansion.                       |
| [GHSA-r825-w8mm-5pxw](https://osv.dev/vulnerability/GHSA-r825-w8mm-5pxw) | Neither a development route nor a direct repository caller passes filenames to an editor's CLI argument parser. |
| [GHSA-9jrq-w75r-8gcw](https://osv.dev/vulnerability/GHSA-9jrq-w75r-8gcw) | No SSR/custom middleware caller passes a request URL to `transformIndexHtml`.                                   |
| [GHSA-rq7h-c2jc-7f22](https://osv.dev/vulnerability/GHSA-rq7h-c2jc-7f22) | No development-server import analysis runs on browser requests.                                                 |

All five findings retain exact `not-affected/unreachable` assessments based on checked-in
commands and API paths across supported operating systems. Reassess before introducing a Vite
development server, direct editor invocation, SSR middleware, or untrusted source imports.

The [npm release metadata](https://registry.npmjs.org/vite) dates Vite 6.4.4, the same-line fix for
these findings, to October 6, 2026 at 05:49 UTC. It was 17 days old at the October 23 review. The
advisory prerequisites remain absent, so no early-release exception is justified. Review its source
delta and frozen lock on November 5 after the publication timestamp plus 30 days, updating both
direct Vite pins and the packed-consumer template together. These assessments expire at the end
of November 5 UTC. Registry versions remain unchanged.

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

## Addendum, 2026-10-23: withdrawn braces advisory

GitHub withdrew [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
on October 23, 2026 because it is not a practically exploitable vulnerability. The
`braces@3.0.3` assessment is retired; the dependency version remains unchanged.

## Addendum, 2026-11-04: aged patches and Undici network advisories

Assessor: Codex. The local Go backend has been removed. The retained dependency graph belongs to
the React library, its private browser fixture, and local build/test commands.

### Aged patch releases

The exact workspace overrides select `undici@7.29.1` for jsdom 28.1.0 and
`source-map-js@1.2.2` for PostCSS 8.5.23 and css-tree 3.2.1. Both satisfy their callers' existing
dependency ranges. No direct dependency, lifecycle permission, or release-age exception is added.
Revisit these overrides with their owning dependencies so they do not retain an obsolete patch.

| Package                                                               | Registry publication, UTC    | Review                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Undici 7.29.1](https://registry.npmjs.org/undici/7.29.1)             | September 4, 2026, 14:25:11  | Fixes the ten advisories in the original Undici table. The source delta corrects cache isolation, retry/body completion, decompression limits, WebSocket cleanup, and TLS callback preservation in BalancedPool; it also updates HTTP/2 bookkeeping and EventSource parsing. No dependency or lifecycle-hook changes. |
| [source-map-js 1.2.2](https://registry.npmjs.org/source-map-js/1.2.2) | September 30, 2026, 14:08:09 | Fixes GHSA-68fv-2mgg-jv7q by bounding indexed-map offsets and nested work, efficiently serializing line gaps, and stopping past exhausted source text. Also falls back to its ordinary sorter when dynamic code generation is unavailable. No dependency or lifecycle hooks.                                          |

Both packages exceed the 30-day admission minimum. Registry tarball integrity was verified before
reviewing the packaged source delta. Undici retains its existing development `prepare` command;
neither package has an install hook, and dependency installation keeps scripts disabled. The
eleven assessments for the superseded versions are retired.

### Undici 7.29.1 reachability

Undici enters the graph only through the development dependency jsdom 28.1.0, including Vitest's
jsdom peer. It is not a dependency of the published library. `packages/workspace/vite.config.ts`
selects local component suites and `vitest.setup.ts` adds DOM shims; neither supplies jsdom
resource options, custom dispatchers, TLS callbacks, cache interceptors, or remote fixtures.

Vitest's jsdom environment constructs `new JSDOM` from authored HTML with `resources` undefined.
In jsdom's `lib/api.js`, `extractResourcesOptions` selects the default dispatcher, no user
interceptors, and `loadSubresources: false`. Its per-document resource loader returns before
dispatch when subresource loading is disabled. This does not disable XMLHttpRequest or WebSocket:
the checked-in tests instantiate neither. jsdom's WebSocket implementation imports Undici, so
adding a socket test would change this conclusion.

jsdom's resource implementation uses `dispatcher.dispatch`, with its own redirect and
decompression handlers, rather than Undici's `fetch` implementation. Its copied decompression
code must be reviewed independently if remote fixtures are introduced; no untrusted compressed
response reaches it in the current suites. The repository scripts' only network client,
`scripts/lib/cdp-client.mjs`, uses Node's built-in `fetch` and `WebSocket` for the isolated Chrome
process launched by the browser fixture. Its HTTP request is to `127.0.0.1`, and Chrome supplies
the local WebSocket URL. That separate runtime client is not an npm Undici import or an
attacker-selected remote endpoint.

| Advisory                                                                 | Required input and absent path                                                                                                                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [GHSA-2m5v-pch6-74hx](https://osv.dev/vulnerability/GHSA-2m5v-pch6-74hx) | Agent/EnvHttpProxyAgent drops a function-valued `tls.checkServerIdentity` option while cloning it. No caller sets such a callback; ordinary certificate validation remains in place.       |
| [GHSA-4qv8-2p9j-2685](https://osv.dev/vulnerability/GHSA-4qv8-2p9j-2685) | A hostile SSE stream exhausts memory through retained EventSource fields/chunks. No caller constructs EventSource or supplies that stream.                                                 |
| [GHSA-4w7w-5xrc-9h26](https://osv.dev/vulnerability/GHSA-4w7w-5xrc-9h26) | Cross-origin redirect responses poison a shared cache when redirect and cache interceptors are composed. Neither that composition nor a shared cache exists here.                          |
| [GHSA-55wc-3pg8-jfw6](https://osv.dev/vulnerability/GHSA-55wc-3pg8-jfw6) | Asynchronous decompression calls a throwing downstream handler outside its error boundary. No Undici decompress/dump chain or untrusted compressed jsdom response is supplied.             |
| [GHSA-9fm3-97px-rjf6](https://osv.dev/vulnerability/GHSA-9fm3-97px-rjf6) | A WebSocket peer floods PING frames without reading automatic PONG replies. No test constructs jsdom/Undici WebSocket; the separate Node CDP client talks to its own local Chrome process. |
| [GHSA-f72v-6w45-q472](https://osv.dev/vulnerability/GHSA-f72v-6w45-q472) | Undici fetch skips mixed-case integrity algorithm tokens. No caller uses that fetch API or supplies integrity metadata.                                                                    |
| [GHSA-qrxm-fqhp-jwvm](https://osv.dev/vulnerability/GHSA-qrxm-fqhp-jwvm) | A hostile TLS 1.2 peer changes certificates during renegotiation and triggers an HTTP/1 or HTTP/2 assertion. No test makes a remote HTTPS request.                                         |
| [GHSA-xjj6-f33q-929c](https://osv.dev/vulnerability/GHSA-xjj6-f33q-929c) | Undici fetch rejects excessive content encodings before attaching a response-body error listener. No caller uses that fetch path or receives such a remote response.                       |

These eight exact findings have `not-affected/unreachable` assessments for Undici 7.29.1, owned by
Codex and expiring November 14, 2026. The conclusion depends on both the API paths and input
sources above, not merely on Undici being a development dependency. Reassess before introducing
remote fixtures, custom TLS/dispatchers, caches, network clients, or Node-side rendering.

The [Undici registry history](https://registry.npmjs.org/undici) dates the same-line fix, 7.30.1,
to October 15, 2026 at 14:18:31 UTC. It becomes eligible on November 14 at that time. The absent
attack paths do not justify admitting a younger release; review 7.30.1 and replace the exact
override when it ages. The existing Vite and Vitest assessments retain their independent review
dates above. KaTeX's fixed line and postcss-selector-parser 7 require broader version changes;
their documented input prerequisites remain absent. The parser's same-major 6.1.5 patch was
published October 19 and becomes eligible November 18.

## Addendum, 2026-11-05: Vite 6.4.4 and KaTeX removal

Assessor: Claude. KaTeX, rehype-katex and remark-math are removed from the library, so
GHSA-238p-pmpm-9mq7 no longer applies and its assessment is retired.

[Vite 6.4.4](https://registry.npmjs.org/vite/6.4.4), published October 6, 2026 at 05:49 UTC,
passed the 30-day admission minimum on November 5 and fixes the five 6.4.3 advisories above, which
are retired. The library manifest, the private packed-consumer source, and the packed-consumer
template move to it together; the lock resolves no other Vite release.

6.4.4 is itself listed by GHSA-8g5g-mxqh-grgj (medium): `server.fs.deny` can be bypassed with
`?raw`-style queries because the 6.4.4 backport omitted vitejs/vite#22160. Exposure requires a
Vite development server reachable over the network through `--host` or `server.host`. The
repository runs Vite only as `vite build`, Vitest's in-process server, which never listens on a
socket here, and the browser checks' fixed Node file server; no command starts a development
server or sets a host. The advisory's request path is therefore absent. The fix, 6.4.5, was
published October 21, 2026 at 05:35 UTC and becomes admissible on November 20; review it then. The
assessment expires November 21, 2026.

## Addendum, 2026-11-06: postcss-selector-parser review

Assessor: Claude. GHSA-rj75-hqrm-r3gf makes flat selectors such as `.a.a.a…` parse in quadratic
time, so a caller that parses attacker-supplied selectors can be held on one thread. The lock
resolves 6.1.4 through Tailwind 3.4.1's postcss-nested and 6.0.10 through
@tailwindcss/typography 0.5.9, which pins it exactly. Both run only in the library build, which
compiles `src/styles/index.css` against class names found in `./src`. All of those selectors are
repository-owned. The published package depends on neither parser, the exported Tailwind preset
runs on the consumer's own toolchain, and workspace content is never compiled as CSS. No
untrusted selector reaches the parser, so both versions remain `not-affected/unreachable`.

The same-major fix, 6.1.5, was published October 19, 2026 at 15:02 UTC and becomes admissible on
November 18. Version 7.1.6 is aged but outside the 6.x range both parents declare. When 6.1.5
ages, replace both resolutions with an exact `postcss-selector-parser` 6.1.5 override and retire
these assessments, which now expire November 19, 2026.

## Addendum, 2026-11-15: aged Undici and Vitest security fixes

Assessor: Codex. Dates in this addendum are UTC. The pre-update npm audit and OSV results identified
the same eight Undici 7.29.1 findings and two @vitest/mocker 4.1.11 findings documented above.
Their fixed releases now exceed the 30-day admission minimum. The lock replaces those vulnerable
versions, and the ten assessments for the superseded versions are retired rather than extended.

| Package                                                                                                       | Exact update     | Registry publication, UTC                   | Security changes                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Undici](https://registry.npmjs.org/undici)                                                                   | 7.29.1 to 7.30.1 | October 15, 2026, 14:18:31                  | Preserves TLS callbacks, bounds EventSource buffering, rejects cross-origin redirect cache entries, catches decompression-handler errors, applies WebSocket backpressure, normalizes integrity tokens, handles TLS renegotiation errors, and aborts excessive-content-encoding responses before creating their body. |
| [Vitest](https://registry.npmjs.org/vitest) and [@vitest/mocker](https://registry.npmjs.org/@vitest%2Fmocker) | 4.1.11 to 4.1.12 | October 15, 2026, 14:40:12 through 14:51:24 | Escapes manual-mock URLs and export names with JSON serialization and normalizes Windows backslashes before checking redirect paths against Vite's file allowlist.                                                                                                                                                   |

The Undici override remains within jsdom 28.1.0's declared `^7.21.0` range. The Vitest update
keeps its seven `@vitest/*` dependencies on the coordinated 4.1.12 release; all were published
on October 15 before Vitest itself. The mocker's existing Vite peer range remains compatible
with 6.4.4. The six other `@vitest/*` packages change only their package manifests.

Registry metadata identifies the official `nodejs/undici` and `vitest-dev/vitest` repositories.
The old and new npm tarballs were verified against registry integrity values before source
comparison. Undici adds no dependency; Vitest's dependency changes are confined to its own
release family. Neither adds an installation lifecycle hook. Undici retains its existing
development `prepare` command. Lock generation and frozen installation keep scripts disabled;
no release-age admission or new vulnerability assessment is needed.

The caller review still finds no path from untrusted input to the previously assessed APIs.
`vite.config.ts` and `vitest.setup.ts` configure authored Node/jsdom tests without resource
options, remote fixtures, custom TLS callbacks, or interceptors. jsdom disables automatic
subresource loading by default and owns its separate resource-dispatch/decompression path.
No checked-in test constructs XMLHttpRequest, EventSource, or jsdom/Undici WebSocket. The CDP
client uses Node's built-in network APIs against its own loopback Chrome process. Vitest's
Node runner installs `hoistMocksPlugin` and `automockPlugin`, not the public mocker/interceptor
plugins that accept WebSocket registrations. Reassess these boundaries if those callers change.

Undici 7.30.1 also changes retry and decompression backpressure, HTTP upgrade completion,
TLS-session caching, and cookie parsing. Its decompression interceptor changes the default
size limit from 64 MiB to unlimited unless explicitly configured. Setta does not compose that
interceptor, and jsdom's separate implementation is unchanged. These differences reinforce the
need to reassess before enabling remote resource fixtures rather than treating the version update
as authorization for new network inputs.

The three remaining assessed findings retain their existing expiry dates and remediation plans:
`postcss-selector-parser` 6.0.10 and 6.1.4 process only repository-owned CSS selectors, and Vite
6.4.4 has no network-listening development server in the checked-in commands. The
[parser 6.1.5 release](https://registry.npmjs.org/postcss-selector-parser) becomes eligible
November 18 at 15:02 UTC; [Vite 6.4.5](https://registry.npmjs.org/vite) becomes eligible
November 20 at 05:35 UTC. Their absent attacker-controlled inputs do not justify early admission
or a broader major-version change. The parser assessments expire November 19 and the Vite
assessment expires November 21.

Post-update dependency review and online supply-chain verification pass with zero open findings;
the three remaining findings are covered by the exact assessments above. Strict doctor and
changed-file checks pass, with existing file-length warnings. All 1,616 tests in 206 files pass
under Node 26.10.0 and pnpm 10.23.0 with Vitest 4.1.12 and jsdom's resolved Undici 7.30.1.

## Addendum, 2026-11-23: build-only dependency revalidation

Assessor: Codex. This review supersedes the Vite and selector-parser assessment expiries
and update plans above. The current OSV advisory records and installed package sources
were checked against the repository's enabled callers and input paths.

- [GHSA-8g5g-mxqh-grgj](https://osv.dev/vulnerability/GHSA-8g5g-mxqh-grgj), Vite 6.4.4:
  `packages/workspace/package.json` invokes `vite build`; Vitest uses an in-process
  server without a listening socket. Browser checks serve their built fixture through
  `scripts/lib/browser-fixture.mjs`, a Node file server bound to `127.0.0.1`. None exposes
  Vite's development transform middleware to incoming HTTP queries, so the `?raw`
  bypass cannot reach a denied source file. Published library artifacts contain no
  development server.
- [GHSA-rj75-hqrm-r3gf](https://osv.dev/vulnerability/GHSA-rj75-hqrm-r3gf),
  postcss-selector-parser 6.0.10 and 6.1.4: the lock resolves 6.0.10 through
  `@tailwindcss/typography` 0.5.9, whose `utils.js` calls `astSync`, and 6.1.4 through
  Tailwind 3.4.1 and `postcss-nested` 6.2.0, whose parser calls `processSync`. These
  paths reach the affected `splitWord` implementation only with repository-owned CSS
  and selectors. The Tailwind configuration reads `./src/**/*.{ts,tsx}`; the
  `itemNestedGridGeometry` test compiles the same checked-in stylesheet and source
  glob. Runtime workspace content is never passed to these build tools, and neither
  parser is a published runtime dependency. The required attacker-supplied selector
  in a synchronous request path is absent.

Vite 6.4.5 and postcss-selector-parser 6.1.5 are now aged fixed releases. The exact
existing versions remain `not-affected/unreachable`; retaining them avoids unrelated
toolchain changes while the documented prerequisites remain absent. These three
assessments expire 2026-12-07. Review the fixed releases at the next toolchain update
or expiry, and replace the assessments after upgrading. Reassess before enabling a
network-facing Vite development server or compiling untrusted runtime CSS or class
names; use an aged fixed release before introducing either path.
