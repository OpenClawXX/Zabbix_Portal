"use client";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type Host, type HostInterface, api } from "../app/api";

const IFACE_TYPE_LABEL: Record<string, string> = {
  "1": "Agent",
  "2": "SNMP",
  "3": "IPMI",
  "4": "JMX",
};

const AVAIL_CONFIG: Record<string, { color: string; label: string }> = {
  "1": { color: "#22C55E", label: "Connected" },
  "2": { color: "#EF4444", label: "Disconnected" },
  "0": { color: "#94A3B8", label: "Unknown" },
};

const AgentCell = ({ interfaces }: { interfaces?: HostInterface[] }) => {
  if (!interfaces || interfaces.length === 0) {
    return <Typography variant="caption" color="text.disabled">No interface</Typography>;
  }
  const iface = interfaces.find((i) => i.type === "1") ?? interfaces[0];
  const typeLabel = IFACE_TYPE_LABEL[iface.type] ?? `Type ${iface.type}`;
  const avail = AVAIL_CONFIG[iface.available] ?? AVAIL_CONFIG["0"];
  return (
    <Tooltip title={`${typeLabel} · ${iface.ip}:${iface.port} · ${avail.label}`}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: avail.color,
            flexShrink: 0,
            boxShadow: `0 0 4px ${avail.color}80`,
          }}
        />
        <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
          {typeLabel}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.72rem" }}>
          {avail.label}
        </Typography>
      </Box>
    </Tooltip>
  );
};
import { useSync } from "../app/context/SyncContext";

