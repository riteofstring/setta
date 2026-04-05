package gitread

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	logTimeout               = 3 * time.Second
	showTimeout              = 4 * time.Second
	maxLogBytes              = 4_000_000
	maxShowBytes             = 2_000_000
	maxLogCount              = 5_000
	maxLogPageSize           = 500
	decorationSeparator      = "\x1d"
	decorateAtomPrefix       = "%(decorate:prefix=,suffix=,separator="
	logMetadataFieldCount    = 7
	commitMetadataFieldCount = 10
)

type Commit struct {
	Hash         string   `json:"hash"`
	Parents      []string `json:"parents"`
	AuthorName   string   `json:"authorName"`
	AuthorEmail  string   `json:"authorEmail"`
	AuthorTimeMS int64    `json:"authorTimeMs"`
	Subject      string   `json:"subject"`
	Decorations  []string `json:"decorations"`
}

type LogRequest struct {
	Rev      string `json:"rev"`
	AllRefs  bool   `json:"allRefs"`
	Offset   int    `json:"offset"`
	PageSize int    `json:"pageSize"`
}

type normalizedLogRequest struct {
	offset   int
	pageSize int
	rev      string
}

type LogResponse struct {
	RepoRoot   string   `json:"repoRoot"`
	HeadBranch *string  `json:"headBranch"`
	Commits    []Commit `json:"commits"`
	Offset     int      `json:"offset"`
	PageSize   int      `json:"pageSize"`
	NextOffset *int     `json:"nextOffset"`
	HasMore    bool     `json:"hasMore"`
	IsCapped   bool     `json:"isCapped"`
}

type CommitChangedFile struct {
	Path      string  `json:"path"`
	OldPath   *string `json:"oldPath"`
	Status    string  `json:"status"`
	Additions *int    `json:"additions"`
	Deletions *int    `json:"deletions"`
}

type CommitDetailsRequest struct {
	CommitHash string `json:"commitHash"`
}

type CommitDetailsResponse struct {
	RepoRoot        string              `json:"repoRoot"`
	CommitHash      string              `json:"commitHash"`
	Parents         []string            `json:"parents"`
	AuthorName      string              `json:"authorName"`
	AuthorEmail     string              `json:"authorEmail"`
	AuthorTimeMS    int64               `json:"authorTimeMs"`
	CommitterName   string              `json:"committerName"`
	CommitterEmail  string              `json:"committerEmail"`
	CommitterTimeMS int64               `json:"committerTimeMs"`
	Subject         string              `json:"subject"`
	Body            string              `json:"body"`
	Files           []CommitChangedFile `json:"files"`
	IsTruncated     bool                `json:"isTruncated"`
}

type CommitFileDiffRequest struct {
	CommitHash string  `json:"commitHash"`
	Path       string  `json:"path"`
	OldPath    *string `json:"oldPath"`
}

type CommitFileDiffResponse struct {
	RepoRoot    string `json:"repoRoot"`
	CommitHash  string `json:"commitHash"`
	Path        string `json:"path"`
	Diff        string `json:"diff"`
	IsTruncated bool   `json:"isTruncated"`
}

type commitMetadata struct {
	commitHash       string
	parentsRaw       string
	authorName       string
	authorEmail      string
	authorTimeRaw    string
	committerName    string
	committerEmail   string
	committerTimeRaw string
	subject          string
	body             string
}

type rawChangedFile struct {
	newPath    string
	oldPath    *string
	statusCode string
}

type numstat struct {
	additions *int
	deletions *int
}

