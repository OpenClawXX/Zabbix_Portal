import logging

from Zabbix_Base import Zabbix_Base

logger = logging.getLogger(__name__)

GUI_ACCESS = {0: "Default", 1: "Internal", 2: "LDAP", 3: "Disabled"}
USERS_STATUS = {0: "Enabled", 1: "Disabled"}


class ZabbixAdmin_Manager(Zabbix_Base):
    def __init__(self):
        super().__init__()
        logger.info("ZabbixAdmin Manager ready.")

    # ── User Groups ────────────────────────────────────────────────────

    def list_user_groups(self) -> list[dict]:
        if not self.zapi:
            return []
        try:
            groups = self.zapi.usergroup.get(
                output=["usrgrpid", "name", "gui_access", "users_status"],
                selectUsers=["userid", "username"],
                sortfield="name",
            )
            return [
                {
                    "usrgrpid": g["usrgrpid"],
                    "name": g["name"],
                    "gui_access": int(g["gui_access"]),
                    "gui_access_label": GUI_ACCESS.get(int(g["gui_access"]), "Default"),
                    "users_status": int(g["users_status"]),
                    "users_status_label": USERS_STATUS.get(int(g["users_status"]), "Enabled"),
                    "user_count": len(g.get("users", [])),
                    "users": g.get("users", []),
                }
                for g in groups
            ]
        except Exception as e:
            logger.exception("list_user_groups failed")
            raise RuntimeError(str(e))

    def list_zabbix_users(self) -> list[dict]:
        if not self.zapi:
            return []
        try:
            users = self.zapi.user.get(
                output=["userid", "username", "name", "surname"],
                sortfield="username",
            )
            return [
                {
                    "userid": u["userid"],
                    "username": u["username"],
                    "display": f"{u.get('name','')} {u.get('surname','')}".strip() or u["username"],
                }
                for u in users
            ]
        except Exception as e:
            logger.error("list_zabbix_users failed: %r", e)
            return []

    def create_user_group(
        self,
        name: str,
        gui_access: int = 0,
        users_status: int = 0,
        debug_mode: int = 0,
        userids: list[str] | None = None,
        hostgroup_rights: list[dict] | None = None,
        templategroup_rights: list[dict] | None = None,
        tag_filters: list[dict] | None = None,
    ) -> str:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            params: dict = {
                "name": name,
                "gui_access": gui_access,
                "users_status": users_status,
                "debug_mode": debug_mode,
            }
            if userids:
                params["userids"] = userids
            if hostgroup_rights:
                params["hostgroup_rights"] = [
                    {"id": r["id"], "permission": r["permission"]}
                    for r in hostgroup_rights if r.get("id")
                ]
            if templategroup_rights:
                params["templategroup_rights"] = [
                    {"id": r["id"], "permission": r["permission"]}
                    for r in templategroup_rights if r.get("id")
                ]
            if tag_filters:
                params["tag_filters"] = [
                    {"groupid": f["groupid"], "tag": f.get("tag", ""), "value": f.get("value", "")}
                    for f in tag_filters if f.get("groupid")
                ]
            result = self.zapi.usergroup.create(**params)
            return result["usrgrpids"][0]
        except Exception as e:
            raise RuntimeError(str(e))

    def delete_user_group(self, usrgrpid: str) -> bool:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            self.zapi.usergroup.delete([usrgrpid])
            return True
        except Exception as e:
            raise RuntimeError(str(e))

    # ── Proxy CRUD ────────────────────────────────────────────────────

    def create_proxy(self, name: str, operating_mode: int = 0, description: str = "") -> str:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            result = self.zapi.proxy.create(name=name, operating_mode=operating_mode, description=description)
            return result["proxyids"][0]
        except Exception as e:
            raise RuntimeError(str(e))

    def update_proxy(self, proxyid: str, name: str, description: str = "") -> bool:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            self.zapi.proxy.update(proxyid=proxyid, name=name, description=description)
            return True
        except Exception as e:
            raise RuntimeError(str(e))

    def delete_proxy(self, proxyid: str) -> bool:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            self.zapi.proxy.delete([proxyid])
            return True
        except Exception as e:
            raise RuntimeError(str(e))

    # ── Roles ──────────────────────────────────────────────────────────

    def list_roles(self) -> list[dict]:
        if not self.zapi:
            return []
        try:
            roles = self.zapi.role.get(
                output=["roleid", "name", "type", "readonly"],
                selectRules="extend",
                sortfield="name",
            )
            USER_TYPES = {1: "User", 2: "Admin", 3: "Super admin"}
            return [
                {
                    "roleid": r["roleid"],
                    "name": r["name"],
                    "type": int(r["type"]),
                    "type_label": USER_TYPES.get(int(r["type"]), "User"),
                    "readonly": int(r.get("readonly", 0)),
                    "rule_count": len(r.get("rules", [])) if isinstance(r.get("rules"), list) else 0,
                }
                for r in roles
            ]
        except Exception as e:
            logger.exception("list_roles failed")
            raise RuntimeError(str(e))

    def create_role(
        self,
        name: str,
        role_type: int = 1,
        ui_access: dict[str, bool] | None = None,
        ui_default_access: int = 1,
        services_read_mode: int = 0,
        services_write_mode: int = 0,
        modules_default_access: int = 1,
        api_access: int = 1,
    ) -> str:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            params: dict = {"name": name, "type": role_type}
            rules: dict = {
                "ui.default_access": str(ui_default_access),
                "services.read.mode": str(services_read_mode),
                "services.write.mode": str(services_write_mode),
                "modules.default_access": str(modules_default_access),
                "api.access": str(api_access),
                "api.mode": "0",
            }
            if ui_access is not None:
                rules["ui"] = [
                    {"name": element, "status": "1" if enabled else "0"}
                    for element, enabled in ui_access.items()
                ]
            params["rules"] = rules
            result = self.zapi.role.create(**params)
            return result["roleids"][0]
        except Exception as e:
            raise RuntimeError(str(e))

    def update_role(self, roleid: str, name: str) -> bool:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            self.zapi.role.update(roleid=roleid, name=name)
            return True
        except Exception as e:
            raise RuntimeError(str(e))

    def delete_role(self, roleid: str) -> bool:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            self.zapi.role.delete([roleid])
            return True
        except Exception as e:
            raise RuntimeError(str(e))

    # ── API Tokens ────────────────────────────────────────────────────

    def list_api_tokens(self) -> list[dict]:
        if not self.zapi:
            return []
        try:
            tokens = self.zapi.token.get(
                output=["tokenid", "name", "userid", "status", "expires_at", "created_at", "lastaccess"],
                sortfield="name",
            )
            # Build userid → username map for display
            try:
                uids = list({t["userid"] for t in tokens})
                users = self.zapi.user.get(output=["userid", "username"], userids=uids) if uids else []
                uid_map = {u["userid"]: u.get("username", "") for u in users}
            except Exception:
                uid_map = {}
            return [
                {
                    "tokenid": t["tokenid"],
                    "name": t["name"],
                    "userid": t["userid"],
                    "username": uid_map.get(t["userid"], t["userid"]),
                    "status": int(t["status"]),
                    "expires_at": int(t.get("expires_at", 0)),
                    "created_at": int(t.get("created_at", 0)),
                    "lastaccess": int(t.get("lastaccess", 0)),
                }
                for t in tokens
            ]
        except Exception as e:
            logger.warning("list_api_tokens failed (may need Super Admin rights): %s", e)
            return []

    def create_api_token(self, name: str, userid: str, expires_at: int = 0) -> tuple[str, str | None]:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            params: dict = {"name": name, "userid": userid, "status": 0}
            if expires_at:
                params["expires_at"] = expires_at
            result = self.zapi.token.create(**params)
            tokenid = result["tokenids"][0]
            gen = self.zapi.token.generate([tokenid])
            token_value = gen[0]["token"] if gen else None
            return tokenid, token_value
        except Exception as e:
            raise RuntimeError(str(e))

    def delete_api_token(self, tokenid: str) -> bool:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            self.zapi.token.delete([tokenid])
            return True
        except Exception as e:
            raise RuntimeError(str(e))

    # ── Proxy Groups (Zabbix 7.x) ─────────────────────────────────────

    def list_proxy_groups(self) -> list[dict]:
        if not self.zapi:
            return []
        try:
            groups = self.zapi.proxygroup.get(
                output=["proxygroupid", "name", "failover_delay", "min_online", "description"],
                selectProxies=["proxyid", "name"],
                sortfield="name",
            )
            return [
                {
                    "proxygroupid": g["proxygroupid"],
                    "name": g["name"],
                    "failover_delay": g.get("failover_delay", "1m"),
                    "min_online": int(g.get("min_online", 1)),
                    "description": g.get("description", ""),
                    "proxy_count": len(g.get("proxies", [])),
                }
                for g in groups
            ]
        except Exception as e:
            logger.warning("list_proxy_groups failed (requires Zabbix 7.x): %s", e)
            return []

    def create_proxy_group(
        self, name: str, failover_delay: str = "1m", min_online: int = 1, description: str = ""
    ) -> str:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            result = self.zapi.proxygroup.create(
                name=name,
                failover_delay=failover_delay,
                min_online=min_online,
                description=description,
            )
            return result["proxygroupids"][0]
        except Exception as e:
            raise RuntimeError(str(e))

    def delete_proxy_group(self, proxygroupid: str) -> bool:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            self.zapi.proxygroup.delete([proxygroupid])
            return True
        except Exception as e:
            raise RuntimeError(str(e))

    # ── Proxies ────────────────────────────────────────────────────────

    def list_proxies(self) -> list[dict]:
        if not self.zapi:
            return []
        try:
            # Zabbix 7.x uses different proxy fields
            try:
                proxies = self.zapi.proxy.get(
                    output=["proxyid", "name", "operating_mode", "description", "lastaccess", "version", "compatibility"],
                    selectHosts="count",
                    sortfield="name",
                )
                MODE_LABELS = {0: "Active", 1: "Passive"}
                return [
                    {
                        "proxyid": p["proxyid"],
                        "name": p["name"],
                        "mode": int(p.get("operating_mode", 0)),
                        "mode_label": MODE_LABELS.get(int(p.get("operating_mode", 0)), "Active"),
                        "description": p.get("description", ""),
                        "lastaccess": int(p.get("lastaccess", 0)),
                        "version": p.get("version", ""),
                        "host_count": int(p.get("hosts", 0)),
                    }
                    for p in proxies
                ]
            except Exception:
                # Fallback for older Zabbix versions
                proxies = self.zapi.proxy.get(
                    output=["proxyid", "host", "status", "description", "lastaccess"],
                    selectHosts="count",
                    sortfield="host",
                )
                return [
                    {
                        "proxyid": p["proxyid"],
                        "name": p.get("host", p.get("name", "")),
                        "mode": 0 if int(p.get("status", 5)) == 5 else 1,
                        "mode_label": "Active" if int(p.get("status", 5)) == 5 else "Passive",
                        "description": p.get("description", ""),
                        "lastaccess": int(p.get("lastaccess", 0)),
                        "version": "",
                        "host_count": int(p.get("hosts", 0)),
                    }
                    for p in proxies
                ]
        except Exception as e:
            logger.exception("list_proxies failed")
            raise RuntimeError(str(e))

    # ── Macros ────────────────────────────────────────────────────────

    def list_global_macros(self) -> list[dict]:
        if not self.zapi:
            return []
        try:
            macros = self.zapi.usermacro.get(
                output=["globalmacroid", "macro", "value", "type", "description"],
                globalmacro=True,
                sortfield="macro",
            )
            MACRO_TYPES = {0: "Text", 1: "Secret text", 2: "Vault secret"}
            return [
                {
                    "globalmacroid": m["globalmacroid"],
                    "macro": m["macro"],
                    "value": m["value"] if int(m.get("type", 0)) == 0 else "••••••",
                    "type": int(m.get("type", 0)),
                    "type_label": MACRO_TYPES.get(int(m.get("type", 0)), "Text"),
                    "description": m.get("description", ""),
                }
                for m in macros
            ]
        except Exception as e:
            logger.exception("list_global_macros failed")
            raise RuntimeError(str(e))

    def create_global_macro(self, macro: str, value: str, description: str = "", macro_type: int = 0) -> str:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        if not macro.startswith("{$"):
            macro = "{$" + macro.strip("{$}") + "}"
        try:
            result = self.zapi.usermacro.createglobal(macro=macro, value=value, description=description, type=macro_type)
            return result["globalmacroids"][0]
        except Exception as e:
            raise RuntimeError(str(e))

    def update_global_macro(self, globalmacroid: str, value: str, description: str = "") -> bool:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            self.zapi.usermacro.updateglobal(globalmacroid=globalmacroid, value=value, description=description)
            return True
        except Exception as e:
            raise RuntimeError(str(e))

    def delete_global_macro(self, globalmacroid: str) -> bool:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            self.zapi.usermacro.deleteglobal([globalmacroid])
            return True
        except Exception as e:
            raise RuntimeError(str(e))

    # ── Authentication settings ───────────────────────────────────────

    def get_auth_settings(self) -> dict:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            return self.zapi.authentication.get(output="extend")
        except Exception as e:
            raise RuntimeError(str(e))

    def update_auth_settings(self, params: dict) -> bool:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            self.zapi.authentication.update(**params)
            return True
        except Exception as e:
            raise RuntimeError(str(e))

    # ── Queue ─────────────────────────────────────────────────────────

    def get_queue_overview(self) -> dict:
        if not self.zapi:
            return {"items": [], "total": 0}
        # queue.get was removed in Zabbix 7.0
        if self._zabbix_version >= (7, 0):
            return {"items": [], "total": 0, "error": f"Queue API was removed in Zabbix {self._zabbix_version[0]}.x. Check the item queue directly in the Zabbix web UI under Administration → Queue."}
        try:
            overview = self.zapi.queue.get(output="extend", limit=500)
            # Enrich with host + item names
            item_ids = [o["itemid"] for o in overview if o.get("itemid")]
            name_map: dict[str, dict] = {}
            if item_ids:
                try:
                    items = self.zapi.item.get(
                        itemids=item_ids,
                        output=["itemid", "name"],
                        selectHosts=["host"],
                    )
                    for it in items:
                        host = (it.get("hosts") or [{}])[0].get("host", "")
                        name_map[it["itemid"]] = {"item_name": it["name"], "hostname": host}
                except Exception:
                    pass
            enriched = []
            for o in overview:
                info = name_map.get(o.get("itemid", ""), {})
                enriched.append({**o, **info})
            enriched.sort(key=lambda x: int(x.get("nextcheck", 0)))
            return {"items": enriched, "total": len(enriched)}
        except Exception as e:
            logger.warning("queue.get failed: %s", e)
            return {"items": [], "total": 0, "error": str(e)}

    # ── Housekeeping / Settings ────────────────────────────────────────

    def get_settings(self) -> dict:
        if not self.zapi:
            return {}
        try:
            settings = self.zapi.settings.get(output="extend")
            return settings
        except Exception as e:
            logger.exception("get_settings failed")
            raise RuntimeError(str(e))

    def update_housekeeping(self, params: dict) -> bool:
        if not self.zapi:
            raise RuntimeError("Zabbix not connected")
        try:
            self.zapi.settings.update(**params)
            return True
        except Exception as e:
            raise RuntimeError(str(e))
