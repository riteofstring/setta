package chatattachments

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"setta/internal/auth"
	"setta/internal/deployments"
	"setta/internal/projectstate"
	"setta/internal/statefs"
)

const defaultTokenTTL = 10 * time.Minute

var (
	ErrSettaFilesRootRequired       = errors.New("chat attachments setta files root is required")
	ErrProjectStateRequired         = errors.New("chat attachments project state is required")
	ErrSessionProviderRequired      = errors.New("chat attachments session provider is required")
	ErrAttachmentTokenUnavailable   = errors.New("attachment token secret unavailable")
	ErrAttachmentDownloadURLMissing = errors.New("attachment download URL origin is unavailable")
	ErrInvalidAttachmentToken       = errors.New("invalid or expired attachment token")
	ErrAttachmentSessionMismatch    = errors.New("attachment token session mismatch")
	ErrAttachmentNotFound           = errors.New("attachment not found")
	ErrAttachmentPathIsDirectory    = errors.New("attachment path is a directory")
)

var textMimeTypes = map[string]struct{}{
	"application/javascript":            {},
	"application/json":                  {},
	"application/toml":                  {},
	"application/x-javascript":          {},
	"application/x-python":              {},
	"application/x-www-form-urlencoded": {},
	"application/x-yaml":                {},
	"application/xml":                   {},
	"application/yaml":                  {},
	"text/markdown":                     {},
	"text/x-markdown":                   {},
	"text/x-python":                     {},
	"text/x-toml":                       {},
}

var textFileExtensions = map[string]struct{}{
	".cfg":      {},
	".conf":     {},
	".csv":      {},
	".ini":      {},
	".json":     {},
	".log":      {},
	".markdown": {},
	".md":       {},
	".py":       {},
	".toml":     {},
	".tsv":      {},
	".txt":      {},
	".xml":      {},
	".yaml":     {},
	".yml":      {},
}

var extensionMimeOverrides = map[string]string{
	".cfg":  "text/plain",
	".conf": "text/plain",
	".csv":  "text/csv",
	".ini":  "text/plain",
	".json": "application/json",
	".log":  "text/plain",
	".md":   "text/markdown",
	".py":   "text/x-python",
	".toml": "application/toml",
	".tsv":  "text/tab-separated-values",
	".txt":  "text/plain",
	".xml":  "application/xml",
	".yaml": "application/yaml",
	".yml":  "application/yaml",
}

type SessionProvider interface {
	CurrentSession() (*auth.CurrentSession, bool)
}

type ServiceOptions struct {
	SettaFilesRoot string
	Host           string
	Port           int
	ProjectState   *projectstate.Runtime
	Deployment     *deployments.Runtime
	Sessions       SessionProvider
	TimeNow        func() time.Time
}

type Service struct {
	settaFilesRoot string
	artifactsRoot  string
	host           string
	port           int
	projectState   *projectstate.Runtime
	deployment     *deployments.Runtime
	sessions       SessionProvider
	timeNow        func() time.Time
	tokenTTL       time.Duration
}

type BuildPayloadRequest struct {
	Messages            []map[string]any
	ProjectConfigID     string
	IncludeText         bool
	IncludeTextNoImages bool
	IncludeDownloadURLs bool
}

type BuildPayloadResult struct {
	AttachmentText         string
	AttachmentTextNoImages string
	AttachmentURLs         map[string]string
}

type DownloadResult struct {
	Content   []byte
	MediaType string
	Filename  string
}

type DownloadURLEntry struct {
	ArtifactID string
	URL        string
	ExpiresAt  int64
}

type attachmentAccessContext struct {
	baseRoot        string
	artifactsRoot   string
	projectConfigID string
	shareSessionID  string
}

type tokenPayload struct {
	ArtifactID      string `json:"artifactId"`
	Exp             int64  `json:"exp"`
	ProjectConfigID string `json:"projectConfigId,omitempty"`
	ShareSessionID  string `json:"shareSessionId,omitempty"`
}

type ProjectConfigNotFoundError struct {
	ProjectConfigID string
}

func (e *ProjectConfigNotFoundError) Error() string {
	if e == nil {
		return "unknown project config id"
	}
	return fmt.Sprintf("Unknown project config id: %s", e.ProjectConfigID)
}