func (s *Service) Log(ctx context.Context, request LogRequest) (LogResponse, error) {
	repoRoot, ok := s.repoRootOrNone(ctx)
	if !ok {
		return LogResponse{}, &Error{Kind: ErrorNotGitRepo, Message: "Current workspace is not a git repository."}
	}

	normalized, err := s.normalizeLogRequest(ctx, repoRoot, request)
	if err != nil {
		return LogResponse{}, err
	}

	headBranch := s.logHeadBranch(ctx, repoRoot, normalized.offset)
	if normalized.offset >= maxLogCount {
		return s.emptyLogResponse(ctx, repoRoot, request.AllRefs, normalized, headBranch), nil
	}

	if response, err := s.logResponseWhenHeadMissing(ctx, repoRoot, request.AllRefs, normalized, headBranch); err != nil {
		return LogResponse{}, err
	} else if response != nil {
		return *response, nil
	}

	result, err := s.runGit(
		ctx,
		repoRoot,
		buildGitLogArgs(request.AllRefs, normalized.rev, normalized.offset, logFetchCount(normalized.offset, normalized.pageSize)),
		logTimeout,
		maxLogBytes,
		maxCommandErrBytes,
	)
	if err != nil {
		return LogResponse{}, err
	}
	if result.timedOut {
		return LogResponse{}, &Error{Kind: ErrorTimedOut, Message: "Timed out running git log."}
	}
	if result.returnCode != 0 && !result.stdoutTruncated {
		return LogResponse{}, &Error{
			Kind:    ErrorCommandFailed,
			Message: fmt.Sprintf("git log failed: %s", commandErrorText(result.stderr)),
		}
	}

	commits, hasMore := parseLogPage(result.stdout, normalized.pageSize, result.stdoutTruncated)
	commits = s.decorateLogCommits(ctx, repoRoot, commits, headBranch)
	isCapped := s.logPageIsCapped(ctx, repoRoot, request.AllRefs, normalized.rev, normalized.offset, commits, &hasMore)
	return LogResponse{
		RepoRoot:   repoRoot,
		HeadBranch: headBranch,
		Commits:    commits,
		Offset:     normalized.offset,
		PageSize:   normalized.pageSize,
		NextOffset: nextLogOffset(normalized.offset, commits, hasMore),
		HasMore:    hasMore,
		IsCapped:   isCapped,
	}, nil
}

func (s *Service) normalizeLogRequest(ctx context.Context, repoRoot string, request LogRequest) (normalizedLogRequest, error) {
	normalized := normalizedLogRequest{
		offset:   request.Offset,
		pageSize: request.PageSize,
		rev:      strings.TrimSpace(request.Rev),
	}
	if normalized.offset < 0 {
		normalized.offset = 0
	}
	if normalized.pageSize < 1 {
		normalized.pageSize = 1
	}
	if normalized.pageSize > maxLogPageSize {
		normalized.pageSize = maxLogPageSize
	}
	if request.AllRefs {
		return normalized, nil
	}
	if normalized.rev == "" {
		return normalizedLogRequest{}, &Error{Kind: ErrorInvalidRevision, Message: "Missing revision."}
	}
	if strings.HasPrefix(normalized.rev, "-") || strings.ContainsRune(normalized.rev, '\x00') {
		return normalizedLogRequest{}, &Error{Kind: ErrorInvalidRevision, Message: "Invalid revision."}
	}
	if normalized.rev == "HEAD" {
		return normalized, nil
	}
	if err := s.verifyRevision(ctx, repoRoot, normalized.rev); err != nil {
		return normalizedLogRequest{}, err
	}
	return normalized, nil
}

func (s *Service) logHeadBranch(ctx context.Context, repoRoot string, offset int) *string {
	if offset != 0 {
		return nil
	}
	branch, _ := s.headRefInfo(ctx, repoRoot)
	return optionalString(branch)
}

func (s *Service) emptyLogResponse(
	ctx context.Context,
	repoRoot string,
	allRefs bool,
	request normalizedLogRequest,
	headBranch *string,
) LogResponse {
	return LogResponse{
		RepoRoot:   repoRoot,
		HeadBranch: headBranch,
		Commits:    []Commit{},
		Offset:     request.offset,
		PageSize:   request.pageSize,
		NextOffset: nil,
		HasMore:    false,
		IsCapped:   s.probeHistoryBeyondCap(ctx, repoRoot, allRefs, request.rev),
	}
}

