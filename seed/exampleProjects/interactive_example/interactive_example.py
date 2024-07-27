from runcoder.tasks.fns import TaskDefinition

def fn(message):
    c = message["content"]
    return {
        "output": [((i - 10) / 5) ** float(c) for i in range(20)],
        "name": "interactive",
        "cache": None,
    }


interactive_example = TaskDefinition(name="interactive_example", fn=fn)
