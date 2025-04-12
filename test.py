# from setta.api.logger import SettaLogger, SettaList
# import time


# x = {"something": SettaList({"x":[1,2,3], "y":[4,5,6]})}
# logger = SettaLogger()

# for i in range(1000):
#     print("sending", i)
#     time.sleep(1)
#     logger.send(x)
# print('done')


# import time
# import tqdm

# for i in tqdm.tqdm(range(1000)):
#     time.sleep(0.1)
import json


from anthropic import Anthropic
from dotenv import load_dotenv
import asyncio

load_dotenv()

client = Anthropic()

available_tools = [
    {
        "name": "add",
        "description": "add two numbers",
        "input_schema": {
            "type": "object",
            "properties": {"a": {"type": "number"}, "b": {"type": "number"}},
            "required": ["a", "b"],
        },
    }
]


stream = client.messages.create(
    max_tokens=1024,
    messages=[
        {
            "role": "user",
            "content": "Add 2 and 3",
        }
    ],
    model="claude-3-5-sonnet-latest",
    tools=available_tools,
    stream=True,
)

llm_msgs = []

for event in stream:
    if event.type == "content_block_start":
        while len(llm_msgs) <= event.index:
            llm_msgs.append(None)
        llm_msgs[event.index] = event.content_block
        if not hasattr(event.content_block, "text"):
            event.content_block.text = ""
    elif event.type == "content_block_delta":
        if event.delta.type == "text_delta":
            llm_msgs[event.index].text += event.delta.text
        elif event.delta.type == "input_json_delta":
            llm_msgs[event.index].text += event.delta.partial_json
    elif event.type == "content_block_stop":
        if llm_msgs[event.index].type == "tool_use":
            llm_msgs[event.index].input = json.loads(llm_msgs[event.index].text)


print(llm_msgs)
