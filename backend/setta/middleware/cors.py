from fastapi.middleware.cors import CORSMiddleware

from setta.auth.session import load_current_session_secret
from setta.trusted_frontend_origins import is_trusted_frontend_origin


class SettaCORSMiddleware(CORSMiddleware):
    def is_allowed_origin(self, origin: str) -> bool:
        if super().is_allowed_origin(origin):
            return True
        session_info = load_current_session_secret()
        if session_info is None:
            return False
        session_metadata, _ = session_info
        return is_trusted_frontend_origin(origin, session_id=session_metadata.id)
