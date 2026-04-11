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

	"setta/internal/devworktree"
)

const (
	statusTimeout       = 2 * time.Second
	diffTimeout         = 4 * time.Second
	pathCheckTimeout    = 1500 * time.Millisecond
	repoLookupTimeout   = 6 * time.Second
	worktreeListTimeout = 1500 * time.Millisecond
	maxStatusBytes      = 2_000_000
	maxDiffBytes        = 2_000_000
	maxCommandErrBytes  = 200_000
	maxRepoLookupBytes  = 4096
	maxPathCheckBytes   = 8192
	maxPathCheckStdout  = 4096
	maxWorktreeBytes    = 32_000
	maxUntrackedRead    = maxDiffBytes
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

type GitWorktreeEntry struct {
	Path           string  `json:"path"`
	DisplayName    string  `json:"displayName"`
	BranchName     *string `json:"branchName"`
	HeadCommit     *string `json:"headCommit"`
	IsCurrent      bool    `json:"isCurrent"`
	IsPrunable     bool    `json:"isPrunable"`
	PrunableReason *string `json:"prunableReason"`
}

type StatusResponse struct {
	Repo        RepoInfo           `json:"repo"`
	Entries     []StatusEntry      `json:"entries"`
	IsTruncated bool               `json:"isTruncated"`
	Worktrees   []GitWorktreeEntry `json:"worktrees"`
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
			Worktrees:   []GitWorktreeEntry{},
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
	worktrees := s.listWorktrees(ctx, repoRoot)

	return StatusResponse{
		Repo: RepoInfo{
			IsGitRepo:  true,
			RepoRoot:   &repoRoot,
			HeadBranch: headBranch,
			HeadCommit: headCommit,
		},
		Entries:     parsePorcelainStatus(statusOutput),
		IsTruncated: result.stdoutTruncated,
		Worktrees:   worktrees,
	}, nil
}

func (s *Service) Diff(ctx context.Context, request DiffRequest) (DiffResponse, error) {
	prepared, err := s.prepareDiffRequest(ctx, request)
	if err != nil {
		return DiffResponse{}, err
	}

	result, err := s.runGit(ctx, prepared.repoRoot, prepared.args, diffTimeout, maxDiffBytes, maxCommandErrBytes)
	if err != nil {
		return DiffResponse{}, err
	}
	if err := validateDiffCommandResult(result); err != nil {
		return DiffResponse{}, err
	}

	diffText, isTruncated, err := s.finalizeDiffOutput(ctx, prepared, result)
	if err != nil {
		return DiffResponse{}, err
	}

	return DiffResponse{
		RepoRoot:    prepared.repoRoot,
		Path:        prepared.relPath,
		Mode:        request.Mode,
		Diff:        diffText,
		IsTruncated: isTruncated,
	}, nil
}

type preparedDiffRequest struct {
	repoRoot string
	relPath  string
	mode     DiffMode
	args     []string
}

func (s *Service) prepareDiffRequest(ctx context.Context, request DiffRequest) (preparedDiffRequest, error) {
	if err := validateDiffMode(request.Mode); err != nil {
		return preparedDiffRequest{}, err
	}

	repoRoot, ok := s.repoRootOrNone(ctx)
	if !ok {
		return preparedDiffRequest{}, &Error{Kind: ErrorNotGitRepo, Message: "Current workspace is not a git repository."}
	}

	relPath, relOldPath, err := s.normalizeDiffPaths(ctx, repoRoot, request)
	if err != nil {
		return preparedDiffRequest{}, err
	}

	return preparedDiffRequest{
		repoRoot: repoRoot,
		relPath:  relPath,
		mode:     request.Mode,
		args:     buildGitDiffArgs(request.Mode, relPath, relOldPath),
	}, nil
}

func validateDiffMode(mode DiffMode) error {
	if mode == DiffModeUnstaged || mode == DiffModeStaged {
		return nil
	}
	return &Error{Kind: ErrorInvalidRequest, Message: "Invalid diff mode."}
}

func (s *Service) normalizeDiffPaths(ctx context.Context, repoRoot string, request DiffRequest) (string, string, error) {
	relPath, err := normalizeRepoRelativePath(request.Path)
	if err != nil {
		return "", "", err
	}
	if err := s.assertSingleFilePathspec(ctx, repoRoot, request.Path, relPath, ""); err != nil {
		return "", "", err
	}

	if request.OldPath == nil {
		return relPath, "", nil
	}

	relOldPath, err := normalizeRepoRelativePath(*request.OldPath)
	if err != nil {
		return "", "", err
	}
	if err := s.assertSingleFilePathspec(ctx, repoRoot, *request.OldPath, relOldPath, ""); err != nil {
		return "", "", err
	}
	return relPath, relOldPath, nil
}

func buildGitDiffArgs(mode DiffMode, relPath string, relOldPath string) []string {
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
	if mode == DiffModeStaged {
		args = append(args, "--cached")
	}
	args = append(args, "--")
	return append(args, diffPaths...)
}

func validateDiffCommandResult(result commandResult) error {
	if result.timedOut {
		return &Error{Kind: ErrorTimedOut, Message: "Timed out running git diff."}
	}
	if result.returnCode == 0 || result.returnCode == 1 || result.stdoutTruncated {
		return nil
	}
	return &Error{
		Kind:    ErrorCommandFailed,
		Message: fmt.Sprintf("git diff failed: %s", commandErrorText(result.stderr)),
	}
}

func (s *Service) finalizeDiffOutput(ctx context.Context, prepared preparedDiffRequest, result commandResult) (string, bool, error) {
	diffText := result.stdout
	isTruncated := result.stdoutTruncated
	if prepared.mode != DiffModeUnstaged || strings.TrimSpace(diffText) != "" {
		return diffText, isTruncated, nil
	}

	isUntracked, err := s.isUntrackedPath(ctx, prepared.repoRoot, prepared.relPath)
	if err != nil {
		return "", false, err
	}
	if !isUntracked {
		return diffText, isTruncated, nil
	}

	absPath, err := resolvePathForUntrackedSynth(prepared.repoRoot, prepared.relPath)
	if err != nil {
		return "", false, err
	}
	return synthesizeUntrackedDiff(prepared.relPath, absPath, isTruncated)
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
	info, err := statUntrackedDiffFile(relPath, absPath)
	if err != nil {
		return "", initialTruncated, err
	}

	data, isTruncated, err := readUntrackedDiffData(relPath, absPath, info.Size(), initialTruncated)
	if err != nil {
		return "", initialTruncated, err
	}
	if bytes.IndexByte(data, 0) >= 0 {
		return renderBinaryUntrackedDiff(relPath), isTruncated, nil
	}
	return renderTextUntrackedDiff(relPath, data), isTruncated, nil
}

func statUntrackedDiffFile(relPath string, absPath string) (os.FileInfo, error) {
	info, err := os.Stat(absPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, &Error{Kind: ErrorPathNotFound, Message: fmt.Sprintf("File not found: %s", relPath)}
		}
		return nil, fmt.Errorf("stat untracked path: %w", err)
	}
	if !info.Mode().IsRegular() {
		return nil, &Error{Kind: ErrorPathNotFile, Message: "Path must point to a file."}
	}
	return info, nil
}