func NewService(opts ServiceOptions) (*Service, error) {
	settaFilesRoot, err := statefs.NormalizePath(opts.SettaFilesRoot, "")
	if err != nil || strings.TrimSpace(settaFilesRoot) == "" {
		return nil, ErrSettaFilesRootRequired
	}
	if opts.ProjectState == nil {
		return nil, ErrProjectStateRequired
	}
	if opts.Sessions == nil {
		return nil, ErrSessionProviderRequired
	}
	timeNow := opts.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	return &Service{
		settaFilesRoot: settaFilesRoot,
		artifactsRoot:  filepath.Join(settaFilesRoot, "artifacts"),
		host:           strings.TrimSpace(opts.Host),
		port:           opts.Port,
		projectState:   opts.ProjectState,
		deployment:     opts.Deployment,
		sessions:       opts.Sessions,
		timeNow:        timeNow,
		tokenTTL:       defaultTokenTTL,
	}, nil
}

func HasAttachments(messages []map[string]any) bool {
	return len(collectMessageAttachments(messages)) != 0
}

func (s *Service) BuildPayload(req BuildPayloadRequest) (BuildPayloadResult, error) {
	attachments := collectMessageAttachments(req.Messages)
	if len(attachments) == 0 {
		return BuildPayloadResult{}, nil
	}

	result := BuildPayloadResult{}
	if req.IncludeText || req.IncludeTextNoImages {
		withImages, withoutImages := s.buildPromptTextPair(attachments)
		if req.IncludeText && strings.TrimSpace(withImages) != "" {
			result.AttachmentText = withImages
		}
		if req.IncludeTextNoImages && strings.TrimSpace(withoutImages) != "" {
			result.AttachmentTextNoImages = withoutImages
		}
	}
	if req.IncludeDownloadURLs {
		urls, err := s.buildAttachmentURLs(attachments, strings.TrimSpace(req.ProjectConfigID))
		if err != nil {
			return BuildPayloadResult{}, err
		}
		if len(urls) != 0 {
			result.AttachmentURLs = urls
		}
	}
	return result, nil
}

func (s *Service) Download(token string) (DownloadResult, error) {
	return s.DownloadForShareSession(token, "")
}

func (s *Service) DownloadForShareSession(token string, shareSessionID string) (DownloadResult, error) {
	secret, err := s.requireSessionSecret()
	if err != nil {
		return DownloadResult{}, err
	}
	payload, err := validateToken(strings.TrimSpace(token), secret, s.timeNow())
	if err != nil {
		return DownloadResult{}, err
	}
	resolvedShareSessionID := strings.TrimSpace(shareSessionID)
	if strings.TrimSpace(payload.ShareSessionID) != resolvedShareSessionID {
		return DownloadResult{}, ErrAttachmentSessionMismatch
	}
	access, err := s.resolveAttachmentAccess(resolvedShareSessionID, payload.ProjectConfigID)
	if err != nil {
		return DownloadResult{}, err
	}
	resolvedPath, err := access.resolvePath(payload.ArtifactID, true)
	if err != nil {
		return DownloadResult{}, err
	}
	content, err := readAttachmentFile(resolvedPath)
	if err != nil {
		return DownloadResult{}, err
	}
	return buildDownloadResult(resolvedPath, content), nil
}

func (s *Service) BuildDownloadURL(
	artifactID string,
	projectConfigID string,
	shareSessionID string,
	buildURL func(token string, shareSessionID string) string,
) (DownloadURLEntry, error) {
	secret, err := s.requireSessionSecret()
	if err != nil {
		return DownloadURLEntry{}, err
	}
	now := s.timeNow()
	expiresAt := now.Unix() + int64(s.tokenTTL/time.Second)
	access, err := s.resolveAttachmentAccess(shareSessionID, projectConfigID)
	if err != nil {
		return DownloadURLEntry{}, err
	}
	resolvedPath, err := access.resolvePath(artifactID, true)
	if err != nil {
		return DownloadURLEntry{}, err
	}
	normalizedArtifactID, err := access.normalizeArtifactID(resolvedPath)
	if err != nil {
		return DownloadURLEntry{}, err
	}
	token, err := mintToken(tokenPayload{
		ArtifactID:      normalizedArtifactID,
		Exp:             expiresAt,
		ProjectConfigID: access.projectConfigID,
		ShareSessionID:  access.shareSessionID,
	}, secret)
	if err != nil {
		return DownloadURLEntry{}, err
	}
	downloadURL, err := s.resolveDownloadURL(token, access.shareSessionID, buildURL)
	if err != nil {
		return DownloadURLEntry{}, err
	}
	return DownloadURLEntry{
		ArtifactID: strings.TrimSpace(artifactID),
		URL:        downloadURL,
		ExpiresAt:  expiresAt,
	}, nil
}

