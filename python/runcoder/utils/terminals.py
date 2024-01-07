import asyncio
from winpty import PtyProcess
import json

async def start_terminal(terminal_websocket):
    # Main event loop
    loop = asyncio.get_event_loop()

    # Start the WinPTY terminal
    pty_process = PtyProcess.spawn('cmd.exe')

    # Function to read from the terminal
    async def read_from_terminal():
        while True:
            output = await loop.run_in_executor(None, pty_process.read, 1024)
            if not output:
                break
            # Send output to WebSocket
            await terminal_websocket.send_text(output)

    # Function to write to the terminal
    async def write_to_terminal(input_data):
        await loop.run_in_executor(None, pty_process.write, input_data)

    # Start reading from the terminal
    read_task = loop.create_task(read_from_terminal())

    # Assume websocket_receive() is an async function that receives data from WebSocket
    while True:
        input_data = await terminal_websocket.receive_text()
        print(input_data, flush=True)
        try:
            input_data = json.loads(input_data)
            if (input_data["type"] == "resize"):
                pty_process.setwinsize(input_data['rows'], input_data['cols'])
        except json.decoder.JSONDecodeError:
            if input_data is None:
                break
            # Write received data to the terminal
            await write_to_terminal(input_data)

    # Cleanup
    read_task.cancel()
    pty_process.terminate()

