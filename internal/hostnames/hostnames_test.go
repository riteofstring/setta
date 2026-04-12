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
