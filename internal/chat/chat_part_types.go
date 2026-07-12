package chat

type ImageAttachmentMimeType string
type ImageAttachmentVariantKind string

const (
	ImageAttachmentMimeTypeGIF  ImageAttachmentMimeType = "image/gif"
	ImageAttachmentMimeTypeJPEG ImageAttachmentMimeType = "image/jpeg"
	ImageAttachmentMimeTypePNG  ImageAttachmentMimeType = "image/png"

	ImageAttachmentVariantThumbnail ImageAttachmentVariantKind = "thumbnail"
	ImageAttachmentVariantInline    ImageAttachmentVariantKind = "inline"
	ImageAttachmentVariantPreview   ImageAttachmentVariantKind = "preview"
	ImageAttachmentVariantOriginal  ImageAttachmentVariantKind = "original"
)

var imageAttachmentMimeTypeValues = []ImageAttachmentMimeType{
	ImageAttachmentMimeTypePNG,
	ImageAttachmentMimeTypeJPEG,
	ImageAttachmentMimeTypeGIF,
}

var imageAttachmentVariantKindValues = []ImageAttachmentVariantKind{
	ImageAttachmentVariantThumbnail,
	ImageAttachmentVariantInline,
	ImageAttachmentVariantPreview,
	ImageAttachmentVariantOriginal,
}

type ChatInput struct {
	Parts []ChatInputPart `json:"parts"`
}

type ChatInputPart struct {
	Type  MessagePartType `json:"type"`
	Text  *ChatTextInput  `json:"text"`
	Image *ChatImageInput `json:"image"`
}

type ChatTextInput struct {
	Text   string     `json:"text"`
	Format TextFormat `json:"format"`
}

type ChatImageInput struct {
	AttachmentID string       `json:"attachmentId"`
	Detail       *ImageDetail `json:"detail"`
	LocalPath    string       `json:"-"`
}

type MessagePart struct {
	ID    string           `json:"id"`
	Type  MessagePartType  `json:"type"`
	Text  *MessageTextPart `json:"text"`
	Image *ImagePart       `json:"image"`
}

type MessageTextPart struct {
	Text   string     `json:"text"`
	Format TextFormat `json:"format"`
}

type ImagePart struct {
	AttachmentID string                   `json:"attachmentId"`
	FileName     string                   `json:"fileName"`
	MimeType     ImageAttachmentMimeType  `json:"mimeType"`
	ByteSize     int                      `json:"byteSize"`
	Width        int                      `json:"width"`
	Height       int                      `json:"height"`
	Variants     []ImageAttachmentVariant `json:"variants"`
	Detail       *ImageDetail             `json:"detail"`
	LocalPath    string                   `json:"-"`
}

type ImageAttachmentVariant struct {
	Kind     ImageAttachmentVariantKind `json:"kind"`
	URL      string                     `json:"url"`
	MimeType ImageAttachmentMimeType    `json:"mimeType"`
	ByteSize int                        `json:"byteSize"`
	Width    int                        `json:"width"`
	Height   int                        `json:"height"`
}

type ImageAttachment struct {
	SchemaVersion  int                      `json:"schemaVersion"`
	ID             string                   `json:"id"`
	WorkspaceID    string                   `json:"workspaceId"`
	ConversationID string                   `json:"conversationId"`
	FileName       string                   `json:"fileName"`
	MimeType       ImageAttachmentMimeType  `json:"mimeType"`
	ByteSize       int                      `json:"byteSize"`
	Width          int                      `json:"width"`
	Height         int                      `json:"height"`
	CreatedAt      string                   `json:"createdAt"`
	Variants       []ImageAttachmentVariant `json:"variants"`
}
