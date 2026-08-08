from setta.auth.tokens import (
    AuthCookieManager,
    BootstrapTokenManager,
    LaunchIntentTokenManager,
    NonceTracker,
)
from setta.types.generated import go_shared_constants

_nonce_tracker = NonceTracker()
BOOTSTRAP_TOKEN_MANAGER = BootstrapTokenManager(
    go_shared_constants.BOOTSTRAP_TOKEN_TTL_SECONDS,
    nonce_tracker=_nonce_tracker,
)
LAUNCH_INTENT_TOKEN_MANAGER = LaunchIntentTokenManager(
    go_shared_constants.LAUNCH_INTENT_TOKEN_TTL_SECONDS
)
AUTH_COOKIE_MANAGER = AuthCookieManager(go_shared_constants.AUTH_COOKIE_MAX_AGE_SECONDS)

__all__ = [
    "AUTH_COOKIE_MANAGER",
    "BOOTSTRAP_TOKEN_MANAGER",
    "LAUNCH_INTENT_TOKEN_MANAGER",
]
