from setta.websockets.listener import expose, get_exposed_functions, start_listener

@expose
def fn():
    pass


def fn2():
    pass


print(get_exposed_functions())

start_listener("test")