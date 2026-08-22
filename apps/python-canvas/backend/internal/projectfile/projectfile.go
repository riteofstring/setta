// Package projectfile owns strict on-disk encoding and same-filesystem project
// replacement. It parses once at the filesystem boundary and returns only a
// validated authored aggregate.
package projectfile

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

// Format is the sole accepted authored project-file format.
const Format = "python-canvas-project/v1"

var (
	ErrInvalidProjectFile = errors.New("projectfile: invalid project file")
	ErrProjectPathInvalid = errors.New("projectfile: project path is invalid")
	ErrProjectFileExists  = errors.New("projectfile: project file already exists")
	ErrProjectFileMissing = errors.New("projectfile: project file is missing")
	ErrStagedClosed       = errors.New("projectfile: staged replacement is closed")
)

type replaceFunc func(source string, destination string) error

// Replacement is one staged authored-project replacement. The coordinator
// owns its commit/discard ordering while this package remains the only owner
// of serialization and same-filesystem replacement mechanics.
type Replacement interface {
	Commit() error
	Discard() error
}

// Store is the narrow strict project-file port used by the application
// coordinator. Adapter is its production implementation; the interface keeps
// transaction failure injection local to focused coordinator tests.
type Store interface {
	Load(path string) (aggregate.State, error)
	Create(path string, state aggregate.State) error
	StageReplacement(path string, state aggregate.State) (Replacement, error)
}

// Adapter is the narrow project-file boundary. Its only injectable participant
// is the atomic replace call used by this package's failure-injection tests.
type Adapter struct {
	replace replaceFunc
}

// NewAdapter constructs the production strict project-file adapter.
func NewAdapter() Adapter {
	return Adapter{replace: os.Rename}
}

// Load reads and validates one complete project file. It never guesses an old
// format or returns a plausible empty aggregate for an unavailable file.
func (adapter Adapter) Load(path string) (aggregate.State, error) {
	if err := validatePath(path); err != nil {
		return aggregate.State{}, err
	}
	content, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return aggregate.State{}, fmt.Errorf("%w: %s", ErrProjectFileMissing, path)
		}
		return aggregate.State{}, fmt.Errorf("read project file %q: %w", path, err)
	}
	state, err := Decode(content)
	if err != nil {
		return aggregate.State{}, fmt.Errorf("decode project file %q: %w", path, err)
	}
	return state, nil
}

// Create writes a new complete authored project through an exclusive create.
// An existing path is never reset or overwritten.
func (adapter Adapter) Create(path string, state aggregate.State) error {
	if err := validatePath(path); err != nil {
		return err
	}
	content, err := Encode(state)
	if err != nil {
		return err
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			return fmt.Errorf("%w: %s", ErrProjectFileExists, path)
		}
		return fmt.Errorf("exclusively create project file %q: %w", path, err)
	}
	fileOpen := true
	committed := false
	defer func() {
		if fileOpen {
			_ = file.Close()
		}
		if !committed {
			_ = os.Remove(path)
		}
	}()
	if err := writeAndSync(file, content); err != nil {
		return fmt.Errorf("write project file %q: %w", path, err)
	}
	if err := file.Close(); err != nil {
		fileOpen = false
		return fmt.Errorf("close project file %q: %w", path, err)
	}
	fileOpen = false
	committed = true
	return nil
}

// StagedReplacement owns complete synced project bytes in the target directory
// until Commit atomically renames them over the target or Discard removes them.
type StagedReplacement struct {
	targetPath    string
	temporaryPath string
	replace       replaceFunc
	closed        bool
}

