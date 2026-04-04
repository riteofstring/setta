package settacli

import (
	"errors"
	"os"
	"strings"

	"setta/internal/sshx"
)

func addExpandedLocalHomeWorkspaceHint(err error, workspace string) error {
	hint, ok := expandedLocalHomeWorkspaceHint(workspace)
	if !ok {
		return err
	}

	var sshErr *sshx.Error
	if !errors.As(err, &sshErr) || sshErr == nil || sshErr.Code != "RemoteWorkspace" {
		return err
	}
	if strings.Contains(sshErr.Message, hint) {
		return err
	}
	return &sshx.Error{
		Code:    sshErr.Code,
		Message: sshErr.Message + " " + hint,
	}
}

func expandedLocalHomeWorkspaceHint(workspace string) (string, bool) {
	trimmedWorkspace := strings.TrimSpace(workspace)
	if trimmedWorkspace == "" || strings.HasPrefix(trimmedWorkspace, "~") {
		return "", false
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", false
	}
	normalizedHome := strings.TrimRight(homeDir, `/\`)
	if normalizedHome == "" {
		return "", false
	}
	if trimmedWorkspace != normalizedHome &&
		!strings.HasPrefix(trimmedWorkspace, normalizedHome+"/") &&
		!strings.HasPrefix(trimmedWorkspace, normalizedHome+`\`) {
		return "", false
	}
	return "This path looks like a locally expanded '~'. Pass the remote path literally with --workspace '~/...'.", true
}
