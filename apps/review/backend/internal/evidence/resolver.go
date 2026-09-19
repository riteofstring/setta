package evidence

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/setta/review/backend/internal/contracts"
)

const (
	maximumTextBytes = 1 << 20
	maximumJSONBytes = 4 << 20
	maximumDiffBytes = 4 << 20
	maximumLineBytes = 1 << 20
)

var hunkHeader = regexp.MustCompile(`^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@`)

type Resolver struct {
	root string
	git  string
}

func New(root string) (*Resolver, error) {
	if strings.TrimSpace(root) == "" || root != strings.TrimSpace(root) || strings.ContainsRune(root, '\x00') {
		return nil, errors.New("evidence: project root is invalid")
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("evidence: resolve project root: %w", err)
	}
	canonical, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return nil, fmt.Errorf("evidence: canonicalize project root: %w", err)
	}
	info, err := os.Stat(canonical)
	if err != nil || !info.IsDir() {
		return nil, errors.New("evidence: project root is not a directory")
	}
	git, _ := exec.LookPath("git")
	return &Resolver{root: canonical, git: git}, nil
}

func (resolver *Resolver) Resolve(requestID string, reference contracts.EvidenceReference) contracts.ResolvedEvidence {
	content, err := resolver.resolve(requestID, reference)
	if err == nil {
		if validationErr := content.Validate(); validationErr == nil {
			return contracts.ResolvedEvidence{
				EvidenceID: reference.ID,
				Status:     "resolved",
				Content:    &content,
			}
		} else {
			err = fmt.Errorf("evidence: resolved content is invalid: %w", validationErr)
		}
	}
	message := err.Error()
	evidenceID := reference.ID
	return contracts.ResolvedEvidence{
		EvidenceID: reference.ID,
		Status:     "failed",
		Error: &contracts.StructuredError{
			Code:       errorCode(err),
			Message:    message,
			RequestID:  &requestID,
			EvidenceID: &evidenceID,
		},
	}
}

func (resolver *Resolver) OpenArtifact(reference contracts.EvidenceReference) (*os.File, error) {
	if reference.Kind != "artifact" || reference.Artifact == nil {
		return nil, errors.New("evidence: reference is not an artifact")
	}
	path, info, err := resolver.regularFile(reference.Artifact.Path)
	if err != nil {
		return nil, err
	}
	if info.Size() != reference.Artifact.ByteLength {
		return nil, errArtifactChanged
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("evidence: open artifact: %w", err)
	}
	digest, err := digestReader(file)
	if err != nil {
		_ = file.Close()
		return nil, err
	}
	if digest != strings.ToLower(reference.Artifact.SHA256) {
		_ = file.Close()
		return nil, errArtifactChanged
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("evidence: rewind artifact: %w", err)
	}
	return file, nil
}

func (resolver *Resolver) resolve(requestID string, reference contracts.EvidenceReference) (contracts.ResolvedEvidenceContent, error) {
	switch reference.Kind {
	case "gitDiff":
		if reference.GitDiff == nil {
			return contracts.ResolvedEvidenceContent{}, errInvalidReference
		}
		return resolver.resolveDiff(*reference.GitDiff)
	case "text":
		if reference.Text == nil {
			return contracts.ResolvedEvidenceContent{}, errInvalidReference
		}
		return resolver.resolveText(*reference.Text)
	case "json":
		if reference.JSON == nil {
			return contracts.ResolvedEvidenceContent{}, errInvalidReference
		}
		return resolver.resolveJSON(*reference.JSON)
	case "artifact":
		if reference.Artifact == nil {
			return contracts.ResolvedEvidenceContent{}, errInvalidReference
		}
		return resolver.resolveArtifact(requestID, reference.ID, reference)
	default:
		return contracts.ResolvedEvidenceContent{}, errUnsupportedKind
	}
}

func (resolver *Resolver) resolveText(reference contracts.TextEvidenceReference) (contracts.ResolvedEvidenceContent, error) {
	source, err := resolver.readVerifiedFile(reference.Path, reference.SourceSHA256, maximumTextBytes)
	if err != nil {
		return contracts.ResolvedEvidenceContent{}, err
	}
	text, err := lineRange(bytes.NewReader(source), reference.StartLine, reference.EndLine)
	if err != nil {
		return contracts.ResolvedEvidenceContent{}, err
	}
	start := reference.StartLine
	end := reference.EndLine
	truncated := false
	return contracts.ResolvedEvidenceContent{
		Kind:      "text",
		Text:      &text,
		StartLine: &start,
		EndLine:   &end,
		Truncated: &truncated,
	}, nil
}

