package settacli

import (
	"encoding/json"
	"fmt"
	"io"
)

type successEnvelope struct {
	SchemaVersion int      `json:"schemaVersion"`
	Command       string   `json:"command"`
	Data          any      `json:"data"`
	Warnings      []string `json:"warnings"`
}

type errorEnvelope struct {
	SchemaVersion int          `json:"schemaVersion"`
	Error         errorPayload `json:"error"`
}

type errorPayload struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Retryable bool   `json:"retryable"`
}

func (context *Context) writeCommandData(command []string, data any) error {
	if context.Globals.JSON {
		return writeJSON(context.Stdout, successEnvelope{
			SchemaVersion: schemaVersion,
			Command:       commandPath(command),
			Data:          data,
			Warnings:      []string{},
		})
	}
	return writePrettyJSON(context.Stdout, data)
}

func writeJSON(writer io.Writer, payload any) error {
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	return encoder.Encode(payload)
}

func writePrettyJSON(writer io.Writer, payload any) error {
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(payload); err != nil {
		return err
	}
	_, err := fmt.Fprintln(writer)
	return err
}
