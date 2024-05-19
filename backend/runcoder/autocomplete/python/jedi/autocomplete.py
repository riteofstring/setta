import jedi


def autocomplete(code, line, column):
    return jedi.Script(code).complete(line=line, column=column)


def get_parameters(code, line):
    return jedi.Script(code).get_signatures(line=line)
