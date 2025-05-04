class SettaArgsObj:
    def __init__(self):
        # Internal dictionary to store attributes
        self._attributes = {}

    def __getattr__(self, name):
        # When accessing a non-existent attribute, create a new container
        if name not in self._attributes:
            self._attributes[name] = SettaArgsObj()
        return self._attributes[name]

    def __setattr__(self, name, value):
        # Handle the special case of our internal _attributes dictionary
        if name == "_attributes":
            super().__setattr__(name, value)
        else:
            # Store all other attributes in our _attributes dictionary
            self._attributes[name] = value

    def __getitem__(self, key):
        # Handle access with square brackets (both numeric indices and string keys)
        if key not in self._attributes:
            self._attributes[key] = SettaArgsObj()
        return self._attributes[key]

    def __setitem__(self, key, value):
        # Handle assignment with square brackets
        self._attributes[key] = value

    def __str__(self):
        # For a readable string representation
        return str(self._attributes)

    def __repr__(self):
        # For representation in interactive sessions
        return self.__str__()
