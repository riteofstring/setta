package gitread

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	statusTimeout      = 2 * time.Second
	diffTimeout        = 4 * time.Second
	pathCheckTimeout   = 1500 * time.Millisecond
	repoLookupTimeout  = 1500 * time.Millisecond
	maxStatusBytes     = 2_000_000
	maxDiffBytes       = 2_000_000
	maxCommandErrBytes = 200_000
	maxRepoLookupBytes = 4096
	maxPathCheckBytes  = 8192
	maxPathCheckStdout = 4096
	maxUntrackedRead   = maxDiffBytes
)

type DiffMode string

const (
	DiffModeUnstaged DiffMode = "unstaged"
	DiffModeStaged   DiffMode = "staged"
)

type ErrorKind string

const (
	ErrorInvalidRequest  ErrorKind = "invalid_request"
	ErrorInvalidRevision ErrorKind = "invalid_revision"
	ErrorInvalidCommit   ErrorKind = "invalid_commit"
	ErrorNotFound        ErrorKind = "not_found"
	ErrorNotGitRepo      ErrorKind = "not_git_repo"
	ErrorPathNotFile     ErrorKind = "path_not_file"
	ErrorPathForbidden   ErrorKind = "path_forbidden"
	ErrorPathNotFound    ErrorKind = "path_not_found"
	ErrorTimedOut        ErrorKind = "timed_out"
	ErrorCommandFailed   ErrorKind = "command_failed"
)

type Error struct {
	Kind    ErrorKind
	Message string
}

func (e *Error) Error() string {
	return e.Message
}

type ServiceOptions struct {
	WorkspaceRoot string
}

type Service struct {
	workspaceRoot string
	gitBinary     string
}

type RepoInfo struct {
	IsGitRepo  bool    `json:"isGitRepo"`
	RepoRoot   *string `json:"repoRoot"`
	HeadBranch *string `json:"headBranch"`
	HeadCommit *string `json:"headCommit"`
}

type StatusEntry struct {
	Path           string  `json:"path"`
	OldPath        *string `json:"oldPath"`
	IndexStatus    string  `json:"indexStatus"`
	WorktreeStatus string  `json:"worktreeStatus"`
	Kind           string  `json:"kind"`
}

type StatusResponse struct {
	Repo        RepoInfo      `json:"repo"`
	Entries     []StatusEntry `json:"entries"`
	IsTruncated bool          `json:"isTruncated"`
}

type DiffRequest struct {
	Path    string   `json:"path"`
	OldPath *string  `json:"oldPath"`
	Mode    DiffMode `json:"mode"`
}

type DiffResponse struct {
	RepoRoot    string   `json:"repoRoot"`
	Path        string   `json:"path"`
	Mode        DiffMode `json:"mode"`
	Diff        string   `json:"diff"`
	IsTruncated bool     `json:"isTruncated"`
}

type commandResult struct {
	returnCode      int
	stdout          string
	stderr          string
	stdoutTruncated bool
	stderrTruncated bool
	timedOut        bool
}

func NewService(options ServiceOptions) (*Service, error) {
	workspaceRoot := strings.TrimSpace(options.WorkspaceRoot)
	if workspaceRoot == "" {
		return nil, fmt.Errorf("workspace root is required")
	}
	gitBinary, _ := exec.LookPath("git")
	return &Service{
		workspaceRoot: workspaceRoot,
		gitBinary:     gitBinary,
	}, nil
}