func (s *Service) BuildDownloadURLs(
	artifactIDs []string,
	projectConfigID string,
	shareSessionID string,
	buildURL func(token string, shareSessionID string) string,
) ([]DownloadURLEntry, error) {
	if len(artifactIDs) == 0 {
		return nil, nil
	}
	entries := make([]DownloadURLEntry, 0, len(artifactIDs))
	for _, artifactID := range artifactIDs {
		entry, err := s.BuildDownloadURL(artifactID, projectConfigID, shareSessionID, buildURL)
		if err != nil {
			continue
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

func (r BuildPayloadResult) AsMap() map[string]any {
	payload := map[string]any{}
	if strings.TrimSpace(r.AttachmentText) != "" {
		payload["attachmentText"] = r.AttachmentText
	}
	if strings.TrimSpace(r.AttachmentTextNoImages) != "" {
		payload["attachmentTextNoImages"] = r.AttachmentTextNoImages
	}
	if len(r.AttachmentURLs) != 0 {
		urls := make(map[string]string, len(r.AttachmentURLs))
		for key, value := range r.AttachmentURLs {
			urls[key] = value
		}
		payload["attachmentUrls"] = urls
	}
	return payload
}

func BuildContentDisposition(filename string) string {
	asciiName := sanitizeASCIIFilename(filename)
	if filename == asciiName {
		return fmt.Sprintf("inline; filename=%q", asciiName)
	}
	return fmt.Sprintf("inline; filename=%q; filename*=UTF-8''%s", asciiName, urlQueryEscape(filename))
}

func (s *Service) buildAttachmentURLs(attachments []chatAttachment, projectConfigID string) (map[string]string, error) {
	secret, err := s.requireSessionSecret()
	if err != nil {
		return nil, err
	}
	origin := buildBackendOrigin(s.host, s.port)
	if origin == "" {
		return nil, ErrAttachmentDownloadURLMissing
	}
	now := s.timeNow()
	expiresAt := now.Unix() + int64(s.tokenTTL/time.Second)
	urls := make(map[string]string, len(attachments))
	for _, attachment := range attachments {
		token, err := mintToken(tokenPayload{
			ArtifactID:      attachment.ID,
			Exp:             expiresAt,
			ProjectConfigID: projectConfigID,
		}, secret)
		if err != nil {
			return nil, err
		}
		urls[attachment.ID] = origin + "/api/attachments/" + token
	}
	return urls, nil
}

func (s *Service) requireSessionSecret() ([]byte, error) {
	if s == nil {
		return nil, ErrAttachmentTokenUnavailable
	}
	currentSession, ok := s.sessions.CurrentSession()
	if !ok || currentSession == nil || len(currentSession.Secret) == 0 {
		return nil, ErrAttachmentTokenUnavailable
	}
	return currentSession.Secret, nil
}

func (s *Service) resolveAttachmentAccess(shareSessionID string, projectConfigID string) (attachmentAccessContext, error) {
	trimmedShareSessionID := strings.TrimSpace(shareSessionID)
	baseRoot, artifactsRoot, snapshot, err := s.resolveAttachmentRoots(trimmedShareSessionID)
	if err != nil {
		return attachmentAccessContext{}, err
	}
	trimmedProjectConfigID := strings.TrimSpace(projectConfigID)
	if err := validateProjectConfigID(snapshot, trimmedProjectConfigID); err != nil {
		return attachmentAccessContext{}, err
	}
	return attachmentAccessContext{
		baseRoot:        baseRoot,
		artifactsRoot:   artifactsRoot,
		projectConfigID: trimmedProjectConfigID,
		shareSessionID:  trimmedShareSessionID,
	}, nil
}

func (s *Service) resolveAttachmentRoots(shareSessionID string) (string, string, projectstate.Snapshot, error) {
	trimmedShareSessionID := strings.TrimSpace(shareSessionID)
	if trimmedShareSessionID == "" {
		return s.settaFilesRoot, s.artifactsRoot, s.projectState.Snapshot(), nil
	}
	if s.deployment == nil {
		return "", "", projectstate.Snapshot{}, ErrAttachmentNotFound
	}
	deploymentRoot := s.deployment.Paths().DeploymentRoot
	return deploymentRoot, filepath.Join(deploymentRoot, "artifacts"), s.deployment.Base().Snapshot(), nil
}

func validateProjectConfigID(snapshot projectstate.Snapshot, projectConfigID string) error {
	if projectConfigID == "" {
		return nil
	}
	if _, err := snapshot.Document.ProjectByID(projectConfigID); err != nil {
		return &ProjectConfigNotFoundError{ProjectConfigID: projectConfigID}
	}
	return nil
}

func (c attachmentAccessContext) resolvePath(artifactID string, requireExists bool) (string, error) {
	return resolveAttachmentPath(artifactID, c.baseRoot, c.artifactsRoot, requireExists)
}

func (c attachmentAccessContext) normalizeArtifactID(resolvedPath string) (string, error) {
	return normalizeArtifactID(resolvedPath, c.artifactsRoot)
}

func (s *Service) resolveDownloadURL(
	token string,
	shareSessionID string,
	buildURL func(token string, shareSessionID string) string,
) (string, error) {
	downloadURL := ""
	if buildURL != nil {
		downloadURL = strings.TrimSpace(buildURL(token, shareSessionID))
	}
	if downloadURL == "" {
		downloadURL = buildDefaultDownloadURL(s.host, s.port, token, shareSessionID)
	}
	if downloadURL == "" {
		return "", ErrAttachmentDownloadURLMissing
	}
	return downloadURL, nil
}

func (s *Service) buildPromptTextPair(attachments []chatAttachment) (string, string) {
	withImages := make([]string, 0, len(attachments))
	withoutImages := make([]string, 0, len(attachments))
	for _, attachment := range attachments {
		resolvedPath, err := resolveAttachmentPath(
			attachment.ID,
			s.settaFilesRoot,
			s.artifactsRoot,
			false,
		)
		if err != nil && !errors.Is(err, ErrAttachmentNotFound) {
			resolvedPath = ""
		}
		mimeType := normalizeMimeType(normalizeAttachmentMime(attachment, resolvedPath))
		if isImageMime(mimeType) {
			withImages = append(withImages, buildAttachmentPlaceholderBlock(attachment, mimeType))
			continue
		}
		if isTextAttachment(attachment, mimeType, resolvedPath) {
			payload, readErr := os.ReadFile(resolvedPath)
			if readErr != nil {
				missing := buildMissingAttachmentBlock(attachment, mimeType)
				withImages = append(withImages, missing)
				withoutImages = append(withoutImages, missing)
				continue
			}
			block := buildAttachmentTextBlock(attachment, string(payload))
			withImages = append(withImages, block)
			withoutImages = append(withoutImages, block)
			continue
		}
		placeholder := buildAttachmentPlaceholderBlock(attachment, mimeType)
		withImages = append(withImages, placeholder)
		withoutImages = append(withoutImages, placeholder)
	}
	return joinPromptBlocks(withImages), joinPromptBlocks(withoutImages)
}

type chatAttachment struct {
	ID       string
	Name     string
	MimeType string
	Size     *int64
}

func collectMessageAttachments(messages []map[string]any) []chatAttachment {
	if len(messages) == 0 {
		return nil
	}
	collected := make([]chatAttachment, 0)
	seen := make(map[string]struct{})
	for _, message := range messages {
		rawAttachments, ok := message["attachments"]
		if !ok {
			continue
		}
		for _, attachment := range anySlice(rawAttachments) {
			typed, ok := attachment.(map[string]any)
			if !ok {
				continue
			}
			if kind := strings.TrimSpace(stringValue(typed["kind"])); kind != "" && kind != "file" {
				continue
			}
			id := strings.TrimSpace(stringValue(typed["id"]))
			if id == "" {
				continue
			}
			if _, exists := seen[id]; exists {
				continue
			}
			seen[id] = struct{}{}
			name := strings.TrimSpace(stringValue(typed["name"]))
			if name == "" {
				name = filepath.Base(id)
			}
			collected = append(collected, chatAttachment{
				ID:       id,
				Name:     name,
				MimeType: strings.TrimSpace(stringValue(typed["mimeType"])),
				Size:     int64Ptr(typed["size"]),
			})
		}
	}
	return collected
}

func resolveAttachmentPath(artifactID string, baseRoot string, artifactsRoot string, requireExists bool) (string, error) {
	trimmedID := strings.TrimSpace(artifactID)
	if trimmedID == "" {
		return "", ErrAttachmentNotFound
	}
	resolvedCandidate, err := resolveAttachmentCandidate(trimmedID, baseRoot)
	if err != nil {
		return "", ErrAttachmentNotFound
	}
	resolvedBaseRoot, resolvedArtifactsRoot, err := resolveAttachmentRootsForPath(baseRoot, artifactsRoot)
	if err != nil {
		return "", ErrAttachmentNotFound
	}
	if err := validateResolvedAttachmentPath(trimmedID, resolvedCandidate, resolvedBaseRoot, resolvedArtifactsRoot); err != nil {
		return "", err
	}
	return finalizeResolvedAttachmentPath(resolvedCandidate, requireExists)
}

func resolveAttachmentCandidate(trimmedID string, baseRoot string) (string, error) {
	candidate := trimmedID
	if !filepath.IsAbs(trimmedID) {
		candidate = filepath.Join(baseRoot, trimmedID)
	}
	return resolvePath(candidate)
}

func resolveAttachmentRootsForPath(baseRoot string, artifactsRoot string) (string, string, error) {
	resolvedBaseRoot, err := resolvePath(baseRoot)
	if err != nil {
		return "", "", err
	}
	resolvedArtifactsRoot, err := resolvePath(artifactsRoot)
	if err != nil {
		return "", "", err
	}
	return resolvedBaseRoot, resolvedArtifactsRoot, nil
}

func validateResolvedAttachmentPath(
	trimmedID string,
	resolvedCandidate string,
	resolvedBaseRoot string,
	resolvedArtifactsRoot string,
) error {
	if !filepath.IsAbs(trimmedID) && !isWithinRoot(resolvedBaseRoot, resolvedCandidate) {
		return ErrAttachmentNotFound
	}
	if !isWithinRoot(resolvedArtifactsRoot, resolvedCandidate) {
		return ErrAttachmentNotFound
	}
	return nil
}

func finalizeResolvedAttachmentPath(resolvedCandidate string, requireExists bool) (string, error) {
	info, err := os.Stat(resolvedCandidate)
	switch {
	case err == nil && info.IsDir():
		return "", ErrAttachmentPathIsDirectory
	case err == nil:
		return resolvedCandidate, nil
	case os.IsNotExist(err):
		if requireExists {
			return "", ErrAttachmentNotFound
		}
		return resolvedCandidate, nil
	default:
		return "", ErrAttachmentNotFound
	}
}

func normalizeArtifactID(resolvedPath string, artifactsRoot string) (string, error) {
	resolvedArtifactsRoot, err := resolvePath(artifactsRoot)
	if err != nil {
		return "", ErrAttachmentNotFound
	}
	resolvedCandidate, err := resolvePath(resolvedPath)
	if err != nil {
		return "", ErrAttachmentNotFound
	}
	if !isWithinRoot(resolvedArtifactsRoot, resolvedCandidate) {
		return "", ErrAttachmentNotFound
	}
	relativePath, err := filepath.Rel(resolvedArtifactsRoot, resolvedCandidate)
	if err != nil {
		return "", ErrAttachmentNotFound
	}
	if relativePath == "." || relativePath == "" {
		return "", ErrAttachmentNotFound
	}
	if relativePath == ".." || strings.HasPrefix(relativePath, ".."+string(filepath.Separator)) {
		return "", ErrAttachmentNotFound
	}
	return filepath.ToSlash(filepath.Join("artifacts", relativePath)), nil
}

func buildDefaultDownloadURL(host string, port int, token string, shareSessionID string) string {
	origin := buildBackendOrigin(host, port)
	if origin == "" {
		return ""
	}
	downloadURL := origin + "/api/attachments/" + token
	if strings.TrimSpace(shareSessionID) == "" {
		return downloadURL
	}
	return downloadURL + "?shareSessionId=" + urlQueryEscape(shareSessionID)
}

func readAttachmentFile(resolvedPath string) ([]byte, error) {
	content, err := os.ReadFile(resolvedPath)
	if err == nil {
		return content, nil
	}
	if os.IsNotExist(err) {
		return nil, ErrAttachmentNotFound
	}
	return nil, fmt.Errorf("read attachment: %w", err)
}

func buildDownloadResult(resolvedPath string, content []byte) DownloadResult {
	return DownloadResult{
		Content:   content,
		MediaType: normalizeMimeType(guessMimeFromValue(resolvedPath)),
		Filename:  filepath.Base(resolvedPath),
	}
}

func resolvePath(raw string) (string, error) {
	normalized, err := statefs.NormalizePath(raw, "")
	if err != nil {
		return "", err
	}
	existing, suffix := deepestExistingAncestor(normalized)
	if existing == "" {
		return normalized, nil
	}
	resolvedExisting, err := filepath.EvalSymlinks(existing)
	if err != nil {
		return normalized, nil
	}
	if suffix == "" {
		return filepath.Clean(resolvedExisting), nil
	}
	return filepath.Clean(filepath.Join(resolvedExisting, suffix)), nil
}

func deepestExistingAncestor(path string) (string, string) {
	current := filepath.Clean(path)
	suffix := ""
	for {
		if _, err := os.Lstat(current); err == nil {
			return current, suffix
		}
		parent := filepath.Dir(current)
		if parent == current {
			return "", ""
		}
		base := filepath.Base(current)
		if suffix == "" {
			suffix = base
		} else {
			suffix = filepath.Join(base, suffix)
		}
		current = parent
	}
}

func isWithinRoot(root string, candidate string) bool {
	relative, err := filepath.Rel(root, candidate)
	if err != nil {
		return false
	}
	if relative == ".." {
		return false
	}
	return !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func normalizeAttachmentMime(attachment chatAttachment, resolvedPath string) string {
	if strings.TrimSpace(attachment.MimeType) != "" {
		return attachment.MimeType
	}
	for _, value := range []string{resolvedPath, attachment.Name, attachment.ID} {
		if guessed := guessMimeFromValue(value); guessed != "" {
			return guessed
		}
	}
	return "application/octet-stream"
}

func guessMimeFromValue(value string) string {
	for _, suffix := range allSuffixes(value) {
		if guessed, ok := extensionMimeOverrides[suffix]; ok {
			return guessed
		}
		if guessed := mime.TypeByExtension(suffix); guessed != "" {
			return guessed
		}
	}
	return ""
}

func allSuffixes(value string) []string {
	base := filepath.Base(strings.TrimSpace(value))
	if base == "" {
		return nil
	}
	parts := strings.Split(base, ".")
	if len(parts) <= 1 {
		return nil
	}
	suffixes := make([]string, 0, len(parts)-1)
	for i := 1; i < len(parts); i++ {
		suffixes = append(suffixes, "."+strings.ToLower(parts[i]))
	}
	return suffixes
}

func normalizeMimeType(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "application/octet-stream"
	}
	mimeType, _, _ := strings.Cut(trimmed, ";")
	return strings.TrimSpace(mimeType)
}

func isImageMime(mimeType string) bool {
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(mimeType)), "image/")
}

func isTextMime(mimeType string) bool {
	normalized := strings.ToLower(strings.TrimSpace(mimeType))
	if strings.HasPrefix(normalized, "text/") {
		return true
	}
	_, ok := textMimeTypes[normalized]
	return ok
}

func isTextAttachment(attachment chatAttachment, mimeType string, resolvedPath string) bool {
	if isTextMime(mimeType) {
		return true
	}
	if normalizeMimeType(mimeType) != "application/octet-stream" {
		return false
	}
	for _, suffix := range allSuffixes(firstNonEmpty(resolvedPath, attachment.Name, attachment.ID)) {
		if _, ok := textFileExtensions[suffix]; ok {
			return true
		}
	}
	return false
}

func buildAttachmentTextBlock(attachment chatAttachment, text string) string {
	header := "[Attachment: " + attachmentDisplayName(attachment) + "]"
	if strings.TrimSpace(text) == "" {
		return header
	}
	return header + "\n" + text
}

func buildAttachmentPlaceholderBlock(attachment chatAttachment, mimeType string) string {
	return "[Attachment: " + attachmentDisplayName(attachment) + "]\n" +
		"Type: " + mimeType + "\n" +
		"Size: " + attachmentSizeLabel(attachment) + "\n" +
		"Content not inlined."
}

func buildMissingAttachmentBlock(attachment chatAttachment, mimeType string) string {
	return "[Attachment missing: " + attachmentDisplayName(attachment) + "]\n" +
		"Type: " + mimeType + "\n" +
		"Size: " + attachmentSizeLabel(attachment) + "\n" +
		"Attachment not found."
}

func attachmentDisplayName(attachment chatAttachment) string {
	if strings.TrimSpace(attachment.Name) != "" {
		return attachment.Name
	}
	if base := filepath.Base(strings.TrimSpace(attachment.ID)); strings.TrimSpace(base) != "" {
		return base
	}
	return "attachment"
}

func attachmentSizeLabel(attachment chatAttachment) string {
	if attachment.Size == nil {
		return "size unknown"
	}
	return strconv.FormatInt(*attachment.Size, 10) + " bytes"
}

func joinPromptBlocks(parts []string) string {
	filtered := make([]string, 0, len(parts))
	for _, part := range parts {
		if strings.TrimSpace(part) != "" {
			filtered = append(filtered, strings.TrimSpace(part))
		}
	}
	return strings.Join(filtered, "\n\n")
}

func mintToken(payload tokenPayload, secret []byte) (string, error) {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("encode attachment token payload: %w", err)
	}
	signature := signPayload(payloadBytes, secret)
	return base64.RawURLEncoding.EncodeToString(payloadBytes) + "." + base64.RawURLEncoding.EncodeToString(signature), nil
}

