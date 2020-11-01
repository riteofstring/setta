class BaseInfo:
    def should_be_included(self, k, include, exclude):
        if len(include) > 0:
            return k in include
        if len(exclude) > 0:
            return k not in exclude
        return True
