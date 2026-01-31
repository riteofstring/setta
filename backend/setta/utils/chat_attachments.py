import base64
import mimetypes
from pathlib import Path

from setta.database.db_objs import DBE
from setta.types.chat_messages import (
    ChatFileAttachment,
    MessageImageUrl,
    MessageImageUrlContent,
    MessageTextContent,
)
from setta.types.generated.chat_messages import BaseChatMessageTypeAdapter
from setta.utils.utils import normalize_path

_TEXT_MIME_TYPES = {
    "application/json",
    "application/xml",
    "application/javascript",
    "application/x-javascript",
    "application/x-python",
    "application/x-yaml",
    "application/yaml",
    "application/x-www-form-urlencoded",
}


def normalize_attachment_mime(attachment: ChatFileAttachment) -> str:
    if attachment.mimeType:
        return attachment.mimeType
    guess, _ = mimetypes.guess_type(attachment.name)
    if guess:
        return guess
    return "application/octet-stream"


def is_text_mime(mime_type: str) -> bool:
    if mime_type.startswith("text/"):
        return True
    return mime_type in _TEXT_MIME_TYPES


def is_image_mime(mime_type: str) -> bool:
    return mime_type.startswith("image/")


def read_attachment_bytes(dbe: DBE, attachment: ChatFileAttachment) -> bytes:
    resolved = normalize_path(Path(attachment.id))
    content = dbe.read(resolved, "rb")
    if content is None:
        raise FileNotFoundError(f"Attachment not found: {attachment.id}")
    return content


def build_attachment_text_block(
    attachment: ChatFileAttachment, text: str
) -> MessageTextContent:
    header = f"[Attachment: {attachment.name}]"
    if text.strip():
        return MessageTextContent(text=f"{header}\n{text}")
    return MessageTextContent(text=header)


def build_attachment_placeholder_block(
    attachment: ChatFileAttachment, *, mime_type: str
) -> MessageTextContent:
    size_label = (
        f"{attachment.size} bytes" if attachment.size is not None else "size unknown"
    )
    return MessageTextContent(
        text=(
            f"[Attachment: {attachment.name}]\n"
            f"Type: {mime_type}\n"
            f"Size: {size_label}\n"
            "Content not inlined."
        )
    )


def build_missing_attachment_block(
    attachment: ChatFileAttachment, *, mime_type: str
) -> MessageTextContent:
    size_label = (
        f"{attachment.size} bytes" if attachment.size is not None else "size unknown"
    )
    return MessageTextContent(
        text=(
            f"[Attachment missing: {attachment.name}]\n"
            f"Type: {mime_type}\n"
            f"Size: {size_label}\n"
            "Attachment not found."
        )
    )


def build_attachment_content_blocks(
    *,
    dbe: DBE,
    attachments: list[ChatFileAttachment],
) -> list[MessageTextContent | MessageImageUrlContent]:
    blocks: list[MessageTextContent | MessageImageUrlContent] = []
    for attachment in attachments:
        mime_type = normalize_attachment_mime(attachment)
        if is_image_mime(mime_type):
            try:
                payload = read_attachment_bytes(dbe, attachment)
            except FileNotFoundError:
                blocks.append(
                    build_missing_attachment_block(attachment, mime_type=mime_type)
                )
                continue
            encoded = base64.b64encode(payload).decode("utf-8")
            url = f"data:{mime_type};base64,{encoded}"
            blocks.append(
                MessageImageUrlContent(
                    image_url=MessageImageUrl(url=url, detail="auto")
                )
            )
            continue
        if is_text_mime(mime_type):
            try:
                payload = read_attachment_bytes(dbe, attachment)
            except FileNotFoundError:
                blocks.append(
                    build_missing_attachment_block(attachment, mime_type=mime_type)
                )
                continue
            text = payload.decode("utf-8", errors="replace")
            blocks.append(build_attachment_text_block(attachment, text))
            continue
        blocks.append(
            build_attachment_placeholder_block(attachment, mime_type=mime_type)
        )
    return blocks


def build_attachments_prompt_text(
    *,
    dbe: DBE,
    attachments: list[ChatFileAttachment],
    include_images: bool = True,
) -> str:
    parts: list[str] = []
    for attachment in attachments:
        mime_type = normalize_attachment_mime(attachment)
        if is_image_mime(mime_type) and not include_images:
            continue
        if is_text_mime(mime_type):
            try:
                payload = read_attachment_bytes(dbe, attachment)
            except FileNotFoundError:
                parts.append(
                    build_missing_attachment_block(attachment, mime_type=mime_type).text
                )
                continue
            text = payload.decode("utf-8", errors="replace")
            parts.append(build_attachment_text_block(attachment, text).text)
            continue
        parts.append(
            build_attachment_placeholder_block(attachment, mime_type=mime_type).text
        )
    return "\n\n".join(part for part in parts if part.strip()).strip()


def collect_message_attachments(raw_messages: list[object]) -> list[ChatFileAttachment]:
    attachments: dict[str, ChatFileAttachment] = {}
    for raw in raw_messages:
        message = BaseChatMessageTypeAdapter.validate_python(raw)
        msg_attachments = getattr(message, "attachments", None)
        if not isinstance(msg_attachments, list):
            continue
        for attachment in msg_attachments:
            attachments.setdefault(attachment.id, attachment)
    return list(attachments.values())


def extract_attachment_urls(inputs: dict[str, object] | None) -> dict[str, str]:
    if not inputs:
        return {}
    raw = inputs.get("attachmentUrls")
    if not isinstance(raw, dict):
        return {}
    urls: dict[str, str] = {}
    for key, value in raw.items():
        if isinstance(key, str) and isinstance(value, str):
            urls[key] = value
    return urls


def extract_attachment_text(inputs: dict[str, object] | None) -> str:
    if not inputs:
        return ""
    raw = inputs.get("attachmentText")
    if isinstance(raw, str):
        return raw.strip()
    return ""


def extract_attachment_text_no_images(inputs: dict[str, object] | None) -> str:
    if not inputs:
        return ""
    raw = inputs.get("attachmentTextNoImages")
    if isinstance(raw, str):
        return raw.strip()
    return ""
