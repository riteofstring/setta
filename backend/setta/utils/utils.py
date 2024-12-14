import json
import os
import re
from json import JSONDecodeError
from pathlib import Path


def get_absolute_path(src_path, file_path):
    return (Path(src_path).parent / file_path).resolve()


def is_dev_mode():
    return os.environ.get("SETTA_DEV_MODE")


# https://gist.github.com/bgusach/a967e0587d6e01e889fd1d776c5f3729
def multireplace(string, replacements):
    """
    Given a string and a replacement map, it returns the replaced string.

    :param str string: string to execute replacements on
    :param dict replacements: replacement dictionary {value to find: value to replace}
    :rtype: str

    """
    if not replacements:
        # Edge case that'd produce a funny regex and cause a KeyError
        return string

    # Place longer ones first to keep shorter substrings from matching where the longer ones should take place
    # For instance given the replacements {'ab': 'AB', 'abc': 'ABC'} against the string 'hey abc', it should produce
    # 'hey ABC' and not 'hey ABc'
    rep_sorted = sorted(replacements, key=len, reverse=True)
    rep_escaped = map(re.escape, rep_sorted)

    # Create a big OR regex that matches any of the substrings to replace
    pattern = re.compile("|".join(rep_escaped))

    # For each match, look up the new string in the replacements, being the key the normalized old string
    return pattern.sub(lambda match: replacements[match.group(0)], string)


class QuoteInsensitiveDict(dict):
    def __getitem__(self, key):
        return super().__getitem__(self.normalize_key(key))

    def __setitem__(self, key, value):
        super().__setitem__(self.normalize_key(key), value)

    def __contains__(self, key):
        return super().__contains__(self.normalize_key(key))

    def normalize_key(self, key):
        # Remove outer quotes if present
        key = key.strip("'\"")
        # Replace all quote characters with a standard one
        key = re.sub(r"['\"]", '"', key)
        return key


def nested_access(input_dict, access_string):
    # Split the string into keys/indices
    keys = (
        access_string.replace("][", ",").replace("[", ",").replace("]", "").split(",")
    )

    # Start with the input dictionary
    result = input_dict

    # Traverse the nested structure
    for idx, key in enumerate(keys):
        if idx == len(keys) - 1:
            break
        if isinstance(result, list):
            result = result[int(key)]
        else:
            # If not an integer, use as a dictionary key
            result = result[key]

    return result, key


def recursive_dict_merge(dict1, dict2, strict_top_level_keys=False):
    """
    Recursively merge two dictionaries. For conflicting keys:
    - If both values are dictionaries: merge recursively
    - If both values are lists: concatenate them
    - Otherwise: value from dict2 takes precedence

    Args:
        dict1 (dict): First dictionary
        dict2 (dict): Second dictionary
        strict_top_level_keys (bool): If True, only keep top-level keys from dict1

    Returns:
        dict: Merged dictionary

    Examples:
        >>> d1 = {'a': 1, 'b': {'c': 2, 'd': [1, 2]}}
        >>> d2 = {'b': {'c': 4, 'd': [3, 4]}, 'f': 6}
        >>> recursive_dict_merge(d1, d2)
        {'a': 1, 'b': {'c': 4, 'd': [1, 2, 3, 4]}, 'f': 6}
        >>> recursive_dict_merge(d1, d2, strict_top_level_keys=True)
        {'a': 1, 'b': {'c': 4, 'd': [1, 2, 3, 4]}}
    """
    if strict_top_level_keys:
        # Only process keys that exist in dict1
        dict2 = {k: v for k, v in dict2.items() if k in dict1}

    merged = dict1.copy()

    for key, value in dict2.items():
        if key in merged:
            if isinstance(merged[key], dict) and isinstance(value, dict):
                # If both values are dictionaries, merge them recursively
                merged[key] = recursive_dict_merge(merged[key], value)
            elif isinstance(merged[key], list) and isinstance(value, list):
                # If both values are lists, concatenate them
                merged[key] = merged[key] + value
            else:
                # Otherwise, value from dict2 takes precedence
                merged[key] = value
        else:
            merged[key] = value

    return merged


def try_json(x):
    try:
        return json.loads(x)
    except JSONDecodeError:
        return x


def replace_null_keys_with_none(data):
    """
    Recursively replaces "null" keys with None in a dictionary.

    Args:
        data: Input dictionary

    Returns:
        Modified dictionary with "null" keys replaced by None
    """
    if isinstance(data, dict):
        new_dict = {}
        for key, value in data.items():
            # Replace "null" key with None
            new_key = None if key == "null" else key

            # Recursively process value if it's a dictionary
            if isinstance(value, dict):
                value = replace_null_keys_with_none(value)
            elif isinstance(value, list):
                # Process dictionaries within lists
                value = [
                    replace_null_keys_with_none(item)
                    if isinstance(item, dict)
                    else item
                    for item in value
                ]

            new_dict[new_key] = value
        return new_dict
    return data


def filter_dict(x, keep_keys=None, default_vals=None):
    if not isinstance(x, dict):
        return x

    return {
        k: filter_dict(v, None, default_vals.get(k) if default_vals else None)
        for k, v in x.items()
        if (not keep_keys or k in keep_keys)
        and ((not default_vals) or (k not in default_vals) or (v != default_vals[k]))
    }
