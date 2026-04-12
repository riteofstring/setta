package hostnames

import "testing"

func TestLoopbackHostsClone(t *testing.T) {
	got := LoopbackHosts()
	got[0] = "mutated"
	if LoopbackHosts()[0] != LoopbackIPv4 {
		t.Fatalf("expected clone, got %#v", LoopbackHosts())
	}
}

func TestSessionMatchHostRewritesClone(t *testing.T) {
	got := SessionMatchHostRewrites()
	got[LoopbackName] = "mutated"
	if SessionMatchHostRewrites()[LoopbackName] != LoopbackIPv4 {
		t.Fatalf("expected clone, got %#v", SessionMatchHostRewrites())
	}
}

func TestNormalizeHostForLocalURL(t *testing.T) {
	testCases := []struct {
		host string
		want string
	}{
		{host: "", want: ""},
		{host: "0.0.0.0", want: LoopbackIPv4},
		{host: "::", want: LoopbackIPv6},
		{host: "[::]", want: LoopbackIPv6},
		{host: "localhost", want: "localhost"},
		{host: "2001:db8::1", want: "2001:db8::1"},
	}
	for _, testCase := range testCases {
		if got := NormalizeHostForLocalURL(testCase.host); got != testCase.want {
			t.Fatalf("NormalizeHostForLocalURL(%q) = %q, want %q", testCase.host, got, testCase.want)
		}
	}
}

func TestFormatHostForURL(t *testing.T) {
	testCases := []struct {
		host string
		want string
	}{
		{host: "0.0.0.0", want: LoopbackIPv4},
		{host: "::", want: "[::1]"},
		{host: "[::]", want: "[::1]"},
		{host: "2001:db8::1", want: "[2001:db8::1]"},
		{host: "[2001:db8::2]", want: "[2001:db8::2]"},
	}
	for _, testCase := range testCases {
		if got := FormatHostForURL(testCase.host); got != testCase.want {
			t.Fatalf("FormatHostForURL(%q) = %q, want %q", testCase.host, got, testCase.want)
		}
	}
}

func TestCanonicalSessionMatchHost(t *testing.T) {
	testCases := []struct {
		host string
		want string
	}{
		{host: "localhost", want: LoopbackIPv4},
		{host: "127.0.0.1", want: LoopbackIPv4},
		{host: "0.0.0.0", want: LoopbackIPv4},
		{host: "::", want: LoopbackIPv6},
		{host: "[::]", want: LoopbackIPv6},
		{host: "::1", want: LoopbackIPv6},
		{host: "Example.COM", want: "example.com"},
	}
	for _, testCase := range testCases {
		if got := CanonicalSessionMatchHost(testCase.host); got != testCase.want {
			t.Fatalf("CanonicalSessionMatchHost(%q) = %q, want %q", testCase.host, got, testCase.want)
		}
	}
}

func TestIsLoopbackHost(t *testing.T) {
	if !IsLoopbackHost("localhost") {
		t.Fatal("expected localhost loopback")
	}
	if !IsLoopbackHost("[::1]") {
		t.Fatal("expected bracketed ipv6 loopback")
	}
	if IsLoopbackHost("0.0.0.0") {
		t.Fatal("did not expect wildcard host to count as loopback")
	}
}

func TestHostsEquivalent(t *testing.T) {
	if !HostsEquivalent("localhost", "127.0.0.1") {
		t.Fatal("expected loopback hosts equivalent")
	}
	if !HostsEquivalent("[::1]", "localhost") {
		t.Fatal("expected bracketed ipv6 loopback equivalent")
	}
	if HostsEquivalent("0.0.0.0", "127.0.0.1") {
		t.Fatal("did not expect wildcard host equivalent")
	}
}
