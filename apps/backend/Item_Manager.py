import logging
import re

from Zabbix_Base import Zabbix_Base

logger = logging.getLogger(__name__)


class Item_Manager(Zabbix_Base):
    def __init__(self):
        super().__init__()
        logger.info("Item Manager ready.")

    def add_item(
        self, hostname, item_name, item_key, value_type=3, team_name: str = ""
    ) -> tuple[str | None, str | None]:
        """
        Adds a new monitoring item to an existing host.
        value_type: 0=float, 1=string, 2=log, 3=integer, 4=text
        Returns (item_id, error_message). item_id is None on failure.
        """
        if not self.zapi:
            return None, "Zabbix API not connected."

        try:
            host_data = self.zapi.host.get(
                filter={"host": [hostname]}, output=["hostid"]
            )
            if not host_data:
                return None, f"Host '{hostname}' not found in Zabbix."

            host_id = host_data[0]["hostid"]

            interfaces = self.zapi.hostinterface.get(hostids=host_id)
            if not interfaces:
                return None, f"No interfaces found for host '{hostname}'."
            interface_id = interfaces[0]["interfaceid"]

            kwargs: dict = dict(
                name=item_name,
                key_=item_key,
                hostid=host_id,
                interfaceid=interface_id,
                type=0,       # Zabbix Agent (Passive)
                value_type=value_type,
                delay="1m",
            )
            # Only attach tags when non-empty — some older Zabbix versions reject tags=[]
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]

            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("Item %r (key: %s) added to %r (ID: %s).", item_name, item_key, hostname, item_id)
            return item_id, None

        except Exception as e:
            msg = str(e)
            logger.error("add_item(%r, %r) failed: %r", hostname, item_name, e)
            return None, msg

    def add_trigger(
        self, hostname, item_key, trigger_name, threshold, operator=">", priority=3
    ) -> tuple[str | None, str | None]:
        """
        Adds a trigger for a host item.
        Automatically picks the expression syntax based on the Zabbix server version:
          >=6.2 → last(/hostname/key)>value   (new syntax)
          <6.2  → {hostname:key.last()}>value  (classic syntax)
        Returns (trigger_id, error_message). trigger_id is None on failure.
        """
        if not self.zapi:
            return None, "Zabbix API not connected."

        valid_operators = {">", "<", ">=", "<=", "=", "<>"}
        if operator not in valid_operators:
            return None, f"Invalid operator '{operator}'."

        try:
            host_data = self.zapi.host.get(
                filter={"host": [hostname]}, output=["hostid"]
            )
            if not host_data:
                return None, f"Host '{hostname}' not found in Zabbix."

            # Choose expression format based on server version.
            # Zabbix 6.2+ dropped the classic {host:key.last()} syntax.
            if self._zabbix_version >= (6, 2):
                expression = f"last(/{hostname}/{item_key}){operator}{threshold}"
            else:
                expression = f"{{{hostname}:{item_key}.last()}}{operator}{threshold}"

            result = self.zapi.trigger.create(
                description=trigger_name, expression=expression, priority=int(priority)
            )
            trigger_id = result["triggerids"][0]
            logger.info("Trigger %r created on %r (ID: %s).", trigger_name, hostname, trigger_id)
            return trigger_id, None

        except Exception as e:
            msg = str(e)
            logger.error("add_trigger(%r, %r) failed: %r", hostname, trigger_name, e)
            return None, msg

    def list_items(self, hostname: str, include_inherited: bool = False) -> list[dict]:
        """List items on a host. include_inherited=True returns template items too."""
        if not self.zapi:
            return []
        try:
            host_data = self.zapi.host.get(
                filter={"host": [hostname]}, output=["hostid"]
            )
            if not host_data:
                return []
            kwargs: dict = dict(
                hostids=host_data[0]["hostid"],
                output=["itemid", "name", "key_", "value_type", "delay"],
                selectTags=["tag", "value"],
            )
            if not include_inherited:
                kwargs["inherited"] = False
            items = self.zapi.item.get(**kwargs)
            return items
        except Exception as e:
            logger.error("list_items(%r) failed: %r", hostname, e)
            return []

    def delete_item(self, itemid: str) -> bool:
        """Delete an item by ID."""
        if not self.zapi:
            return False
        try:
            self.zapi.item.delete([itemid])
            logger.info("Deleted item ID %s.", itemid)
            return True
        except Exception as e:
            logger.error("delete_item(%s) failed: %r", itemid, e)
            return False

    def list_triggers(self, hostname: str) -> list[dict]:
        """List all non-inherited triggers on a host."""
        if not self.zapi:
            return []
        try:
            host_data = self.zapi.host.get(
                filter={"host": [hostname]}, output=["hostid"]
            )
            if not host_data:
                return []
            triggers = self.zapi.trigger.get(
                hostids=host_data[0]["hostid"],
                output=["triggerid", "description", "expression", "priority", "status"],
                inherited=False,
            )
            return triggers
        except Exception as e:
            logger.error("list_triggers(%r) failed: %r", hostname, e)
            return []

    def delete_trigger(self, triggerid: str) -> bool:
        """Delete a trigger by ID."""
        if not self.zapi:
            return False
        try:
            self.zapi.trigger.delete([triggerid])
            logger.info("Deleted trigger ID %s.", triggerid)
            return True
        except Exception as e:
            logger.error("delete_trigger(%s) failed: %r", triggerid, e)
            return False

    def add_http_item(
        self,
        hostname: str,
        item_name: str,
        url: str,
        item_key: str = "",
        request_method: int = 0,   # 0=GET 1=POST 2=PUT 3=HEAD
        status_codes: str = "200",
        timeout: str = "15s",
        verify_peer: bool = True,
        follow_redirects: bool = True,
        posts: str = "",
        value_type: int = 3,       # 3=integer (response code), 0=float (time), 4=text (body)
        team_name: str = "",
        authtype: int = 0,         # 0=None, 1=Basic, 2=NTLM
        username: str = "",
        password: str = "",
        regex_preprocessing: bool = False,
        regex_pattern: str = "",
        regex_output: str = "\\1",
        regex_no_match_value: str = "0",
    ) -> tuple[str | None, str | None]:
        """Add an HTTP agent item (Zabbix type 19). The Zabbix server fetches the URL."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found in Zabbix."
            host_id = host_data[0]["hostid"]

            if not item_key:
                safe = re.sub(r"[^a-zA-Z0-9._-]", "_", url)[:60]
                item_key = f"http.check[{safe}]"

            kwargs: dict = dict(
                name=item_name,
                key_=item_key,
                hostid=host_id,
                type=19,            # HTTP agent
                value_type=value_type,
                delay="1m",
                url=url,
                request_method=request_method,
                status_codes=status_codes,
                timeout=timeout,
                verify_peer=1 if verify_peer else 0,
                verify_host=1 if verify_peer else 0,
                follow_redirects=1 if follow_redirects else 0,
                retrieve_mode=0,    # body
                output_format=0,    # raw
                interfaceid=0,      # HTTP agent does not require a host interface
            )
            if posts:
                kwargs["posts"] = posts
                kwargs["post_type"] = 0  # raw body
            if authtype:
                kwargs["authtype"] = authtype
                kwargs["username"] = username
                kwargs["password"] = password
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]
            if regex_preprocessing and regex_pattern:
                kwargs["preprocessing"] = [{
                    "type": 5,                          # Regular expression
                    "params": f"{regex_pattern}\n{regex_output}",
                    "error_handler": 2,                 # Custom value on error (no match)
                    "error_handler_params": regex_no_match_value,
                }]

            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("HTTP item %r (url=%s) added to %r (ID: %s).", item_name, url, hostname, item_id)
            return item_id, None
        except Exception as e:
            msg = str(e)
            logger.error("add_http_item(%r, %r) failed: %r", hostname, url, e)
            return None, msg

    # Maps service_type slug → (item_key_template, default_name, value_type)
    _SERVICE_MAP: dict[str, tuple[str, str, int]] = {
        "icmp_ping":  ("icmpping[]",                     "ICMP ping",           3),
        "icmp_loss":  ("icmppingloss[]",                 "ICMP packet loss",    0),
        "icmp_time":  ("icmppingsec[]",                  "ICMP response time",  0),
        "http":       ("net.tcp.service[http,,{port}]",  "HTTP check",          3),
        "https":      ("net.tcp.service[https,,{port}]", "HTTPS check",         3),
        "ssh":        ("net.tcp.service[ssh,,{port}]",   "SSH check",           3),
        "smtp":       ("net.tcp.service[smtp,,{port}]",  "SMTP check",          3),
        "ftp":        ("net.tcp.service[ftp,,{port}]",   "FTP check",           3),
        "tcp_port":   ("net.tcp.service[tcp,,{port}]",   "TCP port check",      3),
    }
    _SERVICE_DEFAULT_PORTS: dict[str, int] = {
        "http": 80, "https": 443, "ssh": 22, "smtp": 25, "ftp": 21, "tcp_port": 0,
    }

    def add_service_item(
        self,
        hostname: str,
        service_type: str,
        port: int | None = None,
        item_name: str = "",
        team_name: str = "",
    ) -> tuple[str | None, str | None]:
        """Add a simple-check service item (Zabbix type 3).
        service_type: icmp_ping | icmp_loss | icmp_time | http | https | ssh | smtp | ftp | tcp_port
        """
        if service_type not in self._SERVICE_MAP:
            return None, f"Unknown service type '{service_type}'."
        if not self.zapi:
            return None, "Zabbix API not connected."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found in Zabbix."
            host_id = host_data[0]["hostid"]

            interfaces = self.zapi.hostinterface.get(hostids=host_id)
            if not interfaces:
                return None, f"No interfaces found for host '{hostname}'."
            interface_id = interfaces[0]["interfaceid"]

            key_tpl, default_name, value_type = self._SERVICE_MAP[service_type]
            effective_port = port or self._SERVICE_DEFAULT_PORTS.get(service_type, 0)
            item_key = key_tpl.replace("{port}", str(effective_port))

            if not item_name:
                port_str = f":{effective_port}" if effective_port else ""
                item_name = f"{default_name} on {hostname}{port_str}"

            kwargs: dict = dict(
                name=item_name,
                key_=item_key,
                hostid=host_id,
                interfaceid=interface_id,
                type=3,             # Simple check
                value_type=value_type,
                delay="1m",
            )
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]

            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("Service item %r (type=%s) added to %r (ID: %s).", item_name, service_type, hostname, item_id)
            return item_id, None
        except Exception as e:
            msg = str(e)
            logger.error("add_service_item(%r, %r) failed: %r", hostname, service_type, e)
            return None, msg

    def bulk_add_items(self, hostnames: list[str], item_config: dict) -> list[dict]:
        """Add the same item to multiple hosts. Returns [{hostname, item_id, error}]."""
        item_type = item_config.get("item_type", "agent")
        results = []
        for hostname in hostnames:
            if item_type == "script":
                item_id, err = self.add_script_item(
                    hostname=hostname,
                    script_type=item_config.get("script_type", "bash"),
                    script_mode=item_config.get("script_mode", "command"),
                    script=item_config.get("script", ""),
                    file_arg=item_config.get("file_arg", ""),
                    item_name=item_config.get("item_name", ""),
                    value_type=item_config.get("value_type", 1),
                    team_name=item_config.get("team_name", ""),
                )
            elif item_type == "http":
                item_id, err = self.add_http_item(
                    hostname=hostname,
                    item_name=item_config.get("item_name", ""),
                    url=item_config.get("url", ""),
                    item_key=item_config.get("item_key", ""),
                    request_method=item_config.get("request_method", 0),
                    status_codes=item_config.get("status_codes", "200"),
                    timeout=item_config.get("timeout", "15s"),
                    verify_peer=item_config.get("verify_peer", True),
                    follow_redirects=item_config.get("follow_redirects", True),
                    posts=item_config.get("posts", ""),
                    value_type=item_config.get("value_type", 3),
                    team_name=item_config.get("team_name", ""),
                    authtype=item_config.get("authtype", 0),
                    username=item_config.get("username", ""),
                    password=item_config.get("password", ""),
                    regex_preprocessing=item_config.get("regex_preprocessing", False),
                    regex_pattern=item_config.get("regex_pattern", ""),
                    regex_output=item_config.get("regex_output", "\\1"),
                    regex_no_match_value=item_config.get("regex_no_match_value", "0"),
                )
            elif item_type == "service":
                item_id, err = self.add_service_item(
                    hostname=hostname,
                    service_type=item_config.get("service_type", ""),
                    port=item_config.get("port"),
                    item_name=item_config.get("item_name", ""),
                    team_name=item_config.get("team_name", ""),
                )
            else:
                item_id, err = self.add_item(
                    hostname=hostname,
                    item_name=item_config.get("item_name", ""),
                    item_key=item_config.get("item_key", ""),
                    value_type=item_config.get("value_type", 3),
                    team_name=item_config.get("team_name", ""),
                )
            results.append({"hostname": hostname, "item_id": item_id, "error": err})

        ok = sum(1 for r in results if not r["error"])
        logger.info("bulk_add_items: %d/%d succeeded (type=%s).", ok, len(hostnames), item_type)
        return results

    # (check_type → item_key_template, default_name, value_type)
    _FILE_WATCH_CHECKS: dict[str, tuple[str, str, int]] = {
        "checksum": ("vfs.file.md5sum[{path}]",       "MD5 checksum",       1),  # string
        "mtime":    ("vfs.file.time[{path},modify]",  "Modification time",  3),  # integer unix ts
        "size":     ("vfs.file.size[{path}]",         "File size",          3),  # integer bytes
        "exists":   ("vfs.file.exists[{path}]",       "File exists",        3),  # integer 0/1
    }

    # Bash / PowerShell commands that return the name of the most recently modified file in a folder.
    _FOLDER_LATEST_CMD = {
        "linux":   "find {path} -maxdepth 1 -type f -printf '%T@ %f\\n' 2>/dev/null | sort -n | tail -1 | awk '{{print $2}}'",
        "windows": "powershell -Command \"Get-ChildItem '{path}' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty Name\"",
    }

    def add_file_watch_item(
        self,
        hostname: str,
        file_path: str,
        check_type: str = "checksum",  # checksum | mtime | size | exists | folder_latest
        item_name: str = "",
        team_name: str = "",
        folder_os: str = "linux",      # linux | windows  (only used for folder_latest)
    ) -> tuple[str | None, str | None]:
        """Add an agent item that monitors a file property.
        folder_latest uses system.run and requires EnableRemoteCommands=1.
        All other types use standard vfs.file.* keys.
        """
        if check_type == "folder_latest":
            os_key = folder_os if folder_os in self._FOLDER_LATEST_CMD else "linux"
            cmd = self._FOLDER_LATEST_CMD[os_key].replace("{path}", file_path)
            item_key = f"system.run[{cmd}]"
            if not item_name:
                item_name = f"Latest modified file in {file_path} on {hostname}"
            return self.add_item(hostname, item_name, item_key, 1, team_name)  # value_type=1 string

        if check_type not in self._FILE_WATCH_CHECKS:
            return None, f"Invalid check_type '{check_type}'."
        key_tpl, default_label, value_type = self._FILE_WATCH_CHECKS[check_type]
        item_key = key_tpl.replace("{path}", file_path)
        if not item_name:
            item_name = f"{default_label} — {file_path} on {hostname}"
        return self.add_item(hostname, item_name, item_key, value_type, team_name)

    def add_change_trigger(
        self,
        hostname: str,
        item_key: str,
        trigger_name: str,
        priority: int = 2,
    ) -> tuple[str | None, str | None]:
        """Add a trigger that fires whenever an item's value changes (uses change() function)."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found in Zabbix."
            if self._zabbix_version >= (6, 2):
                expression = f"change(/{hostname}/{item_key})=1"
            else:
                expression = f"{{{hostname}:{item_key}.change()}}>0"
            result = self.zapi.trigger.create(
                description=trigger_name, expression=expression, priority=int(priority)
            )
            trigger_id = result["triggerids"][0]
            logger.info("Change trigger %r created on %r (ID: %s).", trigger_name, hostname, trigger_id)
            return trigger_id, None
        except Exception as e:
            msg = str(e)
            logger.error("add_change_trigger(%r, %r) failed: %r", hostname, item_key, e)
            return None, msg

    def add_file_age_trigger(
        self,
        hostname: str,
        file_path: str,
        trigger_name: str,
        max_age_minutes: int,
        priority: int = 3,
    ) -> tuple[str | None, str | None]:
        """Add a trigger that fires when a file hasn't been modified in max_age_minutes.
        Requires Zabbix 5.4+ (new expression syntax with now() function).
        """
        if not self.zapi:
            return None, "Zabbix API not connected."
        if self._zabbix_version < (5, 4):
            return None, "File age triggers require Zabbix 5.4 or newer (now() function not available in older versions)."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found in Zabbix."
            item_key = f"vfs.file.time[{file_path},modify]"
            threshold = max_age_minutes * 60
            expression = f"now() - last(/{hostname}/{item_key}) > {threshold}"
            result = self.zapi.trigger.create(
                description=trigger_name, expression=expression, priority=int(priority)
            )
            trigger_id = result["triggerids"][0]
            logger.info("Age trigger %r created on %r (ID: %s).", trigger_name, hostname, trigger_id)
            return trigger_id, None
        except Exception as e:
            msg = str(e)
            logger.error("add_file_age_trigger(%r, %r) failed: %r", hostname, file_path, e)
            return None, msg

    def add_script_item(
        self,
        hostname: str,
        script_type: str,   # bash | powershell
        script_mode: str,   # command | file
        script: str,        # inline command or absolute script path on the host
        file_arg: str = "", # optional file path passed as first arg to the script
        item_name: str = "",
        value_type: int = 1,
        team_name: str = "",
    ) -> tuple[str | None, str | None]:
        """Add an agent item that runs a bash or PowerShell script via system.run[].
        Requires EnableRemoteCommands=1 in the Zabbix agent config on the target host.
        """
        if not self.zapi:
            return None, "Zabbix API not connected."
        if script_mode not in ("command", "file"):
            return None, f"Invalid script_mode '{script_mode}'."
        if script_type not in ("bash", "powershell"):
            return None, f"Invalid script_type '{script_type}'."
        if not script.strip():
            return None, "Script content or path must not be empty."

        if script_mode == "file":
            if script_type == "bash":
                cmd = f"bash {script.strip()}"
            else:
                cmd = f"powershell.exe -File {script.strip()}"
            if file_arg.strip():
                cmd += f" {file_arg.strip()}"
        else:
            cmd = script.strip()

        item_key = f"system.run[{cmd}]"

        if not item_name:
            mode_label = "file" if script_mode == "file" else "cmd"
            item_name = f"{script_type} {mode_label} check on {hostname}"

        return self.add_item(hostname, item_name, item_key, value_type, team_name)

    # ------------------------------------------------------------------
    # DATABASE MONITORING
    # ------------------------------------------------------------------

    _DB_AGENT2_METRICS: dict = {
        "postgresql": [
            {"metric": "ping",        "key": "pgsql.ping",           "vtype": 3, "label": "Ping (1=up, 0=down)",     "has_extra": False},
            {"metric": "version",     "key": "pgsql.version",        "vtype": 4, "label": "Server version",          "has_extra": False},
            {"metric": "connections", "key": "pgsql.connections",    "vtype": 4, "label": "Connection stats (JSON)",  "has_extra": False},
            {"metric": "db_size",     "key": "pgsql.db.size",        "vtype": 3, "label": "Database size (bytes)",    "has_extra": True},
        ],
        "mysql": [
            {"metric": "ping",        "key": "mysql.ping",           "vtype": 3, "label": "Ping (1=up, 0=down)",     "has_extra": False},
            {"metric": "version",     "key": "mysql.version",        "vtype": 4, "label": "Server version",          "has_extra": False},
            {"metric": "connections", "key": "mysql.connections",    "vtype": 3, "label": "Active connections",      "has_extra": False},
            {"metric": "db_size",     "key": "mysql.db.size",        "vtype": 3, "label": "Database size (bytes)",    "has_extra": True},
        ],
        "mongodb": [
            {"metric": "ping",        "key": "mongodb.ping",         "vtype": 3, "label": "Ping (1=up, 0=down)",     "has_extra": False},
            {"metric": "version",     "key": "mongodb.server.version","vtype": 4, "label": "Server version",          "has_extra": False},
            {"metric": "connections", "key": "mongodb.connections",  "vtype": 3, "label": "Current connections",     "has_extra": False},
        ],
        "mssql": [
            {"metric": "ping",        "key": "mssql.ping",           "vtype": 3, "label": "Ping (1=up, 0=down)",     "has_extra": False},
            {"metric": "version",     "key": "mssql.version",        "vtype": 4, "label": "Server version",          "has_extra": False},
            {"metric": "connections", "key": "mssql.connections",    "vtype": 3, "label": "Active connections",      "has_extra": False},
        ],
    }

    def add_db_odbc_item(
        self,
        hostname: str,
        dsn: str,
        sql_query: str,
        description: str,
        item_name: str = "",
        value_type: int = 3,
        username: str = "",
        password: str = "",
        team_name: str = "",
    ) -> tuple[str | None, str | None]:
        """Add a Zabbix ODBC database monitor item (type 4) using db.odbc.select."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        if not dsn or not sql_query or not description:
            return None, "DSN, description, and SQL query are all required."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found."
            host_id = host_data[0]["hostid"]
            safe_desc = description.replace(",", "_").replace("]", "_").replace("[", "_")
            item_key = f"db.odbc.select[{safe_desc},{dsn}]"
            if not item_name:
                item_name = f"ODBC: {description} on {hostname}"
            kwargs: dict = dict(
                name=item_name,
                key_=item_key,
                hostid=host_id,
                type=4,
                value_type=value_type,
                params=sql_query,
                delay="1m",
            )
            if username:
                kwargs["username"] = username
            if password:
                kwargs["password"] = password
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]
            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("ODBC item %r added to %r (ID: %s).", item_name, hostname, item_id)
            return item_id, None
        except Exception as e:
            logger.error("add_db_odbc_item(%r) failed: %r", hostname, e)
            return None, str(e)

    def add_db_agent2_item(
        self,
        hostname: str,
        engine: str,
        conn_string: str,
        metric: str,
        item_name: str = "",
        extra_param: str = "",
        value_type: int | None = None,
        team_name: str = "",
    ) -> tuple[str | None, str | None]:
        """Add an Agent2 database plugin item (type 0) using engine-specific keys."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        engine_metrics = self._DB_AGENT2_METRICS.get(engine)
        if not engine_metrics:
            return None, f"Unsupported engine '{engine}'. Use: {', '.join(self._DB_AGENT2_METRICS)}."
        meta = next((m for m in engine_metrics if m["metric"] == metric), None)
        if not meta:
            supported = ", ".join(m["metric"] for m in engine_metrics)
            return None, f"Unknown metric '{metric}' for '{engine}'. Supported: {supported}."
        if not conn_string:
            return None, "Connection string is required."
        key_base = meta["key"]
        if extra_param:
            item_key = f"{key_base}[{conn_string},{extra_param}]"
        else:
            item_key = f"{key_base}[{conn_string}]"
        vtype = value_type if value_type is not None else meta["vtype"]
        if not item_name:
            item_name = f"{engine} {meta['label']} on {hostname}"
        return self.add_item(hostname, item_name, item_key, vtype, team_name)

    def get_all_item_keys(self) -> list[dict]:
        """Return all item keys defined in Zabbix templates, grouped by template name."""
        if not self.zapi:
            return []
        try:
            templates = self.zapi.template.get(output=["templateid", "name"])
            if not templates:
                return []
            template_ids = [t["templateid"] for t in templates]
            template_name_map = {t["templateid"]: t["name"] for t in templates}

            items = self.zapi.item.get(
                output=["name", "key_", "value_type", "hostid"],
                hostids=template_ids,
            )
            seen_keys: set[str] = set()
            result = []
            for item in items:
                key = item["key_"]
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                group = template_name_map.get(item["hostid"], "Other")
                result.append({
                    "key_": key,
                    "name": item["name"],
                    "value_type": item["value_type"],
                    "group": group,
                })
            result.sort(key=lambda x: (x["group"], x["key_"]))
            logger.info("get_all_item_keys: returned %d unique keys.", len(result))
            return result
        except Exception as e:
            logger.error("get_all_item_keys failed: %r", e)
            return []

    def bulk_add_triggers(self, hostnames: list[str], trigger_config: dict) -> list[dict]:
        """Add the same trigger to multiple hosts. Returns [{hostname, trigger_id, error}]."""
        results = []
        for hostname in hostnames:
            trigger_id, err = self.add_trigger(
                hostname=hostname,
                item_key=trigger_config.get("item_key", ""),
                trigger_name=trigger_config.get("trigger_name", ""),
                threshold=trigger_config.get("threshold", 0),
                operator=trigger_config.get("operator", ">"),
                priority=trigger_config.get("priority", 3),
            )
            results.append({"hostname": hostname, "trigger_id": trigger_id, "error": err})

        ok = sum(1 for r in results if not r["error"])
        logger.info("bulk_add_triggers: %d/%d succeeded.", ok, len(hostnames))
        return results