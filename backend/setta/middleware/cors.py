from fastapi.middleware.cors import CORSMiddleware

from setta.utils.frontend_origin_policy import is_origin_allowed_for_current_session


class SettaCORSMiddleware(CORSMiddleware):
    def is_allowed_origin(self, origin: str) -> bool:
        if super().is_allowed_origin(origin):
            return True
        return is_origin_allowed_for_current_session(origin)
