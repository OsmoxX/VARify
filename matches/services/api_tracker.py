import logging
import requests

logger = logging.getLogger(__name__)

def api_get(url: str, **kwargs):
    """
    Globalny wrapper na requests.get do śledzenia zapytań (Request Tracker).
    Pojawi się w logach, by łatwiej było policzyć ilość outbound calls do API.
    """
    logger.info(f"🟢 [API CALL] Wykonuję GET do: {url}")
    timeout = kwargs.pop('timeout', 10)
    return requests.get(url, **kwargs)
