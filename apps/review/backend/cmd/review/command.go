package main

import (
	"encoding/json"
	"fmt"
	"io"
)

func execute(arguments []string, stdin io.Reader, stdout io.Writer, stderr io.Writer) int {
	if len(arguments) == 1 && arguments[0] == "schema" {
		if err := json.NewEncoder(stdout).Encode(map[string]any{"schemaVersion": "setta-review-schema/v1"}); err != nil {
			_, _ = fmt.Fprintln(stderr, err.Error())
			return 1
		}
		return 0
	}
	_, _ = fmt.Fprintln(stderr, `{"code":"invalid_input","message":"Usage: review schema"}`)
	return 2
}
