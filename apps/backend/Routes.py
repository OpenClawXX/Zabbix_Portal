import os
from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import FileResponse

router = APIRouter()

def init_routes(host_manager, item_manager):
    """
    This function "injects" the managers into the routes.
    It returns the router to be included in main.py.
    """

    # --- INVENTORY / EXCEL ---
    @router.get("/download-inventory", tags=["Reports"], summary="Download Host Inventory")
    async def download_inventory():
        """Generates an Excel file of all hosts and triggers a browser download."""
        file_path = os.path.abspath("zabbix_inventory.xlsx")
        try:
            host_manager.export_hosts_to_excel(file_path)
            if not os.path.exists(file_path):
                raise HTTPException(status_code=500, detail="File generation failed.")
            
            return FileResponse(
                path=file_path,
                filename="Zabbix_Inventory_Report.xlsx",
                media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Export Error: {str(e)}")

    # --- HOST MANAGEMENT ---
    @router.post("/api/hosts", tags=["Hosts"], summary="Create New Host")
    async def create_host(data: dict = Body(...)):
        """Creates a new host with basic SNMP/Agent interface."""
        try:
            return host_manager.add_host(data['hostname'], data['ip'], data['group_id'])
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.delete("/api/hosts/{hostname}", tags=["Hosts"], summary="Delete Host")
    async def delete_host(hostname: str):
        """Removes a host from Zabbix using its visible name."""
        try:
            res = host_manager.delete_host(hostname)
            return {"status": "success", "deleted_ids": res}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # --- ITEM & MONITORING ---
    @router.post("/api/items", tags=["Items"], summary="Create Simple Item")
    async def create_item(data: dict = Body(...)):
        """Creates a specific item key for a host."""
        try:
            return item_manager.add_item(data['hostname'], data['item_key'], data['item_name'])
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/api/configure-monitoring", tags=["Monitoring"], summary="Smart Item & Trigger")
    async def monitor(data: dict = Body(...)):
        """
        Smart Logic:
        1. Checks if item exists (creates if not).
        2. Configures a threshold trigger.
        """
        try:
            res = item_manager.configure_monitoring(
                hostname=data['hostname'], 
                item_key=data['item_key'], 
                item_name=data['item_name'], 
                threshold=data['threshold'],
                severity=data.get('severity', 3)
            )
            return res
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    return router