// Stage serializes and syncs one complete candidate to a temporary sibling of
// the target. That same directory is the required same-filesystem boundary.
func (adapter Adapter) Stage(path string, state aggregate.State) (*StagedReplacement, error) {
	if err := validatePath(path); err != nil {
		return nil, err
	}
	content, err := Encode(state)
	if err != nil {
		return nil, err
	}
	directory := filepath.Dir(path)
	temporary, err := os.CreateTemp(directory, ".python-canvas-project-*")
	if err != nil {
		return nil, fmt.Errorf("stage project file %q: %w", path, err)
	}
	temporaryPath := temporary.Name()
	fileOpen := true
	staged := false
	defer func() {
		if fileOpen {
			_ = temporary.Close()
		}
		if !staged {
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := writeAndSync(temporary, content); err != nil {
		return nil, fmt.Errorf("write staged project file %q: %w", path, err)
	}
	if err := temporary.Close(); err != nil {
		fileOpen = false
		return nil, fmt.Errorf("close staged project file %q: %w", path, err)
	}
	fileOpen = false
	staged = true
	return &StagedReplacement{
		targetPath:    path,
		temporaryPath: temporaryPath,
		replace:       adapter.replacer(),
	}, nil
}

// Replace stages and atomically commits a complete project file in one call.
func (adapter Adapter) Replace(path string, state aggregate.State) error {
	staged, err := adapter.Stage(path, state)
	if err != nil {
		return err
	}
	defer func() { _ = staged.Discard() }()
	return staged.Commit()
}

// StageReplacement is the coordinator-facing form of Stage. It deliberately
// exposes only the transaction behavior, not temporary paths or codec details.
func (adapter Adapter) StageReplacement(path string, state aggregate.State) (Replacement, error) {
	return adapter.Stage(path, state)
}

// Commit atomically replaces the target with the previously synced sibling.
func (staged *StagedReplacement) Commit() error {
	if staged == nil || staged.closed {
		return ErrStagedClosed
	}
	if err := staged.replace(staged.temporaryPath, staged.targetPath); err != nil {
		return fmt.Errorf("replace project file %q: %w", staged.targetPath, err)
	}
	staged.closed = true
	return nil
}

// Discard removes an uncommitted staged file. It is idempotent after a
// successful commit because the atomic rename has already consumed the temp.
func (staged *StagedReplacement) Discard() error {
	if staged == nil || staged.closed {
		return nil
	}
	staged.closed = true
	if err := os.Remove(staged.temporaryPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("discard staged project file %q: %w", staged.temporaryPath, err)
	}
	return nil
}

// Encode returns one byte-stable strict project document containing authored
// state only.
func Encode(state aggregate.State) ([]byte, error) {
	if err := state.Validate(); err != nil {
		return nil, fmt.Errorf("encode authored aggregate: %w", err)
	}
	document := diskDocument{
		Format: Format,
		Project: diskProject{
			ID:       state.Project.ID,
			Name:     state.Project.Name,
			Revision: state.Project.Revision,
		},
		PythonTarget: diskPythonTarget{
			Prefix: state.PythonTarget.Prefix,
			Suffix: state.PythonTarget.Suffix,
		},
		Callables: make([]diskCallable, 0, len(state.Callables)),
	}
	for _, callable := range state.Callables {
		diskCallable := diskCallable{
			ID:                 callable.ID,
			Name:               callable.Name,
			AuthoredExpression: callable.AuthoredExpression,
			Parameters:         make([]diskParameter, 0, len(callable.Parameters)),
		}
		for _, parameter := range callable.Parameters {
			diskCallable.Parameters = append(diskCallable.Parameters, diskParameter{
				ID:                 parameter.ID,
				Name:               parameter.Name,
				NameEditable:       parameter.NameEditable,
				PassingStyle:       string(parameter.PassingStyle),
				TypeAnnotation:     cloneString(parameter.TypeAnnotation),
				Default:            cloneString(parameter.Default),
				ProviderOrdinal:    cloneInt(parameter.ProviderOrdinal),
				AuthoredExpression: parameter.AuthoredExpression,
			})
		}
		document.Callables = append(document.Callables, diskCallable)
	}
	encoded, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal project file: %w", err)
	}
	return append(encoded, '\n'), nil
}

// Decode parses exactly one strict project document and returns its one
// validated aggregate. Unknown, missing, null-in-required, and derived fields
// are all rejected at this boundary.
func Decode(content []byte) (aggregate.State, error) {
	raw, err := decodeSingleJSON(content)
	if err != nil {
		return aggregate.State{}, invalidFile("invalid JSON: %v", err)
	}
	fields, err := decodeObject(raw, "document")
	if err != nil {
		return aggregate.State{}, err
	}
	if err := requireExactFields(fields, "document", "format", "project", "pythonTarget", "callables"); err != nil {
		return aggregate.State{}, err
	}
	format, err := decodeString(fields["format"], "document format")
	if err != nil {
		return aggregate.State{}, err
	}
	if format != Format {
		return aggregate.State{}, invalidFile("unsupported format %q", format)
	}
	project, err := decodeProject(fields["project"])
	if err != nil {
		return aggregate.State{}, err
	}
	target, err := decodePythonTarget(fields["pythonTarget"])
	if err != nil {
		return aggregate.State{}, err
	}
	callables, err := decodeCallables(fields["callables"])
	if err != nil {
		return aggregate.State{}, err
	}
	state := aggregate.State{Project: project, PythonTarget: target, Callables: callables}
	if err := state.Validate(); err != nil {
		return aggregate.State{}, invalidFile("incoherent authored aggregate: %v", err)
	}
	return state, nil
}

func (adapter Adapter) replacer() replaceFunc {
	if adapter.replace != nil {
		return adapter.replace
	}
	return os.Rename
}

func newAdapterForTest(replace replaceFunc) Adapter {
	return Adapter{replace: replace}
}

func validatePath(path string) error {
	if strings.TrimSpace(path) == "" {
		return ErrProjectPathInvalid
	}
	return nil
}

func writeAndSync(file *os.File, content []byte) error {
	for len(content) > 0 {
		written, err := file.Write(content)
		if err != nil {
			return err
		}
		if written == 0 {
			return io.ErrShortWrite
		}
		content = content[written:]
	}
	return file.Sync()
}

type diskDocument struct {
	Format       string           `json:"format"`
	Project      diskProject      `json:"project"`
	PythonTarget diskPythonTarget `json:"pythonTarget"`
	Callables    []diskCallable   `json:"callables"`
}

type diskProject struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Revision int    `json:"revision"`
}