func (resolver *Resolver) resolveJSON(reference contracts.JSONEvidenceReference) (contracts.ResolvedEvidenceContent, error) {
	source, err := resolver.readVerifiedFile(reference.Path, reference.SourceSHA256, maximumJSONBytes)
	if err != nil {
		return contracts.ResolvedEvidenceContent{}, err
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var document any
	if err := decoder.Decode(&document); err != nil {
		return contracts.ResolvedEvidenceContent{}, fmt.Errorf("evidence: decode json: %w", err)
	}
	if err := requireJSONEnd(decoder); err != nil {
		return contracts.ResolvedEvidenceContent{}, err
	}
	selected := document
	if len(reference.Pointers) > 0 {
		values := make(map[string]any, len(reference.Pointers))
		for _, pointer := range reference.Pointers {
			value, found := resolvePointer(document, pointer)
			if !found {
				return contracts.ResolvedEvidenceContent{}, fmt.Errorf("%w: %s", errJSONPointer, pointer)
			}
			values[pointer] = value
		}
		selected = values
	}
	encoded, err := json.Marshal(selected)
	if err != nil {
		return contracts.ResolvedEvidenceContent{}, fmt.Errorf("evidence: encode json selection: %w", err)
	}
	return contracts.ResolvedEvidenceContent{Kind: "json", JSON: encoded}, nil
}

func (resolver *Resolver) resolveArtifact(requestID string, evidenceID string, reference contracts.EvidenceReference) (contracts.ResolvedEvidenceContent, error) {
	file, err := resolver.OpenArtifact(reference)
	if err != nil {
		return contracts.ResolvedEvidenceContent{}, err
	}
	_ = file.Close()
	artifact := reference.Artifact
	route := "/api/v1/evidence/" + requestID + "/" + evidenceID
	mediaType := artifact.MediaType
	byteLength := artifact.ByteLength
	digest := strings.ToLower(artifact.SHA256)
	return contracts.ResolvedEvidenceContent{
		Kind:       "artifact",
		Route:      &route,
		MediaType:  &mediaType,
		ByteLength: &byteLength,
		SHA256:     &digest,
	}, nil
}

func (resolver *Resolver) resolveDiff(reference contracts.GitDiffEvidenceReference) (contracts.ResolvedEvidenceContent, error) {
	if resolver.git == "" {
		return contracts.ResolvedEvidenceContent{}, errGitUnavailable
	}
	repository, err := resolver.directory(reference.RepositoryPath)
	if err != nil {
		return contracts.ResolvedEvidenceContent{}, err
	}
	path, err := cleanRelative(reference.Path)
	if err != nil {
		return contracts.ResolvedEvidenceContent{}, err
	}
	if _, _, err := regularFileWithin(repository, path); err != nil {
		return contracts.ResolvedEvidenceContent{}, err
	}
	if err := validateDiffRevisions(reference); err != nil {
		return contracts.ResolvedEvidenceContent{}, err
	}
	patch, err := resolver.runGitDiff(diffArguments(repository, path, reference))
	if err != nil {
		return contracts.ResolvedEvidenceContent{}, err
	}
	patch, err = selectHunk(patch, reference.Hunk)
	if err != nil {
		return contracts.ResolvedEvidenceContent{}, err
	}
	if digestBytes([]byte(patch)) != reference.PatchSHA256 {
		return contracts.ResolvedEvidenceContent{}, errEvidenceChanged
	}
	truncated := false
	return contracts.ResolvedEvidenceContent{Kind: "gitDiff", UnifiedDiff: &patch, Truncated: &truncated}, nil
}

func (resolver *Resolver) readVerifiedFile(relative string, expectedSHA256 string, maximum int) ([]byte, error) {
	path, info, err := resolver.regularFile(relative)
	if err != nil {
		return nil, err
	}
	if info.Size() > int64(maximum) {
		return nil, errEvidenceTooLarge
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("evidence: open source: %w", err)
	}
	defer file.Close()
	source, err := io.ReadAll(io.LimitReader(file, int64(maximum)+1))
	if err != nil {
		return nil, fmt.Errorf("evidence: read source: %w", err)
	}
	if len(source) > maximum {
		return nil, errEvidenceTooLarge
	}
	if digestBytes(source) != expectedSHA256 {
		return nil, errEvidenceChanged
	}
	return source, nil
}

func validateDiffRevisions(reference contracts.GitDiffEvidenceReference) error {
	if !validRevision(reference.BaseRevision) || reference.TargetRevision != nil && !validRevision(*reference.TargetRevision) {
		return errInvalidRevision
	}
	return nil
}

func diffArguments(repository string, path string, reference contracts.GitDiffEvidenceReference) []string {
	arguments := []string{"-C", repository, "diff", "--no-ext-diff", "--no-color", "--unified=" + strconv.Itoa(reference.ContextLines), reference.BaseRevision}
	if reference.TargetRevision != nil {
		arguments = append(arguments, *reference.TargetRevision)
	}
	return append(arguments, "--", filepath.ToSlash(path))
}

func (resolver *Resolver) runGitDiff(arguments []string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, resolver.git, arguments...)
	stdout := boundedBuffer{maximum: maximumDiffBytes}
	stderr := boundedBuffer{maximum: 64 << 10}
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		if ctx.Err() != nil {
			return "", errGitTimeout
		}
		if stdout.exceeded || stderr.exceeded {
			return "", errEvidenceTooLarge
		}
		return "", fmt.Errorf("%w: %s", errGitFailure, strings.TrimSpace(stderr.String()))
	}
	return stdout.String(), nil
}

