import logging
import re

from Zabbix_Base import Zabbix_Base

logger = logging.getLogger(__name__)


class Item_Manager(Zabbix_Base):
    def __init__(self):
        super().__init__()
        logger.info("Item Manager ready.")

    def add_item(
        self, hostname, item_name, item_key, value_type=3, team_name: str = "",
        delay: str = "1m", units: str = "", history: str = "31d",
        trends: str = "365d", description: str = "",
        status: int = 0, timeout: str = "",
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
                delay=delay or "1m",
                history=history or "31d",
                trends=trends or "365d",
                status=status,
            )
            if units:
                kwargs["units"] = units
            if description:
                kwargs["description"] = description
            if timeout:
                kwargs["timeout"] = timeout
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
        self, hostname, item_key, trigger_name, threshold, operator=">", priority=3,
        event_name: str = "", comments: str = "",
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

            create_params: dict = {
                "description": trigger_name, "expression": expression, "priority": int(priority)
            }
            if event_name:
                create_params["event_name"] = event_name
            if comments:
                create_params["comments"] = comments
            result = self.zapi.trigger.create(**create_params)
            trigger_id = result["triggerids"][0]
            logger.info("Trigger %r created on %r (ID: %s).", trigger_name, hostname, trigger_id)
            return trigger_id, None

        except Exception as e:
            msg = str(e)
            logger.error("add_trigger(%r, %r) failed: %r", hostname, trigger_name, e)
            return None, msg

    def add_string_trigger(
        self, hostname: str, item_key: str, trigger_name: str,
        pattern: str, match_type: str = "like", priority: int = 3,
        event_name: str = "", comments: str = "",
    ) -> tuple[str | None, str | None]:
        """
        Adds a trigger for a string/text item using pattern matching.
        match_type: like | notlike | regexp | notregexp
        >=6.2: find(/host/key,,"like","pattern")=1
        <6.2:  str({host:key.last()},"pattern")=1
        """
        if not self.zapi:
            return None, "Zabbix API not connected."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found in Zabbix."

            negate = match_type in ("notlike", "notregexp")
            base_fn = "regexp" if "regexp" in match_type else "like"
            fire_val = "0" if negate else "1"

            if self._zabbix_version >= (6, 2):
                expression = f'find(/{hostname}/{item_key},,"{base_fn}","{pattern}")={fire_val}'
            else:
                expression = f'str({{{hostname}:{item_key}.last()}},"{pattern}")={fire_val}'

            create_params: dict = {
                "description": trigger_name, "expression": expression, "priority": int(priority)
            }
            if event_name:
                create_params["event_name"] = event_name
            if comments:
                create_params["comments"] = comments
            result = self.zapi.trigger.create(**create_params)
            trigger_id = result["triggerids"][0]
            logger.info("String trigger %r created on %r (ID: %s).", trigger_name, hostname, trigger_id)
            return trigger_id, None
        except Exception as e:
            logger.error("add_string_trigger(%r, %r) failed: %r", hostname, trigger_name, e)
            return None, str(e)

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

    def get_item_hostname(self, itemid: str) -> str:
        """Return the host name for an item, or '' if not found."""
        if not self.zapi:
            return ""
        try:
            items = self.zapi.item.get(itemids=[itemid], output=["itemid"], selectHosts=["host"])
            if items and items[0].get("hosts"):
                return items[0]["hosts"][0]["host"]
        except Exception:
            pass
        return ""

    def get_trigger_hostname(self, triggerid: str) -> str:
        """Return the host name for a trigger, or '' if not found."""
        if not self.zapi:
            return ""
        try:
            triggers = self.zapi.trigger.get(triggerids=[triggerid], output=["triggerid"], selectHosts=["host"])
            if triggers and triggers[0].get("hosts"):
                return triggers[0]["hosts"][0]["host"]
        except Exception:
            pass
        return ""

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

    def update_item(self, itemid: str, name: str | None = None, delay: str | None = None, status: str | None = None, key_: str | None = None) -> bool:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            params: dict = {"itemid": itemid}
            if name is not None:
                params["name"] = name
            if delay is not None:
                params["delay"] = delay
            if status is not None:
                params["status"] = int(status)
            if key_ is not None:
                params["key_"] = key_
            self.zapi.item.update(**params)
            return True
        except Exception as e:
            raise RuntimeError(str(e))

    def list_triggers(self, hostname: str) -> tuple[list[dict], str]:
        """List all non-inherited triggers on a host.
        Returns (triggers, host_available) where host_available is
        '0'=Unknown, '1'=Available, '2'=Unavailable (Zabbix interface status).
        """
        if not self.zapi:
            return [], "0"
        try:
            host_data = self.zapi.host.get(
                filter={"host": [hostname]},
                output=["hostid"],
                selectInterfaces=["available", "type"],
            )
            if not host_data:
                return [], "0"

            # Zabbix 7.x: availability lives on each interface.
            # Prefer the ZBX agent interface (type=1), fall back to first.
            interfaces = host_data[0].get("interfaces", [])
            primary = next(
                (i for i in interfaces if str(i.get("type")) == "1"), None
            ) or (interfaces[0] if interfaces else None)
            host_available = str(primary.get("available", "0")) if primary else "0"

            triggers = self.zapi.trigger.get(
                hostids=host_data[0]["hostid"],
                output=["triggerid", "description", "expression", "priority", "status",
                        "value", "lastchange"],
                expandExpression=True,
                inherited=False,
            )
            return triggers, host_available
        except Exception as e:
            logger.error("list_triggers(%r) failed: %r", hostname, e)
            return [], "0"

    def update_trigger(
        self,
        triggerid: str,
        description: str | None = None,
        priority: int | None = None,
        status: int | None = None,
        expression: str | None = None,
        event_name: str | None = None,
        comments: str | None = None,
    ) -> bool:
        """Update a trigger's name, severity, status, expression, event name, or comments."""
        if not self.zapi:
            return False
        try:
            params: dict = {"triggerid": triggerid}
            if description is not None:
                params["description"] = description
            if priority is not None:
                params["priority"] = priority
            if status is not None:
                params["status"] = status
            if expression is not None:
                params["expression"] = expression
            if event_name is not None:
                params["event_name"] = event_name
            if comments is not None:
                params["comments"] = comments
            self.zapi.trigger.update(**params)
            logger.info("Updated trigger ID %s.", triggerid)
            return True
        except Exception as e:
            logger.error("update_trigger(%s) failed: %r", triggerid, e)
            raise

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

    def list_all_triggers(self, search: str = "", hostname: str = "", limit: int = 2000) -> list[dict]:
        """List triggers across all hosts. Custom (non-template) triggers are sorted first."""
        if not self.zapi:
            raise RuntimeError("Zabbix API not connected.")
        fetch_limit = min(limit * 3, 5000)
        kwargs: dict = dict(
            output=["triggerid", "description", "expression", "priority", "status",
                    "value", "lastchange", "templateid"],
            selectHosts=["hostid", "host"],
            expandExpression=True,
            limit=fetch_limit,
            sortfield="description",
            sortorder="ASC",
        )
        if hostname:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return []
            kwargs["hostids"] = host_data[0]["hostid"]
        if search:
            kwargs["search"] = {"description": search}
        triggers = self.zapi.trigger.get(**kwargs)
        # Fetch interface availability for each unique host so the UI can flag
        # triggers on unreachable hosts.
        unique_hostids = list({
            t.get("hosts", [{}])[0].get("hostid", "")
            for t in triggers
            if t.get("hosts")
        } - {""})
        host_avail_map: dict[str, str] = {}
        if unique_hostids:
            try:
                hosts_info = self.zapi.host.get(
                    hostids=unique_hostids,
                    output=["hostid"],
                    selectInterfaces=["available", "type"],
                )
                for h in hosts_info:
                    ifaces = h.get("interfaces", [])
                    primary = next(
                        (i for i in ifaces if str(i.get("type")) == "1"), None
                    ) or (ifaces[0] if ifaces else None)
                    host_avail_map[h["hostid"]] = (
                        str(primary.get("available", "0")) if primary else "0"
                    )
            except Exception as exc:
                logger.warning("list_all_triggers: could not fetch host availability: %r", exc)

        result = []
        for t in triggers:
            hosts = t.get("hosts") or []
            hostid = hosts[0].get("hostid", "") if hosts else ""
            result.append({
                "triggerid": t["triggerid"],
                "description": t["description"],
                "expression": t["expression"],
                "priority": int(t["priority"]),
                "status": int(t["status"]),
                "value": int(t.get("value", 0)),
                "lastchange": int(t.get("lastchange", 0)),
                "hostname": hosts[0]["host"] if hosts else "",
                "templateid": t.get("templateid", "0"),
                "host_available": host_avail_map.get(hostid, "0"),
            })
        # Custom triggers (templateid=0) first, template-inherited triggers after
        result.sort(key=lambda x: (0 if str(x["templateid"]) == "0" else 1, x["description"].lower()))
        logger.info("list_all_triggers: returned %d triggers (search=%r, host=%r).", len(result), search, hostname)
        return result[:limit]

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
        verify_host: bool = True,
        follow_redirects: bool = True,
        posts: str = "",
        post_type: int = 0,        # 0=Raw 2=JSON 3=XML
        value_type: int = 3,       # 3=integer (response code), 0=float (time), 4=text (body)
        retrieve_mode: int = 0,    # 0=body 1=headers 2=body+headers
        team_name: str = "",
        authtype: int = 0,         # 0=None, 1=Basic, 2=NTLM
        username: str = "",
        password: str = "",
        headers: str = "",         # newline-separated "Name: Value" pairs
        query_fields: list[dict] | None = None,   # [{name, value}] appended as URL params
        http_proxy: str = "",
        ssl_cert_file: str = "",
        ssl_key_file: str = "",
        ssl_key_password: str = "",
        convert_to_json: bool = False,  # output_format=1 in Zabbix
        allow_traps: bool = False,
        status: int = 0,               # 0=enabled 1=disabled
        regex_preprocessing: bool = False,
        regex_pattern: str = "",
        regex_output: str = "\\1",
        regex_no_match_value: str = "0",
        delay: str = "1m",
        units: str = "",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
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

            # Append query fields to URL if provided
            effective_url = url
            if query_fields:
                from urllib.parse import urlencode, urlparse, urlunparse, parse_qs, urlencode as _ue
                pairs = [(qf["name"], qf["value"]) for qf in query_fields if qf.get("name")]
                if pairs:
                    sep = "&" if "?" in effective_url else "?"
                    effective_url = effective_url + sep + urlencode(pairs)

            kwargs: dict = dict(
                name=item_name,
                key_=item_key,
                hostid=host_id,
                type=19,            # HTTP agent
                value_type=value_type,
                delay=delay or "1m",
                history=history or "31d",
                trends=trends or "365d",
                url=effective_url,
                request_method=request_method,
                status_codes=status_codes,
                timeout=timeout,
                verify_peer=1 if verify_peer else 0,
                verify_host=1 if verify_host else 0,
                follow_redirects=1 if follow_redirects else 0,
                retrieve_mode=retrieve_mode,
                output_format=1 if convert_to_json else 0,
                allow_traps=1 if allow_traps else 0,
                status=status,
                interfaceid=0,      # HTTP agent does not require a host interface
            )
            if units:
                kwargs["units"] = units
            if description:
                kwargs["description"] = description
            if posts:
                kwargs["posts"] = posts
                kwargs["post_type"] = post_type
            if headers:
                kwargs["headers"] = headers
            if http_proxy:
                kwargs["http_proxy"] = http_proxy
            if ssl_cert_file:
                kwargs["ssl_cert_file"] = ssl_cert_file
            if ssl_key_file:
                kwargs["ssl_key_file"] = ssl_key_file
                if ssl_key_password:
                    kwargs["ssl_key_password"] = ssl_key_password
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
        delay: str = "1m",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
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
                delay=delay or "1m",
                history=history or "31d",
                trends=trends or "365d",
            )
            if description:
                kwargs["description"] = description
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
            common = dict(
                delay=item_config.get("delay", "1m"),
                units=item_config.get("units", ""),
                history=item_config.get("history", "31d"),
                trends=item_config.get("trends", "365d"),
                description=item_config.get("description", ""),
            )
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
                    **common,
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
                    **common,
                )
            elif item_type == "service":
                item_id, err = self.add_service_item(
                    hostname=hostname,
                    service_type=item_config.get("service_type", ""),
                    port=item_config.get("port"),
                    item_name=item_config.get("item_name", ""),
                    team_name=item_config.get("team_name", ""),
                    **{k: v for k, v in common.items() if k != "units"},
                )
            else:
                item_id, err = self.add_item(
                    hostname=hostname,
                    item_name=item_config.get("item_name", ""),
                    item_key=item_config.get("item_key", ""),
                    value_type=item_config.get("value_type", 3),
                    team_name=item_config.get("team_name", ""),
                    delay=item_config.get("delay", "1m"),
                    units=item_config.get("units", ""),
                    history=item_config.get("history", "31d"),
                    trends=item_config.get("trends", "365d"),
                    description=item_config.get("description", ""),
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
        delay: str = "1m",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
    ) -> tuple[str | None, str | None]:
        """Add an agent item that monitors a file property.
        folder_latest uses system.run and requires EnableRemoteCommands=1.
        All other types use standard vfs.file.* keys.
        """
        common = dict(delay=delay, history=history, trends=trends, description=description)
        if check_type == "folder_latest":
            os_key = folder_os if folder_os in self._FOLDER_LATEST_CMD else "linux"
            cmd = self._FOLDER_LATEST_CMD[os_key].replace("{path}", file_path)
            item_key = f"system.run[{cmd}]"
            if not item_name:
                item_name = f"Latest modified file in {file_path} on {hostname}"
            return self.add_item(hostname, item_name, item_key, 1, team_name, **common)

        if check_type not in self._FILE_WATCH_CHECKS:
            return None, f"Invalid check_type '{check_type}'."
        key_tpl, default_label, value_type = self._FILE_WATCH_CHECKS[check_type]
        item_key = key_tpl.replace("{path}", file_path)
        if not item_name:
            item_name = f"{default_label} — {file_path} on {hostname}"
        return self.add_item(hostname, item_name, item_key, value_type, team_name, **common)

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
        delay: str = "1m",
        units: str = "",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
        status: int = 0,
        timeout: str = "",
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

        return self.add_item(hostname, item_name, item_key, value_type, team_name,
                             delay=delay, units=units, history=history, trends=trends,
                             description=description, status=status, timeout=timeout)

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
        delay: str = "1m",
        units: str = "",
        history: str = "31d",
        trends: str = "365d",
        status: int = 0,
        timeout: str = "",
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
                delay=delay or "1m",
                history=history or "31d",
                trends=trends or "365d",
                status=status,
            )
            if units:
                kwargs["units"] = units
            if timeout:
                kwargs["timeout"] = timeout
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

    def list_all_items(
        self,
        search: str = "",
        hostname: str = "",
        limit: int = 2000,
    ) -> list[dict]:
        """List items across all hosts. Custom (non-template) items are sorted first."""
        if not self.zapi:
            raise RuntimeError("Zabbix API not connected.")
        # Fetch more than the requested limit so we can sort custom items first
        # then truncate — avoids template items crowding out user-created ones.
        fetch_limit = min(limit * 3, 5000)
        kwargs: dict = dict(
            output=["itemid", "name", "key_", "value_type", "delay", "status", "state",
                    "lastvalue", "lastclock", "templateid"],
            selectHosts=["host"],
            selectTags=["tag", "value"],
            limit=fetch_limit,
            sortfield="name",
            sortorder="ASC",
        )
        if hostname:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return []
            kwargs["hostids"] = host_data[0]["hostid"]
        if search:
            kwargs["search"] = {"name": search, "key_": search}
            kwargs["searchByAny"] = True
        items = self.zapi.item.get(**kwargs)
        result = []
        for item in items:
            hosts = item.get("hosts") or []
            lc = item.get("lastclock")
            result.append({
                "itemid": item["itemid"],
                "name": item["name"],
                "key_": item["key_"],
                "value_type": item["value_type"],
                "delay": item["delay"],
                "status": item["status"],
                "state": item.get("state", "0"),
                "hostname": hosts[0]["host"] if hosts else "",
                "tags": item.get("tags", []),
                "lastvalue": item.get("lastvalue", ""),
                "lastclock": int(lc) if lc else None,
                "templateid": item.get("templateid", "0"),
            })
        # Custom items (templateid=0 = created directly, not from template) come first
        result.sort(key=lambda x: (0 if str(x["templateid"]) == "0" else 1, x["name"].lower()))
        logger.info("list_all_items: returned %d items (search=%r, host=%r).", len(result), search, hostname)
        return result[:limit]

    def get_all_item_keys(self) -> list[dict]:
        """Return all item keys defined in Zabbix templates, grouped by template name.
        Also includes delay, units, history, trends, description so the UI can
        pre-fill the add-item form when the user selects a known template key.
        """
        if not self.zapi:
            return []
        try:
            templates = self.zapi.template.get(output=["templateid", "name"])
            if not templates:
                return []
            template_ids = [t["templateid"] for t in templates]
            template_name_map = {t["templateid"]: t["name"] for t in templates}

            items = self.zapi.item.get(
                output=["name", "key_", "value_type", "hostid",
                        "delay", "units", "history", "trends", "description"],
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
                    "delay": item.get("delay", "1m"),
                    "units": item.get("units", ""),
                    "history": item.get("history", "31d"),
                    "trends": item.get("trends", "365d"),
                    "description": item.get("description", ""),
                })
            result.sort(key=lambda x: (x["group"], x["key_"]))
            logger.info("get_all_item_keys: returned %d unique keys.", len(result))
            return result
        except Exception as e:
            logger.error("get_all_item_keys failed: %r", e)
            return []

    # ------------------------------------------------------------------
    # SNMP AGENT (type 20)
    # ------------------------------------------------------------------

    def add_snmp_item(
        self,
        hostname: str,
        item_name: str,
        item_key: str,
        snmp_oid: str,
        value_type: int = 3,
        snmp_version: int = 2,          # 1=v1, 2=v2c, 3=v3
        snmp_community: str = "public",
        snmpv3_securityname: str = "",
        snmpv3_securitylevel: int = 0,  # 0=noAuthNoPriv, 1=authNoPriv, 2=authPriv
        snmpv3_authprotocol: int = 0,   # 0=MD5,1=SHA,2=SHA224,3=SHA256,4=SHA384,5=SHA512
        snmpv3_authpassphrase: str = "",
        snmpv3_privprotocol: int = 0,   # 0=DES,1=AES128,2=AES192,3=AES256
        snmpv3_privpassphrase: str = "",
        snmpv3_contextname: str = "",
        team_name: str = "",
        delay: str = "1m",
        units: str = "",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
        status: int = 0,
    ) -> tuple[str | None, str | None]:
        """Add a Zabbix SNMP agent item (type 20). Requires an SNMP interface on the host."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        if not snmp_oid:
            return None, "SNMP OID is required."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found."
            host_id = host_data[0]["hostid"]
            # Look for SNMP interface (type 2)
            interfaces = self.zapi.hostinterface.get(hostids=host_id)
            snmp_iface = next((i for i in interfaces if str(i.get("type")) == "2"), None)
            if not snmp_iface:
                snmp_iface = interfaces[0] if interfaces else None
            if not snmp_iface:
                return None, f"No interface found for host '{hostname}'."
            if not item_name:
                item_name = f"SNMP: {snmp_oid} on {hostname}"
            if not item_key:
                safe = snmp_oid.replace(".", "_").replace(" ", "_")[:40]
                item_key = f"snmp.{safe}"
            kwargs: dict = dict(
                name=item_name, key_=item_key, hostid=host_id,
                interfaceid=snmp_iface["interfaceid"],
                type=20, value_type=value_type,
                snmp_oid=snmp_oid,
                delay=delay or "1m", history=history or "31d", trends=trends or "365d",
                status=status,
            )
            if snmp_version in (1, 2):
                kwargs["snmp_community"] = snmp_community or "public"
            if snmp_version == 3:
                kwargs["snmpv3_securityname"] = snmpv3_securityname
                kwargs["snmpv3_securitylevel"] = snmpv3_securitylevel
                if snmpv3_securitylevel >= 1:
                    kwargs["snmpv3_authprotocol"] = snmpv3_authprotocol
                    kwargs["snmpv3_authpassphrase"] = snmpv3_authpassphrase
                if snmpv3_securitylevel == 2:
                    kwargs["snmpv3_privprotocol"] = snmpv3_privprotocol
                    kwargs["snmpv3_privpassphrase"] = snmpv3_privpassphrase
                if snmpv3_contextname:
                    kwargs["snmpv3_contextname"] = snmpv3_contextname
            if units:
                kwargs["units"] = units
            if description:
                kwargs["description"] = description
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]
            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("SNMP item %r (oid=%s) added to %r (ID: %s).", item_name, snmp_oid, hostname, item_id)
            return item_id, None
        except Exception as e:
            logger.error("add_snmp_item(%r) failed: %r", hostname, e)
            return None, str(e)

    # ------------------------------------------------------------------
    # SNMP TRAP (type 17)
    # ------------------------------------------------------------------

    def add_snmp_trap_item(
        self,
        hostname: str,
        item_name: str,
        item_key: str = "snmptrap.fallback",
        value_type: int = 1,
        team_name: str = "",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
        status: int = 0,
    ) -> tuple[str | None, str | None]:
        """Add a Zabbix SNMP trap item (type 17). Receives traps pushed by external devices."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found."
            host_id = host_data[0]["hostid"]
            interfaces = self.zapi.hostinterface.get(hostids=host_id)
            snmp_iface = next((i for i in interfaces if str(i.get("type")) == "2"), None) or (interfaces[0] if interfaces else None)
            if not snmp_iface:
                return None, f"No interface found for host '{hostname}'."
            kwargs: dict = dict(
                name=item_name, key_=item_key or "snmptrap.fallback",
                hostid=host_id, interfaceid=snmp_iface["interfaceid"],
                type=17, value_type=value_type,
                history=history or "31d", trends=trends or "365d", status=status,
            )
            if description:
                kwargs["description"] = description
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]
            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("SNMP trap item %r added to %r (ID: %s).", item_name, hostname, item_id)
            return item_id, None
        except Exception as e:
            logger.error("add_snmp_trap_item(%r) failed: %r", hostname, e)
            return None, str(e)

    # ------------------------------------------------------------------
    # ZABBIX INTERNAL (type 5)
    # ------------------------------------------------------------------

    def add_internal_item(
        self,
        hostname: str,
        item_name: str,
        item_key: str,
        value_type: int = 3,
        team_name: str = "",
        delay: str = "1m",
        units: str = "",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
        status: int = 0,
    ) -> tuple[str | None, str | None]:
        """Add a Zabbix internal item (type 5) using built-in zabbix[...] keys."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found."
            host_id = host_data[0]["hostid"]
            kwargs: dict = dict(
                name=item_name, key_=item_key, hostid=host_id,
                type=5, value_type=value_type,
                delay=delay or "1m", history=history or "31d", trends=trends or "365d",
                status=status,
            )
            if units:
                kwargs["units"] = units
            if description:
                kwargs["description"] = description
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]
            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("Internal item %r (%s) added to %r (ID: %s).", item_name, item_key, hostname, item_id)
            return item_id, None
        except Exception as e:
            logger.error("add_internal_item(%r) failed: %r", hostname, e)
            return None, str(e)

    # ------------------------------------------------------------------
    # ZABBIX TRAPPER (type 2)
    # ------------------------------------------------------------------

    def add_trapper_item(
        self,
        hostname: str,
        item_name: str,
        item_key: str,
        value_type: int = 4,
        allow_traps: bool = True,
        team_name: str = "",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
        status: int = 0,
    ) -> tuple[str | None, str | None]:
        """Add a Zabbix trapper item (type 2). Accepts data pushed via zabbix_sender."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found."
            host_id = host_data[0]["hostid"]
            kwargs: dict = dict(
                name=item_name, key_=item_key, hostid=host_id,
                type=2, value_type=value_type,
                history=history or "31d", trends=trends or "365d",
                allow_traps=1 if allow_traps else 0,
                status=status,
            )
            if description:
                kwargs["description"] = description
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]
            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("Trapper item %r (%s) added to %r (ID: %s).", item_name, item_key, hostname, item_id)
            return item_id, None
        except Exception as e:
            logger.error("add_trapper_item(%r) failed: %r", hostname, e)
            return None, str(e)

    # ------------------------------------------------------------------
    # EXTERNAL CHECK (type 10)
    # ------------------------------------------------------------------

    def add_external_item(
        self,
        hostname: str,
        item_name: str,
        item_key: str,
        value_type: int = 4,
        team_name: str = "",
        delay: str = "1m",
        units: str = "",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
        status: int = 0,
    ) -> tuple[str | None, str | None]:
        """Add an external check item (type 10). Script must exist in ExternalScripts dir on Zabbix server."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found."
            host_id = host_data[0]["hostid"]
            interfaces = self.zapi.hostinterface.get(hostids=host_id)
            iface = interfaces[0] if interfaces else None
            if not iface:
                return None, f"No interface found for host '{hostname}'."
            kwargs: dict = dict(
                name=item_name, key_=item_key, hostid=host_id,
                interfaceid=iface["interfaceid"],
                type=10, value_type=value_type,
                delay=delay or "1m", history=history or "31d", trends=trends or "365d",
                status=status,
            )
            if units:
                kwargs["units"] = units
            if description:
                kwargs["description"] = description
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]
            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("External item %r (%s) added to %r (ID: %s).", item_name, item_key, hostname, item_id)
            return item_id, None
        except Exception as e:
            logger.error("add_external_item(%r) failed: %r", hostname, e)
            return None, str(e)

    # ------------------------------------------------------------------
    # IPMI AGENT (type 12)
    # ------------------------------------------------------------------

    def add_ipmi_item(
        self,
        hostname: str,
        item_name: str,
        ipmi_sensor: str,
        item_key: str = "",
        value_type: int = 0,
        team_name: str = "",
        delay: str = "1m",
        units: str = "",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
        status: int = 0,
    ) -> tuple[str | None, str | None]:
        """Add an IPMI agent item (type 12). Requires an IPMI interface on the host."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found."
            host_id = host_data[0]["hostid"]
            interfaces = self.zapi.hostinterface.get(hostids=host_id)
            # Prefer IPMI interface (type 3), fall back to first
            ipmi_iface = next((i for i in interfaces if str(i.get("type")) == "3"), None) or (interfaces[0] if interfaces else None)
            if not ipmi_iface:
                return None, f"No interface found for host '{hostname}'."
            if not item_key:
                safe = ipmi_sensor.replace(" ", "_")[:40]
                item_key = f"ipmi.sensor[{safe}]"
            if not item_name:
                item_name = f"IPMI: {ipmi_sensor} on {hostname}"
            kwargs: dict = dict(
                name=item_name, key_=item_key, hostid=host_id,
                interfaceid=ipmi_iface["interfaceid"],
                type=12, value_type=value_type,
                ipmi_sensor=ipmi_sensor,
                delay=delay or "1m", history=history or "31d", trends=trends or "365d",
                status=status,
            )
            if units:
                kwargs["units"] = units
            if description:
                kwargs["description"] = description
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]
            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("IPMI item %r (%s) added to %r (ID: %s).", item_name, ipmi_sensor, hostname, item_id)
            return item_id, None
        except Exception as e:
            logger.error("add_ipmi_item(%r) failed: %r", hostname, e)
            return None, str(e)

    # ------------------------------------------------------------------
    # SSH AGENT (type 13)
    # ------------------------------------------------------------------

    def add_ssh_item(
        self,
        hostname: str,
        item_name: str,
        params: str,
        item_key: str = "",
        authtype: int = 0,      # 0=password, 1=public key
        username: str = "",
        password: str = "",
        publickey: str = "",
        privatekey: str = "",
        value_type: int = 1,
        team_name: str = "",
        delay: str = "1m",
        units: str = "",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
        status: int = 0,
        timeout: str = "",
    ) -> tuple[str | None, str | None]:
        """Add an SSH agent item (type 13). Zabbix server connects via SSH and runs the script."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        if not params.strip():
            return None, "SSH script/commands are required."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found."
            host_id = host_data[0]["hostid"]
            interfaces = self.zapi.hostinterface.get(hostids=host_id)
            iface = interfaces[0] if interfaces else None
            if not iface:
                return None, f"No interface found for host '{hostname}'."
            if not item_key:
                safe = re.sub(r"[^a-zA-Z0-9._-]", "_", item_name)[:40]
                item_key = f"ssh.run[{safe}]"
            kwargs: dict = dict(
                name=item_name, key_=item_key, hostid=host_id,
                interfaceid=iface["interfaceid"],
                type=13, value_type=value_type,
                params=params,
                authtype=authtype,
                username=username or "",
                delay=delay or "1m", history=history or "31d", trends=trends or "365d",
                status=status,
            )
            if authtype == 0 and password:
                kwargs["password"] = password
            if authtype == 1:
                kwargs["publickey"] = publickey
                kwargs["privatekey"] = privatekey
            if units:
                kwargs["units"] = units
            if description:
                kwargs["description"] = description
            if timeout:
                kwargs["timeout"] = timeout
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]
            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("SSH item %r added to %r (ID: %s).", item_name, hostname, item_id)
            return item_id, None
        except Exception as e:
            logger.error("add_ssh_item(%r) failed: %r", hostname, e)
            return None, str(e)

    # ------------------------------------------------------------------
    # TELNET AGENT (type 14)
    # ------------------------------------------------------------------

    def add_telnet_item(
        self,
        hostname: str,
        item_name: str,
        params: str,
        item_key: str = "",
        username: str = "",
        password: str = "",
        value_type: int = 1,
        team_name: str = "",
        delay: str = "1m",
        units: str = "",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
        status: int = 0,
    ) -> tuple[str | None, str | None]:
        """Add a Telnet agent item (type 14). Zabbix server connects via Telnet and runs the script."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        if not params.strip():
            return None, "Telnet script/commands are required."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found."
            host_id = host_data[0]["hostid"]
            interfaces = self.zapi.hostinterface.get(hostids=host_id)
            iface = interfaces[0] if interfaces else None
            if not iface:
                return None, f"No interface found for host '{hostname}'."
            if not item_key:
                safe = re.sub(r"[^a-zA-Z0-9._-]", "_", item_name)[:40]
                item_key = f"telnet.run[{safe}]"
            kwargs: dict = dict(
                name=item_name, key_=item_key, hostid=host_id,
                interfaceid=iface["interfaceid"],
                type=14, value_type=value_type,
                params=params,
                username=username or "",
                password=password or "",
                delay=delay or "1m", history=history or "31d", trends=trends or "365d",
                status=status,
            )
            if units:
                kwargs["units"] = units
            if description:
                kwargs["description"] = description
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]
            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("Telnet item %r added to %r (ID: %s).", item_name, hostname, item_id)
            return item_id, None
        except Exception as e:
            logger.error("add_telnet_item(%r) failed: %r", hostname, e)
            return None, str(e)

    # ------------------------------------------------------------------
    # JMX AGENT (type 16)
    # ------------------------------------------------------------------

    def add_jmx_item(
        self,
        hostname: str,
        item_name: str,
        item_key: str,
        jmx_endpoint: str = "",
        username: str = "",
        password: str = "",
        value_type: int = 3,
        team_name: str = "",
        delay: str = "1m",
        units: str = "",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
        status: int = 0,
    ) -> tuple[str | None, str | None]:
        """Add a JMX agent item (type 16). Requires Zabbix Java Gateway and a JMX interface on the host."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        if not item_key:
            return None, "JMX item key is required (e.g. jmx[\"java.lang:type=Memory\",\"HeapMemoryUsage.used\"])."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found."
            host_id = host_data[0]["hostid"]
            interfaces = self.zapi.hostinterface.get(hostids=host_id)
            # Prefer JMX interface (type 4)
            jmx_iface = next((i for i in interfaces if str(i.get("type")) == "4"), None) or (interfaces[0] if interfaces else None)
            if not jmx_iface:
                return None, f"No interface found for host '{hostname}'."
            kwargs: dict = dict(
                name=item_name, key_=item_key, hostid=host_id,
                interfaceid=jmx_iface["interfaceid"],
                type=16, value_type=value_type,
                delay=delay or "1m", history=history or "31d", trends=trends or "365d",
                status=status,
            )
            if jmx_endpoint:
                kwargs["jmx_endpoint"] = jmx_endpoint
            if username:
                kwargs["username"] = username
                kwargs["password"] = password
            if units:
                kwargs["units"] = units
            if description:
                kwargs["description"] = description
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]
            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("JMX item %r (%s) added to %r (ID: %s).", item_name, item_key, hostname, item_id)
            return item_id, None
        except Exception as e:
            logger.error("add_jmx_item(%r) failed: %r", hostname, e)
            return None, str(e)

    # ------------------------------------------------------------------
    # CALCULATED ITEM (type 15)
    # ------------------------------------------------------------------

    def add_calculated_item(
        self,
        hostname: str,
        item_name: str,
        item_key: str,
        formula: str,
        value_type: int = 0,
        team_name: str = "",
        delay: str = "1m",
        units: str = "",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
        status: int = 0,
    ) -> tuple[str | None, str | None]:
        """Add a calculated item (type 15). Derives its value from a formula referencing other items."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        if not formula.strip():
            return None, "Formula is required."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found."
            host_id = host_data[0]["hostid"]
            kwargs: dict = dict(
                name=item_name, key_=item_key, hostid=host_id,
                type=15, value_type=value_type,
                params=formula,
                delay=delay or "1m", history=history or "31d", trends=trends or "365d",
                status=status,
            )
            if units:
                kwargs["units"] = units
            if description:
                kwargs["description"] = description
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]
            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("Calculated item %r (%s) added to %r (ID: %s).", item_name, item_key, hostname, item_id)
            return item_id, None
        except Exception as e:
            logger.error("add_calculated_item(%r) failed: %r", hostname, e)
            return None, str(e)

    # ------------------------------------------------------------------
    # DEPENDENT ITEM (type 18)
    # ------------------------------------------------------------------

    def add_dependent_item(
        self,
        hostname: str,
        item_name: str,
        item_key: str,
        master_itemid: str,
        value_type: int = 4,
        team_name: str = "",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
        status: int = 0,
    ) -> tuple[str | None, str | None]:
        """Add a dependent item (type 18). Its value is derived from preprocessing a master item."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        if not master_itemid:
            return None, "master_itemid is required."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found."
            host_id = host_data[0]["hostid"]
            kwargs: dict = dict(
                name=item_name, key_=item_key, hostid=host_id,
                type=18, value_type=value_type,
                master_itemid=master_itemid,
                history=history or "31d", trends=trends or "365d",
                status=status,
            )
            if description:
                kwargs["description"] = description
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]
            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("Dependent item %r added to %r (master: %s, ID: %s).", item_name, hostname, master_itemid, item_id)
            return item_id, None
        except Exception as e:
            logger.error("add_dependent_item(%r) failed: %r", hostname, e)
            return None, str(e)

    # ------------------------------------------------------------------
    # SCRIPT ITEM (type 21 — JavaScript on Zabbix server)
    # ------------------------------------------------------------------

    def add_zabbix_script_item(
        self,
        hostname: str,
        item_name: str,
        item_key: str,
        params: str,
        parameters: list[dict] | None = None,
        value_type: int = 4,
        team_name: str = "",
        delay: str = "1m",
        units: str = "",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
        status: int = 0,
        timeout: str = "",
    ) -> tuple[str | None, str | None]:
        """Add a Zabbix Script item (type 21). JavaScript code runs on the Zabbix server/proxy."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        if not params.strip():
            return None, "Script code is required."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found."
            host_id = host_data[0]["hostid"]
            kwargs: dict = dict(
                name=item_name, key_=item_key, hostid=host_id,
                type=21, value_type=value_type,
                params=params,
                delay=delay or "1m", history=history or "31d", trends=trends or "365d",
                status=status,
            )
            if parameters:
                kwargs["parameters"] = [{"name": p["name"], "value": p.get("value", "")} for p in parameters if p.get("name")]
            if units:
                kwargs["units"] = units
            if description:
                kwargs["description"] = description
            if timeout:
                kwargs["timeout"] = timeout
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]
            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("Script item %r (%s) added to %r (ID: %s).", item_name, item_key, hostname, item_id)
            return item_id, None
        except Exception as e:
            logger.error("add_zabbix_script_item(%r) failed: %r", hostname, e)
            return None, str(e)

    # ------------------------------------------------------------------
    # BROWSER ITEM (type 26 — JavaScript browser automation, Zabbix 7.x+)
    # ------------------------------------------------------------------

    def add_browser_item(
        self,
        hostname: str,
        item_name: str,
        item_key: str,
        params: str,
        parameters: list[dict] | None = None,
        value_type: int = 4,
        team_name: str = "",
        delay: str = "1m",
        units: str = "",
        history: str = "31d",
        trends: str = "365d",
        description: str = "",
        status: int = 0,
        timeout: str = "",
    ) -> tuple[str | None, str | None]:
        """Add a Browser item (type 26). JavaScript browser automation on Zabbix server (7.x+)."""
        if not self.zapi:
            return None, "Zabbix API not connected."
        if not params.strip():
            return None, "Browser script code is required."
        try:
            host_data = self.zapi.host.get(filter={"host": [hostname]}, output=["hostid"])
            if not host_data:
                return None, f"Host '{hostname}' not found."
            host_id = host_data[0]["hostid"]
            kwargs: dict = dict(
                name=item_name, key_=item_key, hostid=host_id,
                type=26, value_type=value_type,
                params=params,
                delay=delay or "1m", history=history or "31d", trends=trends or "365d",
                status=status,
            )
            if parameters:
                kwargs["parameters"] = [{"name": p["name"], "value": p.get("value", "")} for p in parameters if p.get("name")]
            if units:
                kwargs["units"] = units
            if description:
                kwargs["description"] = description
            if timeout:
                kwargs["timeout"] = timeout
            if team_name:
                kwargs["tags"] = [{"tag": "team", "value": team_name}]
            result = self.zapi.item.create(**kwargs)
            item_id = result["itemids"][0]
            logger.info("Browser item %r (%s) added to %r (ID: %s).", item_name, item_key, hostname, item_id)
            return item_id, None
        except Exception as e:
            logger.error("add_browser_item(%r) failed: %r", hostname, e)
            return None, str(e)

    # ------------------------------------------------------------------

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