package artifacts

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

func joinedExtensions(name string) string {
	base := filepath.Base(name)
	if base == "" {
		return ""
	}
	index := strings.Index(base, ".")
	if index <= 0 || index == len(base)-1 {
		return ""
	}
	return base[index:]
}

func newArtifactID(extension string) (string, error) {
	buffer := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, buffer); err != nil {
		return "", fmt.Errorf("create artifact id: %w", err)
	}
	return filepath.ToSlash(filepath.Join("artifacts", hex.EncodeToString(buffer)+extension)), nil
}

func guessMimeType(path string, fallback string) string {
	trimmedFallback := strings.TrimSpace(fallback)
	if guessed := strings.TrimSpace(mime.TypeByExtension(strings.ToLower(filepath.Ext(path)))); guessed != "" {
		return guessed
	}
	if trimmedFallback != "" {
		return trimmedFallback
	}
	return "application/octet-stream"
}

func canonicalizeArtifactJSONObject(artifactType ArtifactType, raw []byte) (json.RawMessage, error) {
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, err
	}
	object, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("expected object")
	}
	normalizeArtifactJSONObject(artifactType, object)
	return canonicalizeJSONObjectValue(object)
}

func canonicalizeJSONObjectValue(value any) (json.RawMessage, error) {
	if _, ok := value.(map[string]any); !ok {
		return nil, fmt.Errorf("expected object")
	}
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return nil, err
	}
	return json.RawMessage(encoded), nil
}

func normalizeArtifactJSONObject(artifactType ArtifactType, object map[string]any) {
	switch artifactType {
	case ArtifactTypeBrushStroke:
		normalizeArtifactJSONArrayField(object, "points")
	case ArtifactTypeDrawAreaLayerItemTransform:
		normalizeArtifactJSONArrayField(object, "eraserStrokes")
		strokes, ok := object["eraserStrokes"].([]any)
		if !ok {
			return
		}
		for _, rawStroke := range strokes {
			stroke, ok := rawStroke.(map[string]any)
			if !ok {
				continue
			}
			normalizeArtifactJSONArrayField(stroke, "points")
		}
	}
}

func normalizeArtifactJSONArrayField(object map[string]any, field string) {
	rawValue, ok := object[field]
	if !ok || rawValue == nil {
		object[field] = []any{}
		return
	}
	if values, ok := rawValue.([]any); ok && values == nil {
		object[field] = []any{}
	}
}

func chartDataToCSV(data ChartDataValue) ([]byte, error) {
	if len(data) == 0 {
		return []byte{}, nil
	}
	headers := make([]string, 0, len(data))
	maxRows := 0
	for header, values := range data {
		headers = append(headers, header)
		if len(values) > maxRows {
			maxRows = len(values)
		}
	}
	sort.Strings(headers)

	var builder strings.Builder
	writer := csv.NewWriter(&builder)
	if err := writer.Write(headers); err != nil {
		return nil, err
	}
	for rowIndex := 0; rowIndex < maxRows; rowIndex++ {
		row := make([]string, 0, len(headers))
		for _, header := range headers {
			values := data[header]
			if rowIndex >= len(values) || values[rowIndex] == nil {
				row = append(row, "")
				continue
			}
			row = append(row, fmt.Sprint(values[rowIndex]))
		}
		if err := writer.Write(row); err != nil {
			return nil, err
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, err
	}
	return []byte(builder.String()), nil
}

func parseChartCSV(content []byte) (ChartDataValue, error) {
	reader := csv.NewReader(strings.NewReader(string(content)))
	records, err := reader.ReadAll()
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return ChartDataValue{}, nil
	}
	headers := records[0]
	result := make(ChartDataValue, len(headers))
	for _, header := range headers {
		result[header] = []any{}
	}
	for _, row := range records[1:] {
		for columnIndex, header := range headers {
			if columnIndex >= len(row) {
				result[header] = append(result[header], "")
				continue
			}
			value := strings.TrimSpace(row[columnIndex])
			if value == "" {
				result[header] = append(result[header], "")
				continue
			}
			if numberValue, err := strconv.ParseFloat(value, 64); err == nil {
				result[header] = append(result[header], numberValue)
				continue
			}
			result[header] = append(result[header], value)
		}
	}
	return result, nil
}

func conflictBackupPath(path string, now time.Time) string {
	suffix := filepath.Ext(path)
	base := strings.TrimSuffix(path, suffix)
	return fmt.Sprintf("%s.conflict_backup_%s%s", base, now.Format("20060102_150405"), suffix)
}

func fileHash(path string) (string, bool, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", false, nil
		}
		return "", false, fmt.Errorf("read artifact for hashing: %w", err)
	}
	return hashBytes(content), true, nil
}

func hashBytes(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func cloneRawJSON(value json.RawMessage) json.RawMessage {
	if value == nil {
		return nil
	}
	return append(json.RawMessage(nil), value...)
}

func cloneJSONArtifact(artifact JSONArtifact) JSONArtifact {
	return JSONArtifact{
		Type:  artifact.Type,
		ID:    artifact.ID,
		Value: cloneRawJSON(artifact.Value),
	}
}

func cloneChartDataValues(values ChartDataValue) ChartDataValue {
	clonedValues := make(ChartDataValue, len(values))
	for key, items := range values {
		clonedValues[key] = append([]any(nil), items...)
	}
	return clonedValues
}

func cloneChartDataArtifact(artifact ChartDataArtifact) ChartDataArtifact {
	return ChartDataArtifact{
		Type:  artifact.Type,
		ID:    artifact.ID,
		Value: cloneChartDataValues(artifact.Value),
	}
}