func (s *Service) logResponseWhenHeadMissing(
	ctx context.Context,
	repoRoot string,
	allRefs bool,
	request normalizedLogRequest,
	headBranch *string,
) (*LogResponse, error) {
	if allRefs || request.offset != 0 || request.rev != "HEAD" {
		return nil, nil
	}
	headExists, err := s.verifyHeadExists(ctx, repoRoot)
	if err != nil {
		return nil, err
	}
	if headExists {
		return nil, nil
	}
	response := LogResponse{
		RepoRoot:   repoRoot,
		HeadBranch: headBranch,
		Commits:    []Commit{},
		Offset:     request.offset,
		PageSize:   request.pageSize,
		NextOffset: nil,
		HasMore:    false,
		IsCapped:   false,
	}
	return &response, nil
}

func logFetchCount(offset int, pageSize int) int {
	remainingBudget := maxLogCount - offset
	fetchCount := pageSize + 1
	if fetchCount > remainingBudget {
		return remainingBudget
	}
	return fetchCount
}

func buildGitLogArgs(allRefs bool, rev string, offset int, fetchCount int) []string {
	format := "%H%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%(decorate:prefix=,suffix=,separator=%x1d)%x00"
	args := []string{
		"log",
		"--topo-order",
		fmt.Sprintf("--skip=%d", offset),
		fmt.Sprintf("--max-count=%d", fetchCount),
		"--no-color",
		"-z",
		fmt.Sprintf("--pretty=format:%s", format),
	}
	if allRefs {
		return append(args, "--all")
	}
	return append(args, rev)
}

func parseLogPage(stdout string, pageSize int, stdoutTruncated bool) ([]Commit, bool) {
	commits := parseGitLogOutput(stdout)
	hasMore := len(commits) > pageSize || stdoutTruncated
	if len(commits) > pageSize {
		commits = commits[:pageSize]
	}
	if hasMore && len(commits) == 0 {
		hasMore = false
	}
	return commits, hasMore
}

func (s *Service) decorateLogCommits(ctx context.Context, repoRoot string, commits []Commit, headBranch *string) []Commit {
	if !hasUnexpandedDecorateAtoms(commits) {
		return commits
	}
	sanitized := sanitizeCommitDecorations(commits)
	commitHashes := make(map[string]struct{}, len(commits))
	for _, commit := range commits {
		commitHashes[commit.Hash] = struct{}{}
	}
	fallback := s.loadCommitDecorationsFromRefs(ctx, repoRoot, commitHashes, headBranch)
	for index := range commits {
		if fallback != nil {
			if decorations, ok := fallback[commits[index].Hash]; ok {
				commits[index].Decorations = decorations
				continue
			}
		}
		commits[index].Decorations = sanitized[commits[index].Hash]
	}
	return commits
}

func (s *Service) logPageIsCapped(
	ctx context.Context,
	repoRoot string,
	allRefs bool,
	rev string,
	offset int,
	commits []Commit,
	hasMore *bool,
) bool {
	if offset+len(commits) < maxLogCount {
		return false
	}
	isCapped := s.probeHistoryBeyondCap(ctx, repoRoot, allRefs, rev)
	if isCapped {
		*hasMore = false
	}
	return isCapped
}

func nextLogOffset(offset int, commits []Commit, hasMore bool) *int {
	if !hasMore {
		return nil
	}
	next := offset + len(commits)
	return &next
}

