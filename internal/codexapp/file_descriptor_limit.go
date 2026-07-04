package codexapp

import (
	"fmt"
	"log"
	"path/filepath"
	"strings"
)

const codexAppServerMinimumFileDescriptorLimit uint64 = 1024

type fileDescriptorLimit struct {
	Soft uint64
	Hard uint64
}

type fileDescriptorLimitOperations struct {
	get     func() (fileDescriptorLimit, error)
	setSoft func(soft uint64) error
}

type fileDescriptorLimitDiagnostic struct {
	Supported  bool
	Before     fileDescriptorLimit
	After      fileDescriptorLimit
	Minimum    uint64
	TargetSoft uint64
}

func prepareCodexAppServerLaunch(command string, args []string) error {
	if !isCodexAppServerCommand(command, args) {
		return nil
	}
	diagnostic, err := ensureCodexAppServerFileDescriptorLimit(defaultFileDescriptorLimitOperations())
	logCodexAppServerFileDescriptorDiagnostic(diagnostic, err)
	return err
}

func ensureCodexAppServerFileDescriptorLimit(ops fileDescriptorLimitOperations) (fileDescriptorLimitDiagnostic, error) {
	return ensureMinimumFileDescriptorLimit(ops, codexAppServerMinimumFileDescriptorLimit)
}

func ensureMinimumFileDescriptorLimit(ops fileDescriptorLimitOperations, minimum uint64) (fileDescriptorLimitDiagnostic, error) {
	diagnostic := fileDescriptorLimitDiagnostic{Supported: ops.get != nil && ops.setSoft != nil, Minimum: minimum}
	if !diagnostic.Supported {
		return diagnostic, nil
	}
	before, err := ops.get()
	if err != nil {
		return diagnostic, fmt.Errorf("inspect codex app-server file descriptor limit: %w", err)
	}
	diagnostic.Before = before
	diagnostic.After = before
	diagnostic.TargetSoft = before.Hard

	if err := ops.setSoft(before.Hard); err != nil {
		return diagnostic, fmt.Errorf("raise codex app-server file descriptor limit to hard limit %d: %w", before.Hard, err)
	}
	after, err := ops.get()
	if err != nil {
		return diagnostic, fmt.Errorf("verify codex app-server file descriptor limit: %w", err)
	}
	diagnostic.After = after
	if after.Soft < minimum {
		return diagnostic, fmt.Errorf(
			"Codex app-server has a low file descriptor limit: %d (minimum %d; hard limit %d)",
			after.Soft,
			minimum,
			after.Hard,
		)
	}
	return diagnostic, nil
}

func isCodexAppServerCommand(command string, args []string) bool {
	if len(args) == 0 || args[0] != "app-server" {
		return false
	}
	base := executableBase(command)
	return strings.EqualFold(base, "codex") || strings.EqualFold(base, "codex.exe")
}

func executableBase(command string) string {
	base := filepath.Base(command)
	if index := strings.LastIndex(base, `\`); index >= 0 {
		return base[index+1:]
	}
	return base
}

func logCodexAppServerFileDescriptorDiagnostic(diagnostic fileDescriptorLimitDiagnostic, err error) {
	if !diagnostic.Supported {
		log.Printf("codex app-server launch file descriptor limit: unsupported on this platform")
		return
	}
	if err != nil {
		log.Printf(
			"codex app-server launch file descriptor limit: before_soft=%d before_hard=%d target_soft=%d after_soft=%d after_hard=%d minimum=%d error=%q",
			diagnostic.Before.Soft,
			diagnostic.Before.Hard,
			diagnostic.TargetSoft,
			diagnostic.After.Soft,
			diagnostic.After.Hard,
			diagnostic.Minimum,
			err.Error(),
		)
		return
	}
	log.Printf(
		"codex app-server launch file descriptor limit: before_soft=%d before_hard=%d target_soft=%d after_soft=%d after_hard=%d minimum=%d",
		diagnostic.Before.Soft,
		diagnostic.Before.Hard,
		diagnostic.TargetSoft,
		diagnostic.After.Soft,
		diagnostic.After.Hard,
		diagnostic.Minimum,
	)
}
