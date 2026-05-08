from ZabbixBase import ZabbixBase

class Item_Manager(ZabbixBase):
    def __init__(self):
        super().__init__()
        print("Item Manager ready.")

    def add_item(self, hostname, item_name, item_key, value_type=3):
        """
        Adds a new monitoring item to an existing host.
        value_type: 0=float, 1=string, 2=log, 3=integer, 4=text
        """
        if not self.zapi:
            print("❌ No API connection available.")
            return None

        try:
            # 1. Resolve host ID
            host_data = self.zapi.host.get(
                filter={"host": [hostname]},
                output=["hostid"]
            )
            if not host_data:
                print(f"⚠️ Host '{hostname}' not found.")
                return None

            host_id = host_data[0]['hostid']

            # 2. Resolve interface ID
            interfaces = self.zapi.hostinterface.get(hostids=host_id)
            if not interfaces:
                print(f"⚠️ No interfaces found for host '{hostname}'.")
                return None
            interface_id = interfaces[0]['interfaceid']

            # 3. Create the item
            result = self.zapi.item.create(
                name=item_name,
                key_=item_key,
                hostid=host_id,
                interfaceid=interface_id,
                type=0,              # Zabbix Agent (Passive)
                value_type=value_type,
                delay="1m"
            )
            item_id = result['itemids'][0]
            print(f"✅ Item '{item_name}' (key: {item_key}) added to '{hostname}' (ID: {item_id})")
            return item_id

        except Exception as e:
            print(f"❌ Item Creation Failed: {repr(e)}")
            return None

    def add_trigger(self, hostname, item_key, trigger_name, threshold, operator=">", priority=3):
        """
        Adds a trigger for a host item.
        Example expression: {myhost:system.cpu.load.last()}>5
        priority: 0=Not classified, 1=Information, 2=Warning, 3=Average, 4=High, 5=Disaster
        """
        if not self.zapi:
            print("❌ No API connection available.")
            return None

        valid_operators = {">", "<", ">=", "<=", "=", "<>"}
        if operator not in valid_operators:
            print(f"❌ Invalid operator '{operator}'.")
            return None

        try:
            # Verify the host exists.
            host_data = self.zapi.host.get(
                filter={"host": [hostname]},
                output=["hostid"]
            )
            if not host_data:
                print(f"⚠️ Host '{hostname}' not found.")
                return None

            # Verify the item exists on this host.
            item_data = self.zapi.item.get(
                hostids=host_data[0]["hostid"],
                filter={"key_": [item_key]},
                output=["itemid", "name", "key_"]
            )
            if not item_data:
                print(f"⚠️ Item key '{item_key}' was not found on host '{hostname}'.")
                return None

            expression = f"{{{hostname}:{item_key}.last()}}{operator}{threshold}"
            result = self.zapi.trigger.create(
                description=trigger_name,
                expression=expression,
                priority=int(priority)
            )
            trigger_id = result["triggerids"][0]
            print(f"✅ Trigger '{trigger_name}' created on '{hostname}' (ID: {trigger_id})")
            return trigger_id

        except Exception as e:
            print(f"❌ Trigger Creation Failed: {repr(e)}")
            return None