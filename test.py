def nested_access(input_dict, access_string):
    # Split the string into keys/indices
    keys = access_string.replace('][', ',').replace('[', ',').replace(']', '').split(',')
    
    # Start with the input dictionary
    result = input_dict
    
    # Traverse the nested structure
    for idx,key in enumerate(keys):
        if idx == len(keys) - 1:
            break
        if isinstance(result, list):
            result = result[int(key)]
        else:
            # If not an integer, use as a dictionary key
            result = result[key]
    
    return result, key


# Example usage
my_dict = {
    "a": [1, 2, 3],
    "b": {
        "c": [4, 5, 6],
        "d": {"e": 7}
    }
}

print(nested_access(my_dict, "a[1]"))  # Output: 2
print(nested_access(my_dict, "b[c][0]"))  # Output: 4
print(nested_access(my_dict, "b[d][e]"))  # Output: 7