func validateToken(token string, secret []byte, now time.Time) (tokenPayload, error) {
	if strings.TrimSpace(token) == "" {
		return tokenPayload{}, ErrInvalidAttachmentToken
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return tokenPayload{}, ErrInvalidAttachmentToken
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return tokenPayload{}, ErrInvalidAttachmentToken
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return tokenPayload{}, ErrInvalidAttachmentToken
	}
	expected := signPayload(payloadBytes, secret)
	if !hmac.Equal(signature, expected) {
		return tokenPayload{}, ErrInvalidAttachmentToken
	}
	var payload tokenPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return tokenPayload{}, ErrInvalidAttachmentToken
	}
	if strings.TrimSpace(payload.ArtifactID) == "" || payload.Exp <= 0 {
		return tokenPayload{}, ErrInvalidAttachmentToken
	}
	if effectiveNow(now).Unix() >= payload.Exp {
		return tokenPayload{}, ErrInvalidAttachmentToken
	}
	return payload, nil
}

func signPayload(payload []byte, secret []byte) []byte {
	digest := hmac.New(sha256.New, secret)
	_, _ = digest.Write(payload)
	return digest.Sum(nil)
}

func buildBackendOrigin(host string, port int) string {
	trimmedHost := strings.TrimSpace(host)
	if trimmedHost == "" || port <= 0 {
		return ""
	}
	switch trimmedHost {
	case "0.0.0.0":
		trimmedHost = "127.0.0.1"
	case "::":
		trimmedHost = "::1"
	}
	return "http://" + net.JoinHostPort(trimmedHost, strconv.Itoa(port))
}

