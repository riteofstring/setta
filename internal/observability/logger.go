package observability

import (
	"io"
	"log/slog"
	"os"
)

func NewLogger(level slog.Level, writer io.Writer) *slog.Logger {
	if writer == nil {
		writer = os.Stderr
	}
	return slog.New(slog.NewJSONHandler(writer, &slog.HandlerOptions{Level: level}))
}
