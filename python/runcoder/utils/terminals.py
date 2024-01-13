import asyncio
import json

from winpty import PtyProcess

from runcoder.code.export_selected import export_selected, get_script
from runcoder.code.find_placeholders import needs_python_code, needs_yaml
from runcoder.code.generate_code import generate_code, generate_script
from runcoder.code.generate_yaml import generate_yaml
from runcoder.processors.utils import withTempFiles


async def start_terminal(terminal_websocket):
    # Main event loop
    loop = asyncio.get_event_loop()

    # Start the WinPTY terminal
    pty_process = PtyProcess.spawn("bash.exe")

    # Function to read from the terminal
    async def read_from_terminal():
        while True:
            output = await loop.run_in_executor(None, pty_process.read, 1024)
            if not output:
                break
            # Send output to WebSocket
            await terminal_websocket.send_text(output)

    # Function to write to the terminal
    async def write_to_terminal():
        while True:
            input_data = await terminal_websocket.receive_text()
            try:
                json_val = json.loads(input_data)
                if isinstance(json_val, dict):
                    if json_val["type"] == "resize":
                        pty_process.setwinsize(json_val["rows"], json_val["cols"])
                    elif json_val["type"] == "runCode":
                        runCode(json_val, pty_process.write)
                    continue
            except json.decoder.JSONDecodeError:
                pass
            if input_data is None:
                break
            # Write received data to the terminal
            pty_process.write(input_data)

    try:
        # Start reading from and writing to the terminal
        read_task = loop.create_task(read_from_terminal())
        write_task = loop.create_task(write_to_terminal())

        # Wait for either task to complete
        _, pending = await asyncio.wait(
            [read_task, write_task], return_when=asyncio.FIRST_COMPLETED
        )

        # Cancel the remaining tasks
        for task in pending:
            task.cancel()
            await task  # Ensure task is properly cancelled
    finally:
        # Cleanup
        pty_process.terminate()


def runCode(message, terminal_write_fn):
    p = message["message"]
    selected = export_selected(p)

    def write_bash(filepaths_for_bash):
        def execute_bash(temp_filepaths):
            terminal_write_fn(f"\x15bash {temp_filepaths[0]}\n")

        script = generate_script(p, selected, filepaths_for_bash)
        withTempFiles(
            write=[script],
            in_file_with_suffix=[".sh"],
            then_do=execute_bash,
            auto_delete=False,
        )

    unprocessed_script = get_script(p)
    write = []
    in_file_with_suffix = []
    if needs_python_code(unprocessed_script):
        code, _ = generate_code(selected, p)
        write.append(code)
        in_file_with_suffix.append(".py")
    if needs_yaml(unprocessed_script):
        yaml_dict = generate_yaml(selected)
        write.append(yaml_dict)
        in_file_with_suffix.append(".yaml")

    withTempFiles(
        write=write,
        in_file_with_suffix=in_file_with_suffix,
        then_do=write_bash,
        auto_delete=False,
    )
