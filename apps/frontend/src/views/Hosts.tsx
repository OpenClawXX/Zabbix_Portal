"use client";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type Host, api } from "../app/api";

export const Hosts = () => {
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

  useEffect(() => {
    void reload();
  }, [reload]);

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
        field: "actions",
        headerName: "",
        width: 90,
        sortable: false,
        filterable: false,
        renderCell: (params) => (
          <IconButton aria-label="Delete" size="small" onClick={() => onDelete(params.row as Host)}>
            <DeleteOutlineOutlinedIcon fontSize="small" />
          </IconButton>
        ),
      },
    ],
    [onDelete],
  );

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Hosts
        </Typography>
        <Typography color="text.secondary">Create, review, and delete hosts in Zabbix.</Typography>
      </Box>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
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
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              Bulk import hosts
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Upload a `.csv` or `.xlsx` with columns: `hostname` (or `host`), `ip` (or
              `ip_address`), optional `template`.
            </Typography>
            <Box
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
                borderColor: dragActive ? "primary.main" : "rgba(148,163,184,0.45)",
                borderRadius: 3,
                p: 2.5,
                bgcolor: dragActive ? "rgba(34,211,238,0.08)" : "rgba(15,23,42,0.24)",
                transition: "all 0.2s ease",
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Drag & drop your file here, or click "Choose file".
              </Typography>
            </Box>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={2}
              sx={{ alignItems: { md: "center" } }}
            >
              <Button variant="outlined" component="label">
                Choose file
                <input
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
              <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>
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
                    borderBottom: "1px solid rgba(148,163,184,0.24)",
                    backgroundColor: "rgba(15,23,42,0.45)",
                  },
                  "& .MuiDataGrid-cell": {
                    borderBottom: "1px solid rgba(148,163,184,0.18)",
                  },
                  "& .MuiDataGrid-row:hover": {
                    backgroundColor: "rgba(51,65,85,0.28)",
                  },
                }}
              />
            </Box>
          </Stack>
        </CardContent>
      </Card>
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
