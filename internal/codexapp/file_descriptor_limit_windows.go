//go:build windows

package codexapp

func defaultFileDescriptorLimitOperations() fileDescriptorLimitOperations {
	return fileDescriptorLimitOperations{}
}