type diskPythonTarget struct {
	Prefix string `json:"prefix"`
	Suffix string `json:"suffix"`
}

type diskCallable struct {
	ID                 string          `json:"id"`
	Name               string          `json:"name"`
	AuthoredExpression string          `json:"authoredExpression"`
	Parameters         []diskParameter `json:"parameters"`
}

type diskParameter struct {
	ID                 string  `json:"id"`
	Name               string  `json:"name"`
	NameEditable       bool    `json:"nameEditable"`
	PassingStyle       string  `json:"passingStyle"`
	TypeAnnotation     *string `json:"typeAnnotation"`
	Default            *string `json:"default"`
	ProviderOrdinal    *int    `json:"providerOrdinal"`
	AuthoredExpression string  `json:"authoredExpression"`
}

func decodeProject(raw json.RawMessage) (aggregate.Project, error) {
	fields, err := decodeObject(raw, "project")
	if err != nil {
		return aggregate.Project{}, err
	}
	if err := requireExactFields(fields, "project", "id", "name", "revision"); err != nil {
		return aggregate.Project{}, err
	}
	id, err := decodeString(fields["id"], "project id")
	if err != nil {
		return aggregate.Project{}, err
	}
	name, err := decodeString(fields["name"], "project name")
	if err != nil {
		return aggregate.Project{}, err
	}
	revision, err := decodeInt(fields["revision"], "project revision")
	if err != nil {
		return aggregate.Project{}, err
	}
	return aggregate.Project{ID: id, Name: name, Revision: revision}, nil
}

func decodePythonTarget(raw json.RawMessage) (aggregate.PythonTarget, error) {
	fields, err := decodeObject(raw, "pythonTarget")
	if err != nil {
		return aggregate.PythonTarget{}, err
	}
	if err := requireExactFields(fields, "pythonTarget", "prefix", "suffix"); err != nil {
		return aggregate.PythonTarget{}, err
	}
	prefix, err := decodeString(fields["prefix"], "pythonTarget prefix")
	if err != nil {
		return aggregate.PythonTarget{}, err
	}
	suffix, err := decodeString(fields["suffix"], "pythonTarget suffix")
	if err != nil {
		return aggregate.PythonTarget{}, err
	}
	return aggregate.PythonTarget{Prefix: prefix, Suffix: suffix}, nil
}