func (s *Service) Status(ctx context.Context) (StatusResponse, error) {
	repoRoot, ok := s.repoRootOrNone(ctx)
	if !ok {
		return StatusResponse{
			Repo: RepoInfo{
				IsGitRepo:  false,
				RepoRoot:   nil,
				HeadBranch: nil,
				HeadCommit: nil,
			},
			Entries:     []StatusEntry{},
			IsTruncated: false,
		}, nil
	}

	result, err := s.runGit(
		ctx,
		repoRoot,
		[]string{"status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"},
		statusTimeout,
		maxStatusBytes,
		maxCommandErrBytes,
	)
	if err != nil {
		return StatusResponse{}, err
	}
	if result.timedOut {
		return StatusResponse{}, &Error{Kind: ErrorTimedOut, Message: "Timed out running git status."}
	}
	if result.returnCode != 0 && !result.stdoutTruncated {
		return StatusResponse{}, &Error{
			Kind:    ErrorCommandFailed,
			Message: fmt.Sprintf("git status failed: %s", commandErrorText(result.stderr)),
		}
	}

	statusOutput := result.stdout
	if result.stdoutTruncated || (statusOutput != "" && !strings.HasSuffix(statusOutput, "\x00")) {
		statusOutput = trimToLastCompleteNULRecord(statusOutput)
	}
	headBranch := optionalString(parsePorcelainHeadBranch(statusOutput))
	headCommit := optionalString(parsePorcelainHeadCommit(statusOutput))

	return StatusResponse{
		Repo: RepoInfo{
			IsGitRepo:  true,
			RepoRoot:   &repoRoot,
			HeadBranch: headBranch,
			HeadCommit: headCommit,
		},
		Entries:     parsePorcelainStatus(statusOutput),
		IsTruncated: result.stdoutTruncated,
	}, nil
}

func (s *Service) Diff(ctx context.Context, request DiffRequest) (DiffResponse, error) {
	if request.Mode != DiffModeUnstaged && request.Mode != DiffModeStaged {
		return DiffResponse{}, &Error{Kind: ErrorInvalidRequest, Message: "Invalid diff mode."}
	}

	repoRoot, ok := s.repoRootOrNone(ctx)
	if !ok {
		return DiffResponse{}, &Error{Kind: ErrorNotGitRepo, Message: "Current workspace is not a git repository."}
	}

	relPath, err := normalizeRepoRelativePath(request.Path)
	if err != nil {
		return DiffResponse{}, err
	}
	if err := s.assertSingleFilePathspec(ctx, repoRoot, request.Path, relPath, ""); err != nil {
		return DiffResponse{}, err
	}

	var relOldPath string
	if request.OldPath != nil {
		relOldPath, err = normalizeRepoRelativePath(*request.OldPath)
		if err != nil {
			return DiffResponse{}, err
		}
		if err := s.assertSingleFilePathspec(ctx, repoRoot, *request.OldPath, relOldPath, ""); err != nil {
			return DiffResponse{}, err
		}
	}

	diffPaths := []string{relPath}
	if relOldPath != "" && relOldPath != relPath {
		diffPaths = []string{relOldPath, relPath}
	}

	args := []string{
		"--literal-pathspecs",
		"diff",
		"--no-color",
		"--patch",
		"--find-renames",
		"--no-ext-diff",
		"--no-textconv",
	}
	if request.Mode == DiffModeStaged {
		args = append(args, "--cached")
	}
	args = append(args, "--")
	args = append(args, diffPaths...)

	result, err := s.runGit(ctx, repoRoot, args, diffTimeout, maxDiffBytes, maxCommandErrBytes)
	if err != nil {
		return DiffResponse{}, err
	}
	if result.timedOut {
		return DiffResponse{}, &Error{Kind: ErrorTimedOut, Message: "Timed out running git diff."}
	}
	if result.returnCode != 0 && result.returnCode != 1 && !result.stdoutTruncated {
		return DiffResponse{}, &Error{
			Kind:    ErrorCommandFailed,
			Message: fmt.Sprintf("git diff failed: %s", commandErrorText(result.stderr)),
		}
	}

	diffText := result.stdout
	isTruncated := result.stdoutTruncated
	if request.Mode == DiffModeUnstaged && strings.TrimSpace(diffText) == "" {
		isUntracked, err := s.isUntrackedPath(ctx, repoRoot, relPath)
		if err != nil {
			return DiffResponse{}, err
		}
		if isUntracked {
			absPath, err := resolvePathForUntrackedSynth(repoRoot, relPath)
			if err != nil {
				return DiffResponse{}, err
			}
			diffText, isTruncated, err = synthesizeUntrackedDiff(relPath, absPath, isTruncated)
			if err != nil {
				return DiffResponse{}, err
			}
		}
	}

	return DiffResponse{
		RepoRoot:    repoRoot,
		Path:        relPath,
		Mode:        request.Mode,
		Diff:        diffText,
		IsTruncated: isTruncated,
	}, nil
}

