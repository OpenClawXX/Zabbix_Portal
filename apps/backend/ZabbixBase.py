import os
from pathlib import Path

from dotenv import load_dotenv
from zabbix_utils import ZabbixAPI

class ZabbixBase:
    def __init__(self):
        # Always load the .env that lives next to this file.
        # override=True avoids "stale" machine-level env vars taking precedence.
        dotenv_path = Path(__file__).resolve().parent / ".env"
        load_dotenv(dotenv_path=dotenv_path, override=True)

        url      = os.getenv("ZABBIX_URL")
        user     = os.getenv("ZABBIX_USER")
        password = os.getenv("ZABBIX_PASS")

        # Accept either a base Zabbix URL or the full JSON-RPC endpoint.
        if url and not url.rstrip("/").endswith("api_jsonrpc.php"):
            url = url.rstrip("/") + "/api_jsonrpc.php"

        try:
            # zabbix_utils performs login during construction when creds are provided.
            self.zapi = ZabbixAPI(url=url, user=user, password=password)
            print("Successfully connected to Zabbix API.")
        except Exception as e:
            print(f"Connection failed: {repr(e)}")
            self.zapi = None

    def __del__(self):
        """Cleanly logout when the object is destroyed."""
        if hasattr(self, 'zapi') and self.zapi:
            try:
                self.zapi.logout()
                print("Zabbix session closed.")
            except:
                pass