func decodeCallables(raw json.RawMessage) ([]aggregate.Callable, error) {
	values, err := decodeArray(raw, "callables")
	if err != nil {
		return nil, err
	}
	callables := make([]aggregate.Callable, 0, len(values))
	for index, value := range values {
		callable, err := decodeCallable(value, index)
		if err != nil {
			return nil, err
		}
		callables = append(callables, callable)
	}
	return callables, nil
}

func decodeCallable(raw json.RawMessage, index int) (aggregate.Callable, error) {
	label := fmt.Sprintf("callable %d", index)
	fields, err := decodeObject(raw, label)
	if err != nil {
		return aggregate.Callable{}, err
	}
	if err := requireExactFields(fields, label, "id", "name", "authoredExpression", "parameters"); err != nil {
		return aggregate.Callable{}, err
	}
	id, err := decodeString(fields["id"], label+" id")
	if err != nil {
		return aggregate.Callable{}, err
	}
	name, err := decodeString(fields["name"], label+" name")
	if err != nil {
		return aggregate.Callable{}, err
	}
	expression, err := decodeString(fields["authoredExpression"], label+" authoredExpression")
	if err != nil {
		return aggregate.Callable{}, err
	}
	parameters, err := decodeParameters(fields["parameters"], label)
	if err != nil {
		return aggregate.Callable{}, err
	}
	return aggregate.Callable{ID: id, Name: name, AuthoredExpression: expression, Parameters: parameters}, nil
}

func decodeParameters(raw json.RawMessage, callableLabel string) ([]aggregate.Parameter, error) {
	values, err := decodeArray(raw, callableLabel+" parameters")
	if err != nil {
		return nil, err
	}
	parameters := make([]aggregate.Parameter, 0, len(values))
	for index, value := range values {
		label := fmt.Sprintf("%s parameter %d", callableLabel, index)
		parameter, err := decodeParameter(value, label)
		if err != nil {
			return nil, err
		}
		parameters = append(parameters, parameter)
	}
	return parameters, nil
}

func decodeParameter(raw json.RawMessage, label string) (aggregate.Parameter, error) {
	fields, err := decodeObject(raw, label)
	if err != nil {
		return aggregate.Parameter{}, err
	}
	if err := requireExactFields(fields, label,
		"id", "name", "nameEditable", "passingStyle", "typeAnnotation", "default", "providerOrdinal", "authoredExpression"); err != nil {
		return aggregate.Parameter{}, err
	}
	id, err := decodeString(fields["id"], label+" id")
	if err != nil {
		return aggregate.Parameter{}, err
	}
	name, err := decodeString(fields["name"], label+" name")
	if err != nil {
		return aggregate.Parameter{}, err
	}
	nameEditable, err := decodeBool(fields["nameEditable"], label+" nameEditable")
	if err != nil {
		return aggregate.Parameter{}, err
	}
	passingStyle, err := decodeString(fields["passingStyle"], label+" passingStyle")
	if err != nil {
		return aggregate.Parameter{}, err
	}
	typeAnnotation, err := decodeNullableString(fields["typeAnnotation"], label+" typeAnnotation")
	if err != nil {
		return aggregate.Parameter{}, err
	}
	defaultValue, err := decodeNullableString(fields["default"], label+" default")
	if err != nil {
		return aggregate.Parameter{}, err
	}
	providerOrdinal, err := decodeNullableInt(fields["providerOrdinal"], label+" providerOrdinal")
	if err != nil {
		return aggregate.Parameter{}, err
	}
	expression, err := decodeString(fields["authoredExpression"], label+" authoredExpression")
	if err != nil {
		return aggregate.Parameter{}, err
	}
	return aggregate.Parameter{
		ID:                 id,
		Name:               name,
		NameEditable:       nameEditable,
		PassingStyle:       aggregate.PassingStyle(passingStyle),
		TypeAnnotation:     typeAnnotation,
		Default:            defaultValue,
		ProviderOrdinal:    providerOrdinal,
		AuthoredExpression: expression,
	}, nil
}