func sanitizeASCIIFilename(filename string) string {
	trimmed := strings.TrimSpace(filename)
	if trimmed == "" {
		return "attachment"
	}
	var builder strings.Builder
	for _, r := range trimmed {
		if r > 127 {
			continue
		}
		if r < 32 || r == 127 || r == '"' || r == '\\' {
			builder.WriteByte('_')
			continue
		}
		builder.WriteRune(r)
	}
	if builder.Len() == 0 {
		return "attachment"
	}
	return builder.String()
}

func urlQueryEscape(value string) string {
	var builder strings.Builder
	for i := 0; i < len(value); i++ {
		b := value[i]
		if (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') || b == '-' || b == '_' || b == '.' || b == '~' {
			builder.WriteByte(b)
			continue
		}
		builder.WriteString(fmt.Sprintf("%%%02X", b))
	}
	return builder.String()
}

func anySlice(value any) []any {
	switch typed := value.(type) {
	case []any:
		return typed
	case []map[string]any:
		result := make([]any, 0, len(typed))
		for _, item := range typed {
			result = append(result, item)
		}
		return result
	default:
		return nil
	}
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	default:
		return ""
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func int64Ptr(value any) *int64 {
	switch typed := value.(type) {
	case int:
		resolved := int64(typed)
		return &resolved
	case int64:
		resolved := typed
		return &resolved
	case float64:
		resolved := int64(typed)
		return &resolved
	default:
		return nil
	}
}

func effectiveNow(now time.Time) time.Time {
	if now.IsZero() {
		return time.Now().UTC()
	}
	return now.UTC()
}