func (s *Service) CommitDetails(ctx context.Context, request CommitDetailsRequest) (CommitDetailsResponse, error) {
	repoRoot, ok := s.repoRootOrNone(ctx)
	if !ok {
		return CommitDetailsResponse{}, &Error{Kind: ErrorNotGitRepo, Message: "Current workspace is not a git repository."}
	}

	commitHash, err := s.resolveCommitHash(ctx, repoRoot, request.CommitHash)
	if err != nil {
		return CommitDetailsResponse{}, err
	}

	format := "%H%x00%P%x00%an%x00%ae%x00%at%x00%cn%x00%ce%x00%ct%x00%s%x00%b%x00"
	result, err := s.runGit(
		ctx,
		repoRoot,
		[]string{
			"show",
			"--no-color",
			fmt.Sprintf("--pretty=format:%s", format),
			"--no-ext-diff",
			"--no-textconv",
			"--raw",
			"--numstat",
			"-z",
			commitHash,
			"--",
		},
		showTimeout,
		maxShowBytes,
		maxCommandErrBytes,
	)
	if err != nil {
		return CommitDetailsResponse{}, err
	}
	if result.timedOut {
		return CommitDetailsResponse{}, &Error{Kind: ErrorTimedOut, Message: "Timed out loading commit details."}
	}
	if result.returnCode != 0 && !result.stdoutTruncated {
		return CommitDetailsResponse{}, &Error{Kind: ErrorNotFound, Message: notFoundMessage(result.stderr, "Unknown commit hash.")}
	}

	metadata, diffPayload, parsed := parseCommitMetadataParts(result.stdout)
	if !parsed && result.stdoutTruncated {
		fallback, fallbackErr := s.loadCommitMetadataWithoutDiff(ctx, repoRoot, commitHash, format)
		if fallbackErr != nil {
			return CommitDetailsResponse{}, fallbackErr
		}
		metadata = fallback
		diffPayload = ""
		parsed = true
	}
	if !parsed {
		return CommitDetailsResponse{}, fmt.Errorf("failed to parse commit metadata")
	}

	rawChangedFiles, statsByPath := parseGitShowRawAndNumstat(diffPayload)
	files := make([]CommitChangedFile, 0, len(rawChangedFiles))
	for _, file := range rawChangedFiles {
		stats := statsByPath[file.newPath]
		files = append(files, CommitChangedFile{
			Path:      file.newPath,
			OldPath:   file.oldPath,
			Status:    file.statusCode,
			Additions: stats.additions,
			Deletions: stats.deletions,
		})
	}
	sort.Slice(files, func(left int, right int) bool {
		return files[left].Path < files[right].Path
	})

	return CommitDetailsResponse{
		RepoRoot:        repoRoot,
		CommitHash:      commitHash,
		Parents:         splitParents(metadata.parentsRaw),
		AuthorName:      metadata.authorName,
		AuthorEmail:     metadata.authorEmail,
		AuthorTimeMS:    parseUnixMillis(metadata.authorTimeRaw),
		CommitterName:   metadata.committerName,
		CommitterEmail:  metadata.committerEmail,
		CommitterTimeMS: parseUnixMillis(metadata.committerTimeRaw),
		Subject:         metadata.subject,
		Body:            strings.TrimRight(metadata.body, "\n"),
		Files:           files,
		IsTruncated:     result.stdoutTruncated,
	}, nil
}

func (s *Service) CommitFileDiff(ctx context.Context, request CommitFileDiffRequest) (CommitFileDiffResponse, error) {
	repoRoot, ok := s.repoRootOrNone(ctx)
	if !ok {
		return CommitFileDiffResponse{}, &Error{Kind: ErrorNotGitRepo, Message: "Current workspace is not a git repository."}
	}

	commitHash, err := s.resolveCommitHash(ctx, repoRoot, request.CommitHash)
	if err != nil {
		return CommitFileDiffResponse{}, err
	}

	relPath, err := normalizeRepoRelativePath(request.Path)
	if err != nil {
		return CommitFileDiffResponse{}, err
	}
	if err := s.assertSingleFilePathspec(ctx, repoRoot, request.Path, relPath, commitHash); err != nil {
		return CommitFileDiffResponse{}, err
	}

	var relOldPath string
	if request.OldPath != nil {
		relOldPath, err = normalizeRepoRelativePath(*request.OldPath)
		if err != nil {
			return CommitFileDiffResponse{}, err
		}
		if err := s.assertSingleFilePathspec(ctx, repoRoot, *request.OldPath, relOldPath, commitHash); err != nil {
			return CommitFileDiffResponse{}, err
		}
	}

	args := []string{
		"--literal-pathspecs",
		"show",
		"--no-color",
		"--patch",
		"--no-ext-diff",
		"--no-textconv",
		"--format=",
		commitHash,
		"--",
	}
	if relOldPath != "" && relOldPath != relPath {
		args = append(args, relOldPath, relPath)
	} else {
		args = append(args, relPath)
	}

	result, err := s.runGit(ctx, repoRoot, args, showTimeout, maxShowBytes, maxCommandErrBytes)
	if err != nil {
		return CommitFileDiffResponse{}, err
	}
	if result.timedOut {
		return CommitFileDiffResponse{}, &Error{Kind: ErrorTimedOut, Message: "Timed out running git show."}
	}
	if result.returnCode != 0 && !result.stdoutTruncated {
		return CommitFileDiffResponse{}, &Error{Kind: ErrorNotFound, Message: notFoundMessage(result.stderr, "Unknown commit hash.")}
	}
	if !result.stdoutTruncated && strings.TrimSpace(result.stdout) == "" {
		return CommitFileDiffResponse{}, &Error{Kind: ErrorNotFound, Message: "File is not part of this commit diff."}
	}

	return CommitFileDiffResponse{
		RepoRoot:    repoRoot,
		CommitHash:  commitHash,
		Path:        relPath,
		Diff:        result.stdout,
		IsTruncated: result.stdoutTruncated,
	}, nil
}