func (s *Service) repoRootOrNone(ctx context.Context) (string, bool) {
	if s.gitBinary == "" {
		return "", false
	}
	info, err := os.Stat(s.workspaceRoot)
	if err != nil || !info.IsDir() {
		return "", false
	}

	result, err := s.runGit(
		ctx,
		s.workspaceRoot,
		[]string{"-C", s.workspaceRoot, "rev-parse", "--show-toplevel"},
		repoLookupTimeout,
		maxRepoLookupBytes,
		maxRepoLookupBytes,
	)
	if err != nil || result.timedOut || result.returnCode != 0 {
		return "", false
	}

	rawRoot := strings.TrimSpace(result.stdout)
	if rawRoot == "" {
		return "", false
	}
	if !filepath.IsAbs(rawRoot) {
		rawRoot = filepath.Join(s.workspaceRoot, rawRoot)
	}
	return filepath.Clean(rawRoot), true
}

func (s *Service) isUntrackedPath(ctx context.Context, repoRoot string, relPath string) (bool, error) {
	result, err := s.runGit(
		ctx,
		repoRoot,
		[]string{"--literal-pathspecs", "ls-files", "--others", "--exclude-standard", "--", relPath},
		pathCheckTimeout,
		maxPathCheckBytes,
		maxPathCheckBytes,
	)
	if err != nil {
		return false, err
	}
	if result.returnCode != 0 {
		return false, nil
	}
	return strings.TrimSpace(result.stdout) != "", nil
}

func (s *Service) assertSingleFilePathspec(ctx context.Context, repoRoot string, rawPath string, relPath string, commitish string) error {
	if relPath == "." || strings.HasSuffix(rawPath, "/") || strings.HasSuffix(rawPath, "\\") {
		return &Error{Kind: ErrorPathNotFile, Message: "Path must point to a file."}
	}
	if commitish != "" {
		isDirectory, err := s.gitPathspecIsDirectory(ctx, repoRoot, relPath, commitish)
		if err != nil {
			return err
		}
		if isDirectory {
			return &Error{Kind: ErrorPathNotFile, Message: "Path must point to a file."}
		}
		return nil
	}

	candidateAbs := filepath.Join(repoRoot, filepath.FromSlash(relPath))
	if info, err := os.Stat(candidateAbs); err == nil && info.IsDir() {
		return &Error{Kind: ErrorPathNotFile, Message: "Path must point to a file."}
	}

	isDirectory, err := s.gitPathspecIsDirectory(ctx, repoRoot, relPath, "HEAD")
	if err != nil {
		return err
	}
	if isDirectory {
		return &Error{Kind: ErrorPathNotFile, Message: "Path must point to a file."}
	}
	return nil
}

func (s *Service) gitPathspecIsDirectory(ctx context.Context, repoRoot string, relPath string, commitish string) (bool, error) {
	result, err := s.runGit(
		ctx,
		repoRoot,
		[]string{"--literal-pathspecs", "ls-tree", "-z", "-d", "--name-only", commitish, "--", relPath},
		pathCheckTimeout,
		maxPathCheckStdout,
		maxPathCheckBytes,
	)
	if err != nil {
		return false, err
	}
	if result.returnCode != 0 {
		return false, nil
	}
	for _, token := range strings.Split(result.stdout, "\x00") {
		if token == relPath {
			return true, nil
		}
	}
	return false, nil
}

