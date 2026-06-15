"use client";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import ClearIcon from "@mui/icons-material/Clear";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import WifiOffIcon from "@mui/icons-material/WifiOff";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { type Host, api } from "../app/api";

type TriggerRow = {
  triggerid: string;
  description: string;
  expression: string;
  priority: number;
  status: number;
  value: number;      // 0 = OK, 1 = PROBLEM
  lastchange: number; // unix timestamp of last state change
};

const SEVERITY_CONFIG = [
  { severity: 0, label: "Not classified", color: "#9E9E9E" },
  { severity: 1, label: "Information",    color: "#2196F3" },
  { severity: 2, label: "Warning",        color: "#FFC107" },
  { severity: 3, label: "Average",        color: "#FF5722" },
  { severity: 4, label: "High",           color: "#F44336" },
  { severity: 5, label: "Disaster",       color: "#B71C1C" },
];

const timeAgo = (ts: number): string => {
  if (!ts) return "never";
  const secs = Math.floor(Date.now() / 1000) - ts;
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
};

const SeverityChip = ({ priority }: { priority: number }) => {
  const cfg = SEVERITY_CONFIG.find((s) => s.severity === priority) ?? SEVERITY_CONFIG[0];
  return (
    <Chip
      label={cfg.label}
      size="small"
      variant="outlined"
      sx={{ height: 18, fontSize: "0.65rem", borderColor: cfg.color, color: cfg.color }}
    />
  );
};

const operators = [
  { value: ">",  label: ">" },
  { value: ">=", label: ">=" },
  { value: "<",  label: "<" },
  { value: "<=", label: "<=" },
  { value: "=",  label: "=" },
  { value: "<>", label: "≠" },
];

