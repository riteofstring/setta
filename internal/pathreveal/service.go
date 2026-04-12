package pathreveal

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"setta/internal/appgenskills"
	"setta/internal/statefs"
)

const DefaultTimeout = 5 * time.Second

var (
	ErrWorkspaceRootRequired  = errors.New("workspace root is required")
	ErrSettaFilesRootRequired = errors.New("setta files root is required")
)

type ErrorKind string

const (
	ErrorInvalidRequest ErrorKind = "invalid_request"
	ErrorNotFound       ErrorKind = "not_found"
	ErrorUnavailable    ErrorKind = "unavailable"
	ErrorExecution      ErrorKind = "execution"
)

type Error struct {
	Kind    ErrorKind
	Message string
}

func (e *Error) Error() string {
	if e == nil {
		return "path reveal error"
	}
	return e.Message
}

type ServiceOptions struct {
	WorkspaceRoot  string
	SettaFilesRoot string
	Skills         *appgenskills.Service
	LookPath       func(string) (string, error)
	CommandContext func(context.Context, string, ...string) *exec.Cmd
	GOOS           string
	Timeout        time.Duration
}

type Service struct {
	workspaceRoot  string
	settaFilesRoot string
	skills         *appgenskills.Service
	lookPath       func(string) (string, error)
	commandContext func(context.Context, string, ...string) *exec.Cmd
	goos           string
	timeout        time.Duration
}

func NewService(opts ServiceOptions) (*Service, error) {
	workspaceRoot, err := statefs.NormalizePath(opts.WorkspaceRoot, "")
	if err != nil || strings.TrimSpace(opts.WorkspaceRoot) == "" {
		return nil, ErrWorkspaceRootRequired
	}
	settaFilesRoot, err := statefs.NormalizePath(opts.SettaFilesRoot, "")
	if err != nil || strings.TrimSpace(opts.SettaFilesRoot) == "" {
		return nil, ErrSettaFilesRootRequired
	}

	lookPath := opts.LookPath
	if lookPath == nil {
		lookPath = exec.LookPath
	}
	commandContext := opts.CommandContext
	if commandContext == nil {
		commandContext = exec.CommandContext
	}
	goos := strings.TrimSpace(opts.GOOS)
	if goos == "" {
		goos = runtime.GOOS
	}
	timeout := opts.Timeout
	if timeout <= 0 {
		timeout = DefaultTimeout
	}

	return &Service{
		workspaceRoot:  workspaceRoot,
		settaFilesRoot: settaFilesRoot,
		skills:         opts.Skills,
		lookPath:       lookPath,
		commandContext: commandContext,
		goos:           goos,
		timeout:        timeout,
	}, nil
}

func (s *Service) Reveal(ctx context.Context, rawPath string) error {
	resolvedPath, isDirectory, err := s.resolveRevealTarget(rawPath)
	if err != nil {
		return err
	}
	return s.executeRevealCommand(ctx, resolvedPath, isDirectory)
}

func (s *Service) resolveRevealTarget(rawPath string) (string, bool, error) {
	resolvedPath, err := normalizeRevealRequestPath(rawPath)
	if err != nil {
		return "", false, err
	}
	resolvedPath = resolveExistingPathPrefix(resolvedPath)

	allowedRoots, err := s.allowedRoots()
	if err != nil {
		return "", false, &Error{
			Kind:    ErrorExecution,
			Message: fmt.Sprintf("Failed to determine allowed reveal roots: %v", err),
		}
	}
	if err := validateRevealPathWithinRoots(resolvedPath, allowedRoots); err != nil {
		return "", false, err
	}

	info, err := os.Stat(resolvedPath)
	if err != nil {
		return "", false, newRevealStatError(resolvedPath, err)
	}

	resolvedPath = evaluateRevealPathSymlinks(resolvedPath)
	if err := validateRevealPathWithinRoots(resolvedPath, allowedRoots); err != nil {
		return "", false, err
	}
	return resolvedPath, info.IsDir(), nil
}

func normalizeRevealRequestPath(rawPath string) (string, error) {
	trimmedPath := strings.TrimSpace(rawPath)
	if trimmedPath == "" {
		return "", &Error{Kind: ErrorInvalidRequest, Message: "Path is required."}
	}
	resolvedPath, err := statefs.NormalizePath(trimmedPath, "")
	if err != nil {
		return "", &Error{Kind: ErrorInvalidRequest, Message: err.Error()}
	}
	return resolvedPath, nil
}

func validateRevealPathWithinRoots(path string, allowedRoots []string) error {
	if isWithinAnyRoot(path, allowedRoots) {
		return nil
	}
	return &Error{Kind: ErrorInvalidRequest, Message: "Path is outside allowed reveal roots."}
}

