package appsubsystemchatmodes

import (
	"errors"
	"testing"

	"setta/internal/agentruns"
	hostchatmodes "setta/internal/chatmodes"
)

func TestBuildChatModeContributionsExposeReferenceImageMode(t *testing.T) {
	t.Parallel()

	registry, err := hostchatmodes.NewAppGenerationModeRegistry(hostchatmodes.AppGenerationModeRegistryOptions{
		Contributions: BuildChatModeContributions(),
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	imageMode := string(agentruns.AppGenerationModeJSONRenderWithImage)
	if !registry.AllowsReferenceImage(&imageMode) {
		t.Fatalf("expected image mode to allow reference images")
	}

	plainMode := string(agentruns.AppGenerationModeJSONRender)
	if registry.AllowsReferenceImage(&plainMode) {
		t.Fatalf("expected plain json_render mode to reject reference images")
	}
}

func TestBuildChatModeContributionsRequireCurrentOrRetainedImageForImageMode(t *testing.T) {
	t.Parallel()

	registry, err := hostchatmodes.NewAppGenerationModeRegistry(hostchatmodes.AppGenerationModeRegistryOptions{
		Contributions: BuildChatModeContributions(),
	})
	if err != nil {
		t.Fatalf("new registry: %v", err)
	}

	imageMode := string(agentruns.AppGenerationModeJSONRenderWithImage)
	err = registry.ValidateCurrentTurn(&imageMode, hostchatmodes.AppGenerationTurnValidationOptions{
		Message: map[string]any{
			"id":      "user-follow-up",
			"role":    "user",
			"content": []any{map[string]any{"type": "text", "text": "Tighten the layout."}},
		},
		AppGenerationByMessageID: map[string]string{
			"user-follow-up": string(agentruns.AppGenerationModeJSONRenderWithImage),
		},
	})
	if !errors.Is(err, hostchatmodes.ErrAppGenerationImageAttachmentRequired) {
		t.Fatalf("expected image requirement error, got %v", err)
	}

	err = registry.ValidateCurrentTurn(&imageMode, hostchatmodes.AppGenerationTurnValidationOptions{
		Message: map[string]any{
			"id":      "user-follow-up",
			"role":    "user",
			"content": []any{map[string]any{"type": "text", "text": "Tighten the layout."}},
		},
		PriorMessages: []map[string]any{
			{
				"id":      "user-seed",
				"role":    "user",
				"content": []any{map[string]any{"type": "text", "text": "Match this image."}},
				"attachments": []any{
					map[string]any{"id": "image-1", "mimeType": "image/png"},
				},
			},
		},
		AppGenerationByMessageID: map[string]string{
			"user-seed":      string(agentruns.AppGenerationModeJSONRenderWithImage),
			"user-follow-up": string(agentruns.AppGenerationModeJSONRenderWithImage),
		},
	})
	if err != nil {
		t.Fatalf("expected retained image history to satisfy validator, got %v", err)
	}
}