export const Triggers = () => {
  // ── Table / host state ───────────────────────────────────────────────
  const [triggers, setTriggers] = useState<TriggerRow[]>([]);
  const [hostAvailable, setHostAvailable] = useState("0"); // "0"=Unknown "1"=OK "2"=Down
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [hosts, setHosts] = useState<Host[]>([]);
  const [selectedHost, setSelectedHost] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── Add trigger form state ───────────────────────────────────────────
  const [formHost, setFormHost] = useState("");
  const [formItemKey, setFormItemKey] = useState("");
  const [formItemValueType, setFormItemValueType] = useState<string>("3");
  const [formName, setFormName] = useState("");
  const [formEventName, setFormEventName] = useState("");
  const [formOperator, setFormOperator] = useState(">");
  const [formThreshold, setFormThreshold] = useState("");
  const [formMatchType, setFormMatchType] = useState("like");
  const [formPattern, setFormPattern] = useState("");
  const [formSeverity, setFormSeverity] = useState(2);
  const [formComments, setFormComments] = useState("");
  const [formHostItems, setFormHostItems] = useState<
    Array<{ itemid: string; name: string; key_: string; value_type: string; delay: string }>
  >([]);
  const [formHostItemsLoading, setFormHostItemsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Edit trigger state ───────────────────────────────────────────────
  const [editTrigger, setEditTrigger] = useState<TriggerRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editEventName, setEditEventName] = useState("");
  const [editSeverity, setEditSeverity] = useState(2);
  const [editEnabled, setEditEnabled] = useState(true);
  const [editExpression, setEditExpression] = useState("");
  const [editComments, setEditComments] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const isStringItem = formItemValueType === "1" || formItemValueType === "4";

  // ── Toast ────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false, message: "", severity: "success",
  });
  const showToast = (message: string, sev: "success" | "error") =>
    setToast({ open: true, message, severity: sev });

  const loadTriggers = async (hostname: string) => {
    if (!hostname) { setTriggers([]); setHostAvailable("0"); return; }
    setLoading(true);
    try {
      const res = await api.listTriggers(hostname);
      setHostAvailable(res.host_available ?? "0");
      setTriggers(
        res.triggers.map((t) => ({
          triggerid: t.triggerid,
          description: t.description,
          expression: t.expression,
          priority: Number(t.priority),
          status: Number(t.status),
          value: Number(t.value ?? 0),
          lastchange: Number(t.lastchange ?? 0),
        }))
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.listHosts()
      .then((r) => setHosts(r.hosts))
      .catch(() => {});
  }, []);

  const handleHostChange = (hostname: string) => {
    setSelectedHost(hostname);
    void loadTriggers(hostname);
  };

  // Load items for the selected host in the Add form
  useEffect(() => {
    if (!formHost) {
      setFormHostItems([]);
      setFormItemKey("");
      setFormItemValueType("3");
      return;
    }
    setFormHostItemsLoading(true);
    api.listItems(formHost, true)
      .then((r) => {
        setFormHostItems(r.items.filter((i) => ["0", "1", "3", "4"].includes(i.value_type)));
        setFormItemKey("");
        setFormItemValueType("3");
      })
      .catch(() => setFormHostItems([]))
      .finally(() => setFormHostItemsLoading(false));
  }, [formHost]);

  const handleAdd = async () => {
    if (!formHost || !formItemKey || !formName) return;
    if (isStringItem && formPattern === "") return;
    if (!isStringItem && formThreshold === "") return;
    setSaving(true);
    try {
      await api.addTrigger(
        isStringItem
          ? {
              hostname: formHost, item_key: formItemKey, trigger_name: formName,
              severity: formSeverity, string_pattern: formPattern, match_type: formMatchType,
              event_name: formEventName || undefined, comments: formComments || undefined,
            }
          : {
              hostname: formHost, item_key: formItemKey, trigger_name: formName,
              operator: formOperator, threshold: Number(formThreshold), severity: formSeverity,
              event_name: formEventName || undefined, comments: formComments || undefined,
            },
      );
      showToast("Trigger created.", "success");
      setAddOpen(false);
      setFormHost(""); setFormItemKey(""); setFormItemValueType("3"); setFormName("");
      setFormEventName(""); setFormThreshold(""); setFormOperator(">"); setFormPattern("");
      setFormMatchType("like"); setFormSeverity(2); setFormComments("");
      if (formHost === selectedHost) void loadTriggers(selectedHost);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (triggerid: string) => {
    try {
      await api.deleteTrigger(triggerid);
      setTriggers((prev) => prev.filter((t) => t.triggerid !== triggerid));
      showToast("Trigger deleted.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const openEdit = (t: TriggerRow) => {
    setEditTrigger(t);
    setEditName(t.description);
    setEditEventName("");
    setEditSeverity(t.priority);
    setEditEnabled(t.status === 0);
    setEditExpression(t.expression);
    setEditComments("");
  };

  const handleEdit = async () => {
    if (!editTrigger) return;
    setEditSaving(true);
    try {
      await api.updateTrigger(editTrigger.triggerid, {
        description: editName,
        priority: editSeverity,
        status: editEnabled ? 0 : 1,
        expression: editExpression,
        event_name: editEventName || undefined,
        comments: editComments || undefined,
      });
      showToast("Trigger updated.", "success");
      setEditTrigger(null);
      void loadTriggers(selectedHost);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setEditSaving(false);
    }
  };

  const filtered = triggers.filter((t) => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const desc = t.description.toLowerCase();
    const expr = t.expression.toLowerCase();
    return words.length === 0 || words.every((w) => desc.includes(w) || expr.includes(w));
  });

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" fontWeight={700} mb={3}>Triggers</Typography>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            {/* Toolbar */}
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel>Host</InputLabel>
                <Select
                  value={selectedHost}
                  label="Host"
                  onChange={(e) => handleHostChange(e.target.value)}
                >
                  <MenuItem value=""><em>Select a host…</em></MenuItem>
                  {hosts.map((h) => <MenuItem key={h.hostid} value={h.host}>{h.host}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField
                size="small"
                placeholder="Search by name or expression…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={!selectedHost}
                sx={{ minWidth: 260 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlinedIcon sx={{ fontSize: 18 }} />
                    </InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearch("")}>
                        <ClearIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                }}
              />
              <Box sx={{ flex: 1 }} />
              <Tooltip title="Refresh">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => void loadTriggers(selectedHost)}
                    disabled={loading || !selectedHost}
                  >
                    <RefreshIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddCircleOutlineIcon />}
                onClick={() => setAddOpen(true)}
              >
                Add Trigger
              </Button>
            </Stack>

            <Divider />

            {/* Host unreachable banner */}
            {selectedHost && hostAvailable === "2" && (
              <Alert
                severity="warning"
                icon={<WifiOffIcon fontSize="inherit" />}
                sx={{ py: 0.5, fontSize: "0.82rem" }}
              >
                <strong>Host agent unreachable.</strong> Zabbix cannot collect data from this host.
                Trigger states below are stale — they reflect the last known values, not the current
                host condition. A trigger may show OK even though the host is down.
              </Alert>
            )}

            {/* Triggers table */}
            {!selectedHost ? (
              <Box sx={{ py: 6, textAlign: "center" }}>
                <Typography variant="body2" color="text.secondary">
                  Select a host to view its triggers.
                </Typography>
              </Box>
            ) : (
              <>
                <TableContainer sx={{ maxHeight: 520 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700, bgcolor: "background.paper" }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 700, bgcolor: "background.paper" }}>Expression</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: 120, bgcolor: "background.paper" }}>Severity</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: 110, bgcolor: "background.paper" }}>State</TableCell>
                        <TableCell sx={{ fontWeight: 700, width: 90, bgcolor: "background.paper" }}>Status</TableCell>
                        <TableCell sx={{ width: 96, bgcolor: "background.paper" }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {loading
                        ? Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>
                              {Array.from({ length: 6 }).map((__, j) => (
                                <TableCell key={j}><Skeleton variant="text" /></TableCell>
                              ))}
                            </TableRow>
                          ))
                        : filtered.length === 0
                          ? (
                            <TableRow>
                              <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                <Typography variant="body2" color="text.secondary">
                                  {triggers.length === 0
                                    ? "No triggers found for this host."
                                    : "No triggers match the search."}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )
                          : filtered.map((t) => (
                            <TableRow key={t.triggerid} hover>
                              <TableCell>
                                <Typography variant="body2">{t.description}</Typography>
                              </TableCell>
                              <TableCell sx={{ maxWidth: 300 }}>
                                <Tooltip title={t.expression} placement="top">
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontFamily: "monospace",
                                      fontSize: "0.7rem",
                                      color: "text.secondary",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                  >
                                    {t.expression}
                                  </Typography>
                                </Tooltip>
                              </TableCell>
                              <TableCell><SeverityChip priority={t.priority} /></TableCell>
                              <TableCell>
                                {hostAvailable === "2" ? (
                                  <Tooltip title="Host agent is unreachable — this state is stale and may be incorrect" placement="top">
                                    <Chip
                                      label="No data"
                                      size="small"
                                      variant="filled"
                                      sx={{ height: 18, fontSize: "0.65rem", fontWeight: 700, bgcolor: "#78716C", color: "#fff" }}
                                    />
                                  </Tooltip>
                                ) : (
                                  <Tooltip title={t.lastchange ? `Since ${timeAgo(t.lastchange)}` : "No state change recorded"} placement="top">
                                    <Chip
                                      label={t.value === 1 ? "PROBLEM" : "OK"}
                                      size="small"
                                      variant="filled"
                                      sx={{
                                        height: 18, fontSize: "0.65rem", fontWeight: 700,
                                        bgcolor: t.value === 1 ? "error.main" : "success.main",
                                        color: "#fff",
                                      }}
                                    />
                                  </Tooltip>
                                )}
                              </TableCell>
                              <TableCell>
                                <Chip
                                  label={t.status === 0 ? "Enabled" : "Disabled"}
                                  size="small"
                                  color={t.status === 0 ? "success" : "default"}
                                  variant="outlined"
                                  sx={{ height: 18, fontSize: "0.65rem" }}
                                />
                              </TableCell>
                              <TableCell>
                                <Stack direction="row" spacing={0.5}>
                                  <Tooltip title="Edit trigger">
                                    <IconButton size="small" onClick={() => openEdit(t)}>
                                      <EditOutlinedIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Delete trigger">
                                    <IconButton
                                      size="small"
                                      color="error"
                                      onClick={() => setConfirmDeleteId(t.triggerid)}
                                    >
                                      <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </Stack>
                              </TableCell>
                            </TableRow>
                          ))
                      }
                    </TableBody>
                  </Table>
                </TableContainer>
                <Typography variant="caption" color="text.secondary">
                  {loading
                    ? "Loading…"
                    : `${filtered.length} of ${triggers.length} trigger${triggers.length !== 1 ? "s" : ""}`}
                </Typography>
              </>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* ── Add Trigger Dialog ── */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Trigger</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size="small" fullWidth required>
              <InputLabel>Host</InputLabel>
              <Select value={formHost} label="Host" onChange={(e) => setFormHost(e.target.value)}>
                {hosts.map((h) => (
                  <MenuItem key={h.hostid} value={h.host}>{h.host}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth required disabled={!formHost || formHostItemsLoading}>
              <InputLabel>Item</InputLabel>
              <Select
                value={formItemKey}
                label="Item"
                onChange={(e) => {
                  setFormItemKey(e.target.value);
                  const item = formHostItems.find((i) => i.key_ === e.target.value);
                  if (item) {
                    setFormItemValueType(item.value_type);
                    if (!formName) setFormName(`${item.name} alert`);
                  }
                }}
              >
                {formHostItemsLoading
                  ? (
                    <MenuItem disabled>
                      <CircularProgress size={14} sx={{ mr: 1 }} />Loading…
                    </MenuItem>
                  )
                  : formHostItems.length === 0
                    ? <MenuItem disabled>No items found</MenuItem>
                    : formHostItems.map((i) => (
                        <MenuItem key={i.key_} value={i.key_}>
                          {i.name} ({i.key_})
                          {(i.value_type === "1" || i.value_type === "4") && (
                            <Chip label="text" size="small" sx={{ ml: 1, height: 16, fontSize: "0.6rem" }} />
                          )}
                        </MenuItem>
                      ))
                }
              </Select>
            </FormControl>

            <TextField
              size="small" fullWidth required label="Name"
              value={formName} onChange={(e) => setFormName(e.target.value)}
            />

            <TextField
              size="small" fullWidth label="Event name"
              value={formEventName} onChange={(e) => setFormEventName(e.target.value)}
              helperText="Optional — shown in the Problems view when this trigger fires"
            />

            {/* Severity — segmented button row */}
            <Box>
              <Typography variant="caption" sx={{ color: "text.secondary", mb: 0.5, display: "block" }}>
                Severity
              </Typography>
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {SEVERITY_CONFIG.map((s) => (
                  <Button
                    key={s.severity}
                    size="small"
                    variant={formSeverity === s.severity ? "contained" : "outlined"}
                    onClick={() => setFormSeverity(s.severity)}
                    sx={{
                      fontSize: "0.72rem",
                      textTransform: "none",
                      borderColor: s.color,
                      color: formSeverity === s.severity ? "#fff" : s.color,
                      bgcolor: formSeverity === s.severity ? s.color : "transparent",
                      "&:hover": {
                        bgcolor: formSeverity === s.severity ? s.color : `${s.color}18`,
                        borderColor: s.color,
                      },
                    }}
                  >
                    {s.label}
                  </Button>
                ))}
              </Box>
            </Box>

            {/* Condition */}
            {isStringItem ? (
              <Stack direction="row" spacing={1.5}>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>Match type</InputLabel>
                  <Select
                    value={formMatchType}
                    label="Match type"
                    onChange={(e) => setFormMatchType(e.target.value)}
                  >
                    <MenuItem value="like">contains</MenuItem>
                    <MenuItem value="notlike">does not contain</MenuItem>
                    <MenuItem value="regexp">matches regex</MenuItem>
                    <MenuItem value="notregexp">does not match regex</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small" required label="Pattern"
                  value={formPattern} onChange={(e) => setFormPattern(e.target.value)}
                  sx={{ flex: 1 }}
                />
              </Stack>
            ) : (
              <Stack direction="row" spacing={1.5}>
                <FormControl size="small" sx={{ minWidth: 90 }}>
                  <InputLabel>Operator</InputLabel>
                  <Select
                    value={formOperator}
                    label="Operator"
                    onChange={(e) => setFormOperator(e.target.value)}
                  >
                    {operators.map((op) => (
                      <MenuItem key={op.value} value={op.value}>{op.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  size="small" required label="Threshold"
                  value={formThreshold} onChange={(e) => setFormThreshold(e.target.value)}
                  type="number" sx={{ flex: 1 }}
                />
              </Stack>
            )}

            {formHost && formItemKey && (
              <Alert severity="info" sx={{ py: 0.5 }}>
                {isStringItem
                  ? (
                    <span>
                      Expression:{" "}
                      <code>
                        {`find(/${formHost}/${formItemKey},,"${formMatchType.replace(/^not/, "") || "like"}","${formPattern || "?"}")`}
                        {formMatchType.startsWith("not") ? "=0" : "=1"}
                      </code>
                    </span>
                  )
                  : (
                    <span>
                      Expression:{" "}
                      <code>{`last(/${formHost}/${formItemKey}) ${formOperator} ${formThreshold || "?"}`}</code>
                    </span>
                  )
                }
              </Alert>
            )}

            <TextField
              size="small" fullWidth label="Description"
              value={formComments} onChange={(e) => setFormComments(e.target.value)}
              multiline minRows={2} placeholder="Optional notes about this trigger"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={
              saving || !formHost || !formItemKey || !formName ||
              (isStringItem ? formPattern === "" : formThreshold === "")
            }
            onClick={() => void handleAdd()}
          >
            {saving ? <CircularProgress size={18} /> : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Edit Trigger Dialog ── */}
      <Dialog open={!!editTrigger} onClose={() => setEditTrigger(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Trigger</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              size="small" fullWidth required label="Trigger name"
              value={editName} onChange={(e) => setEditName(e.target.value)}
            />

            <TextField
              size="small" fullWidth label="Event name"
              value={editEventName} onChange={(e) => setEditEventName(e.target.value)}
              helperText="Optional — shown in the Problems view"
            />

            <Box>
              <Typography variant="caption" sx={{ color: "text.secondary", mb: 0.5, display: "block" }}>
                Severity
              </Typography>
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {SEVERITY_CONFIG.map((s) => (
                  <Button
                    key={s.severity}
                    size="small"
                    variant={editSeverity === s.severity ? "contained" : "outlined"}
                    onClick={() => setEditSeverity(s.severity)}
                    sx={{
                      fontSize: "0.72rem",
                      textTransform: "none",
                      borderColor: s.color,
                      color: editSeverity === s.severity ? "#fff" : s.color,
                      bgcolor: editSeverity === s.severity ? s.color : "transparent",
                      "&:hover": {
                        bgcolor: editSeverity === s.severity ? s.color : `${s.color}18`,
                        borderColor: s.color,
                      },
                    }}
                  >
                    {s.label}
                  </Button>
                ))}
              </Box>
            </Box>

            <FormControlLabel
              control={
                <Switch
                  checked={editEnabled}
                  onChange={(e) => setEditEnabled(e.target.checked)}
                />
              }
              label={editEnabled ? "Enabled" : "Disabled"}
            />

            <TextField
              size="small" fullWidth label="Expression"
              value={editExpression} onChange={(e) => setEditExpression(e.target.value)}
              multiline minRows={2}
              InputProps={{ sx: { fontFamily: "monospace", fontSize: "0.8rem" } }}
              helperText="Edit with care — must be a valid Zabbix trigger expression."
            />

            <TextField
              size="small" fullWidth label="Description"
              value={editComments} onChange={(e) => setEditComments(e.target.value)}
              multiline minRows={2} placeholder="Optional notes about this trigger"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTrigger(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={editSaving || !editName.trim() || !editExpression.trim()}
            onClick={() => void handleEdit()}
          >
            {editSaving ? <CircularProgress size={18} /> : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Confirm delete Dialog ── */}
      <Dialog open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Trigger</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this trigger? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => confirmDeleteId && void handleDelete(confirmDeleteId)}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
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
    </Box>
  );
};