export const Hosts = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { lastSync } = useSync();
  const [hostname, setHostname] = useState("");
  const [ip, setIp] = useState("");
  const [template, setTemplate] = useState("Linux by Zabbix agent");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Host | null>(null);

  const showToast = useCallback((message: string, severity: "success" | "error") => {
    setToast({ open: true, message, severity });
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listHosts();
      setHosts(res.hosts);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: lastSync triggers re-fetch on sync events
  useEffect(() => {
    void reload();
  }, [reload, lastSync]);

  const onCreate = async () => {
    try {
      await api.createHost({ hostname, ip, template });
      showToast("Host added successfully.", "success");
      setHostname("");
      setIp("");
      await reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const onDelete = useCallback(
    async (h: Host) => {
      try {
        await api.deleteHost(h.host);
        showToast(`Host '${h.host}' deleted successfully.`, "success");
        setConfirmDelete(null);
        await reload();
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e), "error");
      }
    },
    [reload, showToast],
  );

  const onBulkUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const res = await api.bulkCreateHosts(uploadFile);
      if (res.failed_count > 0) {
        showToast(
          `Imported with warnings: ${res.created_count} created, ${res.failed_count} failed.`,
          "error",
        );
      } else {
        showToast(`Bulk import successful: ${res.created_count} hosts created.`, "success");
      }
      setUploadFile(null);
      await reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setUploading(false);
    }
  };

  const pickUploadFile = (file: File | null) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) {
      showToast("Only .csv and .xlsx files are supported.", "error");
      return;
    }
    setUploadFile(file);
  };

  const rows = useMemo(() => hosts.map((h) => ({ id: h.hostid, ...h })), [hosts]);

  const columns = useMemo<GridColDef[]>(
    () => [
      { field: "host", headerName: "Technical name", flex: 1, minWidth: 180 },
      { field: "name", headerName: "Visible name", flex: 1, minWidth: 200 },
      {
        field: "status",
        headerName: "Status",
        width: 140,
        renderCell: (params) => (
          <Chip
            size="small"
            variant="outlined"
            label={params.value === "0" ? "Enabled" : "Disabled"}
            color={params.value === "0" ? "success" : "default"}
          />
        ),
      },
      {
        field: "interfaces",
        headerName: "Agent",
        width: 200,
        sortable: false,
        filterable: false,
        renderCell: (params) => <AgentCell interfaces={params.value as HostInterface[]} />,
      },
      {
        field: "actions",
        headerName: "",
        width: 90,
        sortable: false,
        filterable: false,
        renderCell: (params) => (
          <IconButton aria-label="Delete host" size="small" onClick={() => setConfirmDelete(params.row as Host)}>
            <DeleteOutlineOutlinedIcon fontSize="small" />
          </IconButton>
        ),
      },
    ],
    [onDelete],
  );

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <ComputerOutlinedIcon sx={{ fontSize: 28, color: "primary.main" }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Hosts
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create, review, and delete hosts in Zabbix.
          </Typography>
        </Box>
      </Box>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Create host
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Fill host details, then push directly to Zabbix.
            </Typography>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Hostname"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                fullWidth
              />
              <TextField
                label="IP address"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Template"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                fullWidth
              />
            </Stack>
            <Box>
              <Button variant="contained" onClick={onCreate} disabled={!hostname || !ip}>
                Create host
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Bulk import hosts
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Upload a{" "}
              <Box component="code" sx={{ fontFamily: "monospace", fontSize: "0.85em" }}>.csv</Box>
              {" or "}
              <Box component="code" sx={{ fontFamily: "monospace", fontSize: "0.85em" }}>.xlsx</Box>
              {" with columns: "}
              <Box component="code" sx={{ fontFamily: "monospace", fontSize: "0.85em" }}>hostname</Box>
              {" (or "}
              <Box component="code" sx={{ fontFamily: "monospace", fontSize: "0.85em" }}>host</Box>
              {"), "}
              <Box component="code" sx={{ fontFamily: "monospace", fontSize: "0.85em" }}>ip</Box>
              {" (or "}
              <Box component="code" sx={{ fontFamily: "monospace", fontSize: "0.85em" }}>ip_address</Box>
              {"), optional "}
              <Box component="code" sx={{ fontFamily: "monospace", fontSize: "0.85em" }}>template</Box>
              .
            </Typography>
            <Box
              component="label"
              htmlFor="bulk-upload-input"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                pickUploadFile(e.dataTransfer.files?.[0] ?? null);
              }}
              sx={{
                border: "2px dashed",
                borderColor: dragActive ? "primary.main" : "divider",
                borderRadius: 3,
                p: 2.5,
                bgcolor: dragActive ? "rgba(59,130,246,0.06)" : "action.hover",
                transition: "all 0.2s ease",
                cursor: "pointer",
                display: "block",
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Drag & drop your file here, or click to choose a file.
              </Typography>
            </Box>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              sx={{ alignItems: { md: "center" } }}
            >
              <Button variant="outlined" component="label" htmlFor="bulk-upload-input">
                Choose file
                <input
                  id="bulk-upload-input"
                  hidden
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(e) => pickUploadFile(e.target.files?.[0] ?? null)}
                />
              </Button>
              <Typography color="text.secondary" variant="body2" sx={{ flex: 1 }}>
                {uploadFile ? uploadFile.name : "No file selected"}
              </Typography>
              <Button
                variant="contained"
                onClick={onBulkUpload}
                disabled={!uploadFile || uploading}
              >
                {uploading ? "Importing..." : "Import hosts"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={1.5}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
                Hosts inventory
              </Typography>
              <IconButton size="small" onClick={reload} aria-label="Refresh">
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Box>
            <Divider />
            <Box sx={{ height: 520 }}>
              <DataGrid
                rows={rows}
                columns={columns}
                loading={loading}
                disableRowSelectionOnClick
                pageSizeOptions={[10, 25, 50]}
                initialState={{
                  pagination: { paginationModel: { pageSize: 10, page: 0 } },
                }}
                sx={{
                  border: "none",
                  "& .MuiDataGrid-columnHeaders": {
                    backgroundColor: isDark ? "rgba(11,22,40,0.6)" : "rgba(241,245,249,0.9)",
                    borderBottom: isDark
                      ? "1px solid rgba(255,255,255,0.07)"
                      : "1px solid rgba(15,23,42,0.08)",
                  },
                  "& .MuiDataGrid-cell": {
                    borderBottom: isDark
                      ? "1px solid rgba(255,255,255,0.04)"
                      : "1px solid rgba(15,23,42,0.06)",
                  },
                  "& .MuiDataGrid-row:hover": {
                    backgroundColor: isDark ? "rgba(59,130,246,0.06)" : "rgba(59,130,246,0.04)",
                  },
                }}
              />
            </Box>
          </Stack>
        </CardContent>
      </Card>
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete host?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will permanently remove <strong>{confirmDelete?.host}</strong> from Zabbix. This
            action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => confirmDelete && onDelete(confirmDelete)}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          severity={toast.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
};
