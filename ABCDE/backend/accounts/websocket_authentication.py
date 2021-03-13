from channels.auth import AuthMiddlewareStack
from channels.db import database_sync_to_async
from django.db import close_old_connections
from knox.auth import TokenAuthentication

# from knox.auth import authenticate_credentials


# all from # https://gist.github.com/rluts/22e05ed8f53f97bdd02eafdf38f3d60a#gistcomment-3166469
@database_sync_to_async
def get_user(headers):
    try:
        token_name, token_key = headers[b"authorization"].decode().split()
        if token_name == "Token":
            user, token = TokenAuthentication().authenticate_credentials(
                token_key.encode()
            )
            return user
    except AuthToken.DoesNotExist:
        return AnonymousUser()


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
        headers = dict(self.scope["headers"])
        if b"authorization" in headers:
            self.scope["user"] = await get_user(headers)
        return await self.inner(self.scope, receive, send)


TokenAuthMiddlewareStack = lambda inner: TokenAuthMiddleware(AuthMiddlewareStack(inner))