func (s *Service) runGit(ctx context.Context, cwd string, args []string, timeout time.Duration, maxStdoutBytes int, maxStderrBytes int) (commandResult, error) {
	if s.gitBinary == "" {
		return commandResult{
			returnCode:      127,
			stdout:          "",
			stderr:          "git not found",
			stdoutTruncated: false,
			stderrTruncated: false,
			timedOut:        false,
		}, nil
	}

	commandCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	commandArgs := append([]string{"-c", "color.ui=false", "-c", "core.quotePath=false", "--no-pager"}, args...)
	stdout := newCappedBuffer(maxStdoutBytes, cancel)
	stderr := newCappedBuffer(maxStderrBytes, cancel)
	cmd := exec.CommandContext(commandCtx, s.gitBinary, commandArgs...)
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "GIT_PAGER=cat")
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	runErr := cmd.Run()

	returnCode := 0
	if cmd.ProcessState != nil {
		returnCode = cmd.ProcessState.ExitCode()
	} else if runErr != nil {
		returnCode = -1
	}
	return commandResult{
		returnCode:      returnCode,
		stdout:          stdout.String(),
		stderr:          stderr.String(),
		stdoutTruncated: stdout.Truncated(),
		stderrTruncated: stderr.Truncated(),
		timedOut:        errors.Is(commandCtx.Err(), context.DeadlineExceeded),
	}, nil
}

func normalizeRepoRelativePath(rawPath string) (string, error) {
	if rawPath == "" {
		return "", &Error{Kind: ErrorInvalidRequest, Message: "Missing path."}
	}
	if strings.ContainsRune(rawPath, '\x00') {
		return "", &Error{Kind: ErrorInvalidRequest, Message: "Invalid path."}
	}
	if filepath.IsAbs(rawPath) {
		return "", &Error{Kind: ErrorInvalidRequest, Message: "Path must be repo-relative."}
	}
	for _, part := range strings.FieldsFunc(rawPath, func(r rune) bool { return r == '/' || r == '\\' }) {
		if part == ".." {
			return "", &Error{Kind: ErrorInvalidRequest, Message: "Path must not contain '..'."}
		}
	}
	return filepath.ToSlash(filepath.Clean(rawPath)), nil
}

func resolvePathForUntrackedSynth(repoRoot string, relPath string) (string, error) {
	candidateAbs := filepath.Join(repoRoot, filepath.FromSlash(relPath))
	info, err := os.Lstat(candidateAbs)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", &Error{Kind: ErrorPathNotFound, Message: fmt.Sprintf("File not found: %s", relPath)}
		}
		return "", fmt.Errorf("stat synthesized diff path: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return "", &Error{Kind: ErrorPathForbidden, Message: "Symlink paths are not supported for synthesized diffs."}
	}

	resolvedRoot, err := filepath.Abs(repoRoot)
	if err != nil {
		return "", fmt.Errorf("resolve repo root: %w", err)
	}
	resolvedCandidate, err := filepath.Abs(candidateAbs)
	if err != nil {
		return "", fmt.Errorf("resolve candidate path: %w", err)
	}
	relativeToRoot, err := filepath.Rel(resolvedRoot, resolvedCandidate)
	if err != nil {
		return "", fmt.Errorf("rel synthesized diff path: %w", err)
	}
	if relativeToRoot == ".." || strings.HasPrefix(relativeToRoot, ".."+string(filepath.Separator)) {
		return "", &Error{Kind: ErrorPathForbidden, Message: "Path must be within the repo root."}
	}
	return resolvedCandidate, nil
}

