// Package conformance runs provider-neutral lifecycle checks for Setta runtime
// adapters.
//
// A provider adapter plugs into this package by implementing
// runtimeprovider.Provider for the external lifecycle
// and runtimeprovider.WorkloadLeaseManager for the trusted in-runtime lease
// API. The adapter test supplies a disposable runtime identity, a service probe
// command that writes the configured persistent counter and heartbeat files,
// and hooks for provider-specific environment preparation, warm-idle waiting,
// restart pressure, and detached-work setup. Suite.Run then exercises the
// adapter through the same create, persistence, Service, lease, checkpoint,
// restore, and destroy assertions used by live provider lifecycle harnesses.
//
// Provider-specific semantic gaps should be recorded in the platform plan
// before a check is skipped. Skips are explicit per named check and are returned
// as typed Result values, so adapter completion can require a clean pass list
// rather than relying on one monolithic test.
package conformance