func newRevealStatError(path string, err error) error {
	if os.IsNotExist(err) {
		return &Error{Kind: ErrorNotFound, Message: fmt.Sprintf("Path does not exist: %s", path)}
	}
	return &Error{Kind: ErrorExecution, Message: fmt.Sprintf("Failed to inspect path: %v", err)}
}

func evaluateRevealPathSymlinks(path string) string {
	evaluatedPath, err := filepath.EvalSymlinks(path)
	if err != nil || strings.TrimSpace(evaluatedPath) == "" {
		return path
	}
	return filepath.Clean(evaluatedPath)
}

func (s *Service) executeRevealCommand(ctx context.Context, path string, isDirectory bool) error {
	command := buildRevealCommand(path, isDirectory, s.goos)
	executable, err := s.lookPath(command[0])
	if err != nil {
		return &Error{Kind: ErrorUnavailable, Message: fmt.Sprintf("File explorer command not available: %s", command[0])}
	}

	commandContext, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()
	output, runErr := s.commandContext(commandContext, executable, command[1:]...).CombinedOutput()
	if errors.Is(commandContext.Err(), context.DeadlineExceeded) {
		return &Error{
			Kind:    ErrorExecution,
			Message: fmt.Sprintf("Failed to reveal path in file explorer: %s timed out after %ds.", command[0], int(s.timeout/time.Second)),
		}
	}
	if runErr != nil {
		return newRevealCommandError(command[0], output, runErr)
	}
	return nil
}

func newRevealCommandError(command string, output []byte, runErr error) error {
	detail := strings.TrimSpace(string(output))
	var exitErr *exec.ExitError
	if detail == "" && errors.As(runErr, &exitErr) {
		detail = fmt.Sprintf("%s exited with status %d.", command, exitErr.ExitCode())
	}
	if detail != "" {
		return &Error{
			Kind:    ErrorExecution,
			Message: fmt.Sprintf("Failed to reveal path in file explorer: %s", detail),
		}
	}
	return &Error{
		Kind:    ErrorExecution,
		Message: fmt.Sprintf("Failed to launch file explorer: %v", runErr),
	}
}

func (s *Service) allowedRoots() ([]string, error) {
	roots := []string{s.workspaceRoot, s.settaFilesRoot}
	if s.skills != nil {
		skillRoots, err := s.skills.SkillRootPaths()
		if err != nil {
			return nil, err
		}
		roots = append(roots, skillRoots...)
	}
	uniqueRoots := make([]string, 0, len(roots))
	seen := map[string]struct{}{}
	for _, root := range roots {
		resolvedRoot, err := statefs.NormalizePath(root, "")
		if err != nil {
			return nil, err
		}
		if evaluatedRoot, err := filepath.EvalSymlinks(resolvedRoot); err == nil && strings.TrimSpace(evaluatedRoot) != "" {
			resolvedRoot = filepath.Clean(evaluatedRoot)
		}
		if _, ok := seen[resolvedRoot]; ok {
			continue
		}
		seen[resolvedRoot] = struct{}{}
		uniqueRoots = append(uniqueRoots, resolvedRoot)
	}
	return uniqueRoots, nil
}

func buildRevealCommand(path string, isDirectory bool, goos string) []string {
	switch goos {
	case "darwin":
		if !isDirectory {
			return []string{"open", "-R", path}
		}
		return []string{"open", path}
	case "windows":
		if !isDirectory {
			return []string{"explorer", "/select," + path}
		}
		return []string{"explorer", path}
	default:
		if isDirectory {
			return []string{"xdg-open", path}
		}
		return []string{"xdg-open", filepath.Dir(path)}
	}
}

func isWithinAnyRoot(path string, roots []string) bool {
	for _, root := range roots {
		if _, err := statefs.EnsureWithinRoot(root, path, "path"); err == nil {
			return true
		}
	}
	return false
}

func resolveExistingPathPrefix(path string) string {
	current := filepath.Clean(path)
	if current == "" {
		return current
	}

	var suffix []string
	for {
		if evaluatedPath, err := filepath.EvalSymlinks(current); err == nil && strings.TrimSpace(evaluatedPath) != "" {
			current = filepath.Clean(evaluatedPath)
			break
		}
		parent := filepath.Dir(current)
		if parent == current {
			return filepath.Clean(path)
		}
		suffix = append(suffix, filepath.Base(current))
		current = parent
	}

	for i := len(suffix) - 1; i >= 0; i-- {
		current = filepath.Join(current, suffix[i])
	}
	return filepath.Clean(current)
}
