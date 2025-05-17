# from anthropic import Anthropic

# client = Anthropic()
# with client.messages.with_streaming_response.create(
#     max_tokens=1024,
#     messages=[
#         {
#             "role": "user",
#             "content": "Hello, Claude",
#         }
#     ],
#     model="claude-3-5-sonnet-latest",
#     stream=True
# ) as response:
#     print(response.headers)
#     for event in response.parse():
#         print(event)


# from anthropic import AsyncAnthropic
# import asyncio

# async def main():
#     client = AsyncAnthropic()
#     ctx = client.messages.with_streaming_response.create(
#         max_tokens=1024,
#         messages=[
#             {
#                 "role": "user",
#                 "content": "Hello, Claude",
#             }
#         ],
#         model="claude-3-5-sonnet-latest",
#         stream=True
#     )
#     async with ctx as response:
#         print(response.headers)
#         stream = await response.parse()
#         async for event in stream:
#             print(event)


# asyncio.run(main())


import asyncio

from anthropic import AsyncAnthropic


async def main():
    client = AsyncAnthropic()
    response = await client.messages.with_raw_response.create(
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": "Hello, Claude",
            }
        ],
        model="claude-3-5-sonnet-latest",
        stream=True,
    )
    print(response.headers.keys())
    async for event in response.parse():
        print(event)


asyncio.run(main())
