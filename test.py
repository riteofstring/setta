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


from anthropic import AsyncAnthropic
from dotenv import load_dotenv
import asyncio

load_dotenv()

client = AsyncAnthropic()

async def main() -> None:
    async with client.messages.stream(
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": "Say hello there!",
            }
        ],
        model="claude-3-5-sonnet-latest",
    ) as stream:
        async for text in stream.text_stream:
            print(text)
        print()

    # message = await stream.get_final_message()
    # print(message.to_json())

asyncio.run(main())

# llm_msgs = {}

# for event in stream:
#     if event.type == "content_block_start":
#         llm_msgs[event.index] = {"type": event.content_block.type, "text": event.content_block.text}
#     elif event.type == "content_block_delta":
#         if event.delta.type == "text_delta":
#             llm_msgs[event.index]["text"] += event.delta.text


# print(llm_msgs)