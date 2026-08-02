package tokenusage

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
	"sync"

	"setta/internal/agent"
)

const (
	// PathEnvironment enables the eval-only token telemetry sink in the
	// production backend. Normal product runs leave it unset.
	PathEnvironment = "SETTA_EVAL_TOKEN_USAGE_PATH"

	MaximumFileBytes    = 4 * 1024 * 1024
	MaximumLineBytes    = 64 * 1024
	MaximumObservations = 16 * 1024
)

// FileSink is a bounded JSONL implementation of Agent's ephemeral accounting
// boundary. Each provider notification is synced before the turn continues so
// a later harness failure cannot silently erase already-observed usage.
type FileSink struct {
	mutex        sync.Mutex
	file         *os.File
	bytesWritten int
	observations int
	closed       bool
}

func OpenFileSink(path string) (*FileSink, error) {
	clean, err := validateTelemetryPath(path)
	if err != nil {
		return nil, err
	}
	file, err := os.OpenFile(clean, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("create eval token telemetry: %w", err)
	}
	return &FileSink{file: file}, nil
}

func validateTelemetryPath(path string) (string, error) {
	if strings.TrimSpace(path) == "" || strings.TrimSpace(path) != path || !filepath.IsAbs(path) {
		return "", errors.New("eval token telemetry path must be absolute without surrounding whitespace")
	}
	clean := filepath.Clean(path)
	if clean != path {
		return "", fmt.Errorf("eval token telemetry path must be clean: %s", path)
	}
	parent := filepath.Dir(clean)
	info, err := os.Lstat(parent)
	if err != nil {
		return "", fmt.Errorf("inspect eval token telemetry directory: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return "", fmt.Errorf("eval token telemetry parent must be a real directory: %s", parent)
	}
	if _, err := os.Lstat(clean); err == nil {
		return "", fmt.Errorf("eval token telemetry already exists: %s", clean)
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("inspect eval token telemetry destination: %w", err)
	}
	return clean, nil
}

func (sink *FileSink) ObserveTokenUsage(observation agent.TokenUsageObservation) error {
	if sink == nil {
		return errors.New("eval token telemetry sink is required")
	}
	if err := observation.Validate(); err != nil {
		return fmt.Errorf("validate eval token telemetry observation: %w", err)
	}
	encoded, err := json.Marshal(observation)
	if err != nil {
		return fmt.Errorf("encode eval token telemetry observation: %w", err)
	}
	if len(encoded)+1 > MaximumLineBytes {
		return fmt.Errorf("eval token telemetry observation exceeds %d bytes", MaximumLineBytes)
	}

	sink.mutex.Lock()
	defer sink.mutex.Unlock()
	if sink.closed || sink.file == nil {
		return errors.New("eval token telemetry sink is closed")
	}
	if sink.observations >= MaximumObservations {
		return fmt.Errorf("eval token telemetry exceeds %d observations", MaximumObservations)
	}
	if sink.bytesWritten > MaximumFileBytes-len(encoded)-1 {
		return fmt.Errorf("eval token telemetry exceeds %d bytes", MaximumFileBytes)
	}
	encoded = append(encoded, '\n')
	if _, err := sink.file.Write(encoded); err != nil {
		return fmt.Errorf("write eval token telemetry observation: %w", err)
	}
	if err := sink.file.Sync(); err != nil {
		return fmt.Errorf("sync eval token telemetry observation: %w", err)
	}
	sink.bytesWritten += len(encoded)
	sink.observations++
	return nil
}

func (sink *FileSink) Close() error {
	if sink == nil {
		return nil
	}
	sink.mutex.Lock()
	defer sink.mutex.Unlock()
	if sink.closed {
		return nil
	}
	sink.closed = true
	if sink.file == nil {
		return nil
	}
	syncErr := sink.file.Sync()
	closeErr := sink.file.Close()
	sink.file = nil
	return errors.Join(syncErr, closeErr)
}

func DecodeObservations(raw []byte) ([]agent.TokenUsageObservation, error) {
	if len(raw) == 0 {
		return nil, errors.New("eval token telemetry is empty")
	}
	if len(raw) > MaximumFileBytes {
		return nil, fmt.Errorf("eval token telemetry exceeds %d bytes", MaximumFileBytes)
	}
	scanner := bufio.NewScanner(bytes.NewReader(raw))
	scanner.Buffer(make([]byte, 4096), MaximumLineBytes)
	observations := make([]agent.TokenUsageObservation, 0)
	for scanner.Scan() {
		if len(observations) >= MaximumObservations {
			return nil, fmt.Errorf("eval token telemetry exceeds %d observations", MaximumObservations)
		}
		decoder := json.NewDecoder(bytes.NewReader(scanner.Bytes()))
		decoder.DisallowUnknownFields()
		var observation agent.TokenUsageObservation
		if err := decoder.Decode(&observation); err != nil {
			return nil, fmt.Errorf("decode eval token telemetry observation[%d]: %w", len(observations), err)
		}
		var trailing any
		if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
			return nil, fmt.Errorf("eval token telemetry observation[%d] has trailing JSON", len(observations))
		}
		if err := observation.Validate(); err != nil {
			return nil, fmt.Errorf("validate eval token telemetry observation[%d]: %w", len(observations), err)
		}
		observations = append(observations, observation)
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan eval token telemetry: %w", err)
	}
	if len(observations) == 0 {
		return nil, errors.New("eval token telemetry contains no observations")
	}
	return observations, nil
}
