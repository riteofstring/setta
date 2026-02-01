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
from setta.utils.attachment_paths import resolve_attachment_path

_TEXT_MIME_TYPES = {
    "application/json",
    "application/xml",
    "application/javascript",
    "application/x-javascript",
    "application/x-python",
    "application/toml",
    "application/x-yaml",
    "application/yaml",
    "application/x-www-form-urlencoded",
    "text/markdown",
    "text/x-markdown",
    "text/x-python",
    "text/x-toml",
}
_TEXT_FILE_EXTENSIONS = {
    ".cfg",
    ".conf",
    ".csv",
    ".ini",
    ".json",
    ".log",
    ".md",
    ".markdown",
    ".py",
    ".toml",
    ".tsv",
    ".txt",
    ".xml",
    ".yaml",
    ".yml",
}


def normalize_attachment_mime(
    attachment: ChatFileAttachment, *, path: Path | None = None
) -> str:
    if isinstance(attachment.mimeType, str):
        trimmed = attachment.mimeType.strip()
        if trimmed:
            return trimmed
    if path is not None:
        guess, _ = mimetypes.guess_type(path.as_posix())
        if guess:
            return guess
    guess, _ = mimetypes.guess_type(attachment.name)
    if guess:
        return guess
    guess, _ = mimetypes.guess_type(attachment.id)
    if guess:
        return guess
    return "application/octet-stream"


def is_text_mime(mime_type: str) -> bool:
    if mime_type.startswith("text/"):
        return True
    return mime_type in _TEXT_MIME_TYPES


def is_image_mime(mime_type: str) -> bool:
    return mime_type.startswith("image/")


def _get_attachment_suffixes(
    attachment: ChatFileAttachment, path: Path | None
) -> list[str]:
    if path is not None:
        suffixes = [suffix.lower() for suffix in path.suffixes if suffix]
        if suffixes:
            return suffixes
    name_suffixes = [suffix.lower() for suffix in Path(attachment.name).suffixes]
    return name_suffixes


def is_text_attachment(
    attachment: ChatFileAttachment, mime_type: str, path: Path | None
) -> bool:
    if is_text_mime(mime_type):
        return True
    if mime_type != "application/octet-stream":
        return False
    suffixes = _get_attachment_suffixes(attachment, path)
    return any(suffix in _TEXT_FILE_EXTENSIONS for suffix in suffixes)


def _resolve_attachment_path_for_read(
    attachment: ChatFileAttachment,
    *,
    base_root: Path,
    artifacts_root: Path,
    allow_external: bool,
) -> Path | None:
    try:
        return resolve_attachment_path(
            attachment.id,
            base_root=base_root,
            artifacts_root=artifacts_root,
            allow_external=allow_external,
            require_exists=False,
        )
    except (FileNotFoundError, IsADirectoryError, PermissionError, ValueError):
        return None


def read_attachment_bytes(dbe: DBE, resolved: Path | None, attachment_id: str) -> bytes:
    if resolved is None:
        raise FileNotFoundError(f"Attachment not found: {attachment_id}")
    content = dbe.read(resolved, "rb")
    if content is None:
        raise FileNotFoundError(f"Attachment not found: {attachment_id}")
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
    base_root: Path,
    artifacts_root: Path,
    allow_external: bool,
) -> list[MessageTextContent | MessageImageUrlContent]:
    blocks: list[MessageTextContent | MessageImageUrlContent] = []
    for attachment in attachments:
        resolved_path = _resolve_attachment_path_for_read(
            attachment,
            base_root=base_root,
            artifacts_root=artifacts_root,
            allow_external=allow_external,
        )
        mime_type = normalize_attachment_mime(attachment, path=resolved_path)
        if is_image_mime(mime_type):
            try:
                payload = read_attachment_bytes(dbe, resolved_path, attachment.id)
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
        if is_text_attachment(attachment, mime_type, resolved_path):
            try:
                payload = read_attachment_bytes(dbe, resolved_path, attachment.id)
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
    base_root: Path,
    artifacts_root: Path,
    allow_external: bool,
    include_images: bool = True,
) -> str:
    texts = build_attachments_prompt_text_pair(
        dbe=dbe,
        attachments=attachments,
        base_root=base_root,
        artifacts_root=artifacts_root,
        allow_external=allow_external,
    )
    return texts[0] if include_images else texts[1]


def build_attachments_prompt_text_pair(
    *,
    dbe: DBE,
    attachments: list[ChatFileAttachment],
    base_root: Path,
    artifacts_root: Path,
    allow_external: bool,
) -> tuple[str, str]:
    with_images: list[str] = []
    without_images: list[str] = []
    for attachment in attachments:
        resolved_path = _resolve_attachment_path_for_read(
            attachment,
            base_root=base_root,
            artifacts_root=artifacts_root,
            allow_external=allow_external,
        )
        mime_type = normalize_attachment_mime(attachment, path=resolved_path)
        if is_image_mime(mime_type):
            with_images.append(
                build_attachment_placeholder_block(attachment, mime_type=mime_type).text
            )
            continue
        if is_text_attachment(attachment, mime_type, resolved_path):
            try:
                payload = read_attachment_bytes(dbe, resolved_path, attachment.id)
            except FileNotFoundError:
                missing = build_missing_attachment_block(
                    attachment, mime_type=mime_type
                ).text
                with_images.append(missing)
                without_images.append(missing)
                continue
            text = payload.decode("utf-8", errors="replace")
            block = build_attachment_text_block(attachment, text).text
            with_images.append(block)
            without_images.append(block)
            continue
        placeholder = build_attachment_placeholder_block(
            attachment, mime_type=mime_type
        ).text
        with_images.append(placeholder)
        without_images.append(placeholder)
    return (
        "\n\n".join(part for part in with_images if part.strip()).strip(),
        "\n\n".join(part for part in without_images if part.strip()).strip(),
    )


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