func (s *Service) verifyRevision(ctx context.Context, repoRoot string, revision string) error {
	result, err := s.runGit(
		ctx,
		repoRoot,
		[]string{"rev-parse", "--verify", "--quiet", "--end-of-options", revision},
		pathCheckTimeout,
		256,
		maxPathCheckBytes,
	)
	if err != nil {
		return err
	}
	if result.timedOut {
		return &Error{Kind: ErrorTimedOut, Message: "Timed out verifying revision."}
	}
	if result.returnCode != 0 {
		return &Error{Kind: ErrorInvalidRevision, Message: fmt.Sprintf("Invalid revision: %s", revision)}
	}
	return nil
}

func (s *Service) verifyHeadExists(ctx context.Context, repoRoot string) (bool, error) {
	result, err := s.runGit(
		ctx,
		repoRoot,
		[]string{"rev-parse", "--verify", "--quiet", "HEAD"},
		pathCheckTimeout,
		256,
		maxPathCheckBytes,
	)
	if err != nil {
		return false, err
	}
	if result.timedOut {
		return false, &Error{Kind: ErrorTimedOut, Message: "Timed out verifying HEAD."}
	}
	return result.returnCode == 0, nil
}

func (s *Service) headRefInfo(ctx context.Context, repoRoot string) (string, string) {
	result, err := s.runGit(
		ctx,
		repoRoot,
		[]string{"rev-parse", "--abbrev-ref", "HEAD", "HEAD"},
		pathCheckTimeout,
		256,
		maxPathCheckBytes,
	)
	if err != nil || result.returnCode != 0 {
		return "", ""
	}
	lines := strings.Split(strings.TrimSpace(result.stdout), "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) == "" {
		return "", ""
	}
	branch := strings.TrimSpace(lines[0])
	if branch == "HEAD" {
		branch = ""
	}
	commit := ""
	if len(lines) > 1 {
		commit = strings.TrimSpace(lines[1])
	}
	return branch, commit
}

func (s *Service) resolveCommitHash(ctx context.Context, repoRoot string, rawCommitHash string) (string, error) {
	commitHash := strings.TrimSpace(rawCommitHash)
	if commitHash == "" || strings.HasPrefix(commitHash, "-") || strings.ContainsRune(commitHash, '\x00') {
		return "", &Error{Kind: ErrorInvalidCommit, Message: "Invalid commit hash."}
	}

	result, err := s.runGit(
		ctx,
		repoRoot,
		[]string{"rev-parse", "--verify", "--quiet", "--end-of-options", commitHash + "^{commit}"},
		pathCheckTimeout,
		256,
		maxPathCheckBytes,
	)
	if err != nil {
		return "", err
	}
	if result.timedOut {
		return "", &Error{Kind: ErrorTimedOut, Message: "Timed out verifying commit hash."}
	}

	resolved := strings.TrimSpace(result.stdout)
	if result.returnCode != 0 || resolved == "" {
		return "", &Error{Kind: ErrorInvalidCommit, Message: "Invalid commit hash."}
	}
	return resolved, nil
}

