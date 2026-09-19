package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestExecuteSchema(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if code := execute([]string{"schema"}, strings.NewReader(""), &stdout, &stderr); code != 0 {
		t.Fatalf("execute() = %d, stderr = %q", code, stderr.String())
	}
	if got := stdout.String(); got != "{\"schemaVersion\":\"setta-review-schema/v1\"}\n" {
		t.Fatalf("stdout = %q", got)
	}
}
