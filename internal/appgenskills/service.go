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
	customSkillRootPriority = []string{
		"agents_home_skills",
		"user_agents_skills",
		"workspace_agents_skills",
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

func (s *Service) List() ([]SkillEntry, error) {
	roots, err := s.skillRoots()
	if err != nil {
		return nil, err
	}

	rows := make([]SkillEntry, 0)
	for _, root := range roots {
		info, err := os.Stat(root.Path)
		if err != nil {
			continue
		}
		if !info.IsDir() {
			continue
		}

		skillDocs, err := iterSkillDocs(root.Path)
		if err != nil {
			continue
		}
		for _, skillDocPath := range skillDocs {
			skillDir := filepath.Dir(skillDocPath)
			relativePath, err := filepath.Rel(root.Path, skillDir)
			if err != nil {
				continue
			}
			relativePath = filepath.ToSlash(relativePath)
			if relativePath == "." || relativePath == "" {
				relativePath = "."
			}
			isEditable, editabilityReason := resolveSkillEditability(root.ID, relativePath, skillDocPath)
			rows = append(rows, SkillEntry{
				SkillID:           fmt.Sprintf("%s::%s", root.ID, relativePath),
				Name:              filepath.Base(skillDir),
				RootLabel:         root.Label,
				RootPath:          root.Path,
				RelativePath:      relativePath,
				IsEditable:        isEditable,
				EditabilityReason: stringPointerIfPresent(editabilityReason),
				Description:       extractSkillDescription(skillDocPath),
			})
		}
	}

	sort.Slice(rows, func(i, j int) bool {
		left := rows[i]
		right := rows[j]
		if diff := strings.Compare(strings.ToLower(left.RootLabel), strings.ToLower(right.RootLabel)); diff != 0 {
			return diff < 0
		}
		if diff := strings.Compare(strings.ToLower(left.RelativePath), strings.ToLower(right.RelativePath)); diff != 0 {
			return diff < 0
		}
		return strings.ToLower(left.Name) < strings.ToLower(right.Name)
	})
	return rows, nil
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
	selectedSkillID := strings.TrimSpace(skillID)
	selectedRelativePath := strings.TrimSpace(relativePath)
	if selectedSkillID != "" && selectedRelativePath != "" {
		return UpsertCustomSkillResponse{}, invalidErrorf("Provide either skillId or relativePath, not both.")
	}
	if selectedSkillID == "" && selectedRelativePath == "" {
		return UpsertCustomSkillResponse{}, invalidErrorf("relativePath is required when skillId is not provided.")
	}

	var (
		targetRootID       string
		targetRootPath     string
		targetRelativePath string
		resolvedSkillID    string
		skillDocPath       string
		created            bool
	)

	if selectedSkillID != "" {
		skillIndex, err := s.skillIndexByID()
		if err != nil {
			return UpsertCustomSkillResponse{}, err
		}
		selectedSkill, ok := skillIndex[selectedSkillID]
		if !ok {
			return UpsertCustomSkillResponse{}, notFoundErrorf("Unknown or non-discoverable skillId: %s", selectedSkillID)
		}
		target, err := s.resolveSkillDocPathFromID(selectedSkill.SkillID)
		if err != nil {
			return UpsertCustomSkillResponse{}, err
		}
		if _, err := os.Stat(target.SkillDocPath); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return UpsertCustomSkillResponse{}, notFoundErrorf("Missing SKILL.md for %s", selectedSkill.SkillID)
			}
			return UpsertCustomSkillResponse{}, invalidErrorf("%v", err)
		}
			isEditable, editabilityReason := resolveSkillEditability(target.RootID, target.RelativePath, target.SkillDocPath)
			if !isEditable {
				if strings.TrimSpace(editabilityReason) == "" {
					return UpsertCustomSkillResponse{}, invalidErrorf("Selected skill is not editable.")
				}
				return UpsertCustomSkillResponse{}, invalidErrorf("%s", editabilityReason)
			}
		targetRootID = target.RootID
		targetRootPath = target.RootPath
		targetRelativePath = target.RelativePath
		skillDocPath = target.SkillDocPath
		resolvedSkillID = selectedSkill.SkillID
		created = false
	} else {
		root, err := s.resolveCustomSkillCreateRootForWrite()
		if err != nil {
			return UpsertCustomSkillResponse{}, err
		}
		targetRootID = s.resolveDiscoverableRootIDForPath(root.Path, root.ID)
		targetRootPath = root.Path
		targetRelativePath, err = normalizeCustomSkillRelativePath(selectedRelativePath)
		if err != nil {
			return UpsertCustomSkillResponse{}, err
		}
		skillDocPath, err = normalizePath(filepath.Join(targetRootPath, filepath.FromSlash(targetRelativePath), "SKILL.md"), "", s.lookupEnv, s.homeDir)
		if err != nil {
			return UpsertCustomSkillResponse{}, invalidErrorf("%v", err)
		}
		if !isWithinRoot(targetRootPath, skillDocPath) {
			return UpsertCustomSkillResponse{}, invalidErrorf("Invalid skill path.")
		}
		if _, err := os.Stat(skillDocPath); err == nil {
			return UpsertCustomSkillResponse{}, invalidErrorf("Custom skill already exists for relativePath '%s'.", targetRelativePath)
		} else if !errors.Is(err, os.ErrNotExist) {
			return UpsertCustomSkillResponse{}, invalidErrorf("%v", err)
		}
		resolvedSkillID = fmt.Sprintf("%s::%s", targetRootID, targetRelativePath)
		created = true
	}

	if created {
		if err := writeNewCustomSkillDoc(skillDocPath, targetRelativePath, content); err != nil {
			return UpsertCustomSkillResponse{}, err
		}
	} else {
		if err := writeExistingCustomSkillDoc(skillDocPath, resolvedSkillID, content); err != nil {
			return UpsertCustomSkillResponse{}, err
		}
	}

	skillIndex, err := s.skillIndexByID()
	if err != nil {
		return UpsertCustomSkillResponse{}, err
	}
	skill, ok := skillIndex[resolvedSkillID]
	if !ok {
		return UpsertCustomSkillResponse{}, notFoundErrorf("Unknown or non-discoverable skillId: %s", resolvedSkillID)
	}

	skillContent, err := buildWrittenSkillContent(resolvedSkillID, content, skillDocPath)
	if err != nil {
		return UpsertCustomSkillResponse{}, err
	}

	return UpsertCustomSkillResponse{
		SkillID:      resolvedSkillID,
		Created:      created,
		RootPath:     targetRootPath,
		SkillDocPath: skillDocPath,
		Skill:        skill,
		SkillContent: skillContent,
	}, nil
}

