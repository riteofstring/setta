# from setta.code_gen.python.check_scope import are_positions_in_scope_with_variable
# from setta.code_gen.python.generate_code import get_chars_in_line_before_position


# def add_placeholder_to_empty_line_for_scope_checking(code, cursor_position):
#     is_empty_line = False
#     before_chars = get_chars_in_line_before_position(code, cursor_position)
    
#     if len(before_chars.strip()) == 0:
#         line_end_index = code.find("\n", cursor_position)
#         if line_end_index == -1:
#             # Check remaining characters if we're at the last line
#             after_chars = code[cursor_position:]
#         else:
#             after_chars = code[cursor_position:line_end_index]
            
#         if len(after_chars.strip()) == 0:
#             is_empty_line = True

#     if is_empty_line:
#         code = code[:cursor_position] + "_" + code[cursor_position:]
            
#     return code

# code="""
# def fn():
#     x=5

# """
# idx = 19
# code = add_placeholder_to_empty_line_for_scope_checking(code, idx)
# print(code)
# response = are_positions_in_scope_with_variable(code, [idx], "x")
# print(response)