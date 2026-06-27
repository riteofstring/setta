package codexapp

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const codexRPCRecordingEnv = "SETTA_RECORDING_DIR"

var codexRPCRecording = struct {
	file *os.File
	path string
	mu   sync.Mutex
}{}

type codexRPCRecord struct {
	At        string          `json:"at"`
	Direction string          `json:"direction"`
	Message   json.RawMessage `json:"message,omitempty"`
	Raw       string          `json:"raw,omitempty"`
}

func recordCodexRPCMessage(direction string, data []byte) {
	codexRPCRecording.mu.Lock()
	defer codexRPCRecording.mu.Unlock()

	file := codexRPCRecordingFileLocked()
	if file == nil {
		return
	}
	record := codexRPCRecord{
		At:        time.Now().UTC().Format(time.RFC3339Nano),
		Direction: direction,
		Message:   append(json.RawMessage(nil), data...),
	}
	encoded, err := json.Marshal(record)
	if err != nil {
		record.Message = nil
		record.Raw = string(data)
		encoded, err = json.Marshal(record)
		if err != nil {
			return
		}
	}
	_, _ = file.Write(append(encoded, '\n'))
}

func codexRPCRecordingFileLocked() *os.File {
	dir := os.Getenv(codexRPCRecordingEnv)
	if dir == "" {
		return nil
	}
	path := filepath.Join(dir, "codex-rpc.jsonl")
	if codexRPCRecording.file != nil && codexRPCRecording.path == path {
		return codexRPCRecording.file
	}
	if codexRPCRecording.file != nil {
		_ = codexRPCRecording.file.Close()
		codexRPCRecording.file = nil
		codexRPCRecording.path = ""
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil
	}
	codexRPCRecording.file = file
	codexRPCRecording.path = path
	return file
}