func (s *Service) loadCommitMetadataWithoutDiff(ctx context.Context, repoRoot string, commitHash string, format string) (commitMetadata, error) {
	result, err := s.runGit(
		ctx,
		repoRoot,
		[]string{
			"show",
			"--no-color",
			fmt.Sprintf("--pretty=format:%s", format),
			"--no-ext-diff",
			"--no-textconv",
			"--no-patch",
			commitHash,
			"--",
		},
		showTimeout,
		maxShowBytes,
		maxCommandErrBytes,
	)
	if err != nil {
		return commitMetadata{}, err
	}
	if result.timedOut {
		return commitMetadata{}, &Error{Kind: ErrorTimedOut, Message: "Timed out loading commit metadata."}
	}
	if result.returnCode != 0 && !result.stdoutTruncated {
		return commitMetadata{}, &Error{Kind: ErrorNotFound, Message: notFoundMessage(result.stderr, "Unknown commit hash.")}
	}
	metadata, _, ok := parseCommitMetadataParts(result.stdout)
	if !ok {
		return commitMetadata{}, fmt.Errorf("failed to parse commit metadata")
	}
	return metadata, nil
}

func (s *Service) probeHistoryBeyondCap(ctx context.Context, repoRoot string, allRefs bool, rev string) bool {
	args := []string{
		"log",
		"--topo-order",
		fmt.Sprintf("--skip=%d", maxLogCount),
		"--max-count=1",
		"--no-color",
		"--pretty=format:%H",
	}
	if allRefs {
		args = append(args, "--all")
	} else {
		args = append(args, rev)
	}
	result, err := s.runGit(ctx, repoRoot, args, logTimeout, 512, maxCommandErrBytes)
	if err != nil || result.timedOut || result.returnCode != 0 {
		return false
	}
	return strings.TrimSpace(result.stdout) != ""
}

func (s *Service) loadCommitDecorationsFromRefs(ctx context.Context, repoRoot string, commitHashes map[string]struct{}, headBranch *string) map[string][]string {
	if len(commitHashes) == 0 {
		return map[string][]string{}
	}

	hashes := make([]string, 0, len(commitHashes))
	for hash := range commitHashes {
		hashes = append(hashes, hash)
	}
	sort.Strings(hashes)

	args := []string{
		"for-each-ref",
		"--format=%(objectname)%00%(*objectname)%00%(refname)%00%(symref)%00",
	}
	for _, hash := range hashes {
		args = append(args, "--points-at="+hash)
	}
	args = append(args, "refs/heads", "refs/remotes", "refs/tags")

	result, err := s.runGit(ctx, repoRoot, args, logTimeout, maxLogBytes, maxCommandErrBytes)
	if err != nil || result.timedOut || result.returnCode != 0 || result.stdoutTruncated {
		return nil
	}

	decorationsByHash := make(map[string][]string)
	for _, line := range strings.Split(strings.TrimSuffix(result.stdout, "\n"), "\n") {
		if line == "" {
			continue
		}
		fields := strings.Split(line, "\x00")
		if len(fields) < 4 {
			continue
		}
		targetHash := strings.TrimSpace(fields[1])
		if targetHash == "" {
			targetHash = strings.TrimSpace(fields[0])
		}
		if _, ok := commitHashes[targetHash]; !ok {
			continue
		}
		label := buildRefDecorationLabel(strings.TrimSpace(fields[2]), strings.TrimSpace(fields[3]))
		if label == "" {
			continue
		}
		decorationsByHash[targetHash] = appendUniqueString(decorationsByHash[targetHash], label)
	}

	if headBranch != nil && *headBranch != "" {
		headHash := s.resolveHeadCommitHash(ctx, repoRoot)
		if headHash != "" {
			if _, ok := commitHashes[headHash]; ok {
				headDecoration := "HEAD -> " + *headBranch
				existing := decorationsByHash[headHash]
				if !containsString(existing, headDecoration) {
					decorationsByHash[headHash] = append([]string{headDecoration}, existing...)
				}
			}
		}
	}
	return decorationsByHash
}

