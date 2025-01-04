def get_chars_before_newline(string, position):
    last_newline = string.rfind('\n', 0, position)
    return string[last_newline + 1:position]


print(get_chars_before_newline("dog\n  1234cat\n\n\nmorestuff", 10))