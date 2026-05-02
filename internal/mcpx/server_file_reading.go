package mcpx

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"setta/internal/statefs"
	"setta/internal/tools"
)

func newReadFileRangeHandler(workspaceRoot string) tools.Handler {
	return func(_ context.Context, arguments map[string]any) (any, error) {
		request, err := readReadFileRangeRequest(arguments)
		if err != nil {
			return nil, err
		}
		resolvedPath, err := statefs.ResolveWithinRoot(workspaceRoot, request.rawPath, "path")
		if err != nil {
			return nil, newToolError("invalid_arguments", "%s", err.Error())
		}
		content, err := readUTF8RegularFile(resolvedPath)
		if err != nil {
			return nil, err
		}
		selectedLines, resolvedEndLine := selectReadFileRangeLines(splitFileLines(content), request.startLine, request.endLine)
		relativePath, err := filepath.Rel(workspaceRoot, resolvedPath)
		if err != nil {
			return nil, fmt.Errorf("relative path for %s: %w", resolvedPath, err)
		}

		return readFileRangeResult{
			Path:         filepath.ToSlash(filepath.Clean(relativePath)),
			AbsolutePath: resolvedPath,
			StartLine:    request.startLine,
			EndLine:      resolvedEndLine,
			Encoding:     "utf-8",
			Content:      strings.Join(selectedLines, "\n"),
		}, nil
	}
}

type readFileRangeRequest struct {
	rawPath   string
	startLine int
	endLine   *int
}

func readReadFileRangeRequest(arguments map[string]any) (readFileRangeRequest, error) {
	rawPath, err := readRequiredStringArgument(arguments, "path")
	if err != nil {
		return readFileRangeRequest{}, err
	}
	startLine, err := readOptionalPositiveIntArgument(arguments, "start_line")
	if err != nil {
		return readFileRangeRequest{}, err
	}
	endLine, err := readOptionalPositiveIntArgument(arguments, "end_line")
	if err != nil {
		return readFileRangeRequest{}, err
	}

	request := readFileRangeRequest{
		rawPath:   rawPath,
		startLine: 1,
		endLine:   endLine,
	}
	if startLine != nil {
		request.startLine = *startLine
	}
	if request.endLine != nil && *request.endLine < request.startLine {
		return readFileRangeRequest{}, newToolError(
			"invalid_arguments",
			"end_line must be greater than or equal to start_line",
		)
	}
	return request, nil
}

func readUTF8RegularFile(resolvedPath string) (string, error) {
	info, err := os.Stat(resolvedPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", newToolError("file_not_found", "File not found: %s", resolvedPath)
		}
		return "", fmt.Errorf("stat %s: %w", resolvedPath, err)
	}
	if !info.Mode().IsRegular() {
		return "", newToolError("invalid_arguments", "Path is not a file: %s", resolvedPath)
	}

	data, err := os.ReadFile(resolvedPath)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", resolvedPath, err)
	}
	if !utf8.Valid(data) {
		return "", newToolError("invalid_arguments", "File is not UTF-8 encoded: %s", resolvedPath)
	}
	return string(data), nil
}

func selectReadFileRangeLines(lines []string, startLine int, endLine *int) ([]string, int) {
	selectedLines := make([]string, 0, len(lines))
	resolvedEndLine := startLine - 1
	for lineNumber := startLine; lineNumber <= len(lines); lineNumber++ {
		if endLine != nil && lineNumber > *endLine {
			break
		}
		selectedLines = append(selectedLines, lines[lineNumber-1])
		resolvedEndLine = lineNumber
	}
	return selectedLines, resolvedEndLine
}

func splitFileLines(content string) []string {
	normalized := strings.ReplaceAll(content, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\r", "\n")
	lines := strings.Split(normalized, "\n")
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}