func (s *Service) resolveHeadCommitHash(ctx context.Context, repoRoot string) string {
	result, err := s.runGit(
		ctx,
		repoRoot,
		[]string{"rev-parse", "--verify", "--quiet", "HEAD"},
		pathCheckTimeout,
		256,
		maxPathCheckBytes,
	)
	if err != nil || result.timedOut || result.returnCode != 0 {
		return ""
	}
	return strings.TrimSpace(result.stdout)
}

func parseGitLogOutput(output string) []Commit {
	remaining := strings.TrimLeft(output, "\r\n")
	commits := make([]Commit, 0)
	for remaining != "" {
		fields, next, ok := parseNULDelimitedFields(remaining, logMetadataFieldCount)
		if !ok {
			break
		}
		remaining = next
		if strings.HasPrefix(remaining, "\x00") {
			remaining = remaining[1:]
		}
		remaining = strings.TrimLeft(remaining, "\r\n")

		decorations := make([]string, 0)
		if strings.TrimSpace(fields[6]) != "" {
			for _, item := range strings.Split(fields[6], decorationSeparator) {
				trimmed := strings.TrimSpace(item)
				if trimmed != "" {
					decorations = append(decorations, trimmed)
				}
			}
		}
		commits = append(commits, Commit{
			Hash:         fields[0],
			Parents:      splitParents(fields[1]),
			AuthorName:   fields[2],
			AuthorEmail:  fields[3],
			AuthorTimeMS: parseUnixMillis(fields[4]),
			Subject:      fields[5],
			Decorations:  decorations,
		})
	}
	return commits
}

func parseCommitMetadataParts(output string) (commitMetadata, string, bool) {
	fields, remainder, ok := parseNULDelimitedFields(strings.TrimLeft(output, "\r\n"), commitMetadataFieldCount)
	if !ok {
		return commitMetadata{}, "", false
	}
	return commitMetadata{
		commitHash:       fields[0],
		parentsRaw:       fields[1],
		authorName:       fields[2],
		authorEmail:      fields[3],
		authorTimeRaw:    fields[4],
		committerName:    fields[5],
		committerEmail:   fields[6],
		committerTimeRaw: fields[7],
		subject:          fields[8],
		body:             fields[9],
	}, remainder, true
}

func parseNULDelimitedFields(output string, fieldCount int) ([]string, string, bool) {
	fields := make([]string, 0, fieldCount)
	cursor := 0
	for len(fields) < fieldCount {
		separatorIndex := strings.IndexByte(output[cursor:], 0)
		if separatorIndex == -1 {
			return nil, "", false
		}
		separatorIndex += cursor
		fields = append(fields, output[cursor:separatorIndex])
		cursor = separatorIndex + 1
	}
	return fields, output[cursor:], true
}

func parseGitShowRawAndNumstat(diffPayload string) ([]rawChangedFile, map[string]numstat) {
	payload := strings.TrimLeft(diffPayload, "\r\n")
	tokens := strings.Split(payload, "\x00")
	if len(tokens) > 0 && tokens[len(tokens)-1] == "" {
		tokens = tokens[:len(tokens)-1]
	}

	files := make([]rawChangedFile, 0)
	index := 0
	for index < len(tokens) {
		header := tokens[index]
		if header == "" || !strings.HasPrefix(header, ":") {
			break
		}
		index++
		parts := strings.Fields(header)
		if len(parts) == 0 {
			continue
		}
		statusCode := strings.TrimSpace(parts[len(parts)-1])
		if statusCode == "" {
			continue
		}

		var oldPath *string
		var newPath string
		if strings.HasPrefix(statusCode, "R") || strings.HasPrefix(statusCode, "C") {
			if index+1 >= len(tokens) {
				break
			}
			oldPath = optionalString(tokens[index])
			newPath = tokens[index+1]
			index += 2
		} else {
			if index >= len(tokens) {
				break
			}
			newPath = tokens[index]
			index++
		}
		if newPath == "" {
			continue
		}
		files = append(files, rawChangedFile{
			newPath:    newPath,
			oldPath:    oldPath,
			statusCode: statusCode,
		})
	}

	statsByPath := make(map[string]numstat)
	for index < len(tokens) {
		token := tokens[index]
		index++
		if token == "" {
			continue
		}

		firstTab := strings.IndexByte(token, '\t')
		if firstTab == -1 {
			continue
		}
		secondTab := strings.IndexByte(token[firstTab+1:], '\t')
		if secondTab == -1 {
			continue
		}
		secondTab += firstTab + 1

		additionsText := token[:firstTab]
		deletionsText := token[firstTab+1 : secondTab]
		pathOrMarker := token[secondTab+1:]
		if !isNumstatField(additionsText) || !isNumstatField(deletionsText) {
			continue
		}

		additions := parseOptionalNumstat(additionsText)
		deletions := parseOptionalNumstat(deletionsText)
		newPath := pathOrMarker
		if newPath == "" {
			if index+1 >= len(tokens) {
				continue
			}
			newPath = tokens[index+1]
			index += 2
		}
		if newPath == "" {
			continue
		}
		statsByPath[newPath] = numstat{additions: additions, deletions: deletions}
	}

	return files, statsByPath
}