func readUntrackedDiffData(relPath string, absPath string, fileSize int64, initialTruncated bool) ([]byte, bool, error) {
	file, err := os.Open(absPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, initialTruncated, &Error{Kind: ErrorPathNotFound, Message: fmt.Sprintf("File not found: %s", relPath)}
		}
		return nil, initialTruncated, fmt.Errorf("open untracked path: %w", err)
	}
	defer file.Close()

	isTruncated := initialTruncated || fileSize > maxUntrackedRead
	data := make([]byte, maxUntrackedRead+1)
	readCount, readErr := io.ReadFull(file, data)
	if readErr == nil {
		return data[:maxUntrackedRead], true, nil
	}
	if errors.Is(readErr, io.ErrUnexpectedEOF) || errors.Is(readErr, io.EOF) {
		return data[:readCount], isTruncated, nil
	}
	return nil, initialTruncated, fmt.Errorf("read untracked path: %w", readErr)
}

func renderBinaryUntrackedDiff(relPath string) string {
	return strings.Join([]string{
		fmt.Sprintf("diff --git a/%s b/%s", relPath, relPath),
		"GIT binary patch",
		"(binary file, diff omitted)",
		"",
	}, "\n")
}

func renderTextUntrackedDiff(relPath string, data []byte) string {
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
	return strings.Join(output, "\n")
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
	tokens := splitPorcelainStatusTokens(output)
	entries := make([]StatusEntry, 0)
	for index := 0; index < len(tokens); index++ {
		nextToken := ""
		if index+1 < len(tokens) {
			nextToken = tokens[index+1]
		}
		record, ok := parsePorcelainStatusRecord(tokens[index], nextToken)
		if !ok {
			continue
		}
		if record.consumeNext {
			index++
		}
		entries = append(entries, record.statusEntries()...)
	}
	return entries
}

func splitPorcelainStatusTokens(output string) []string {
	tokens := strings.Split(output, "\x00")
	if len(tokens) > 0 && tokens[len(tokens)-1] == "" {
		tokens = tokens[:len(tokens)-1]
	}
	return tokens
}

type porcelainStatusRecord struct {
	path           string
	oldPath        *string
	indexStatus    string
	worktreeStatus string
	kind           string
	consumeNext    bool
}

func parsePorcelainStatusRecord(token string, nextToken string) (porcelainStatusRecord, bool) {
	if token == "" || strings.HasPrefix(token, "# ") {
		return porcelainStatusRecord{}, false
	}
	switch {
	case strings.HasPrefix(token, "1 "):
		return parsePorcelainTrackedRecord(token, 9, 8)
	case strings.HasPrefix(token, "2 "):
		record, ok := parsePorcelainTrackedRecord(token, 10, 9)
		if !ok {
			return porcelainStatusRecord{}, false
		}
		record.oldPath = optionalString(nextToken)
		record.consumeNext = nextToken != ""
		return record, true
	case strings.HasPrefix(token, "u "):
		return parsePorcelainTrackedRecord(token, 11, 10)
	case strings.HasPrefix(token, "? "):
		return porcelainStatusRecord{
			path:           token[2:],
			indexStatus:    "?",
			worktreeStatus: "?",
			kind:           "untracked",
		}, true
	default:
		return porcelainStatusRecord{}, false
	}
}

