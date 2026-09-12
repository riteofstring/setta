package cases

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/setta/bench/backend/internal/contracts"
)

type manifestCase struct {
	ID       string          `json:"id"`
	Name     *string         `json:"name"`
	Input    json.RawMessage `json:"input"`
	Expected json.RawMessage `json:"expected"`
}

func Load(projectRoot string, caseSet contracts.CaseSetV1) ([]contracts.CaseV1, error) {
	if err := caseSet.Validate(); err != nil {
		return nil, err
	}
	path, err := resolve(projectRoot, caseSet.Manifest)
	if err != nil {
		return nil, err
	}
	file, err := openManifest(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	return readManifest(file)
}

func openManifest(path string) (*os.File, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("cases: open manifest: %w", err)
	}
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > contracts.MaximumManifestBytes {
		_ = file.Close()
		return nil, errors.New("cases: manifest is not an admitted regular file")
	}
	return file, nil
}

func readManifest(file io.Reader) ([]contracts.CaseV1, error) {
	reader := bufio.NewReader(io.LimitReader(file, contracts.MaximumManifestBytes+1))
	result := make([]contracts.CaseV1, 0)
	seen := map[string]struct{}{}
	for lineNumber := 1; ; lineNumber++ {
		line, readErr := readLine(reader)
		if readErr != nil && !errors.Is(readErr, io.EOF) {
			return nil, fmt.Errorf("cases: read line %d: %w", lineNumber, readErr)
		}
		if err := appendManifestCase(&result, seen, line, lineNumber); err != nil {
			return nil, err
		}
		if errors.Is(readErr, io.EOF) {
			break
		}
	}
	if len(result) == 0 {
		return nil, errors.New("cases: manifest contains no cases")
	}
	return result, nil
}

func appendManifestCase(result *[]contracts.CaseV1, seen map[string]struct{}, line []byte, lineNumber int) error {
	if len(bytes.TrimSpace(line)) == 0 {
		return nil
	}
	item, err := decodeLine(line)
	if err != nil {
		return fmt.Errorf("cases: line %d: %w", lineNumber, err)
	}
	if _, exists := seen[item.ID]; exists {
		return fmt.Errorf("cases: line %d repeats case id %q", lineNumber, item.ID)
	}
	seen[item.ID] = struct{}{}
	*result = append(*result, item)
	if len(*result) > contracts.MaximumCases {
		return errors.New("cases: manifest exceeds the case limit")
	}
	return nil
}

func readLine(reader *bufio.Reader) ([]byte, error) {
	var complete []byte
	for {
		fragment, prefix, err := reader.ReadLine()
		complete = append(complete, fragment...)
		if len(complete) > contracts.MaximumManifestLineBytes {
			return nil, errors.New("manifest line exceeds the byte limit")
		}
		if err != nil {
			return complete, err
		}
		if !prefix {
			return complete, nil
		}
	}
}

func decodeLine(line []byte) (contracts.CaseV1, error) {
	var decoded manifestCase
	if err := contracts.DecodeStrict(line, &decoded); err != nil {
		return contracts.CaseV1{}, err
	}
	name := decoded.ID
	if decoded.Name != nil {
		name = *decoded.Name
	}
	expected := decoded.Expected
	if len(expected) == 0 {
		expected = json.RawMessage("null")
	}
	item := contracts.CaseV1{ID: decoded.ID, Name: name, Input: decoded.Input, Expected: expected}
	return item, item.Validate()
}

func resolve(root string, relative string) (string, error) {
	canonicalRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", fmt.Errorf("cases: resolve project root: %w", err)
	}
	joined := filepath.Join(canonicalRoot, filepath.FromSlash(relative))
	resolved, err := filepath.EvalSymlinks(joined)
	if err != nil {
		return "", fmt.Errorf("cases: resolve manifest: %w", err)
	}
	relation, err := filepath.Rel(canonicalRoot, resolved)
	if err != nil || filepath.IsAbs(relation) || relation == ".." || strings.HasPrefix(relation, ".."+string(filepath.Separator)) {
		return "", errors.New("cases: manifest escapes the project root")
	}
	entry, err := os.Lstat(joined)
	if err != nil || entry.Mode()&os.ModeSymlink != 0 || !entry.Mode().IsRegular() {
		return "", errors.New("cases: manifest is not a regular project file")
	}
	return resolved, nil
}
