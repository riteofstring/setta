package runtimeinstall

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// MinisignVerifier verifies a signed SHA256SUMS manifest with the local
// minisign command. The install loop verifies this before any provider call.
type MinisignVerifier struct {
	Command string
}

func (verifier MinisignVerifier) VerifyReleaseSignature(
	ctx context.Context,
	request SignatureVerificationRequest,
) error {
	command := verifier.Command
	if command == "" {
		command = "minisign"
	}
	cmd := exec.CommandContext(
		ctx,
		command,
		"-Vm",
		request.ChecksumsPath,
		"-P",
		request.PublicKey,
		"-x",
		request.SignaturePath,
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return fmt.Errorf("%w: minisign verification failed: %s", ErrSignatureRejected, message)
	}
	return nil
}

var _ SignatureVerifier = MinisignVerifier{}
