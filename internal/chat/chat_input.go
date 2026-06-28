package chat

import (
	"errors"
	"fmt"
	"strings"
)

const maxImageAttachmentsPerMessage = 10

func TextChatInput(text string) ChatInput {
	return ChatInput{
		Parts: []ChatInputPart{{
			Type: MessagePartText,
			Text: &ChatTextInput{
				Text:   text,
				Format: TextFormatPlain,
			},
		}},
	}
}

func validateChatInput(input ChatInput) error {
	if len(input.Parts) == 0 {
		return errors.New("message input must contain at least one part")
	}
	hasContent := false
	imageCount := 0
	for index, part := range input.Parts {
		if err := validateChatInputPart(part); err != nil {
			return fmt.Errorf("message input part %d: %w", index, err)
		}
		switch part.Type {
		case MessagePartText:
			if strings.TrimSpace(part.Text.Text) != "" {
				hasContent = true
			}
		case MessagePartImage:
			hasContent = true
			imageCount++
		}
	}
	if !hasContent {
		return errors.New("message input must contain text or an image")
	}
	if imageCount > maxImageAttachmentsPerMessage {
		return fmt.Errorf("message input has %d images, maximum is %d", imageCount, maxImageAttachmentsPerMessage)
	}
	return nil
}

func normalizeChatInput(input ChatInput) ChatInput {
	parts := make([]ChatInputPart, 0, len(input.Parts))
	for _, part := range input.Parts {
		normalized := part
		if part.Text != nil {
			text := *part.Text
			text.Text = strings.TrimSpace(text.Text)
			normalized.Text = &text
		}
		if part.Image != nil {
			image := *part.Image
			if part.Image.Detail != nil {
				detail := *part.Image.Detail
				image.Detail = &detail
			}
			normalized.Image = &image
		}
		parts = append(parts, normalized)
	}
	return ChatInput{Parts: parts}
}

func validateChatInputPart(part ChatInputPart) error {
	switch part.Type {
	case MessagePartText:
		if part.Text == nil {
			return errors.New("text payload is required")
		}
		if part.Image != nil {
			return errors.New("image payload must be null for text parts")
		}
		return validateChatTextInput(*part.Text)
	case MessagePartImage:
		if part.Image == nil {
			return errors.New("image payload is required")
		}
		if part.Text != nil {
			return errors.New("text payload must be null for image parts")
		}
		return validateChatImageInput(*part.Image)
	default:
		return fmt.Errorf("unsupported type %s", part.Type)
	}
}

func validateChatTextInput(input ChatTextInput) error {
	if !validValue(input.Format, textFormatValues) {
		return fmt.Errorf("unsupported text format %s", input.Format)
	}
	return nil
}

func validateChatImageInput(input ChatImageInput) error {
	if err := validateStorageID("attachment id", input.AttachmentID); err != nil {
		return err
	}
	if input.Detail != nil && !validValue(*input.Detail, imageDetailValues) {
		return fmt.Errorf("unsupported image detail %s", *input.Detail)
	}
	return nil
}

func chatInputText(input ChatInput) string {
	parts := make([]string, 0, len(input.Parts))
	for _, part := range input.Parts {
		if part.Type == MessagePartText && part.Text != nil {
			parts = append(parts, part.Text.Text)
		}
	}
	return strings.Join(parts, "")
}

func chatInputImageCount(input ChatInput) int {
	count := 0
	for _, part := range input.Parts {
		if part.Type == MessagePartImage {
			count++
		}
	}
	return count
}

func messageText(message ChatMessage) string {
	parts := make([]string, 0, len(message.Parts))
	for _, part := range message.Parts {
		if part.Type == MessagePartText && part.Text != nil {
			parts = append(parts, part.Text.Text)
		}
	}
	return strings.Join(parts, "")
}

func messageImageCount(message ChatMessage) int {
	count := 0
	for _, part := range message.Parts {
		if part.Type == MessagePartImage {
			count++
		}
	}
	return count
}

func messagePromptSummary(message ChatMessage) string {
	text := strings.TrimSpace(messageText(message))
	if text != "" {
		return summarize(text, maxPromptSummary)
	}
	imageCount := messageImageCount(message)
	if imageCount == 1 {
		return "Image attachment"
	}
	return fmt.Sprintf("%d image attachments", imageCount)
}

func cloneMessageParts(parts []MessagePart) []MessagePart {
	if len(parts) == 0 {
		return nil
	}
	cloned := make([]MessagePart, len(parts))
	for index, part := range parts {
		cloned[index] = part
		if part.Text != nil {
			text := *part.Text
			cloned[index].Text = &text
		}
		if part.Image != nil {
			image := *part.Image
			if part.Image.Detail != nil {
				detail := *part.Image.Detail
				image.Detail = &detail
			}
			cloned[index].Image = &image
		}
	}
	return cloned
}
