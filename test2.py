import subprocess
import re

def extract_args_from_help(script_path):
    # Run the script with the help flag
    result = subprocess.run(['python', script_path, '-h'], capture_output=True, text=True)
    output = result.stdout

    # Split to get the relevant part of the help output
    options_part = output.split("options:")[1]

    # Regular expression to match argument patterns, including pairs separated by a comma
    arg_pattern = re.compile(r'(-\w+)(,\s+)?(--[\w-]+)?')

    # Extract the arguments and process them
    raw_arguments = arg_pattern.findall(options_part)
    arguments = []
    for short, _, long in raw_arguments:
        if long:
            # If there is a long version, strip its leading dashes and use it
            arguments.append(long.lstrip('-'))
        else:
            # If there is no long version, strip the short one's leading dashes and use it
            arguments.append(short.lstrip('-'))

    # Parse the usage line to determine if a flag is of the 'store_true' type
    usage_line = output.split("\n")[0]
    store_true_flags = []
    for arg in arguments:
        if re.search(fr"{re.escape('-' + arg)}\s+\w+", usage_line) is None:
            store_true_flags.append(arg)

    # Return a dictionary categorizing the arguments
    return {
        'store_true_flags': store_true_flags,
        'other_flags': [arg for arg in arguments if arg not in store_true_flags]
    }

# Example usage
script_path = 'test.py'
arguments = extract_args_from_help(script_path)
print(arguments)
