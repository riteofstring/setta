# chi

- Module: `github.com/go-chi/chi/v5`
- Local status: pinned in `go.mod`
- Local version: `v5.2.5`
- Retrieved: 2026-03-07
- Official package docs: https://pkg.go.dev/github.com/go-chi/chi/v5
- Official repo: https://github.com/go-chi/chi

## Why It Exists In This Rewrite

- thin HTTP route tree on top of `net/http`
- route grouping and middleware composition
- URL parameter extraction without framework-shaped handlers

## APIs We Use Now

- `chi.NewRouter`
- `Router.Route`
- `Router.Use`
- `Router.With`
- `Router.Get` / `Post`
- `chi.URLParam`
- `chi.NewRouteContext` in tests

Current repo call sites:

- `internal/httpapi/httpapi.go`
- `internal/httpapi/deployment_routes.go`
- `internal/httpapi/terminal_routes.go`
- `internal/wsapi/routes.go`

## Usage Rules For This Repo

- keep handlers in stdlib `http.Handler` / `http.HandlerFunc` form
- use chi for routing and route params, not for product semantics
- keep auth, mode policy, and runtime decisions in internal packages, not in
  clever chi middleware chains
- tests that call handlers directly must populate route context explicitly if
  they expect `chi.URLParam` to work

## Relevant Upstream Guidance

- chi is designed to stay compatible with plain `net/http`
- route groups and subrouters are the intended composition model for large APIs
- middleware remains optional and composable rather than framework-global

## Gotchas

- `chi.URLParam` reads from request route context; it will be empty in tests if
  the route context is missing
- do not turn chi middleware into a hidden stateful runtime layer
- keep route registration readable; large nested trees are still hard to reason
  about even when the library supports them
