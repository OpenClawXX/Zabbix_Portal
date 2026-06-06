"use client";
import AddIcon from "@mui/icons-material/Add";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import RouterOutlinedIcon from "@mui/icons-material/RouterOutlined";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  LinearProgress,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type Host, type HostInterface, type HostTag, api } from "../app/api";
import { useSync } from "../app/context/SyncContext";

const IFACE_BADGE: Record<string, string> = {
  "1": "ZBX",
  "2": "SNM",
  "3": "IPMI",
  "4": "JMX",
};

const AVAIL_CONFIG: Record<string, { bg: string; border: string; text: string; label: string }> = {
  "1": { bg: "#16a34a", border: "#16a34a", text: "#fff", label: "Available" },
  "2": { bg: "#dc2626", border: "#dc2626", text: "#fff", label: "Unavailable" },
  "0": { bg: "transparent", border: "#4B5563", text: "#6B7280", label: "Unknown" },
};

const AvailabilityCell = ({ interfaces }: { interfaces?: HostInterface[] }) => {
  if (!interfaces || interfaces.length === 0)
    return <Typography variant="caption" color="text.disabled">—</Typography>;
  const iface = interfaces.find((i) => i.type === "1") ?? interfaces[0];
  const badge = IFACE_BADGE[iface.type] ?? "N/A";
  const avail = AVAIL_CONFIG[iface.available] ?? AVAIL_CONFIG["0"];
  return (
    <Tooltip title={avail.label} placement="top">
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          px: 1,
          py: 0.3,
          borderRadius: "4px",
          border: `1.5px solid ${avail.border}`,
          bgcolor: avail.bg,
          cursor: "default",
          userSelect: "none",
        }}
      >
        <Typography sx={{ fontSize: "0.65rem", fontWeight: 800, color: avail.text, letterSpacing: "0.06em" }}>
          {badge}
        </Typography>
      </Box>
    </Tooltip>
  );
};

const ProblemsCell = ({ count }: { count?: number }) => {
  if (!count)
    return (
      <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.75rem" }}>
        —
      </Typography>
    );
  const bg = count >= 5 ? "#dc2626" : "#ea580c";
  return (
    <Tooltip title={`${count} active problem${count !== 1 ? "s" : ""}`} placement="top">
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 26,
          height: 22,
          borderRadius: "11px",
          bgcolor: bg,
          px: 0.8,
          cursor: "default",
        }}
      >
        <Typography sx={{ fontSize: "0.72rem", fontWeight: 700, color: "#fff" }}>{count}</Typography>
      </Box>
    </Tooltip>
  );
};

