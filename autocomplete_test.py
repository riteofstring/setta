import asyncio
from backend.runcoder.lsp.reader import LanguageServerReader
from backend.runcoder.lsp.server import LanguageServer
from backend.runcoder.lsp.writer import LanguageServerWriter
from pathlib import Path


class FakeWebsocketManager:
    async def send_message_to_requester(self, *args, **kwargs):
        pass


async def main():
    lsp = LanguageServer(
        root_path=Path("D:/Documents/App Development/runcoder/.runcoder_code")
    )
    lsp_writer = LanguageServerWriter(lsp)
    lsp_listener = LanguageServerReader(lsp, FakeWebsocketManager())

    await lsp.start_server()
    await lsp_listener.start_listener()
    await lsp_writer.send_initialize_request()

    # code_id = "test"
    # code = "import math\nx=math.sqrt('dog')"
    # # codeJson = {'__x0': {'sectionId': 'db301066-c193-482a-991e-0697e73cf710', 'name': 'yearning_brown', 'type': 'SECTION', 'value': {'callable': "math.sqrt", 'params': [], 'unusedParams': []}}}
    # codeJson = {}

    code_id = "test"
    code = "import torch\ntorch.nn.CrossEntropyLoss("
    # codeJson = {'__x0': {'sectionId': 'db301066-c193-482a-991e-0697e73cf710', 'name': 'yearning_brown', 'type': 'SECTION', 'value': {'callable': "math.sqrt", 'params': [], 'unusedParams': []}}}
    codeJson = {}


    await lsp_writer.send_document_open_request(code_id, code, codeJson)
    # await lsp_writer.send_document_update("test", "import math\nmath.sqrt(5)")
    # await lsp_writer.send_document_open_request("test", "import torch\ntorch.nn.C")
    # await lsp_writer.send_autocomplete_request(1, 10, "test", "1234")
    # await lsp_writer.send_document_update(
    #     "test", "import torch\ntorch.nn.CrossEntropyLoss("
    # )
    await lsp_writer.send_signature_help_request(1, 26, "test", "1234")
    # pprint(lsp.sent_msg_info.keys())
    print("\n\n\n***********LISTENING*************")
    await lsp.server.wait()


if __name__ == "__main__":
    asyncio.run(main())
