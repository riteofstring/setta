from runcoder.tasks.fns.utils import TaskDefinition

def fn(message):
    c = message["message"]
    return {
        "output": [((i - 10) / 5) ** float(c) for i in range(20)],
        "name": "interactive",
        "cache": None,
    }


RUNCODER = TaskDefinition(name="interactive_example", fn=fn)
