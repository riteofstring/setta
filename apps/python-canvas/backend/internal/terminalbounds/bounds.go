// Package terminalbounds owns the platform-safe terminal dimensions shared by
// the transport boundary and every PTY implementation.
package terminalbounds

// MaximumDimension fits Windows ConPTY's signed COORD fields and therefore
// defines the portable upper bound for all public terminal sizes.
const MaximumDimension = 32767
