package runtime

import (
	"encoding/json"
	"io"
	"sync"

	"setta/internal/httpapi"
)

type terminalStreamJSONRecorder struct {
	encoder *json.Encoder
	mu      sync.Mutex
}

func newTerminalStreamJSONRecorder(writer io.Writer) *terminalStreamJSONRecorder {
	return &terminalStreamJSONRecorder{encoder: json.NewEncoder(writer)}
}

func (recorder *terminalStreamJSONRecorder) RecordTerminalStream(record httpapi.TerminalStreamRecord) {
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	_ = recorder.encoder.Encode(record)
}
