import asyncio
import os
from pathlib import Path
from uuid import uuid4

from setta.lsp.reader import LanguageServerReader
from setta.lsp.server import LanguageServer
from setta.lsp.writer import LanguageServerWriter


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
    lsp_writer = LanguageServerWriter(lsp, use_virtual_files=False)
    lsp_listener = LanguageServerReader(lsp, FakeWebsocketManager())

    await lsp.start_server()
    await lsp_listener.start_listener()
    await lsp_writer.send_initialize_request()

#     code_id = "generated_code"
#     code = """import transformers
# import torch
# class C:
#     def __init__(self):
#         self.x = 5
#         self.some_value = transformers.Trainer()
# """

#     code_id_2= "main_script"
#     code_2 = """from .generated_code import C
# c = C()
# c.some_value.add_callback()"""
#     codeJson = {}


    code_id = "generated_code"
    code="""import math

from types import SimpleNamespace

class SettaArgs:
    def __init__(self):
        # Internal dictionary to store attributes
        self._attributes = {}
    
    def __getattr__(self, name):
        # When accessing a non-existent attribute, create a new container
        if name not in self._attributes:
            self._attributes[name] = SettaArgs()
        return self._attributes[name]
    
    def __setattr__(self, name, value):
        # Handle the special case of our internal _attributes dictionary
        if name == "_attributes":
            super().__setattr__(name, value)
        else:
            # Store all other attributes in our _attributes dictionary
            self._attributes[name] = value
    
    def __getitem__(self, key):
        # Handle access with square brackets (both numeric indices and string keys)
        if key not in self._attributes:
            self._attributes[key] = SettaArgs()
        return self._attributes[key]
    
    def __setitem__(self, key, value):
        # Handle assignment with square brackets
        self._attributes[key] = value
            
    def __str__(self):
        # For a readable string representation
        return str(self._attributes)
        
    def __repr__(self):
        # For representation in interactive sessions
        return self.__str__()

class S:
    def __init__(self):
        args = SettaArgs()
        args.the_result[0].x = 5
        args.the_result[1].x = 10
        the_result__i0 = math.sqrt(args.the_result[0].x)
        the_result__i1 = math.sqrt(args.the_result[1].x)
        self.the_result = [the_result__i0, the_result__i1]
        self.args = args


s = S()
"""

    codeJson = {}

    await lsp_writer.send_document_open_request(code_id, code, codeJson)
    # await lsp_writer.send_document_open_request(code_id_2, code_2, codeJson)
    id = str(uuid4())
    split_code = code.split("\n")
    row = len(split_code)-1
    col = len(split_code[row])-1
    print("row, col", row, col)
    # await lsp_writer.send_autocomplete_request(row, col, code_id_2, id, [], [], 0)
    # await lsp_writer.send_signature_help_request(row, col, code_id, id)
    print("\n\n\n***********LISTENING*************")
    await lsp.server.wait()


if __name__ == "__main__":
    asyncio.run(main())



# import transformers
# class C:
#     def __init__(self):
#         self.x = 5
#         self.some_value = transformers.Trainer()

# c = C()
# c.some_value.add_