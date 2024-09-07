import asyncio


from setta.lsp.reader import LanguageServerReader
from setta.lsp.server import LanguageServer
from setta.lsp.writer import LanguageServerWriter
from pathlib import Path
from setta.utils.constants import load_constants
load_constants()



class FakeWebsocketManager:
    async def send_message_to_requester(self, *args, **kwargs):
        pass

    async def broadcast(self, *args, **kwargs):
        pass


async def main():
    # lsp = LanguageServer(
    #     root_path=Path("D:/Documents/App Development/setta/.setta_code")
    # )
    lsp = LanguageServer(
        root_path=Path("/Users/kevin/Documents/AppDevelopment/setta")
    )
    lsp_writer = LanguageServerWriter(lsp)
    lsp_listener = LanguageServerReader(lsp, FakeWebsocketManager())

    await lsp.start_server()
    await lsp_listener.start_listener()
    await lsp_writer.send_initialize_request()

    code_id = "test123123"
    code = "import sklearn.datasets"
    codeJson = {}

    
    await lsp_writer.send_document_open_request(code_id, code, codeJson)
    # await lsp_writer.send_reference_request(position_offset, 0, 0, code_id, str(uuid4()), str(uuid4()))
    # await lsp_writer.send_document_update("test", "import math\nmath.sqrt(5)")
    # await lsp_writer.send_document_open_request("test", "import torch\ntorch.nn.C")
    await lsp_writer.send_autocomplete_request(0, 23, code_id, "1234", [], [])
    # await lsp_writer.send_document_update(
    #     "test", "import torch\ntorch.nn.CrossEntropyLoss("
    # )
    # print(len(code.split("\n")[1])-2)
    # await lsp_writer.send_signature_help_request(1, len(code.split("\n")[1])-1, "test", "1234")
    # await lsp_writer.send_signature_help_request(1, 10, "test", "1234")
    # await lsp_writer.send_signature_help_request(1, 26, "test", "1234")
    # pprint(lsp.sent_msg_info.keys())
    print("\n\n\n***********LISTENING*************")
    await lsp.server.wait()


if __name__ == "__main__":
    asyncio.run(main())


