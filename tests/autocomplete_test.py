import asyncio


from setta.lsp.reader import LanguageServerReader
from setta.lsp.server import LanguageServer
from setta.lsp.writer import LanguageServerWriter
from pathlib import Path
from uuid import uuid4
import os
import logging
import time
logging.basicConfig(
    level=getattr(logging, "DEBUG"),
    format="%(levelname)s - %(asctime)s - %(name)s - %(message)s",
)

class FakeWebsocketManager:
    async def return_to_requester(self, *args, **kwargs):
        pass

    async def broadcast(self, *args, **kwargs):
        pass


async def main():
    lsp = LanguageServer(
        workspace_folder=Path(os.path.abspath("setta_files/code/timestamped_folder")),
        code_folder=Path(os.path.abspath("setta_files/code/timestamped_folder")),
        settings={},
        name="test",
    )
    lsp_writer = LanguageServerWriter(lsp, use_virtual_files=True)
    lsp_listener = LanguageServerReader(lsp, FakeWebsocketManager())

    await lsp.start_server()
    await lsp_listener.start_listener()
    await lsp_writer.send_initialize_request()

    code_id = "referencetest"
    code = "import transformers\ntransformers.T"
    codeJson = {}

    await lsp_writer.send_document_open_request(code_id, code, codeJson)
    id = str(uuid4())
    col = len(code.split("\n")[1]) - 1
    await lsp_writer.send_autocomplete_request(1, col, code_id, id, [], [], 0)
    time.sleep(0.5)
    await lsp_writer.send_cancel(id)
    print("\n\n\n***********LISTENING*************")
    await lsp.server.wait()


if __name__ == "__main__":
    asyncio.run(main())
