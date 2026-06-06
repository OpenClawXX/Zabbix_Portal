from Zabbix_Base import Zabbix_Base


class Item_Manager(Zabbix_Base):
    def __init__(self):
        super().__init__()
        print("Item Manager ready.")

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
            print(f"✅ Item '{item_name}' (key: {item_key}) added to '{hostname}' (ID: {item_id})")
            return item_id, None

        except Exception as e:
            msg = str(e)
            print(f"❌ Item Creation Failed: {repr(e)}")
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
            print(f"✅ Trigger '{trigger_name}' created on '{hostname}' (ID: {trigger_id})")
            return trigger_id, None

        except Exception as e:
            msg = str(e)
            print(f"❌ Trigger Creation Failed: {repr(e)}")
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
            print(f"❌ list_items failed: {repr(e)}")
            return []

    def delete_item(self, itemid: str) -> bool:
        """Delete an item by ID."""
        if not self.zapi:
            return False
        try:
            self.zapi.item.delete([itemid])
            print(f"🗑️ Deleted item ID {itemid}")
            return True
        except Exception as e:
            print(f"❌ delete_item failed: {repr(e)}")
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
            print(f"❌ list_triggers failed: {repr(e)}")
            return []

    def delete_trigger(self, triggerid: str) -> bool:
        """Delete a trigger by ID."""
        if not self.zapi:
            return False
        try:
            self.zapi.trigger.delete([triggerid])
            print(f"🗑️ Deleted trigger ID {triggerid}")
            return True
        except Exception as e:
            print(f"❌ delete_trigger failed: {repr(e)}")
            return False
