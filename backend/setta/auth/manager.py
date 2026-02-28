from setta.auth.tokens import AuthCookieManager, BootstrapTokenManager, NonceTracker
from setta.utils.constants import C

_nonce_tracker = NonceTracker()
BOOTSTRAP_TOKEN_MANAGER = BootstrapTokenManager(
    C.BOOTSTRAP_TOKEN_TTL_SECONDS, nonce_tracker=_nonce_tracker
)
AUTH_COOKIE_MANAGER = AuthCookieManager(C.AUTH_COOKIE_MAX_AGE_SECONDS)

__all__ = ["AUTH_COOKIE_MANAGER", "BOOTSTRAP_TOKEN_MANAGER"]
