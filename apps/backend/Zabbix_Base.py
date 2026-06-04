import logging
import os
from pathlib import Path

import requests
from dotenv import load_dotenv
from zabbix_utils import ZabbixAPI

logger = logging.getLogger(__name__)


class Zabbix_Base:
    def __init__(self):
        dotenv_path = Path(__file__).resolve().parent / ".env"
        load_dotenv(dotenv_path=dotenv_path, override=False)

        url = os.getenv("ZABBIX_URL")
        user = os.getenv("ZABBIX_USER")
        password = os.getenv("ZABBIX_PASS")

        # Accept either a base Zabbix URL or the full JSON-RPC endpoint.
        # If a bare base URL is given, detect the web server to pick the right path.
        self._ssl_verify = os.getenv("ZABBIX_SSL_VERIFY", "true").lower() != "false"
        if url and not url.rstrip("/").endswith("api_jsonrpc.php"):
            url = self._resolve_api_url(url)

        try:
            # zabbix_utils performs login during construction when creds are provided.
            self.zapi = ZabbixAPI(
                url=url, user=user, password=password, skip_version_check=True
            )
            logger.info("Successfully connected to Zabbix API.")
        except Exception as e:
            logger.error("Zabbix connection failed: %r", e)
            self.zapi = None

    def _resolve_api_url(self, base_url: str) -> str:
        """Probe both known Zabbix API paths and return whichever responds.

        Tries /api_jsonrpc.php first (nginx default), then /zabbix/api_jsonrpc.php
        (Apache default). Falls back to the nginx path if both fail.
        """
        clean = base_url.rstrip("/")
        candidates = [
            f"{clean}/api_jsonrpc.php",
            f"{clean}/zabbix/api_jsonrpc.php",
        ]
        payload = {"jsonrpc": "2.0", "method": "apiinfo.version", "params": [], "id": 1}
        for api_url in candidates:
            try:
                resp = requests.post(api_url, json=payload, timeout=5, verify=self._ssl_verify)
                if resp.status_code == 200 and "jsonrpc" in resp.text:
                    logger.info("Zabbix API found at: %s", api_url)
                    return api_url
            except Exception:
                continue
        logger.warning("Could not probe Zabbix API — falling back to %s", candidates[0])
        return candidates[0]

    def close(self) -> None:
        """Cleanly logout from Zabbix. Call this explicitly on shutdown."""
        if hasattr(self, "zapi") and self.zapi:
            try:
                self.zapi.logout()
                logger.info("Zabbix session closed.")
            except Exception:
                pass
            self.zapi = None