func (s *Service) skillRoots() ([]skillRoot, error) {
	xdgConfigHome := filepath.Join(s.homeDir, ".config")
	if raw, ok := s.lookupEnv("XDG_CONFIG_HOME"); ok && strings.TrimSpace(raw) != "" {
		path, err := normalizePath(raw, "", s.lookupEnv, s.homeDir)
		if err != nil {
			return nil, err
		}
		xdgConfigHome = path
	}

	candidates := []skillRoot{
		{ID: "workspace_agents_skills", Label: "Workspace .agents/skills", Path: filepath.Join(s.workspaceRoot, ".agents", "skills")},
		{ID: "workspace_claude_skills", Label: "Workspace .claude/skills", Path: filepath.Join(s.workspaceRoot, ".claude", "skills")},
		{ID: "workspace_opencode_skills", Label: "Workspace .opencode/skills", Path: filepath.Join(s.workspaceRoot, ".opencode", "skills")},
		{ID: "user_agents_skills", Label: "User ~/.agents/skills", Path: filepath.Join(s.homeDir, ".agents", "skills")},
		{ID: "user_claude_skills", Label: "User ~/.claude/skills", Path: filepath.Join(s.homeDir, ".claude", "skills")},
		{ID: "user_opencode_skills", Label: "User ${XDG_CONFIG_HOME:-~/.config}/opencode/skills", Path: filepath.Join(xdgConfigHome, "opencode", "skills")},
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
		raw, ok := s.lookupEnv(envCandidate.Env)
		if !ok || strings.TrimSpace(raw) == "" {
			continue
		}
		path, err := normalizePath(raw, "", s.lookupEnv, s.homeDir)
		if err != nil {
			return nil, err
		}
		if filepath.Base(path) != "skills" {
			path = filepath.Join(path, "skills")
		}
		candidates = append(candidates, skillRoot{
			ID:    envCandidate.ID,
			Label: envCandidate.Label,
			Path:  path,
		})
	}

	roots := make([]skillRoot, 0, len(candidates))
	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		path, err := normalizePath(candidate.Path, "", s.lookupEnv, s.homeDir)
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
	if raw, ok := s.lookupEnv("AGENTS_HOME"); ok && strings.TrimSpace(raw) != "" {
		path, err := normalizePath(raw, "", s.lookupEnv, s.homeDir)
		if err != nil {
			return nil, err
		}
		if filepath.Base(path) != "skills" {
			path = filepath.Join(path, "skills")
		}
		candidates = append(candidates, skillRoot{
			ID:    "agents_home_skills",
			Label: "AGENTS_HOME skills",
			Path:  path,
		})
	}
	candidates = append(candidates,
		skillRoot{ID: "user_agents_skills", Label: "User ~/.agents/skills", Path: filepath.Join(s.homeDir, ".agents", "skills")},
		skillRoot{ID: "workspace_agents_skills", Label: "Workspace .agents/skills", Path: filepath.Join(s.workspaceRoot, ".agents", "skills")},
	)

	deduped := make([]skillRoot, 0, len(candidates))
	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		path, err := normalizePath(candidate.Path, "", s.lookupEnv, s.homeDir)
		if err != nil {
			return nil, err
		}
		if _, ok := seen[path]; ok {
			continue
		}
		seen[path] = struct{}{}
		candidate.Path = path
		deduped = append(deduped, candidate)
	}

	roots := make([]skillRoot, 0, len(customSkillRootPriority))
	for _, rootID := range customSkillRootPriority {
		for _, candidate := range deduped {
			if candidate.ID != rootID {
				continue
			}
			roots = append(roots, candidate)
			break
		}
	}
	if len(roots) > 0 {
		return roots, nil
	}
	return []skillRoot{{
		ID:    "user_agents_skills",
		Label: "User ~/.agents/skills",
		Path:  filepath.Join(s.homeDir, ".agents", "skills"),
	}}, nil
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
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", fmt.Errorf("missing path")
	}
	value = os.Expand(value, func(key string) string {
		if lookupEnv == nil {
			return ""
		}
		if resolved, ok := lookupEnv(key); ok {
			return resolved
		}
		return ""
	})
	if value == "~" || strings.HasPrefix(value, "~/") || strings.HasPrefix(value, "~\\") {
		resolvedHome := strings.TrimSpace(homeDir)
		if resolvedHome == "" {
			var err error
			resolvedHome, err = os.UserHomeDir()
			if err != nil {
				return "", fmt.Errorf("resolve user home: %w", err)
			}
		}
		suffix := strings.TrimPrefix(strings.TrimPrefix(value, "~"), string(os.PathSeparator))
		suffix = strings.TrimPrefix(strings.TrimPrefix(suffix, "/"), "\\")
		value = filepath.Join(resolvedHome, suffix)
	}
	if strings.TrimSpace(base) != "" && !filepath.IsAbs(value) {
		value = filepath.Join(base, value)
	}
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
