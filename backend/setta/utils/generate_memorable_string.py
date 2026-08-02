import random

from setta.types.generated import go_shared_constants


def generate_memorable_string(num_words=2, separator="_"):
    """
    Generate a random name from the Go-owned memorable-name vocabulary.

    Args:
        num_words (int): Number of words to combine (default: 2)
        separator (str): String to join words with (default: '_')

    Returns:
        str: Combined random words
    """

    word_lists = [
        go_shared_constants.MEMORABLE_NAME_ADJECTIVES,
        go_shared_constants.MEMORABLE_NAME_NOUNS,
        go_shared_constants.MEMORABLE_NAME_VERBS,
    ]

    # Select random words from different categories
    selected_words = []
    while len(selected_words) < num_words:
        # Get a random word list
        word_list = random.choice(word_lists)
        # Get a random word from that list
        word = random.choice(word_list)
        # Only add if we haven't used this word yet
        if word not in selected_words:
            selected_words.append(word)

    return separator.join(selected_words)