func synthesizeUntrackedDiff(relPath string, absPath string, initialTruncated bool) (string, bool, error) {
	info, err := os.Stat(absPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", initialTruncated, &Error{Kind: ErrorPathNotFound, Message: fmt.Sprintf("File not found: %s", relPath)}
		}
		return "", initialTruncated, fmt.Errorf("stat untracked path: %w", err)
	}
	if !info.Mode().IsRegular() {
		return "", initialTruncated, &Error{Kind: ErrorPathNotFile, Message: fmt.Sprintf("Path must point to a regular file: %s", relPath)}
	}

	file, err := os.Open(absPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", initialTruncated, &Error{Kind: ErrorPathNotFound, Message: fmt.Sprintf("File not found: %s", relPath)}
		}
		return "", initialTruncated, fmt.Errorf("open untracked path: %w", err)
	}
	defer file.Close()

	isTruncated := initialTruncated || info.Size() > maxUntrackedRead
	data := make([]byte, maxUntrackedRead+1)
	readCount, readErr := io.ReadFull(file, data)
	switch {
	case readErr == nil:
		isTruncated = true
		data = data[:maxUntrackedRead]
	case errors.Is(readErr, io.ErrUnexpectedEOF), errors.Is(readErr, io.EOF):
		data = data[:readCount]
	default:
		return "", initialTruncated, fmt.Errorf("read untracked path: %w", readErr)
	}

	if bytes.IndexByte(data, 0) >= 0 {
		return strings.Join([]string{
			fmt.Sprintf("diff --git a/%s b/%s", relPath, relPath),
			"GIT binary patch",
			"(binary file, diff omitted)",
			"",
		}, "\n"), isTruncated, nil
	}

	text := string(data)
	hasTrailingNewline := strings.HasSuffix(text, "\n")
	lines := strings.Split(strings.TrimSuffix(text, "\n"), "\n")
	if len(lines) == 1 && lines[0] == "" {
		lines = nil
	}

	output := []string{
		fmt.Sprintf("diff --git a/%s b/%s", relPath, relPath),
		"new file mode 100644",
		"--- /dev/null",
		fmt.Sprintf("+++ b/%s", relPath),
	}
	if len(lines) > 0 {
		output = append(output, fmt.Sprintf("@@ -0,0 +1,%d @@", len(lines)))
		for _, line := range lines {
			output = append(output, "+"+line)
		}
		if !hasTrailingNewline {
			output = append(output, "\\ No newline at end of file")
		}
	}
	output = append(output, "")
	return strings.Join(output, "\n"), isTruncated, nil
}

func parsePorcelainHeadBranch(output string) string {
	for _, token := range strings.Split(output, "\x00") {
		if !strings.HasPrefix(token, "# branch.head ") {
			continue
		}
		branch := strings.TrimSpace(strings.TrimPrefix(token, "# branch.head "))
		switch branch {
		case "", "(detached)", "(unknown)", "HEAD", "HEAD (no branch)":
			return ""
		default:
			return branch
		}
	}
	return ""
}

func parsePorcelainHeadCommit(output string) string {
	for _, token := range strings.Split(output, "\x00") {
		if !strings.HasPrefix(token, "# branch.oid ") {
			continue
		}
		headCommit := strings.TrimSpace(strings.TrimPrefix(token, "# branch.oid "))
		switch headCommit {
		case "", "(initial)", "(unknown)":
			return ""
		default:
			return headCommit
		}
	}
	return ""
}