func (resolver *Resolver) regularFile(relative string) (string, os.FileInfo, error) {
	return regularFileWithin(resolver.root, relative)
}

func (resolver *Resolver) directory(relative string) (string, error) {
	cleaned, err := cleanRelativeDirectory(relative)
	if err != nil {
		return "", err
	}
	joined := filepath.Join(resolver.root, cleaned)
	if err := ensureNoSymlink(resolver.root, cleaned); err != nil {
		return "", err
	}
	info, err := os.Stat(joined)
	if err != nil {
		return "", fmt.Errorf("evidence: inspect directory: %w", err)
	}
	if !info.IsDir() {
		return "", errNotDirectory
	}
	return joined, nil
}

func regularFileWithin(root string, relative string) (string, os.FileInfo, error) {
	cleaned, err := cleanRelative(relative)
	if err != nil {
		return "", nil, err
	}
	if err := ensureNoSymlink(root, cleaned); err != nil {
		return "", nil, err
	}
	joined := filepath.Join(root, cleaned)
	info, err := os.Lstat(joined)
	if err != nil {
		return "", nil, fmt.Errorf("evidence: inspect file: %w", err)
	}
	if !info.Mode().IsRegular() {
		return "", nil, errNotRegular
	}
	return joined, info, nil
}

func cleanRelative(relative string) (string, error) {
	if relative == "" || relative != strings.TrimSpace(relative) || filepath.IsAbs(relative) || strings.ContainsRune(relative, '\x00') {
		return "", errUnsafePath
	}
	cleaned := filepath.Clean(relative)
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return "", errUnsafePath
	}
	return cleaned, nil
}

func cleanRelativeDirectory(relative string) (string, error) {
	if relative == "." {
		return ".", nil
	}
	return cleanRelative(relative)
}

func ensureNoSymlink(root string, relative string) error {
	if relative == "." {
		return nil
	}
	current := root
	for _, part := range strings.Split(relative, string(filepath.Separator)) {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil {
			return fmt.Errorf("evidence: inspect path: %w", err)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return errSymlink
		}
	}
	return nil
}

func lineRange(reader io.Reader, start int, end int) (string, error) {
	if start < 1 || end < start {
		return "", errInvalidLineRange
	}
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64<<10), maximumLineBytes)
	var lines []string
	line := 0
	for scanner.Scan() {
		line++
		if line >= start && line <= end {
			lines = append(lines, scanner.Text())
		}
		if line >= end {
			break
		}
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("evidence: read line range: %w", err)
	}
	if line < end {
		return "", errLineRangeMissing
	}
	return strings.Join(lines, "\n"), nil
}

func requireJSONEnd(decoder *json.Decoder) error {
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return errJSONTrailing
		}
		return fmt.Errorf("evidence: decode trailing json: %w", err)
	}
	return nil
}

func resolvePointer(document any, pointer string) (any, bool) {
	if pointer == "" {
		return document, true
	}
	if !strings.HasPrefix(pointer, "/") {
		return nil, false
	}
	current := document
	for _, raw := range strings.Split(pointer[1:], "/") {
		token := strings.ReplaceAll(strings.ReplaceAll(raw, "~1", "/"), "~0", "~")
		var found bool
		current, found = resolvePointerToken(current, token)
		if !found {
			return nil, false
		}
	}
	return current, true
}

func resolvePointerToken(current any, token string) (any, bool) {
	switch value := current.(type) {
	case map[string]any:
		selected, found := value[token]
		return selected, found
	case []any:
		return resolveArrayToken(value, token)
	default:
		return nil, false
	}
}

func resolveArrayToken(values []any, token string) (any, bool) {
	if token == "" || token[0] == '+' || len(token) > 1 && token[0] == '0' {
		return nil, false
	}
	index, err := strconv.Atoi(token)
	if err != nil || index < 0 || index >= len(values) {
		return nil, false
	}
	return values[index], true
}

