package projectstate

import (
	"errors"
)

var (
	ErrSectionIDRequired                          = errors.New("section id is required")
	ErrSectionNameRequired                        = errors.New("section name is required")
	ErrSectionIDKeyMismatch                       = errors.New("section id must match its map key")
	ErrProjectNotFound                            = errors.New("project was not found in document")
	ErrProjectCodegenTargetLanguage               = errors.New("project codegen target language is required")
	ErrSectionVariantIDRequired                   = errors.New("section variant id is required")
	ErrSectionVariantIDKeyMismatch                = errors.New("section variant id must match its map key")
	ErrSectionImplIDRequired                      = errors.New("section impl id is required")
	ErrSectionImplIDKeyMismatch                   = errors.New("section impl id must match its map key")
	ErrEntrySectionNotFound                       = errors.New("entry code block id was not found in sections")
	ErrSectionNotFound                            = errors.New("section was not found in project")
	ErrSectionVariantNotFound                     = errors.New("section variant was not found in project")
	ErrSectionImplNotFound                        = errors.New("section impl was not found in project")
	ErrSectionActiveVariantNotFound               = errors.New("section active variant was not found")
	ErrSectionDefaultVariantMissing               = errors.New("section default variant id is required when variants exist")
	ErrSectionVariantMembership                   = errors.New("section variant must belong to the section")
	ErrSectionImplKindRequired                    = errors.New("section impl kind is required")
	ErrUnsupportedSectionImplKind                 = errors.New("unsupported section impl kind")
	ErrCodeSectionConfigRequired                  = errors.New("code section config is required")
	ErrTerminalSectionConfigRequired              = errors.New("terminal section config is required")
	ErrDrawSectionConfigRequired                  = errors.New("draw section config is required")
	ErrGeneratedSectionConfigRequired             = errors.New("generated section config is required")
	ErrGeneratedSectionKindRequired               = errors.New("generated section kind is required")
	ErrUnsupportedGeneratedSectionKind            = errors.New("unsupported generated section kind")
	ErrCodeLanguageRequired                       = errors.New("code language is required")
	ErrCodeFileBindingPathRequired                = errors.New("code file binding path is required")
	ErrCodeFileBindingLegacyPayloadKeys           = errors.New("code file binding payload must use canonical_path and access_mode keys")
	ErrDrawRenderedImagePathRequired              = errors.New("draw rendered image path is required")
	ErrTopLevelSectionNotFound                    = errors.New("top-level section was not found in project")
	ErrDuplicateTopLevelSection                   = errors.New("duplicate top-level section id")
	ErrPersistedProjectViewModesRequireRepair     = errors.New("persisted project view modes require repair")
	ErrPersistedProjectActiveIDsRequireRepair     = errors.New("persisted project active ids require repair")
	ErrPersistedProjectChatWindowingRequireRepair = errors.New("persisted project chat windowing requires repair")
	ErrPersistedProjectWindowSpacesRequireRepair  = errors.New("persisted project window spaces require repair")
	ErrParentSectionNotFound                      = errors.New("parent section was not found in project")
	ErrSectionConflict                            = errors.New("section already exists")
	ErrSectionVariantConflict                     = errors.New("section variant already exists")
	ErrSectionImplConflict                        = errors.New("section impl already exists")
	ErrTerminalSeedRequired                       = errors.New("terminal section seed is required")
	ErrCodeSectionRequired                        = errors.New("section must resolve to a code section")
	ErrTerminalSectionRequired                    = errors.New("section must resolve to a terminal section")
	ErrDrawSectionRequired                        = errors.New("section must resolve to a draw section")
	ErrCallableSectionRequired                    = errors.New("section must resolve to a callable section")
	ErrGroupSectionRequired                       = errors.New("section must resolve to a group section")
	ErrChatSectionRequired                        = errors.New("section must resolve to a chat section")
	ErrPromptSectionRequired                      = errors.New("section must resolve to a prompt section")
	ErrPromptFormatInvalid                        = errors.New("prompt format is invalid")
	ErrChatPermissionModeInvalid                  = errors.New("chat permission mode is invalid")
	ErrChatDictationModeInvalid                   = errors.New("chat dictation mode is invalid")
)

type SectionKind string

const (
	SectionKindCode      SectionKind = "code"
	SectionKindTerminal  SectionKind = "terminal"
	SectionKindDraw      SectionKind = "draw"
	SectionKindGenerated SectionKind = "generated"
)

type CodeLanguage string

const (
	CodeLanguagePython     CodeLanguage = "python"
	CodeLanguageBash       CodeLanguage = "bash"
	CodeLanguageJavaScript CodeLanguage = "javascript"
	CodeLanguageTypeScript CodeLanguage = "typescript"
	CodeLanguageJSON       CodeLanguage = "json"
	CodeLanguageYAML       CodeLanguage = "yaml"
	CodeLanguageTOML       CodeLanguage = "toml"
	CodeLanguageMarkdown   CodeLanguage = "markdown"
	CodeLanguagePlaintext  CodeLanguage = "plaintext"
)

