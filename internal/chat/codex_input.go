package chat

import (
	"fmt"
	"strings"
)

func codexUserInputForTurn(request TurnRequest) ([]map[string]any, error) {
	return codexUserInputItems(request.SemanticContextText(), request.Input)
}

func codexUserInputForSteer(request SteerRequest) ([]map[string]any, error) {
	return codexUserInputItems(request.SemanticContextText(), request.Input)
}

func codexUserInputItems(semanticContext string, input ChatInput) ([]map[string]any, error) {
	items := []map[string]any{}
	if contextText := strings.TrimSpace(semanticContext); contextText != "" {
		items = append(items, map[string]any{
			"text": contextText,
			"type": "text",
		})
	}
	for index, part := range input.Parts {
		switch part.Type {
		case MessagePartText:
			if part.Text == nil {
				return nil, fmt.Errorf("codex input part %d text payload is required", index)
			}
			if part.Text.Text == "" {
				continue
			}
			items = append(items, map[string]any{
				"text": part.Text.Text,
				"type": "text",
			})
		case MessagePartImage:
			if part.Image == nil {
				return nil, fmt.Errorf("codex input part %d image payload is required", index)
			}
			if part.Image.LocalPath == "" {
				return nil, fmt.Errorf("codex input part %d image local path is required", index)
			}
			item := map[string]any{
				"path": part.Image.LocalPath,
				"type": "localImage",
			}
			if part.Image.Detail != nil {
				item["detail"] = string(*part.Image.Detail)
			}
			items = append(items, item)
		default:
			return nil, fmt.Errorf("codex input part %d has unsupported type %s", index, part.Type)
		}
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("codex input must contain text or an image")
	}
	return items, nil
}
