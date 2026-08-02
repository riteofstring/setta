# Deployment diagnostics

The deployment monitor accepts either of these diagnostics:

- Liveness: `GET /live`, returning `{"live":true}`.
- Readiness: `GET /ready`, returning the repository's standard readiness body.

The monitor configuration deliberately does not choose between liveness and
readiness. A maintainer must make that product choice before adding the route.