type CodeFileAccessMode string

const (
	CodeFileAccessModeReadWrite CodeFileAccessMode = "read_write"
	CodeFileAccessModeReadOnly  CodeFileAccessMode = "read_only"
	CodeFileAccessModeWriteOnly CodeFileAccessMode = "write_only"
)

// setta-go-type-discovery: skip
type Section struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	DisplayName      string   `json:"displayName,omitempty"`
	VariantIDs       []string `json:"variantIds,omitempty"`
	DefaultVariantID string   `json:"defaultVariantId,omitempty"`
	ParentSectionID  string   `json:"parentSectionId,omitempty"`
	SharedModifier   RawJSON  `json:"sharedModifier,omitempty" ts_type:"Record<string, unknown>" shared_schema_map_value_ref:"RawMessage"`
	UnsharedKeys     []string `json:"unsharedKeys,omitempty"`
}

// setta-go-type-discovery: skip
type ProjectCodegenTarget struct {
	Language string  `json:"language"`
	Payload  RawJSON `json:"payload,omitempty"`
}

// setta-go-type-discovery: skip
type SectionVariant struct {
	ID               string   `json:"id"`
	Name             string   `json:"name,omitempty"`
	ImplID           string   `json:"implId"`
	NonPresetImplIDs []string `json:"nonPresetImplIds,omitempty"`
	Modifier         RawJSON  `json:"modifier,omitempty" ts_type:"Record<string, unknown>" shared_schema_map_value_ref:"RawMessage"`
	IsFrozen         bool     `json:"isFrozen,omitempty"`
}

// setta-go-type-discovery: skip
type SectionImpl struct {
	ID        string                `json:"id"`
	Kind      SectionKind           `json:"kind"`
	Payload   RawJSON               `json:"payload,omitempty"`
	Code      *CodeSectionImpl      `json:"code,omitempty"`
	Terminal  *TerminalSectionImpl  `json:"terminal,omitempty"`
	Draw      *DrawSectionImpl      `json:"draw,omitempty"`
	Generated *GeneratedSectionImpl `json:"generated,omitempty"`
}

// setta-go-type-discovery: skip
type CodeSectionImpl struct {
	Language                  CodeLanguage     `json:"language"`
	Binding                   *CodeFileBinding `json:"binding,omitempty"`
	AttachedTerminalSectionID string           `json:"attachedTerminalSectionId,omitempty"`
	Children                  []string         `json:"children,omitempty"`
}

// setta-go-type-discovery: skip
type CodeFileBinding struct {
	Path        string             `json:"path"`
	AccessMode  CodeFileAccessMode `json:"accessMode,omitempty"`
	AutoBinding bool               `json:"autoBinding,omitempty"`
}

type TerminalSessionMode string

const (
	TerminalSessionModeInteractive    TerminalSessionMode = ""
	TerminalSessionModeManagedConsole TerminalSessionMode = "managed_console"
)

// setta-go-type-discovery: skip
type TerminalSectionImpl struct {
	SessionMode TerminalSessionMode `json:"sessionMode,omitempty"`
}

// setta-go-type-discovery: skip
type DrawSectionImpl struct {
	RenderedImagePath string `json:"renderedImagePath,omitempty"`
}

type GeneratedSectionKind string

const (
	GeneratedSectionKindPythonCode     GeneratedSectionKind = "python_code"
	GeneratedSectionKindPythonMetadata GeneratedSectionKind = "python_metadata"
	GeneratedSectionKindPlugin         GeneratedSectionKind = "plugin"
)

// setta-go-type-discovery: skip
type GeneratedSectionImpl struct {
	Kind GeneratedSectionKind `json:"kind"`
}

func (p Project) Clone() Project {
	cloned := p
	cloned.TopLevelSectionIDs = append([]string(nil), p.TopLevelSectionIDs...)
	cloned.ActiveIDs = append([]string(nil), p.ActiveIDs...)
	cloned.GeneratedCodeBinding = cloneCodeFileBinding(p.GeneratedCodeBinding)
	cloned.GeneratedMetadataBinding = cloneCodeFileBinding(p.GeneratedMetadataBinding)
	cloned.Viewport = cloneViewport(p.Viewport)
	copyProjectLayoutState(&cloned, p)
	copyProjectEdgeState(&cloned, p)
	copyProjectSectionState(&cloned, p)
	copyProjectCodeObjectState(&cloned, p)
	return cloned
}

