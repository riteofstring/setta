from backend_utils.utils import query_string_parser
from channels.auth import AuthMiddlewareStack
from channels.db import database_sync_to_async
from knox.auth import TokenAuthentication


# all from # https://gist.github.com/rluts/22e05ed8f53f97bdd02eafdf38f3d60a#gistcomment-3166469
@database_sync_to_async
def get_user(token):
    user, token = TokenAuthentication().authenticate_credentials(token.encode())
    token.delete()
    return user


class TokenAuthMiddleware:
    def __init__(self, inner):
        self.inner = inner

    def __call__(self, scope):
        return TokenAuthMiddlewareInstance(scope, self)


class TokenAuthMiddlewareInstance:
    """
    Yeah, this is black magic:
    https://github.com/django/channels/issues/1399
    """

    def __init__(self, scope, middleware):
        self.middleware = middleware
        self.scope = dict(scope)
        self.inner = self.middleware.inner

    async def __call__(self, receive, send):
        query_string = self.scope["query_string"]
        token = query_string_parser(query_string, "token")
        self.scope["user"] = await get_user(token)
        return await self.inner(self.scope, receive, send)


TokenAuthMiddlewareStack = lambda inner: TokenAuthMiddleware(AuthMiddlewareStack(inner))