func hasUnexpandedDecorateAtoms(commits []Commit) bool {
	for _, commit := range commits {
		for _, decoration := range commit.Decorations {
			if strings.HasPrefix(strings.TrimSpace(decoration), decorateAtomPrefix) {
				return true
			}
		}
	}
	return false
}

func sanitizeCommitDecorations(commits []Commit) map[string][]string {
	sanitized := make(map[string][]string, len(commits))
	for _, commit := range commits {
		values := make([]string, 0, len(commit.Decorations))
		for _, decoration := range commit.Decorations {
			trimmed := strings.TrimSpace(decoration)
			if trimmed == ")" || strings.HasPrefix(trimmed, decorateAtomPrefix) {
				continue
			}
			values = append(values, trimmed)
		}
		sanitized[commit.Hash] = values
	}
	return sanitized
}

func buildRefDecorationLabel(fullRefName string, symrefTarget string) string {
	switch {
	case strings.HasPrefix(fullRefName, "refs/tags/"):
		shortName := normalizeShortRefName(fullRefName)
		if shortName == "" {
			return ""
		}
		return "tag: " + shortName
	case strings.HasPrefix(fullRefName, "refs/heads/"), strings.HasPrefix(fullRefName, "refs/remotes/"):
		shortName := normalizeShortRefName(fullRefName)
		if shortName == "" {
			return ""
		}
		targetShort := normalizeShortRefName(symrefTarget)
		if targetShort != "" {
			return shortName + " -> " + targetShort
		}
		return shortName
	default:
		return ""
	}
}

func normalizeShortRefName(fullRefName string) string {
	switch {
	case strings.HasPrefix(fullRefName, "refs/heads/"):
		return strings.TrimSpace(strings.TrimPrefix(fullRefName, "refs/heads/"))
	case strings.HasPrefix(fullRefName, "refs/remotes/"):
		return strings.TrimSpace(strings.TrimPrefix(fullRefName, "refs/remotes/"))
	case strings.HasPrefix(fullRefName, "refs/tags/"):
		return strings.TrimSpace(strings.TrimPrefix(fullRefName, "refs/tags/"))
	default:
		return ""
	}
}

func splitParents(parentsRaw string) []string {
	if strings.TrimSpace(parentsRaw) == "" {
		return []string{}
	}
	return strings.Fields(parentsRaw)
}

func parseUnixMillis(value string) int64 {
	parsed, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil {
		return 0
	}
	return parsed * 1000
}

func parseOptionalNumstat(value string) *int {
	if value == "-" {
		return nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return nil
	}
	return &parsed
}

func isNumstatField(value string) bool {
	if value == "-" {
		return true
	}
	_, err := strconv.Atoi(value)
	return err == nil
}

func appendUniqueString(values []string, value string) []string {
	if containsString(values, value) {
		return values
	}
	return append(values, value)
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func notFoundMessage(stderr string, fallback string) string {
	trimmed := strings.TrimSpace(stderr)
	if trimmed == "" {
		return fallback
	}
	return trimmed
}