func copyProjectLayoutState(dst *Project, src Project) {
	if src.ViewModes != nil {
		dst.ViewModes = make(map[string]ViewMode, len(src.ViewModes))
		for viewModeID, viewMode := range src.ViewModes {
			dst.ViewModes[viewModeID] = viewMode.Clone()
		}
	}
	if src.CodegenTargets != nil {
		dst.CodegenTargets = make([]ProjectCodegenTarget, len(src.CodegenTargets))
		for index, target := range src.CodegenTargets {
			dst.CodegenTargets[index] = target.Clone()
		}
	}
	if src.TopLevelSections != nil {
		dst.TopLevelSections = make(map[string]TopLevelSectionLayout, len(src.TopLevelSections))
		for sectionID, layout := range src.TopLevelSections {
			dst.TopLevelSections[sectionID] = layout.Clone()
		}
	}
	if src.WindowSpaces != nil {
		dst.WindowSpaces = make(map[string]WindowSpaceConfig, len(src.WindowSpaces))
		for windowSpaceID, windowSpace := range src.WindowSpaces {
			dst.WindowSpaces[windowSpaceID] = windowSpace.Clone()
		}
	}
	if src.ProjectChatWindowing != nil {
		clonedWindowing := src.ProjectChatWindowing.Clone()
		dst.ProjectChatWindowing = &clonedWindowing
	}
}

func copyProjectEdgeState(dst *Project, src Project) {
	if src.Edges != nil {
		dst.Edges = make([]Edge, len(src.Edges))
		for index, edge := range src.Edges {
			dst.Edges[index] = edge.Clone()
		}
	}
	if src.AgenticEdges != nil {
		dst.AgenticEdges = make([]AgenticEdge, len(src.AgenticEdges))
		for index, edge := range src.AgenticEdges {
			dst.AgenticEdges[index] = edge.Clone()
		}
	}
	if src.StateMachineEdges != nil {
		dst.StateMachineEdges = make([]StateMachineEdge, len(src.StateMachineEdges))
		for index, edge := range src.StateMachineEdges {
			dst.StateMachineEdges[index] = edge.Clone()
		}
	}
}

func copyProjectSectionState(dst *Project, src Project) {
	if src.SectionVariantMap != nil {
		dst.SectionVariantMap = make(map[string]string, len(src.SectionVariantMap))
		for sectionID, variantID := range src.SectionVariantMap {
			dst.SectionVariantMap[sectionID] = variantID
		}
	}
	if src.Sections != nil {
		dst.Sections = make(map[string]Section, len(src.Sections))
		for sectionID, section := range src.Sections {
			dst.Sections[sectionID] = section.Clone()
		}
	}
	if src.SectionVariants != nil {
		dst.SectionVariants = make(map[string]SectionVariant, len(src.SectionVariants))
		for variantID, variant := range src.SectionVariants {
			dst.SectionVariants[variantID] = variant.Clone()
		}
	}
	if src.SectionImpls != nil {
		dst.SectionImpls = make(map[string]SectionImpl, len(src.SectionImpls))
		for implID, impl := range src.SectionImpls {
			dst.SectionImpls[implID] = impl.Clone()
		}
	}
}

func copyProjectCodeObjectState(dst *Project, src Project) {
	if src.CodeObjs != nil {
		dst.CodeObjs = make(map[string]CodeObject, len(src.CodeObjs))
		for codeObjID, codeObj := range src.CodeObjs {
			dst.CodeObjs[codeObjID] = codeObj.Clone()
		}
	}
	if src.CodeObjVariants != nil {
		dst.CodeObjVariants = make(map[string]CodeObjectVariant, len(src.CodeObjVariants))
		for variantID, variant := range src.CodeObjVariants {
			dst.CodeObjVariants[variantID] = variant.Clone()
		}
	}
	if src.CodeObjImpls != nil {
		dst.CodeObjImpls = make(map[string]CodeObjectImpl, len(src.CodeObjImpls))
		for implID, impl := range src.CodeObjImpls {
			dst.CodeObjImpls[implID] = impl.Clone()
		}
	}
}

func (s Section) Clone() Section {
	cloned := s
	cloned.VariantIDs = append([]string(nil), s.VariantIDs...)
	cloned.SharedModifier = cloneRawJSON(s.SharedModifier)
	cloned.UnsharedKeys = append([]string(nil), s.UnsharedKeys...)
	return cloned
}

func (t ProjectCodegenTarget) Clone() ProjectCodegenTarget {
	cloned := t
	cloned.Payload = cloneRawJSON(t.Payload)
	return cloned
}

func (v SectionVariant) Clone() SectionVariant {
	cloned := v
	cloned.NonPresetImplIDs = append([]string(nil), v.NonPresetImplIDs...)
	cloned.Modifier = cloneRawJSON(v.Modifier)
	return cloned
}

func (i SectionImpl) Clone() SectionImpl {
	cloned := i
	cloned.Payload = cloneRawJSON(i.Payload)
	if i.Code != nil {
		code := *i.Code
		code.Children = append([]string(nil), i.Code.Children...)
		if i.Code.Binding != nil {
			binding := *i.Code.Binding
			code.Binding = &binding
		}
		cloned.Code = &code
	}
	if i.Terminal != nil {
		terminal := *i.Terminal
		cloned.Terminal = &terminal
	}
	if i.Draw != nil {
		draw := *i.Draw
		cloned.Draw = &draw
	}
	if i.Generated != nil {
		generated := *i.Generated
		cloned.Generated = &generated
	}
	return cloned
}