func parsePorcelainTrackedRecord(token string, partCount int, pathIndex int) (porcelainStatusRecord, bool) {
	parts := strings.SplitN(token, " ", partCount)
	if len(parts) != partCount || len(parts[1]) != 2 {
		return porcelainStatusRecord{}, false
	}
	return porcelainStatusRecord{
		path:           parts[pathIndex],
		indexStatus:    string(parts[1][0]),
		worktreeStatus: string(parts[1][1]),
	}, true
}

func (record porcelainStatusRecord) statusEntries() []StatusEntry {
	if record.kind == "untracked" {
		return []StatusEntry{record.statusEntry("untracked")}
	}
	if record.isConflict() {
		return []StatusEntry{record.statusEntry("conflict")}
	}

	entries := make([]StatusEntry, 0, 2)
	if record.indexStatus != "." {
		entries = append(entries, record.statusEntry("staged"))
	}
	if record.worktreeStatus != "." {
		entries = append(entries, record.statusEntry("unstaged"))
	}
	return entries
}

func (record porcelainStatusRecord) statusEntry(kind string) StatusEntry {
	return StatusEntry{
		Path:           record.path,
		OldPath:        record.oldPath,
		IndexStatus:    record.indexStatus,
		WorktreeStatus: record.worktreeStatus,
		Kind:           kind,
	}
}

func (record porcelainStatusRecord) isConflict() bool {
	statusPair := record.indexStatus + record.worktreeStatus
	return strings.Contains(statusPair, "U") || statusPair == "AA" || statusPair == "DD"
}

func (s *Service) listWorktrees(ctx context.Context, repoRoot string) []GitWorktreeEntry {
	result, err := s.runGit(
		ctx,
		repoRoot,
		[]string{"worktree", "list", "--porcelain", "-z"},
		worktreeListTimeout,
		maxWorktreeBytes,
		maxCommandErrBytes,
	)
	if err != nil || result.timedOut || result.returnCode != 0 {
		return []GitWorktreeEntry{}
	}
	return parseWorktreeListPorcelain(result.stdout, repoRoot)
}

func parseWorktreeListPorcelain(output string, currentRepoRoot string) []GitWorktreeEntry {
	currentComparable := comparablePath(currentRepoRoot)
	worktrees := make([]GitWorktreeEntry, 0)
	record := make([]string, 0)

	flushRecord := func() {
		if len(record) == 0 {
			return
		}
		firstField := record[0]
		const prefix = "worktree "
		if !strings.HasPrefix(firstField, prefix) {
			return
		}
		rawPath := strings.TrimSpace(strings.TrimPrefix(firstField, prefix))
		if rawPath == "" {
			return
		}

		var branchName *string
		var headCommit *string
		var prunableReason *string

		for _, field := range record[1:] {
			switch {
			case strings.HasPrefix(field, "HEAD "):
				headCommit = optionalString(strings.TrimSpace(strings.TrimPrefix(field, "HEAD ")))
			case strings.HasPrefix(field, "branch "):
				branchName = optionalString(parseWorktreeBranchName(strings.TrimSpace(strings.TrimPrefix(field, "branch "))))
			case field == "detached":
				branchName = nil
			case strings.HasPrefix(field, "prunable"):
				prunableReason = optionalString(strings.TrimSpace(strings.TrimPrefix(field, "prunable")))
			}
		}

		worktrees = append(worktrees, GitWorktreeEntry{
			Path:           rawPath,
			DisplayName:    devworktree.DeriveName(rawPath),
			BranchName:     branchName,
			HeadCommit:     headCommit,
			IsCurrent:      comparablePath(rawPath) == currentComparable,
			IsPrunable:     prunableReason != nil,
			PrunableReason: prunableReason,
		})
	}

	for _, field := range strings.Split(output, "\x00") {
		if field == "" {
			flushRecord()
			record = record[:0]
			continue
		}
		record = append(record, field)
	}

	return worktrees
}

func parseWorktreeBranchName(raw string) string {
	branch := strings.TrimSpace(raw)
	if branch == "" {
		return ""
	}
	const prefix = "refs/heads/"
	if strings.HasPrefix(branch, prefix) {
		return branch[len(prefix):]
	}
	return branch
}

func comparablePath(path string) string {
	cleaned := filepath.Clean(strings.TrimSpace(path))
	if cleaned == "" {
		return ""
	}
	if resolved, err := filepath.EvalSymlinks(cleaned); err == nil {
		return filepath.Clean(resolved)
	}
	if absolute, err := filepath.Abs(cleaned); err == nil {
		return filepath.Clean(absolute)
	}
	return cleaned
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
