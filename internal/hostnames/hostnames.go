package hostnames

import (
	"maps"
	"slices"
	"strings"
)

const (
	LoopbackIPv4 = "127.0.0.1"
	LoopbackName = "localhost"
	LoopbackIPv6 = "::1"
	WildcardIPv4 = "0.0.0.0"
	WildcardIPv6 = "::"
)

var loopbackHosts = []string{
	LoopbackIPv4,
	LoopbackName,
	LoopbackIPv6,
}

var sessionMatchHostRewrites = map[string]string{
	LoopbackIPv4: LoopbackIPv4,
	LoopbackName: LoopbackIPv4,
	WildcardIPv4: LoopbackIPv4,
	LoopbackIPv6: LoopbackIPv6,
	WildcardIPv6: LoopbackIPv6,
}

func LoopbackHosts() []string {
	return slices.Clone(loopbackHosts)
}

func SessionMatchHostRewrites() map[string]string {
	return maps.Clone(sessionMatchHostRewrites)
}

func NormalizeHostForLocalURL(host string) string {
	trimmed := trimHost(host)
	switch normalizeHostKey(trimmed) {
	case WildcardIPv4:
		return LoopbackIPv4
	case WildcardIPv6:
		return LoopbackIPv6
	default:
		return trimmed
	}
}

func FormatHostForURL(host string) string {
	normalized := NormalizeHostForLocalURL(host)
	if normalized == "" {
		return ""
	}
	if strings.Contains(normalized, ":") && !strings.HasPrefix(normalized, "[") {
		return "[" + normalized + "]"
	}
	return normalized
}

func CanonicalSessionMatchHost(host string) string {
	normalized := normalizeHostKey(host)
	if rewritten, ok := sessionMatchHostRewrites[normalized]; ok {
		return rewritten
	}
	return normalized
}

func IsLoopbackHost(host string) bool {
	return isLoopbackKey(normalizeHostKey(host))
}

func HostsEquivalent(left string, right string) bool {
	normalizedLeft := normalizeHostKey(left)
	normalizedRight := normalizeHostKey(right)
	return normalizedLeft == normalizedRight ||
		(isLoopbackKey(normalizedLeft) && isLoopbackKey(normalizedRight))
}

func trimHost(host string) string {
	trimmed := strings.TrimSpace(host)
	if strings.HasPrefix(trimmed, "[") && strings.HasSuffix(trimmed, "]") {
		return strings.TrimPrefix(strings.TrimSuffix(trimmed, "]"), "[")
	}
	return trimmed
}

func normalizeHostKey(host string) string {
	return strings.ToLower(trimHost(host))
}

func isLoopbackKey(host string) bool {
	switch host {
	case LoopbackIPv4, LoopbackName, LoopbackIPv6:
		return true
	default:
		return false
	}
}
