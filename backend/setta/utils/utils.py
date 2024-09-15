import os
import re
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
