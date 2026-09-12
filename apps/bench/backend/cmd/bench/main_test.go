package main

import "testing"

func TestParseServeOptionsRequiresSupervisionAndAcceptsEphemeralPort(t *testing.T) {
	t.Parallel()
	options, err := parseServeOptions([]string{"--project-root", "/project", "--create=true", "--web-root", "/web", "--session-nonce", "nonce", "--supervised-stdin=true", "--port", "0"})
	if err != nil {
		t.Fatalf("parseServeOptions() = %v", err)
	}
	if options.projectRoot != "/project" || !options.create || options.webRoot != "/web" || options.sessionNonce != "nonce" || !options.supervisedStdin || options.port != 0 {
		t.Fatalf("options = %#v", options)
	}
	if _, err := parseServeOptions([]string{"--project-root", "/project", "--web-root", "/web", "--session-nonce", "nonce", "--port", "0"}); err == nil {
		t.Fatal("parseServeOptions() accepted an unsupervised host")
	}
}