func parsePorcelainStatus(output string) []StatusEntry {
	tokens := strings.Split(output, "\x00")
	if len(tokens) > 0 && tokens[len(tokens)-1] == "" {
		tokens = tokens[:len(tokens)-1]
	}

	entries := make([]StatusEntry, 0)
	for index := 0; index < len(tokens); index++ {
		token := tokens[index]
		if token == "" || strings.HasPrefix(token, "# ") {
			continue
		}

		var (
			oldPath        *string
			indexStatus    string
			worktreeStatus string
			path           string
			ok             bool
		)

		switch {
		case strings.HasPrefix(token, "1 "):
			parts := strings.SplitN(token, " ", 9)
			if len(parts) != 9 || len(parts[1]) != 2 {
				continue
			}
			indexStatus = string(parts[1][0])
			worktreeStatus = string(parts[1][1])
			path = parts[8]
			ok = true
		case strings.HasPrefix(token, "2 "):
			parts := strings.SplitN(token, " ", 10)
			if len(parts) != 10 || len(parts[1]) != 2 {
				continue
			}
			indexStatus = string(parts[1][0])
			worktreeStatus = string(parts[1][1])
			path = parts[9]
			if index+1 < len(tokens) {
				oldPath = optionalString(tokens[index+1])
				index++
			}
			ok = true
		case strings.HasPrefix(token, "u "):
			parts := strings.SplitN(token, " ", 11)
			if len(parts) != 11 || len(parts[1]) != 2 {
				continue
			}
			indexStatus = string(parts[1][0])
			worktreeStatus = string(parts[1][1])
			path = parts[10]
			ok = true
		case strings.HasPrefix(token, "? "):
			entries = append(entries, StatusEntry{
				Path:           token[2:],
				OldPath:        nil,
				IndexStatus:    "?",
				WorktreeStatus: "?",
				Kind:           "untracked",
			})
		}
		if !ok {
			continue
		}

		statusPair := indexStatus + worktreeStatus
		isConflict := strings.Contains(statusPair, "U") || statusPair == "DD" || statusPair == "AU" || statusPair == "UD" || statusPair == "UA" || statusPair == "DU" || statusPair == "AA"
		if isConflict {
			entries = append(entries, StatusEntry{
				Path:           path,
				OldPath:        oldPath,
				IndexStatus:    indexStatus,
				WorktreeStatus: worktreeStatus,
				Kind:           "conflict",
			})
			continue
		}

		if indexStatus != "." {
			entries = append(entries, StatusEntry{
				Path:           path,
				OldPath:        oldPath,
				IndexStatus:    indexStatus,
				WorktreeStatus: worktreeStatus,
				Kind:           "staged",
			})
		}
		if worktreeStatus != "." {
			entries = append(entries, StatusEntry{
				Path:           path,
				OldPath:        oldPath,
				IndexStatus:    indexStatus,
				WorktreeStatus: worktreeStatus,
				Kind:           "unstaged",
			})
		}
	}
	return entries
}

func trimToLastCompleteNULRecord(output string) string {
	lastNUL := strings.LastIndexByte(output, 0)
	if lastNUL == -1 {
		return ""
	}
	return output[:lastNUL+1]
}

func optionalString(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	valueCopy := value
	return &valueCopy
}

func commandErrorText(stderr string) string {
	trimmed := strings.TrimSpace(stderr)
	if trimmed == "" {
		return "unknown error"
	}
	return trimmed
}

type cappedBuffer struct {
	mu         sync.Mutex
	buffer     bytes.Buffer
	maxBytes   int
	truncated  bool
	cancel     context.CancelFunc
	cancelOnce sync.Once
}

func newCappedBuffer(maxBytes int, cancel context.CancelFunc) *cappedBuffer {
	return &cappedBuffer{
		maxBytes: maxBytes,
		cancel:   cancel,
	}
}

func (b *cappedBuffer) Write(payload []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	remaining := b.maxBytes - b.buffer.Len()
	switch {
	case remaining <= 0:
		b.markTruncated()
	case len(payload) > remaining:
		_, _ = b.buffer.Write(payload[:remaining])
		b.markTruncated()
	default:
		_, _ = b.buffer.Write(payload)
	}
	return len(payload), nil
}

func (b *cappedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buffer.String()
}

func (b *cappedBuffer) Truncated() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.truncated
}

func (b *cappedBuffer) markTruncated() {
	b.truncated = true
	b.cancelOnce.Do(func() {
		if b.cancel != nil {
			b.cancel()
		}
	})
}
