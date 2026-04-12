package appgenskills

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	MaxSkillContentPreviewBytes = 262_144
	maxSkillDescriptionRunes    = 240
	customSkillDocFileMode      = 0o644
)

var (
	ErrWorkspaceRootRequired = errors.New("workspace root is required")

	customSkillRelativePathPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`)
	skipSegments                   = map[string]struct{}{
		"node_modules": {},
		".git":         {},
		"setta_files":  {},
		"dist":         {},
		"build":        {},
	}
	customSkillEditableRootIDs = map[string]struct{}{
		"agents_home_skills":      {},
		"user_agents_skills":      {},
		"workspace_agents_skills": {},
	}
)

type NotFoundError struct {
	message string
}

func (e *NotFoundError) Error() string {
	return e.message
}

type InvalidError struct {
	message string
}

func (e *InvalidError) Error() string {
	return e.message
}

type SkillEntry struct {
	SkillID           string  `json:"skillId"`
	Name              string  `json:"name"`
	RootLabel         string  `json:"rootLabel"`
	RootPath          string  `json:"rootPath"`
	RelativePath      string  `json:"relativePath"`
	IsEditable        bool    `json:"isEditable"`
	EditabilityReason *string `json:"editabilityReason"`
	Description       string  `json:"description"`
}

type GetSkillsResponse struct {
	Skills                          []SkillEntry `json:"skills"`
	CustomSkillCreateRootPath       *string      `json:"customSkillCreateRootPath"`
	CustomSkillCreateRootActionable bool         `json:"customSkillCreateRootActionable"`
}

type SkillContent struct {
	SkillID           string `json:"skillId"`
	Content           string `json:"content"`
	Truncated         bool   `json:"truncated"`
	OriginalSizeBytes int64  `json:"originalSizeBytes"`
}

type UpsertCustomSkillResponse struct {
	SkillID      string       `json:"skillId"`
	Created      bool         `json:"created"`
	RootPath     string       `json:"rootPath"`
	SkillDocPath string       `json:"skillDocPath"`
	Skill        SkillEntry   `json:"skill"`
	SkillContent SkillContent `json:"skillContent"`
}

type ServiceOptions struct {
	WorkspaceRoot string
	HomeDir       string
	LookupEnv     func(string) (string, bool)
}

type Service struct {
	workspaceRoot string
	homeDir       string
	lookupEnv     func(string) (string, bool)
}

type skillRoot struct {
	ID    string
	Label string
	Path  string
}

type customSkillRoot struct {
	skillRoot
	Exists bool
}

type resolvedSkillDoc struct {
	RootID       string
	RootLabel    string
	RootPath     string
	RelativePath string
	SkillDocPath string
}

type upsertCustomSkillSelection struct {
	SkillID      string
	RelativePath string
}

type upsertCustomSkillTarget struct {
	RootID       string
	RootPath     string
	RelativePath string
	SkillDocPath string
	SkillID      string
	Created      bool
}

func NewService(opts ServiceOptions) (*Service, error) {
	lookupEnv := opts.LookupEnv
	if lookupEnv == nil {
		lookupEnv = os.LookupEnv
	}

	workspaceRoot, err := normalizePath(strings.TrimSpace(opts.WorkspaceRoot), "", lookupEnv, opts.HomeDir)
	if err != nil {
		if strings.TrimSpace(opts.WorkspaceRoot) == "" {
			return nil, ErrWorkspaceRootRequired
		}
		return nil, err
	}

	homeDir := strings.TrimSpace(opts.HomeDir)
	if homeDir == "" {
		homeDir, err = os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("resolve user home: %w", err)
		}
	}
	homeDir, err = normalizePath(homeDir, "", lookupEnv, homeDir)
	if err != nil {
		return nil, err
	}

	return &Service{
		workspaceRoot: workspaceRoot,
		homeDir:       homeDir,
		lookupEnv:     lookupEnv,
	}, nil
}

func (s *Service) ResolveSkillsResponse() (GetSkillsResponse, error) {
	skills, err := s.List()
	if err != nil {
		return GetSkillsResponse{}, err
	}

	var (
		customSkillCreateRootPath       *string
		customSkillCreateRootActionable bool
	)
	if root, err := s.resolveCustomSkillCreateRoot(); err == nil {
		customSkillCreateRootPath = stringPointer(root.Path)
		customSkillCreateRootActionable = root.Exists
	}

	return GetSkillsResponse{
		Skills:                          skills,
		CustomSkillCreateRootPath:       customSkillCreateRootPath,
		CustomSkillCreateRootActionable: customSkillCreateRootActionable,
	}, nil
}

func (s *Service) SkillRootPaths() ([]string, error) {
	roots, err := s.skillRoots()
	if err != nil {
		return nil, err
	}
	paths := make([]string, 0, len(roots))
	for _, root := range roots {
		paths = append(paths, root.Path)
	}
	return paths, nil
}

func (s *Service) List() ([]SkillEntry, error) {
	roots, err := s.skillRoots()
	if err != nil {
		return nil, err
	}

	rows := make([]SkillEntry, 0)
	for _, root := range roots {
		rows = append(rows, listSkillEntriesForRoot(root)...)
	}

	sortSkillEntries(rows)
	return rows, nil
}

func listSkillEntriesForRoot(root skillRoot) []SkillEntry {
	info, err := os.Stat(root.Path)
	if err != nil || !info.IsDir() {
		return nil
	}

	skillDocs, err := iterSkillDocs(root.Path)
	if err != nil {
		return nil
	}

	rows := make([]SkillEntry, 0, len(skillDocs))
	for _, skillDocPath := range skillDocs {
		row, ok := buildSkillEntry(root, skillDocPath)
		if ok {
			rows = append(rows, row)
		}
	}
	return rows
}

func buildSkillEntry(root skillRoot, skillDocPath string) (SkillEntry, bool) {
	skillDir := filepath.Dir(skillDocPath)
	relativePath, err := filepath.Rel(root.Path, skillDir)
	if err != nil {
		return SkillEntry{}, false
	}

	relativePath = normalizeListedSkillRelativePath(relativePath)
	isEditable, editabilityReason := resolveSkillEditability(root.ID, relativePath, skillDocPath)
	return SkillEntry{
		SkillID:           fmt.Sprintf("%s::%s", root.ID, relativePath),
		Name:              filepath.Base(skillDir),
		RootLabel:         root.Label,
		RootPath:          root.Path,
		RelativePath:      relativePath,
		IsEditable:        isEditable,
		EditabilityReason: stringPointerIfPresent(editabilityReason),
		Description:       extractSkillDescription(skillDocPath),
	}, true
}

func normalizeListedSkillRelativePath(relativePath string) string {
	normalized := filepath.ToSlash(relativePath)
	if normalized == "." || normalized == "" {
		return "."
	}
	return normalized
}

func sortSkillEntries(rows []SkillEntry) {
	sort.Slice(rows, func(i, j int) bool {
		return compareSkillEntries(rows[i], rows[j]) < 0
	})
}

func compareSkillEntries(left SkillEntry, right SkillEntry) int {
	if diff := compareCaseInsensitive(left.RootLabel, right.RootLabel); diff != 0 {
		return diff
	}
	if diff := compareCaseInsensitive(left.RelativePath, right.RelativePath); diff != 0 {
		return diff
	}
	return compareCaseInsensitive(left.Name, right.Name)
}

func compareCaseInsensitive(left string, right string) int {
	return strings.Compare(strings.ToLower(left), strings.ToLower(right))
}

func (s *Service) ReadContent(skillID string) (SkillContent, error) {
	rawID := strings.TrimSpace(skillID)
	target, err := s.resolveSkillDocPathFromID(rawID)
	if err != nil {
		return SkillContent{}, err
	}

	info, err := os.Stat(target.SkillDocPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return SkillContent{}, notFoundErrorf("Missing SKILL.md for %s", rawID)
		}
		return SkillContent{}, invalidErrorf("%v", err)
	}

	handle, err := os.Open(target.SkillDocPath)
	if err != nil {
		return SkillContent{}, invalidErrorf("%v", err)
	}
	defer handle.Close()

	preview := make([]byte, MaxSkillContentPreviewBytes+1)
	readBytes, readErr := io.ReadFull(handle, preview)
	switch {
	case readErr == nil:
	case errors.Is(readErr, io.EOF), errors.Is(readErr, io.ErrUnexpectedEOF):
	default:
		return SkillContent{}, invalidErrorf("%v", readErr)
	}
	preview = preview[:readBytes]

	truncated := info.Size() > MaxSkillContentPreviewBytes
	if truncated && len(preview) > MaxSkillContentPreviewBytes {
		preview = preview[:MaxSkillContentPreviewBytes]
	}

	content, err := decodeSkillPreview(preview, truncated)
	if err != nil {
		return SkillContent{}, invalidErrorf("%v", err)
	}

	return SkillContent{
		SkillID:           rawID,
		Content:           content,
		Truncated:         truncated,
		OriginalSizeBytes: info.Size(),
	}, nil
}

func (s *Service) UpsertCustomSkill(skillID string, relativePath string, content string) (UpsertCustomSkillResponse, error) {
	selection, err := resolveUpsertCustomSkillSelection(skillID, relativePath)
	if err != nil {
		return UpsertCustomSkillResponse{}, err
	}
	target, err := s.resolveUpsertCustomSkillTarget(selection)
	if err != nil {
		return UpsertCustomSkillResponse{}, err
	}
	if err := writeUpsertCustomSkill(target, content); err != nil {
		return UpsertCustomSkillResponse{}, err
	}
	return s.buildUpsertCustomSkillResponse(target, content)
}

func (s *Service) skillRoots() ([]skillRoot, error) {
	candidates := []skillRoot{
		workspaceAgentsSkillRoot(s.workspaceRoot),
		{ID: "workspace_claude_skills", Label: "Workspace .claude/skills", Path: filepath.Join(s.workspaceRoot, ".claude", "skills")},
		defaultUserAgentsSkillRoot(s.homeDir),
		{ID: "user_claude_skills", Label: "User ~/.claude/skills", Path: filepath.Join(s.homeDir, ".claude", "skills")},
		{ID: "admin_codex_skills", Label: "Admin /etc/codex/skills", Path: "/etc/codex/skills"},
	}

	for _, envCandidate := range []struct {
		ID    string
		Label string
		Env   string
	}{
		{ID: "agents_home_skills", Label: "AGENTS_HOME skills", Env: "AGENTS_HOME"},
		{ID: "codex_home_skills", Label: "CODEX_HOME skills", Env: "CODEX_HOME"},
	} {
		root, ok, err := resolveOptionalEnvSkillRoot(envCandidate.Env, envCandidate.ID, envCandidate.Label, s.lookupEnv, s.homeDir)
		if err != nil {
			return nil, err
		}
		if ok {
			candidates = append(candidates, root)
		}
	}

	return normalizeUniqueSkillRoots(candidates, s.lookupEnv, s.homeDir)
}

func (s *Service) resolveSkillDocPathFromID(skillID string) (resolvedSkillDoc, error) {
	rootID, relativePath, err := splitSkillID(skillID)
	if err != nil {
		return resolvedSkillDoc{}, err
	}

	roots, err := s.skillRoots()
	if err != nil {
		return resolvedSkillDoc{}, err
	}
	rootByID := make(map[string]skillRoot, len(roots))
	for _, root := range roots {
		rootByID[root.ID] = root
	}

	root, ok := rootByID[rootID]
	if !ok {
		return resolvedSkillDoc{}, notFoundErrorf("Unknown skill root: %s", rootID)
	}

	normalizedRelativePath := strings.TrimSpace(relativePath)
	skillDir := root.Path
	if normalizedRelativePath == "" || normalizedRelativePath == "." {
		normalizedRelativePath = "."
	} else {
		skillDir, err = normalizePath(filepath.FromSlash(normalizedRelativePath), root.Path, s.lookupEnv, s.homeDir)
		if err != nil {
			return resolvedSkillDoc{}, invalidErrorf("%v", err)
		}
		if !isWithinRoot(root.Path, skillDir) {
			return resolvedSkillDoc{}, invalidErrorf("Invalid skill path.")
		}
	}

	return resolvedSkillDoc{
		RootID:       root.ID,
		RootLabel:    root.Label,
		RootPath:     root.Path,
		RelativePath: normalizedRelativePath,
		SkillDocPath: filepath.Join(skillDir, "SKILL.md"),
	}, nil
}

func (s *Service) iterPrioritizedCustomSkillRoots() ([]skillRoot, error) {
	candidates := make([]skillRoot, 0, 3)
	agentsHomeRoot, ok, err := resolveOptionalEnvSkillRoot("AGENTS_HOME", "agents_home_skills", "AGENTS_HOME skills", s.lookupEnv, s.homeDir)
	if err != nil {
		return nil, err
	}
	if ok {
		candidates = append(candidates, agentsHomeRoot)
	}
	candidates = append(candidates, defaultUserAgentsSkillRoot(s.homeDir), workspaceAgentsSkillRoot(s.workspaceRoot))

	roots, err := normalizeUniqueSkillRoots(candidates, s.lookupEnv, s.homeDir)
	if err != nil {
		return nil, err
	}
	if len(roots) > 0 {
		return roots, nil
	}
	return []skillRoot{defaultUserAgentsSkillRoot(s.homeDir)}, nil
}

func resolveOptionalEnvSkillRoot(envKey string, rootID string, rootLabel string, lookupEnv func(string) (string, bool), homeDir string) (skillRoot, bool, error) {
	if lookupEnv == nil {
		return skillRoot{}, false, nil
	}
	raw, ok := lookupEnv(envKey)
	if !ok || strings.TrimSpace(raw) == "" {
		return skillRoot{}, false, nil
	}

	path, err := normalizePath(raw, "", lookupEnv, homeDir)
	if err != nil {
		return skillRoot{}, false, err
	}
	if filepath.Base(path) != "skills" {
		path = filepath.Join(path, "skills")
	}

	return skillRoot{ID: rootID, Label: rootLabel, Path: path}, true, nil
}

func defaultUserAgentsSkillRoot(homeDir string) skillRoot {
	return skillRoot{
		ID:    "user_agents_skills",
		Label: "User ~/.agents/skills",
		Path:  filepath.Join(homeDir, ".agents", "skills"),
	}
}

func workspaceAgentsSkillRoot(workspaceRoot string) skillRoot {
	return skillRoot{
		ID:    "workspace_agents_skills",
		Label: "Workspace .agents/skills",
		Path:  filepath.Join(workspaceRoot, ".agents", "skills"),
	}
}

func normalizeUniqueSkillRoots(candidates []skillRoot, lookupEnv func(string) (string, bool), homeDir string) ([]skillRoot, error) {
	roots := make([]skillRoot, 0, len(candidates))
	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		path, err := normalizePath(candidate.Path, "", lookupEnv, homeDir)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[path]; ok {
			continue
		}
		seen[path] = struct{}{}
		candidate.Path = path
		roots = append(roots, candidate)
	}
	return roots, nil
}

func (s *Service) resolveCustomSkillCreateRoot() (customSkillRoot, error) {
	roots, err := s.iterPrioritizedCustomSkillRoots()
	if err != nil {
		return customSkillRoot{}, err
	}

	checked := make([]string, 0, len(roots))
	for _, root := range roots {
		ok, exists, detail := checkCustomSkillRootCandidate(root.Path)
		if ok {
			return customSkillRoot{skillRoot: root, Exists: exists}, nil
		}
		checked = append(checked, fmt.Sprintf("%s (%s): %s", root.ID, root.Path, fallbackRootDetail(detail)))
	}
	return customSkillRoot{}, invalidErrorf("No writable custom skill root available. Checked: %s", strings.Join(checked, "; "))
}

func (s *Service) resolveCustomSkillCreateRootForWrite() (customSkillRoot, error) {
	roots, err := s.iterPrioritizedCustomSkillRoots()
	if err != nil {
		return customSkillRoot{}, err
	}

	checked := make([]string, 0, len(roots))
	for _, root := range roots {
		ok, exists, detail := probeCustomSkillRootWritable(root.Path)
		if ok {
			return customSkillRoot{skillRoot: root, Exists: exists}, nil
		}
		checked = append(checked, fmt.Sprintf("%s (%s): %s", root.ID, root.Path, fallbackRootDetail(detail)))
	}
	return customSkillRoot{}, invalidErrorf("No writable custom skill root available. Checked: %s", strings.Join(checked, "; "))
}

func (s *Service) resolveDiscoverableRootIDForPath(rootPath string, fallbackRootID string) string {
	roots, err := s.skillRoots()
	if err != nil {
		return fallbackRootID
	}
	for _, root := range roots {
		if root.Path == rootPath {
			return root.ID
		}
	}
	return fallbackRootID
}

func (s *Service) skillIndexByID() (map[string]SkillEntry, error) {
	rows, err := s.List()
	if err != nil {
		return nil, err
	}
	index := make(map[string]SkillEntry, len(rows))
	for _, row := range rows {
		index[row.SkillID] = row
	}
	return index, nil
}

func resolveUpsertCustomSkillSelection(skillID string, relativePath string) (upsertCustomSkillSelection, error) {
	selection := upsertCustomSkillSelection{
		SkillID:      strings.TrimSpace(skillID),
		RelativePath: strings.TrimSpace(relativePath),
	}
	switch {
	case selection.SkillID != "" && selection.RelativePath != "":
		return upsertCustomSkillSelection{}, invalidErrorf("Provide either skillId or relativePath, not both.")
	case selection.SkillID == "" && selection.RelativePath == "":
		return upsertCustomSkillSelection{}, invalidErrorf("relativePath is required when skillId is not provided.")
	default:
		return selection, nil
	}
}

func (s *Service) resolveUpsertCustomSkillTarget(selection upsertCustomSkillSelection) (upsertCustomSkillTarget, error) {
	if selection.SkillID != "" {
		return s.resolveExistingCustomSkillTarget(selection.SkillID)
	}
	return s.resolveNewCustomSkillTarget(selection.RelativePath)
}

func (s *Service) resolveExistingCustomSkillTarget(skillID string) (upsertCustomSkillTarget, error) {
	selectedSkill, err := s.lookupSkillByID(skillID)
	if err != nil {
		return upsertCustomSkillTarget{}, err
	}
	target, err := s.resolveSkillDocPathFromID(selectedSkill.SkillID)
	if err != nil {
		return upsertCustomSkillTarget{}, err
	}
	if err := requireExistingSkillDoc(target.SkillDocPath, selectedSkill.SkillID); err != nil {
		return upsertCustomSkillTarget{}, err
	}
	if err := validateEditableSkillTarget(target); err != nil {
		return upsertCustomSkillTarget{}, err
	}
	return upsertCustomSkillTarget{
		RootID:       target.RootID,
		RootPath:     target.RootPath,
		RelativePath: target.RelativePath,
		SkillDocPath: target.SkillDocPath,
		SkillID:      selectedSkill.SkillID,
		Created:      false,
	}, nil
}

func (s *Service) resolveNewCustomSkillTarget(relativePath string) (upsertCustomSkillTarget, error) {
	root, err := s.resolveCustomSkillCreateRootForWrite()
	if err != nil {
		return upsertCustomSkillTarget{}, err
	}
	normalizedRelativePath, err := normalizeCustomSkillRelativePath(relativePath)
	if err != nil {
		return upsertCustomSkillTarget{}, err
	}
	skillDocPath, err := normalizePath(
		filepath.Join(root.Path, filepath.FromSlash(normalizedRelativePath), "SKILL.md"),
		"",
		s.lookupEnv,
		s.homeDir,
	)
	if err != nil {
		return upsertCustomSkillTarget{}, invalidErrorf("%v", err)
	}
	if err := validateNewCustomSkillPath(root.Path, skillDocPath, normalizedRelativePath); err != nil {
		return upsertCustomSkillTarget{}, err
	}
	rootID := s.resolveDiscoverableRootIDForPath(root.Path, root.ID)
	return upsertCustomSkillTarget{
		RootID:       rootID,
		RootPath:     root.Path,
		RelativePath: normalizedRelativePath,
		SkillDocPath: skillDocPath,
		SkillID:      fmt.Sprintf("%s::%s", rootID, normalizedRelativePath),
		Created:      true,
	}, nil
}

func (s *Service) buildUpsertCustomSkillResponse(target upsertCustomSkillTarget, content string) (UpsertCustomSkillResponse, error) {
	skill, err := s.lookupSkillByID(target.SkillID)
	if err != nil {
		return UpsertCustomSkillResponse{}, err
	}
	skillContent, err := buildWrittenSkillContent(target.SkillID, content, target.SkillDocPath)
	if err != nil {
		return UpsertCustomSkillResponse{}, err
	}
	return UpsertCustomSkillResponse{
		SkillID:      target.SkillID,
		Created:      target.Created,
		RootPath:     target.RootPath,
		SkillDocPath: target.SkillDocPath,
		Skill:        skill,
		SkillContent: skillContent,
	}, nil
}

func (s *Service) lookupSkillByID(skillID string) (SkillEntry, error) {
	skillIndex, err := s.skillIndexByID()
	if err != nil {
		return SkillEntry{}, err
	}
	skill, ok := skillIndex[skillID]
	if !ok {
		return SkillEntry{}, notFoundErrorf("Unknown or non-discoverable skillId: %s", skillID)
	}
	return skill, nil
}

func requireExistingSkillDoc(skillDocPath string, skillID string) error {
	if _, err := os.Stat(skillDocPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return notFoundErrorf("Missing SKILL.md for %s", skillID)
		}
		return invalidErrorf("%v", err)
	}
	return nil
}

func validateEditableSkillTarget(target resolvedSkillDoc) error {
	isEditable, editabilityReason := resolveSkillEditability(target.RootID, target.RelativePath, target.SkillDocPath)
	if isEditable {
		return nil
	}
	if strings.TrimSpace(editabilityReason) == "" {
		return invalidErrorf("Selected skill is not editable.")
	}
	return invalidErrorf("%s", editabilityReason)
}

func validateNewCustomSkillPath(rootPath string, skillDocPath string, relativePath string) error {
	if !isWithinRoot(rootPath, skillDocPath) {
		return invalidErrorf("Invalid skill path.")
	}
	if _, err := os.Stat(skillDocPath); err == nil {
		return invalidErrorf("Custom skill already exists for relativePath '%s'.", relativePath)
	} else if !errors.Is(err, os.ErrNotExist) {
		return invalidErrorf("%v", err)
	}
	return nil
}

func writeUpsertCustomSkill(target upsertCustomSkillTarget, content string) error {
	if target.Created {
		return writeNewCustomSkillDoc(target.SkillDocPath, target.RelativePath, content)
	}
	return writeExistingCustomSkillDoc(target.SkillDocPath, target.SkillID, content)
}

func splitSkillID(skillID string) (string, string, error) {
	raw := strings.TrimSpace(skillID)
	if !strings.Contains(raw, "::") {
		return "", "", invalidErrorf("Invalid skill id.")
	}
	parts := strings.SplitN(raw, "::", 2)
	return parts[0], parts[1], nil
}

func iterSkillDocs(rootPath string) ([]string, error) {
	docs := make([]string, 0)
	err := filepath.WalkDir(rootPath, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if entry.IsDir() {
			if path != rootPath {
				if _, ok := skipSegments[entry.Name()]; ok {
					return filepath.SkipDir
				}
			}
			return nil
		}
		if entry.Name() == "SKILL.md" {
			docs = append(docs, path)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return docs, nil
}

func extractSkillDescription(skillDocPath string) string {
	handle, err := os.Open(skillDocPath)
	if err != nil {
		return ""
	}
	defer handle.Close()

	reader := bufio.NewReader(handle)
	for {
		line, err := reader.ReadBytes('\n')
		if len(line) > 0 {
			if !utf8.Valid(line) {
				return ""
			}
			trimmed := strings.TrimSpace(string(line))
			if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
				return truncateRunes(trimmed, maxSkillDescriptionRunes)
			}
		}
		if errors.Is(err, io.EOF) {
			return ""
		}
		if err != nil {
			return ""
		}
	}
}

func resolveSkillEditability(rootID string, relativePath string, skillDocPath string) (bool, string) {
	if _, ok := customSkillEditableRootIDs[rootID]; !ok {
		return false, "Only skills under AGENTS_HOME/skills, ~/.agents/skills, or workspace .agents/skills are editable."
	}
	normalizedRelativePath := strings.TrimSpace(relativePath)
	if normalizedRelativePath == "" || normalizedRelativePath == "." {
		return false, "Editing root-level SKILL.md is not supported."
	}
	return resolveExistingCustomSkillReplaceability(skillDocPath)
}

func resolveExistingCustomSkillReplaceability(skillDocPath string) (bool, string) {
	info, err := os.Stat(skillDocPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, "Missing SKILL.md."
		}
		return false, err.Error()
	}
	if info.IsDir() {
		return false, "Missing SKILL.md."
	}

	parentPath := filepath.Dir(skillDocPath)
	parentInfo, err := os.Stat(parentPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, "Skill directory is missing."
		}
		return false, err.Error()
	}
	if !parentInfo.IsDir() {
		return false, "Skill directory is missing."
	}
	if !modeAllowsExec(parentInfo.Mode()) {
		return false, "Skill directory is not accessible."
	}
	if !modeAllowsWriteExec(parentInfo.Mode()) {
		return false, "Skill directory is not writable."
	}
	return true, ""
}

func checkCustomSkillRootCandidate(rootPath string) (bool, bool, string) {
	info, err := os.Stat(rootPath)
	switch {
	case err == nil:
		if !info.IsDir() {
			return false, true, "not a directory"
		}
		if modeAllowsWriteExec(info.Mode()) {
			return true, true, ""
		}
		return false, true, "not writable"
	case !errors.Is(err, os.ErrNotExist):
		return false, false, err.Error()
	}

	existingParentPath := findExistingCustomSkillParent(rootPath)
	parentInfo, err := os.Stat(existingParentPath)
	if err != nil {
		return false, false, err.Error()
	}
	if !parentInfo.IsDir() {
		return false, false, "parent path is not a directory"
	}
	if modeAllowsWriteExec(parentInfo.Mode()) {
		return true, false, ""
	}
	return false, false, "parent directory not writable"
}

func probeCustomSkillRootWritable(rootPath string) (bool, bool, string) {
	rootExists := false
	if _, err := os.Stat(rootPath); err == nil {
		rootExists = true
	} else if !errors.Is(err, os.ErrNotExist) {
		return false, false, err.Error()
	}

	createdPaths := []string{}
	if !rootExists {
		createdPaths = collectMissingCustomSkillProbePaths(rootPath)
	}
	if err := os.MkdirAll(rootPath, 0o755); err != nil {
		return false, rootExists, err.Error()
	}

	probeName := ".setta-write-probe-" + fmt.Sprintf("%d-", os.Getpid()) + randomHex(4)
	probePath := filepath.Join(rootPath, probeName)
	if err := os.WriteFile(probePath, []byte{}, customSkillDocFileMode); err != nil {
		unlinkIfExists(probePath)
		cleanupCustomSkillProbePaths(createdPaths)
		return false, rootExists, err.Error()
	}
	unlinkIfExists(probePath)
	cleanupCustomSkillProbePaths(createdPaths)
	return true, rootExists, ""
}

func findExistingCustomSkillParent(rootPath string) string {
	current := filepath.Clean(rootPath)
	for {
		if _, err := os.Stat(current); err == nil {
			return current
		}
		parent := filepath.Dir(current)
		if parent == current {
			return current
		}
		current = parent
	}
}

func collectMissingCustomSkillProbePaths(rootPath string) []string {
	missing := make([]string, 0)
	current := filepath.Clean(rootPath)
	for {
		if _, err := os.Stat(current); err == nil {
			return missing
		}
		missing = append(missing, current)
		parent := filepath.Dir(current)
		if parent == current {
			return missing
		}
		current = parent
	}
}

func cleanupCustomSkillProbePaths(paths []string) {
	for _, path := range paths {
		if err := os.Remove(path); err != nil {
			return
		}
	}
}

func normalizeCustomSkillRelativePath(relativePath string) (string, error) {
	normalized := strings.TrimSpace(relativePath)
	if !customSkillRelativePathPattern.MatchString(normalized) {
		return "", invalidErrorf("relativePath must start with an alphanumeric character and only contain letters, numbers, underscores, or hyphens.")
	}
	return normalized, nil
}

func buildWrittenSkillContent(skillID string, content string, skillDocPath string) (SkillContent, error) {
	info, err := os.Stat(skillDocPath)
	if err != nil {
		return SkillContent{}, invalidErrorf("%v", err)
	}
	return SkillContent{
		SkillID:           skillID,
		Content:           content,
		Truncated:         false,
		OriginalSizeBytes: info.Size(),
	}, nil
}

func writeTempCustomSkillDoc(skillDocPath string, content string) (string, error) {
	parentDir := filepath.Dir(skillDocPath)
	tempFile, err := os.CreateTemp(parentDir, ".setta-skill-*.tmp")
	if err != nil {
		return "", invalidErrorf("%v", err)
	}
	tempPath := tempFile.Name()
	cleanup := true
	defer func() {
		if cleanup {
			unlinkIfExists(tempPath)
		}
	}()

	if _, err := tempFile.WriteString(content); err != nil {
		_ = tempFile.Close()
		return "", invalidErrorf("%v", err)
	}
	if err := tempFile.Sync(); err != nil {
		_ = tempFile.Close()
		return "", invalidErrorf("%v", err)
	}
	if err := tempFile.Close(); err != nil {
		return "", invalidErrorf("%v", err)
	}
	if err := os.Chmod(tempPath, customSkillDocFileMode); err != nil {
		return "", invalidErrorf("%v", err)
	}
	cleanup = false
	return tempPath, nil
}

func writeNewCustomSkillDoc(skillDocPath string, relativePath string, content string) error {
	skillDir := filepath.Dir(skillDocPath)
	_, err := os.Stat(skillDir)
	skillDirExists := err == nil
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return invalidErrorf("%v", err)
	}

	if err := os.MkdirAll(skillDir, 0o755); err != nil {
		return invalidErrorf("%v", err)
	}

	tempPath, err := writeTempCustomSkillDoc(skillDocPath, content)
	if err != nil {
		if !skillDirExists {
			_ = os.Remove(skillDir)
		}
		return err
	}
	defer unlinkIfExists(tempPath)

	if err := os.Link(tempPath, skillDocPath); err != nil {
		if errors.Is(err, fs.ErrExist) {
			if !skillDirExists {
				_ = os.Remove(skillDir)
			}
			return invalidErrorf("Custom skill already exists for relativePath '%s'.", relativePath)
		}
		if !skillDirExists {
			_ = os.Remove(skillDir)
		}
		return invalidErrorf("%v", err)
	}
	return nil
}

func writeExistingCustomSkillDoc(skillDocPath string, skillID string, content string) error {
	if _, err := os.Stat(skillDocPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return notFoundErrorf("Missing SKILL.md for %s", skillID)
		}
		return invalidErrorf("%v", err)
	}

	tempPath, err := writeTempCustomSkillDoc(skillDocPath, content)
	if err != nil {
		return err
	}
	defer unlinkIfExists(tempPath)

	if _, err := os.Stat(skillDocPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return notFoundErrorf("Missing SKILL.md for %s", skillID)
		}
		return invalidErrorf("%v", err)
	}
	if err := os.Rename(tempPath, skillDocPath); err != nil {
		return invalidErrorf("%v", err)
	}
	return nil
}

func unlinkIfExists(path string) {
	_ = os.Remove(path)
}

func decodeSkillPreview(preview []byte, truncated bool) (string, error) {
	index := 0
	for index < len(preview) {
		_, size := utf8.DecodeRune(preview[index:])
		if size == 1 && preview[index] >= 0x80 {
			if truncated && !utf8.FullRune(preview[index:]) {
				return string(preview[:index]), nil
			}
			return "", fmt.Errorf("invalid UTF-8")
		}
		index += size
	}
	return string(preview), nil
}

func normalizePath(raw string, base string, lookupEnv func(string) (string, bool), homeDir string) (string, error) {
	value, err := prepareNormalizedPath(raw, lookupEnv, homeDir)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(base) != "" && !filepath.IsAbs(value) {
		value = filepath.Join(base, value)
	}
	return resolveAbsolutePath(raw, value)
}

func prepareNormalizedPath(raw string, lookupEnv func(string) (string, bool), homeDir string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", fmt.Errorf("missing path")
	}

	value = expandNormalizedPathEnv(value, lookupEnv)
	if !hasNormalizedPathHomePrefix(value) {
		return value, nil
	}
	return expandNormalizedPathHome(value, homeDir)
}

func expandNormalizedPathEnv(value string, lookupEnv func(string) (string, bool)) string {
	if lookupEnv == nil {
		return value
	}
	return os.Expand(value, func(key string) string {
		if resolved, ok := lookupEnv(key); ok {
			return resolved
		}
		return ""
	})
}

func hasNormalizedPathHomePrefix(value string) bool {
	return value == "~" || strings.HasPrefix(value, "~/") || strings.HasPrefix(value, "~\\")
}

func expandNormalizedPathHome(value string, homeDir string) (string, error) {
	resolvedHome, err := resolveNormalizedPathHomeDir(homeDir)
	if err != nil {
		return "", err
	}
	return filepath.Join(resolvedHome, trimNormalizedPathHomePrefix(value)), nil
}

func resolveNormalizedPathHomeDir(homeDir string) (string, error) {
	resolvedHome := strings.TrimSpace(homeDir)
	if resolvedHome != "" {
		return resolvedHome, nil
	}

	resolvedHome, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve user home: %w", err)
	}
	return resolvedHome, nil
}

func trimNormalizedPathHomePrefix(value string) string {
	suffix := strings.TrimPrefix(strings.TrimPrefix(value, "~"), string(os.PathSeparator))
	suffix = strings.TrimPrefix(strings.TrimPrefix(suffix, "/"), "\\")
	return suffix
}

func resolveAbsolutePath(raw string, value string) (string, error) {
	absoluteValue, err := filepath.Abs(value)
	if err != nil {
		return "", fmt.Errorf("resolve path %q: %w", raw, err)
	}
	return filepath.Clean(absoluteValue), nil
}

func isWithinRoot(root string, candidate string) bool {
	relative, err := filepath.Rel(root, candidate)
	if err != nil {
		return false
	}
	return relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func truncateRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}

func modeAllowsExec(mode fs.FileMode) bool {
	return mode.Perm()&0o111 != 0
}

func modeAllowsWriteExec(mode fs.FileMode) bool {
	return mode.Perm()&0o222 != 0 && modeAllowsExec(mode)
}

func stringPointer(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func stringPointerIfPresent(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	copyValue := value
	return &copyValue
}

func randomHex(size int) string {
	if size <= 0 {
		return ""
	}
	buffer := make([]byte, size)
	if _, err := rand.Read(buffer); err != nil {
		return "00000000"
	}
	return hex.EncodeToString(buffer)
}

func fallbackRootDetail(detail string) string {
	if strings.TrimSpace(detail) == "" {
		return "not writable"
	}
	return detail
}

func notFoundErrorf(format string, args ...any) error {
	return &NotFoundError{message: fmt.Sprintf(format, args...)}
}

func invalidErrorf(format string, args ...any) error {
	return &InvalidError{message: fmt.Sprintf(format, args...)}
}
