## TODO: don't connect to websocket. Instead, make it so that a function can be added to the list in get_consumer_fn.


def fn(args):
    return {"zesty_amber": args["c"] ** 2}


RUNCODER = {"fn": fn, "project": "interactive"}
