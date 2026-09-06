# Vitest mocker vulnerability assessment — 2026-09-09

## Scope

- Assessment source baseline: `dde52fcf35f2f9dfea918ee0f1282b5dce28a30c`
- Lockfile: `pnpm-lock.yaml`
- Lockfile SHA-256: `a3b7593c8f03a53f8b5837c5a47b51773dfb2618f7b58c65aa0e00cfc22b75e2`
- Resolved packages: `vitest@4.1.10` and `@vitest/mocker@4.1.10`
- Assessment owner: `frontend-test-tooling`
- Independent approver: `kevin`
- Review date: 2026-09-09
- Expiry: 2026-09-18

The review covered every Vitest package script and configuration, direct use of the public mocker
plugins, and the repository's separately launched Vite development and preview servers.

## Technical analysis

[GHSA-82fw-gwwq-j7x9](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9)
allows a client that can reach a Vite HMR WebSocket to register a redirect mock through the public
`mockerPlugin` or `interceptorPlugin`. The vulnerable plugin then reads the redirect target without
confining it to Vite's file-serving allowlist.

Setta invokes Vitest only through `vitest run`. Its four Vitest configurations use the Node or jsdom
environment and enable neither Browser Mode nor the Vitest API server. The normal Node runner uses
Vite in middleware mode, does not listen on a network socket without an API port, and loads the
hoist and automock transforms rather than either affected public interceptor plugin. Repository
source imports neither `mockerPlugin`, `interceptorPlugin`, nor `@vitest/mocker` directly.

The browser acceptance and performance harnesses launch the product's compiled Vite preview server,
not a Vitest server. Those processes do not load a Vitest mocker plugin and explicitly bind to
`127.0.0.1`. The Realtime and Python Canvas development-server configurations likewise load no
Vitest plugin. Consequently, no Setta process exposes the unauthenticated mock-registration event,
so an untrusted client cannot register an escaping redirect or reach the advisory's file-read sink.

## Approval record

On 2026-09-09, `kevin` instructed the repository worker to retain a dependency with a reported
security issue when the affected path is unreachable rather than admit a too-new replacement, and
to use a minimal upgrade when the issue does affect Setta. The assessment owner is
`frontend-test-tooling`, so the approver is a distinct identity. This approval covers only
GHSA-82fw-gwwq-j7x9 for `vitest@4.1.10` and `@vitest/mocker@4.1.10` in the lockfile identified above.
It does not cover another advisory, version, lockfile, server mode, or network exposure.

## Remediation plan

The first fixed 4.1.x release is Vitest 4.1.11, published on 2026-08-18. This assessment expires once
that release satisfies the repository's 30-day admission window. At that point, update all four
exact direct Vitest pins together, generate the candidate lockfile with lifecycle scripts disabled,
run dependency review, install from the frozen lockfile, and rerun the affected frontend suites.

Reassess immediately if Setta enables Vitest Browser Mode or its API server, imports either public
mocker plugin, exposes a Vitest/Vite HMR socket, or adds another server that composes
`@vitest/mocker`.
