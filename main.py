from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from io import BytesIO
import pandas as pd

from Host_Manager import Host_Manager
from Item_Manager import Item_Manager

# ── App & Managers ────────────────────────────────────────────────────
app = FastAPI(
    title="Zabbix DevOps API",
    description="Manage Zabbix hosts and items via REST",
    version="1.0.0"
)
host_bot = Host_Manager()
item_bot = Item_Manager()

# ── Request Schemas ───────────────────────────────────────────────────

class HostRequest(BaseModel):
    hostname: str
    ip: str
    template: Optional[str] = "Linux by Zabbix agent"

class ItemRequest(BaseModel):
    hostname: str
    item_name: str
    item_key: str
    value_type: Optional[int] = 3   # 3 = integer (most common)

class TriggerRequest(BaseModel):
    hostname: str
    item_key: str
    trigger_name: str
    threshold: float
    operator: Optional[str] = ">"
    severity: Optional[int] = 3

# ── Routes ────────────────────────────────────────────────────────────

@app.get("/health", tags=["Status"], summary="API Health Check")
def health():
    """Returns whether the API is up and connected to Zabbix."""
    return {"status": "online", "zabbix_connected": host_bot.zapi is not None}


@app.get("/hosts", tags=["Hosts"], summary="List All Hosts")
def get_all_hosts():
    """Returns all hosts from Zabbix."""
    hosts = host_bot.get_hosts()
    return {"count": len(hosts), "hosts": hosts}


@app.get("/hosts/download", tags=["Hosts"], summary="Download Host Inventory (.xlsx)")
def download_inventory():
    """Generates an Excel file of all hosts and triggers a download."""
    excel_bytes = host_bot.export_hosts_to_excel_bytes()
    if not excel_bytes:
        raise HTTPException(status_code=500, detail="Failed to generate Excel file.")
    headers = {"Content-Disposition": 'attachment; filename="Zabbix_Inventory.xlsx"'}
    return StreamingResponse(
        content=iter([excel_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@app.post("/hosts", tags=["Hosts"], summary="Create New Host", status_code=201)
def create_host(data: HostRequest):
    """Creates a new Zabbix host with an agent interface."""
    result = host_bot.create_server(data.hostname, data.ip, template_name=data.template)
    if not result:
        raise HTTPException(status_code=400, detail="Failed to create host. Check logs.")
    return {"message": "Host created successfully.", "hostid": result}


@app.post("/hosts/bulk", tags=["Hosts"], summary="Bulk Create Hosts from CSV/XLSX", status_code=201)
async def bulk_create_hosts(file: UploadFile = File(...)):
    """Creates multiple hosts from a CSV/XLSX file with columns: hostname, ip, template(optional)."""
    filename = (file.filename or "").lower()
    if not filename.endswith((".csv", ".xlsx")):
        raise HTTPException(status_code=400, detail="Unsupported file type. Use .csv or .xlsx")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(BytesIO(content))
        else:
            df = pd.read_excel(BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {exc}") from exc

    normalized = {str(c).strip().lower(): c for c in df.columns}
    hostname_col = normalized.get("hostname") or normalized.get("host")
    ip_col = normalized.get("ip") or normalized.get("ip_address")
    template_col = normalized.get("template")

    if not hostname_col or not ip_col:
        raise HTTPException(
            status_code=400,
            detail="File must contain hostname (or host) and ip (or ip_address) columns.",
        )

    created: list[dict] = []
    failed: list[dict] = []
    default_template = "Linux by Zabbix agent"

    for idx, row in df.iterrows():
        hostname = str(row.get(hostname_col, "")).strip()
        ip = str(row.get(ip_col, "")).strip()
        template = str(row.get(template_col, "")).strip() if template_col else ""
        if not hostname or hostname.lower() == "nan" or not ip or ip.lower() == "nan":
            failed.append({"row": int(idx) + 2, "reason": "Missing hostname/ip"})
            continue

        hostid = host_bot.create_server(hostname, ip, template_name=template or default_template)
        if hostid:
            created.append({"row": int(idx) + 2, "hostname": hostname, "hostid": hostid})
        else:
            failed.append({"row": int(idx) + 2, "hostname": hostname, "reason": "Zabbix create failed"})

    return {
        "message": "Bulk host import completed.",
        "total_rows": int(len(df)),
        "created_count": len(created),
        "failed_count": len(failed),
        "created": created,
        "failed": failed,
    }


@app.delete("/hosts/{hostname}", tags=["Hosts"], summary="Delete Host")
def delete_host(hostname: str):
    """Deletes a host from Zabbix by its technical name."""
    success = host_bot.delete_server(hostname)
    if not success:
        raise HTTPException(status_code=404, detail=f"Host '{hostname}' not found or deletion failed.")
    return {"message": f"Host '{hostname}' deleted successfully."}


@app.post("/items", tags=["Items"], summary="Add Monitoring Item", status_code=201)
def add_item(data: ItemRequest):
    """Adds a monitoring item (metric) to an existing host."""
    result = item_bot.add_item(data.hostname, data.item_name, data.item_key, data.value_type)
    if not result:
        raise HTTPException(status_code=400, detail="Failed to add item. Check host name and key.")
    return {"message": "Item added successfully.", "itemid": result}


@app.post("/triggers", tags=["Triggers"], summary="Add Trigger to Item", status_code=201)
def add_trigger(data: TriggerRequest):
    """Adds a trigger to an existing host item."""
    result = item_bot.add_trigger(
        hostname=data.hostname,
        item_key=data.item_key,
        trigger_name=data.trigger_name,
        threshold=data.threshold,
        operator=data.operator or ">",
        priority=data.severity or 3,
    )
    if not result:
        raise HTTPException(
            status_code=400,
            detail="Failed to add trigger. Check host, item key, operator, and threshold.",
        )
    return {"message": "Trigger added successfully.", "triggerid": result}


# ── Runner ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=6769)