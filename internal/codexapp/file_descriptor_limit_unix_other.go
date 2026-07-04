//go:build !windows && !darwin

package codexapp

func platformFileDescriptorSoftLimit(soft uint64) uint64 {
	return soft
}
