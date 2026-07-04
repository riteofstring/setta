package chat

import "fmt"

func validateImagePartVariants(messageID string, partID string, part ImagePart) error {
	if len(part.Variants) != len(imageAttachmentVariantKindValues) {
		return fmt.Errorf("message %s part %s has %d image variants, want %d", messageID, partID, len(part.Variants), len(imageAttachmentVariantKindValues))
	}
	seen := map[ImageAttachmentVariantKind]bool{}
	for _, variant := range part.Variants {
		if err := validateImagePartVariant(messageID, partID, variant); err != nil {
			return err
		}
		if seen[variant.Kind] {
			return fmt.Errorf("message %s part %s has duplicate %s image variant", messageID, partID, variant.Kind)
		}
		seen[variant.Kind] = true
	}
	return validateImagePartRequiredVariants(messageID, partID, seen)
}

func validateImagePartVariant(messageID string, partID string, variant ImageAttachmentVariant) error {
	if !validValue(variant.Kind, imageAttachmentVariantKindValues) {
		return fmt.Errorf("message %s part %s has unsupported image variant %s", messageID, partID, variant.Kind)
	}
	if variant.URL == "" {
		return fmt.Errorf("message %s part %s %s image variant URL is required", messageID, partID, variant.Kind)
	}
	if !supportedImageMimeType(variant.MimeType) {
		return fmt.Errorf("message %s part %s %s image variant has unsupported mimeType %s", messageID, partID, variant.Kind, variant.MimeType)
	}
	if variant.ByteSize <= 0 {
		return fmt.Errorf("message %s part %s %s image variant byteSize must be positive", messageID, partID, variant.Kind)
	}
	if variant.Width <= 0 || variant.Height <= 0 {
		return fmt.Errorf("message %s part %s %s image variant dimensions must be positive", messageID, partID, variant.Kind)
	}
	return nil
}

func validateImagePartRequiredVariants(messageID string, partID string, seen map[ImageAttachmentVariantKind]bool) error {
	for _, kind := range imageAttachmentVariantKindValues {
		if !seen[kind] {
			return fmt.Errorf("message %s part %s is missing %s image variant", messageID, partID, kind)
		}
	}
	return nil
}
