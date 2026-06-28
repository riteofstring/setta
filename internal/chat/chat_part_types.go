package chat

type ImageAttachmentMimeType string

const (
	ImageAttachmentMimeTypeGIF  ImageAttachmentMimeType = "image/gif"
	ImageAttachmentMimeTypeJPEG ImageAttachmentMimeType = "image/jpeg"
	ImageAttachmentMimeTypePNG  ImageAttachmentMimeType = "image/png"
)

var imageAttachmentMimeTypeValues = []ImageAttachmentMimeType{
	ImageAttachmentMimeTypePNG,
	ImageAttachmentMimeTypeJPEG,
	ImageAttachmentMimeTypeGIF,
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
	AttachmentID string                  `json:"attachmentId"`
	FileName     string                  `json:"fileName"`
	MimeType     ImageAttachmentMimeType `json:"mimeType"`
	ByteSize     int                     `json:"byteSize"`
	Width        int                     `json:"width"`
	Height       int                     `json:"height"`
	ThumbnailURL string                  `json:"thumbnailUrl"`
	PreviewURL   string                  `json:"previewUrl"`
	Detail       *ImageDetail            `json:"detail"`
	LocalPath    string                  `json:"-"`
}

type ImageAttachment struct {
	SchemaVersion  int                     `json:"schemaVersion"`
	ID             string                  `json:"id"`
	WorkspaceID    string                  `json:"workspaceId"`
	ConversationID string                  `json:"conversationId"`
	FileName       string                  `json:"fileName"`
	MimeType       ImageAttachmentMimeType `json:"mimeType"`
	ByteSize       int                     `json:"byteSize"`
	Width          int                     `json:"width"`
	Height         int                     `json:"height"`
	CreatedAt      string                  `json:"createdAt"`
	ThumbnailURL   string                  `json:"thumbnailUrl"`
	PreviewURL     string                  `json:"previewUrl"`
}