export const Hosts = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { lastSync } = useSync();

  const [hostname, setHostname] = useState("");
  const [ip, setIp] = useState("");
  const [template, setTemplate] = useState("Linux by Zabbix agent");
  const [templates, setTemplates] = useState<Array<{ templateid: string; name: string }>>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Host | null>(null);
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false, message: "", severity: "success",
  });

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
  useEffect(() => { void reload(); }, [reload, lastSync]);

  useEffect(() => {
    api.listTemplates().then((r) => setTemplates(r.templates)).catch(() => {});
  }, []);

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

  const onDelete = useCallback(async (h: Host) => {
    try {
      await api.deleteHost(h.host);
      showToast(`Host '${h.host}' deleted.`, "success");
      setConfirmDelete(null);
      await reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  }, [reload, showToast]);

  const onBulkUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const res = await api.bulkCreateHosts(uploadFile);
      if (res.failed_count > 0) {
        showToast(`Imported with warnings: ${res.created_count} created, ${res.failed_count} failed.`, "error");
      } else {
        showToast(`Bulk import: ${res.created_count} hosts created.`, "success");
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

  const headerSx = {
    fontSize: "0.7rem",
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.07em",
    color: isDark ? "#64748B" : "#6B7280",
  };

  const columns = useMemo<GridColDef[]>(
    () => [
      {
        field: "host",
        headerName: "Name",
        flex: 1.2,
        minWidth: 180,
        renderHeader: () => <Typography sx={headerSx}>Name</Typography>,
        renderCell: (params) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <RouterOutlinedIcon sx={{ fontSize: 15, color: "text.disabled", flexShrink: 0 }} />
            <Typography sx={{ fontSize: "0.85rem", fontWeight: 600 }}>{params.value}</Typography>
          </Box>
        ),
      },
      {
        field: "ip",
        headerName: "IP",
        width: 220,
        sortable: false,
        filterable: false,
        renderHeader: () => <Typography sx={headerSx}>IP Address</Typography>,
        renderCell: (params) => {
          const ifaces = params.row.interfaces as HostInterface[] | undefined;
          const iface = ifaces?.find((i) => i.type === "1") ?? ifaces?.[0];
          if (!iface) return <Typography variant="caption" color="text.disabled">—</Typography>;
          return (
            <Tooltip title={`${iface.ip}:${iface.port}`} placement="top">
              <Typography
                noWrap
                sx={{ fontSize: "0.8rem", fontFamily: "monospace", color: "text.secondary" }}
              >
                {iface.ip}
                <Typography component="span" sx={{ opacity: 0.5, fontSize: "inherit", fontFamily: "inherit" }}>
                  :{iface.port}
                </Typography>
              </Typography>
            </Tooltip>
          );
        },
      },
      {
        field: "availability",
        headerName: "Availability",
        width: 140,
        sortable: false,
        filterable: false,
        renderHeader: () => <Typography sx={headerSx}>Availability</Typography>,
        renderCell: (params) => (
          <AvailabilityCell interfaces={params.row.interfaces as HostInterface[]} />
        ),
      },
      {
        field: "status",
        headerName: "Status",
        width: 130,
        renderHeader: () => <Typography sx={headerSx}>Status</Typography>,
        renderCell: (params) => (
          <Chip
            size="small"
            label={params.value === "0" ? "Enabled" : "Disabled"}
            sx={{
              fontSize: "0.7rem",
              height: 20,
              fontWeight: 600,
              bgcolor: params.value === "0"
                ? (isDark ? "rgba(22,163,74,0.18)" : "rgba(22,163,74,0.12)")
                : "action.hover",
              color: params.value === "0" ? "#16a34a" : "text.disabled",
              border: "none",
            }}
          />
        ),
      },
      {
        field: "tags",
        headerName: "Tags",
        flex: 1.4,
        minWidth: 140,
        sortable: false,
        filterable: false,
        renderHeader: () => <Typography sx={headerSx}>Tags</Typography>,
        renderCell: (params) => {
          const tags = (params.value as HostTag[] | undefined) ?? [];
          if (tags.length === 0)
            return <Typography variant="caption" color="text.disabled">—</Typography>;
          return (
            <Box sx={{ display: "flex", flexWrap: "nowrap", gap: 0.4, overflow: "hidden" }}>
              {tags.slice(0, 3).map((t) => (
                <Chip
                  key={`${t.tag}:${t.value}`}
                  label={t.value ? `${t.tag}: ${t.value}` : t.tag}
                  size="small"
                  sx={{
                    fontSize: "0.62rem",
                    height: 18,
                    bgcolor: isDark ? "rgba(59,130,246,0.12)" : "rgba(59,130,246,0.08)",
                    color: isDark ? "#93C5FD" : "#2563EB",
                    border: "none",
                    flexShrink: 0,
                  }}
                />
              ))}
              {tags.length > 3 && (
                <Tooltip title={tags.slice(3).map((t) => `${t.tag}: ${t.value}`).join(", ")}>
                  <Typography variant="caption" color="text.disabled" sx={{ alignSelf: "center" }}>
                    +{tags.length - 3}
                  </Typography>
                </Tooltip>
              )}
            </Box>
          );
        },
      },
      {
        field: "problem_count",
        headerName: "Problems",
        width: 130,
        renderHeader: () => <Typography sx={headerSx}>Problems</Typography>,
        renderCell: (params) => <ProblemsCell count={params.value as number} />,
      },
      {
        field: "actions",
        headerName: "",
        width: 56,
        sortable: false,
        filterable: false,
        renderCell: (params) => (
          <Tooltip title="Delete host" placement="left">
            <IconButton
              size="small"
              onClick={() => setConfirmDelete(params.row as Host)}
              sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
            >
              <DeleteOutlineOutlinedIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
        ),
      },
    ],
    [isDark],
  );

  const totalProblems = hosts.reduce((sum, h) => sum + (h.problem_count ?? 0), 0);

  return (
    <Stack spacing={3}>
      {/* ── Header ── */}
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Hosts
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Manage hosts, interfaces, and monitor availability
          </Typography>
        </Box>
        <Button
          size="small"
          variant="outlined"
          startIcon={<DownloadOutlinedIcon />}
          onClick={() => { window.location.href = "/api/hosts/download"; }}
          sx={{ flexShrink: 0 }}
        >
          Export
        </Button>
      </Box>

      {/* ── Stats strip ── */}
      <Box sx={{ display: "flex", gap: 2 }}>
        {[
          { label: "Total hosts", value: hosts.length },
          {
            label: "Available",
            value: hosts.filter(
              (h) => h.interfaces?.some((i) => i.available === "1"),
            ).length,
            color: "#16a34a",
          },
          {
            label: "Unavailable",
            value: hosts.filter(
              (h) => h.interfaces?.some((i) => i.available === "2"),
            ).length,
            color: "#dc2626",
          },
          { label: "Active problems", value: totalProblems, color: totalProblems > 0 ? "#ea580c" : undefined },
        ].map((s) => (
          <Box
            key={s.label}
            sx={{
              flex: 1,
              p: 1.5,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
              bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
            }}
          >
            <Typography sx={{ fontSize: "0.68rem", color: "text.disabled", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {s.label}
            </Typography>
            <Typography sx={{ fontSize: "1.5rem", fontWeight: 700, color: s.color ?? "text.primary", lineHeight: 1.3 }}>
              {loading ? "—" : s.value}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ── Inventory table ── */}
      <Card sx={{ overflow: "hidden" }}>
        <Box
          sx={{
            px: 2.5,
            py: 1.5,
            display: "flex",
            alignItems: "center",
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>
            Host inventory
          </Typography>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={reload}>
              <RefreshIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
        </Box>
        {loading && <LinearProgress sx={{ height: 2 }} />}
        <Box sx={{ height: 560 }}>
          <DataGrid
            rows={rows}
            columns={columns}
            loading={false}
            rowHeight={58}
            columnHeaderHeight={46}
            disableRowSelectionOnClick
            pageSizeOptions={[10, 25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } } }}
            sx={{
              border: "none",
              "& .MuiDataGrid-columnHeaders": {
                bgcolor: isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)",
                borderBottom: "1px solid",
                borderColor: "divider",
              },
              "& .MuiDataGrid-columnHeader": {
                px: 2.5,
              },
              "& .MuiDataGrid-cell": {
                px: 2.5,
                borderBottom: "1px solid",
                borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)",
                display: "flex",
                alignItems: "center",
              },
              "& .MuiDataGrid-row:hover": {
                bgcolor: isDark ? "rgba(59,130,246,0.05)" : "rgba(59,130,246,0.03)",
              },
              "& .MuiDataGrid-footerContainer": {
                borderTop: "1px solid",
                borderColor: "divider",
                minHeight: 48,
              },
              "& .MuiDataGrid-overlay": { bgcolor: "transparent" },
            }}
          />
        </Box>
      </Card>

      {/* ── Management accordions ── */}
      <Accordion
        disableGutters
        elevation={0}
        sx={{ border: "1px solid", borderColor: "divider", borderRadius: "12px !important", "&:before": { display: "none" } }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2.5, minHeight: 52 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <AddIcon sx={{ fontSize: 18, color: "primary.main" }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Add host</Typography>
            <Typography variant="caption" color="text.disabled">— create a single host in Zabbix</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 2.5, pb: 2.5 }}>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField size="small" label="Hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} fullWidth />
              <TextField size="small" label="IP address" value={ip} onChange={(e) => setIp(e.target.value)} fullWidth />
            </Stack>
            <Autocomplete
              freeSolo
              size="small"
              options={templates.map((t) => t.name)}
              value={template}
              onChange={(_, v) => { if (v !== null) setTemplate(v); }}
              onInputChange={(_, v, reason) => { if (reason === "input" || reason === "clear") setTemplate(v); }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Template"
                  placeholder="Linux by Zabbix agent"
                  helperText={templates.length === 0 ? "Type a template name" : `${templates.length} templates available`}
                />
              )}
              fullWidth
            />
            <Box>
              <Button variant="contained" size="small" onClick={onCreate} disabled={!hostname || !ip} startIcon={<AddIcon />}>
                Create host
              </Button>
            </Box>
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Accordion
        disableGutters
        elevation={0}
        sx={{ border: "1px solid", borderColor: "divider", borderRadius: "12px !important", "&:before": { display: "none" } }}
      >
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2.5, minHeight: 52 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <CloudUploadOutlinedIcon sx={{ fontSize: 18, color: "primary.main" }} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Bulk import</Typography>
            <Typography variant="caption" color="text.disabled">— upload .csv or .xlsx</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 2.5, pb: 2.5 }}>
          <Divider sx={{ mb: 2 }} />
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Upload a file with columns: <code>hostname</code> (or <code>host</code>), <code>ip</code>{" "}
              (or <code>ip_address</code>), optional <code>template</code>.
            </Typography>
            <Box
              component="label"
              htmlFor="bulk-upload-input"
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); pickUploadFile(e.dataTransfer.files?.[0] ?? null); }}
              sx={{
                border: "2px dashed",
                borderColor: dragActive ? "primary.main" : "divider",
                borderRadius: 2,
                p: 3,
                textAlign: "center",
                bgcolor: dragActive ? "rgba(59,130,246,0.06)" : "action.hover",
                transition: "all 0.2s",
                cursor: "pointer",
              }}
            >
              <CloudUploadOutlinedIcon sx={{ fontSize: 28, color: "text.disabled", mb: 0.5 }} />
              <Typography variant="body2" color="text.secondary">
                {uploadFile ? uploadFile.name : "Drag & drop or click to choose a file"}
              </Typography>
              <input id="bulk-upload-input" hidden type="file" accept=".csv,.xlsx"
                onChange={(e) => pickUploadFile(e.target.files?.[0] ?? null)} />
            </Box>
            <Stack direction="row" spacing={2} alignItems="center">
              <Button variant="outlined" size="small" component="label" htmlFor="bulk-upload-input">
                Choose file
              </Button>
              <Button variant="contained" size="small" onClick={onBulkUpload} disabled={!uploadFile || uploading}
                startIcon={<CloudUploadOutlinedIcon />}>
                {uploading ? "Importing…" : "Import hosts"}
              </Button>
            </Stack>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {/* ── Delete confirm dialog ── */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete host?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Permanently removes <strong>{confirmDelete?.host}</strong> from Zabbix. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={() => confirmDelete && onDelete(confirmDelete)}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={3500}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert onClose={() => setToast((t) => ({ ...t, open: false }))} severity={toast.severity} variant="filled" sx={{ width: "100%" }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
};