func digestReader(reader io.Reader) (string, error) {
	hash := sha256.New()
	if _, err := io.Copy(hash, reader); err != nil {
		return "", fmt.Errorf("evidence: hash artifact: %w", err)
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func digestBytes(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func validRevision(revision string) bool {
	return revision != "" && revision == strings.TrimSpace(revision) && !strings.HasPrefix(revision, "-") && !strings.ContainsRune(revision, '\x00')
}

func selectHunk(patch string, wanted contracts.GitHunk) (string, error) {
	lines := strings.Split(strings.TrimSuffix(patch, "\n"), "\n")
	preambleEnd := 0
	selectedStart := -1
	selectedEnd := len(lines)
	for index, line := range lines {
		match := hunkHeader.FindStringSubmatch(line)
		if match == nil {
			continue
		}
		if preambleEnd == 0 {
			preambleEnd = index
		}
		if selectedStart >= 0 {
			selectedEnd = index
			break
		}
		oldStart, _ := strconv.Atoi(match[1])
		oldLines := countOrOne(match[2])
		newStart, _ := strconv.Atoi(match[3])
		newLines := countOrOne(match[4])
		if oldStart == wanted.OldStart && oldLines == wanted.OldLines && newStart == wanted.NewStart && newLines == wanted.NewLines {
			selectedStart = index
		}
	}
	if selectedStart < 0 {
		return "", errHunkMissing
	}
	selected := append([]string{}, lines[:preambleEnd]...)
	selected = append(selected, lines[selectedStart:selectedEnd]...)
	return strings.Join(selected, "\n") + "\n", nil
}

func countOrOne(value string) int {
	if value == "" {
		return 1
	}
	count, _ := strconv.Atoi(value)
	return count
}

type boundedBuffer struct {
	bytes.Buffer
	maximum  int
	exceeded bool
}

func (buffer *boundedBuffer) Write(data []byte) (int, error) {
	remaining := buffer.maximum - buffer.Len()
	if remaining <= 0 {
		buffer.exceeded = true
		return 0, errEvidenceTooLarge
	}
	if len(data) > remaining {
		_, _ = buffer.Buffer.Write(data[:remaining])
		buffer.exceeded = true
		return remaining, errEvidenceTooLarge
	}
	return buffer.Buffer.Write(data)
}

var (
	errArtifactChanged  = errors.New("evidence: artifact bytes do not match the admitted identity")
	errEvidenceChanged  = errors.New("evidence: source bytes do not match the admitted identity")
	errEvidenceTooLarge = errors.New("evidence: content exceeds the admitted size limit")
	errGitFailure       = errors.New("evidence: git could not resolve the requested diff")
	errGitTimeout       = errors.New("evidence: git resolution timed out")
	errGitUnavailable   = errors.New("evidence: git is unavailable")
	errHunkMissing      = errors.New("evidence: requested git hunk was not found")
	errInvalidLineRange = errors.New("evidence: line range is invalid")
	errInvalidReference = errors.New("evidence: reference payload does not match its kind")
	errInvalidRevision  = errors.New("evidence: git revision is invalid")
	errJSONPointer      = errors.New("evidence: json pointer was not found")
	errJSONTrailing     = errors.New("evidence: json file contains trailing content")
	errLineRangeMissing = errors.New("evidence: line range exceeds the file")
	errNotDirectory     = errors.New("evidence: path is not a directory")
	errNotRegular       = errors.New("evidence: path is not a regular file")
	errSymlink          = errors.New("evidence: symlink paths are not admitted")
	errUnsafePath       = errors.New("evidence: path escapes the project root")
	errUnsupportedKind  = errors.New("evidence: kind is unsupported")
)

func errorCode(err error) string {
	switch {
	case errors.Is(err, errArtifactChanged):
		return "artifact_changed"
	case errors.Is(err, errEvidenceChanged):
		return "evidence_changed"
	case errors.Is(err, errEvidenceTooLarge):
		return "evidence_too_large"
	case errors.Is(err, errGitFailure), errors.Is(err, errGitTimeout), errors.Is(err, errGitUnavailable):
		return "git_unavailable"
	case errors.Is(err, errHunkMissing):
		return "hunk_missing"
	case errors.Is(err, errInvalidLineRange), errors.Is(err, errLineRangeMissing):
		return "line_range_invalid"
	case errors.Is(err, errJSONPointer):
		return "json_pointer_missing"
	case errors.Is(err, errNotDirectory), errors.Is(err, errNotRegular), errors.Is(err, os.ErrNotExist):
		return "evidence_missing"
	case errors.Is(err, errSymlink), errors.Is(err, errUnsafePath):
		return "unsafe_path"
	case errors.Is(err, errUnsupportedKind):
		return "unsupported_evidence"
	default:
		return "evidence_invalid"
	}
}