func decodeSingleJSON(content []byte) (json.RawMessage, error) {
	decoder := json.NewDecoder(bytes.NewReader(content))
	var raw json.RawMessage
	if err := decoder.Decode(&raw); err != nil {
		return nil, err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return nil, errors.New("multiple JSON values")
		}
		return nil, err
	}
	return raw, nil
}

func decodeObject(raw json.RawMessage, label string) (map[string]json.RawMessage, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	token, err := decoder.Token()
	if err != nil {
		return nil, invalidFile("%s must be an object", label)
	}
	delimiter, isObject := token.(json.Delim)
	if !isObject || delimiter != '{' {
		return nil, invalidFile("%s must be an object", label)
	}
	fields := make(map[string]json.RawMessage)
	for decoder.More() {
		keyToken, err := decoder.Token()
		if err != nil {
			return nil, invalidFile("%s has an invalid object key", label)
		}
		key, isString := keyToken.(string)
		if !isString {
			return nil, invalidFile("%s has a non-string object key", label)
		}
		if _, exists := fields[key]; exists {
			return nil, invalidFile("%s repeats field %q", label, key)
		}
		var value json.RawMessage
		if err := decoder.Decode(&value); err != nil {
			return nil, invalidFile("%s field %q is invalid", label, key)
		}
		fields[key] = value
	}
	if _, err := decoder.Token(); err != nil {
		return nil, invalidFile("%s is not closed", label)
	}
	return fields, nil
}

func requireExactFields(fields map[string]json.RawMessage, label string, expected ...string) error {
	expectedSet := make(map[string]struct{}, len(expected))
	for _, field := range expected {
		expectedSet[field] = struct{}{}
	}
	for field := range fields {
		if _, known := expectedSet[field]; !known {
			return invalidFile("%s has unknown field %q", label, field)
		}
	}
	for _, field := range expected {
		if _, present := fields[field]; !present {
			return invalidFile("%s is missing field %q", label, field)
		}
	}
	return nil
}

func decodeArray(raw json.RawMessage, label string) ([]json.RawMessage, error) {
	if isNull(raw) || len(bytes.TrimSpace(raw)) == 0 || bytes.TrimSpace(raw)[0] != '[' {
		return nil, invalidFile("%s must be an array", label)
	}
	var values []json.RawMessage
	if err := json.Unmarshal(raw, &values); err != nil {
		return nil, invalidFile("%s must be an array", label)
	}
	return values, nil
}

func decodeString(raw json.RawMessage, label string) (string, error) {
	if isNull(raw) {
		return "", invalidFile("%s must be a string", label)
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", invalidFile("%s must be a string", label)
	}
	return value, nil
}

func decodeBool(raw json.RawMessage, label string) (bool, error) {
	if isNull(raw) {
		return false, invalidFile("%s must be a boolean", label)
	}
	var value bool
	if err := json.Unmarshal(raw, &value); err != nil {
		return false, invalidFile("%s must be a boolean", label)
	}
	return value, nil
}

func decodeInt(raw json.RawMessage, label string) (int, error) {
	if isNull(raw) {
		return 0, invalidFile("%s must be an integer", label)
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return 0, invalidFile("%s must be an integer", label)
	}
	number, isNumber := value.(json.Number)
	if !isNumber {
		return 0, invalidFile("%s must be an integer", label)
	}
	integer, err := strconv.Atoi(number.String())
	if err != nil {
		return 0, invalidFile("%s must be an integer", label)
	}
	return integer, nil
}

func decodeNullableString(raw json.RawMessage, label string) (*string, error) {
	if isNull(raw) {
		return nil, nil
	}
	value, err := decodeString(raw, label)
	if err != nil {
		return nil, err
	}
	return &value, nil
}

func decodeNullableInt(raw json.RawMessage, label string) (*int, error) {
	if isNull(raw) {
		return nil, nil
	}
	value, err := decodeInt(raw, label)
	if err != nil {
		return nil, err
	}
	return &value, nil
}

func isNull(raw json.RawMessage) bool {
	return bytes.Equal(bytes.TrimSpace(raw), []byte("null"))
}

func invalidFile(format string, arguments ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalidProjectFile, fmt.Sprintf(format, arguments...))
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneInt(value *int) *int {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
