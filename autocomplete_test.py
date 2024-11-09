import asyncio


from setta.lsp.reader import LanguageServerReader
from setta.lsp.server import LanguageServer
from setta.lsp.writer import LanguageServerWriter
from pathlib import Path
from setta.utils.constants import load_constants
# from setta.utils.utils import multireplace
# from setta.tasks.fns.textFieldFindReferences import generateCodeForReferenceFinding
from uuid import uuid4
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
        workspace_folder=Path("/Users/kevin/Documents/AppDevelopment/setta"),
        code_folder=Path("/Users/kevin/Documents/AppDevelopment/setta/.setta_code/timestamped_folder")
    )
    lsp_writer = LanguageServerWriter(lsp)
    lsp_listener = LanguageServerReader(lsp, FakeWebsocketManager())

    await lsp.start_server()
    await lsp_listener.start_listener()
    await lsp_writer.send_initialize_request()

    code_id = "test"
    code = "import backend.setta.utils.generate_memorable_string\nbackend.setta.utils.generate_memorable_string.generate_memorable_string()"
    codeJson = {}

    # code_id = "test"
    # code = "import torch\n__x1=5\n__x0=torch.nn.CrossEntropyLoss(weight=__x1)"
    # codeJson = {
    #     "__x1": {
    #         "value": "5",
    #         "paramInfoId": "63480229-db46-40dd-8219-a2535ae509bb",
    #         "sectionId": "f3e65be7-397c-4c32-8e96-05cadfe7e07b",
    #         "name": "weight",
    #         "deps": [],
    #         "type": "TEXT",
    #         "is_global": False,
    #     },
    #     "__x2": {
    #         "value": "",
    #         "paramInfoId": "e554df9e-353d-4d82-bb92-f7a6f4e53a55",
    #         "sectionId": "f3e65be7-397c-4c32-8e96-05cadfe7e07b",
    #         "name": "size_average",
    #         "deps": [],
    #         "type": "TEXT",
    #         "is_global": False,
    #     },
    #     "__x3": {
    #         "value": "",
    #         "paramInfoId": "47f1dd05-3c5e-4b03-a875-47e9a021c5b6",
    #         "sectionId": "f3e65be7-397c-4c32-8e96-05cadfe7e07b",
    #         "name": "ignore_index",
    #         "deps": [],
    #         "type": "TEXT",
    #         "is_global": False,
    #     },
    #     "__x4": {
    #         "value": "",
    #         "paramInfoId": "0bfd9ea3-0a93-4768-9aa0-92f6c99b949c",
    #         "sectionId": "f3e65be7-397c-4c32-8e96-05cadfe7e07b",
    #         "name": "reduce",
    #         "deps": [],
    #         "type": "TEXT",
    #         "is_global": False,
    #     },
    #     "__x5": {
    #         "value": "",
    #         "paramInfoId": "07de4d06-92af-4a70-8d3a-810b8335a8a7",
    #         "sectionId": "f3e65be7-397c-4c32-8e96-05cadfe7e07b",
    #         "name": "reduction",
    #         "deps": [],
    #         "type": "TEXT",
    #         "is_global": False,
    #     },
    #     "__x6": {
    #         "value": "",
    #         "paramInfoId": "bd881e96-a4f2-4bf4-ab2e-829be7ab67fc",
    #         "sectionId": "f3e65be7-397c-4c32-8e96-05cadfe7e07b",
    #         "name": "label_smoothing",
    #         "deps": [],
    #         "type": "TEXT",
    #         "is_global": False,
    #     },
    #     "__x0": {
    #         "sectionId": "f3e65be7-397c-4c32-8e96-05cadfe7e07b",
    #         "name": "secure_gold",
    #         "type": "SECTION",
    #         "value": {
    #             "callable": "torch.nn.CrossEntropyLoss",
    #             "params": ["__x1"],
    #             "unusedParams": ["__x2", "__x3", "__x4", "__x5", "__x6"],
    #         },
    #     },
    # }
    await lsp_writer.send_document_open_request(code_id, code, codeJson)
    # await lsp_writer.send_reference_request(position_offset, 0, 0, code_id, str(uuid4()), str(uuid4()))
    # await lsp_writer.send_document_update("test", "import math\nmath.sqrt(5)")
    # await lsp_writer.send_document_open_request("test", "import torch\ntorch.nn.C")
    # await lsp_writer.send_autocomplete_request(1, 72, "test", "1234", [], [])
    # await lsp_writer.send_document_update(
    #     "test", "import torch\ntorch.nn.CrossEntropyLoss("
    # )
    # print(len(code.split("\n")[1])-2)
    await lsp_writer.send_signature_help_request(1, 72, "test", "1234")
    # await lsp_writer.send_signature_help_request(1, 10, "test", "1234")
    # await lsp_writer.send_signature_help_request(1, 26, "test", "1234")
    # pprint(lsp.sent_msg_info.keys())
    print("\n\n\n***********LISTENING*************")
    await lsp.server.wait()


if __name__ == "__main__":
    asyncio.run(main())