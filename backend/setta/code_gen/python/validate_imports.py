import asyncio
import logging

from setta.database.utils import create_new_id

logger = logging.getLogger(__name__)


async def validate_imports(generated_imports, lsp_writer):
    if not generated_imports:
        return generated_imports

    filepath = None
    generated_imports = None
    await lsp_writer.send_document_open_request(
        filepath=filepath, code=generated_imports, virtual=True
    )

    lines = generated_imports.split("\n")
    message_id = create_new_id()

    # First, send all requests and store the futures
    request_futures = []
    line_indices = []  # Keep track of which line each request is for
    for idx, line in enumerate(lines):
        if not line:
            continue
        request_id = f"{message_id}-{idx}"
        # Send request without awaiting
        lsp_writer.create_asyncio_task(
            lsp_writer.send_definition_request(
                idx, len(line) - 1, code_id, request_id, virtual=True
            ),
            request_id,
            local=True,
        )
        # Store the future for waiting later
        future = lsp_writer.wait_for_response(request_id)
        request_futures.append(future)
        line_indices.append(idx)  # Store the original line index

    # Then await all responses concurrently
    responses = await asyncio.gather(*request_futures)

    # Use line_indices to map responses back to correct lines
    for response_idx, response in enumerate(responses):
        original_idx = line_indices[response_idx]
        if not response["data"]:
            # replace with equal length comment so that we don't have
            # to change any position information
            lines[original_idx] = "#" * len(lines[original_idx])

    generated_imports = "\n".join(lines)
    return generated_imports
