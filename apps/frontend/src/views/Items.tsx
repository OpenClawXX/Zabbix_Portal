"use client";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useState } from "react";
import { api } from "../app/api";

const valueTypes = [
  { value: 0, label: "Float" },
  { value: 1, label: "String" },
  { value: 2, label: "Log" },
  { value: 3, label: "Integer" },
  { value: 4, label: "Text" },
];

const operators = [
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: ">=" },
  { value: "<=", label: "<=" },
  { value: "=", label: "=" },
  { value: "<>", label: "<>" },
];

const severities = [
  { value: 0, label: "Not classified" },
  { value: 1, label: "Information" },
  { value: 2, label: "Warning" },
  { value: 3, label: "Average" },
  { value: 4, label: "High" },
  { value: 5, label: "Disaster" },
];

const severityColor = (p: string): "default" | "info" | "warning" | "error" => {
  const n = Number(p);
  if (n <= 1) return "info";
  if (n <= 2) return "warning";
  return "error";
};

type Item = { itemid: string; name: string; key_: string; value_type: string; delay: string };
type Trigger = { triggerid: string; description: string; expression: string; priority: string; status: string };

export const Items = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  // ── Add item ──────────────────────────────────────────────────────────
  const [hostname, setHostname] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemKey, setItemKey] = useState("");
  const [valueType, setValueType] = useState(3);

  // ── Add trigger ───────────────────────────────────────────────────────
  const [triggerHost, setTriggerHost] = useState("");
  const [triggerItemKey, setTriggerItemKey] = useState("");
  const [triggerName, setTriggerName] = useState("");
  const [operator, setOperator] = useState(">");
  const [threshold, setThreshold] = useState("");
  const [severity, setSeverity] = useState(3);

  // ── Manage items ──────────────────────────────────────────────────────
  const [searchItemHost, setSearchItemHost] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // ── Manage triggers ───────────────────────────────────────────────────
  const [searchTriggerHost, setSearchTriggerHost] = useState("");
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [loadingTriggers, setLoadingTriggers] = useState(false);

  // ── Toast ─────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false, message: "", severity: "success",
  });
  const showToast = (message: string, severity: "success" | "error") =>
    setToast({ open: true, message, severity });

  // ── Handlers ─────────────────────────────────────────────────────────
  const onCreate = async () => {
    try {
      await api.addItem({ hostname, item_name: itemName, item_key: itemKey, value_type: valueType });
      showToast("Item added successfully.", "success");
      setItemName("");
      setItemKey("");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const onCreateTrigger = async () => {
    const parsedThreshold = Number(threshold);
    if (!Number.isFinite(parsedThreshold)) {
      showToast("Threshold must be a valid number.", "error");
      return;
    }
    try {
      await api.addTrigger({ hostname: triggerHost, item_key: triggerItemKey, trigger_name: triggerName, operator, threshold: parsedThreshold, severity });
      showToast("Trigger added successfully.", "success");
      setTriggerName("");
      setThreshold("");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const onLoadItems = async () => {
    if (!searchItemHost.trim()) return;
    setLoadingItems(true);
    try {
      const res = await api.listItems(searchItemHost.trim());
      setItems(res.items);
      if (res.items.length === 0) showToast("No custom items found for this host.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoadingItems(false);
    }
  };

  const onDeleteItem = async (itemid: string) => {
    try {
      await api.deleteItem(itemid);
      setItems((prev) => prev.filter((i) => i.itemid !== itemid));
      showToast("Item deleted.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const onLoadTriggers = async () => {
    if (!searchTriggerHost.trim()) return;
    setLoadingTriggers(true);
    try {
      const res = await api.listTriggers(searchTriggerHost.trim());
      setTriggers(res.triggers);
      if (res.triggers.length === 0) showToast("No custom triggers found for this host.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoadingTriggers(false);
    }
  };

  const onDeleteTrigger = async (triggerid: string) => {
    try {
      await api.deleteTrigger(triggerid);
      setTriggers((prev) => prev.filter((t) => t.triggerid !== triggerid));
      showToast("Trigger deleted.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>Items & Triggers</Typography>
        <Typography color="text.secondary">Add or remove monitoring items and alert triggers.</Typography>
      </Box>

      {/* ── Add item ── */}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Add item</Typography>
            <Typography color="text.secondary" variant="body2">
              Attach a new metric check to an existing host.
            </Typography>
            <Divider />
            <TextField label="Hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} />
            <TextField label="Item name" value={itemName} onChange={(e) => setItemName(e.target.value)} />
            <TextField label="Item key" value={itemKey} onChange={(e) => setItemKey(e.target.value)} />
            <TextField select label="Value type" value={valueType} onChange={(e) => setValueType(Number(e.target.value))}>
              {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </TextField>
            <Box>
              <Button variant="contained" color="secondary" onClick={onCreate} disabled={!hostname || !itemName || !itemKey}>
                Add item
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* ── Delete items ── */}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Delete item</Typography>
            <Typography color="text.secondary" variant="body2">
              Look up a host's custom items and remove the ones you no longer need.
            </Typography>
            <Divider />
            <Stack direction="row" spacing={1}>
              <TextField
                label="Hostname"
                value={searchItemHost}
                onChange={(e) => setSearchItemHost(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void onLoadItems(); }}
                fullWidth
              />
              <Button
                variant="outlined"
                onClick={onLoadItems}
                disabled={!searchItemHost.trim() || loadingItems}
                startIcon={loadingItems ? <CircularProgress size={16} /> : <SearchOutlinedIcon />}
                sx={{ whiteSpace: "nowrap", minWidth: 100 }}
              >
                Load
              </Button>
            </Stack>
            {items.length > 0 && (
              <Stack spacing={1}>
                {items.map((item) => (
                  <Box
                    key={item.itemid}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      px: 1.5,
                      py: 1,
                      borderRadius: 1.5,
                      border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.1)",
                      backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.03)",
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{item.name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {item.key_} · every {item.delay}
                      </Typography>
                    </Box>
                    <Tooltip title="Delete item">
                      <IconButton color="error" size="small" onClick={() => void onDeleteItem(item.itemid)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* ── Add trigger ── */}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Add trigger</Typography>
            <Typography color="text.secondary" variant="body2">
              Create an alert rule on an existing item key (expression uses <code>.last()</code>).
            </Typography>
            <Divider />
            <TextField label="Hostname" value={triggerHost} onChange={(e) => setTriggerHost(e.target.value)} />
            <TextField label="Item key" value={triggerItemKey} onChange={(e) => setTriggerItemKey(e.target.value)} helperText="Example: system.cpu.load" />
            <TextField label="Trigger name" value={triggerName} onChange={(e) => setTriggerName(e.target.value)} />
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField select label="Operator" value={operator} onChange={(e) => setOperator(e.target.value)} fullWidth>
                {operators.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
              <TextField label="Threshold" value={threshold} onChange={(e) => setThreshold(e.target.value)} fullWidth />
            </Stack>
            <TextField select label="Severity" value={severity} onChange={(e) => setSeverity(Number(e.target.value))}>
              {severities.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </TextField>
            <Box>
              <Button variant="contained" onClick={onCreateTrigger} disabled={!triggerHost || !triggerItemKey || !triggerName || threshold.trim() === ""}>
                Add trigger
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* ── Delete triggers ── */}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Delete trigger</Typography>
            <Typography color="text.secondary" variant="body2">
              Look up a host's custom triggers and remove the ones you no longer need.
            </Typography>
            <Divider />
            <Stack direction="row" spacing={1}>
              <TextField
                label="Hostname"
                value={searchTriggerHost}
                onChange={(e) => setSearchTriggerHost(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void onLoadTriggers(); }}
                fullWidth
              />
              <Button
                variant="outlined"
                onClick={onLoadTriggers}
                disabled={!searchTriggerHost.trim() || loadingTriggers}
                startIcon={loadingTriggers ? <CircularProgress size={16} /> : <SearchOutlinedIcon />}
                sx={{ whiteSpace: "nowrap", minWidth: 100 }}
              >
                Load
              </Button>
            </Stack>
            {triggers.length > 0 && (
              <Stack spacing={1}>
                {triggers.map((t) => (
                  <Box
                    key={t.triggerid}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      px: 1.5,
                      py: 1,
                      borderRadius: 1.5,
                      border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.1)",
                      backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.03)",
                    }}
                  >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{t.description}</Typography>
                        <Chip
                          label={severities[Number(t.priority)]?.label ?? t.priority}
                          size="small"
                          color={severityColor(t.priority)}
                          sx={{ height: 18, fontSize: "0.6rem", flexShrink: 0 }}
                        />
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>
                        {t.expression}
                      </Typography>
                    </Box>
                    <Tooltip title="Delete trigger">
                      <IconButton color="error" size="small" onClick={() => void onDeleteTrigger(t.triggerid)} sx={{ ml: 1, flexShrink: 0 }}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Snackbar
        open={toast.open}
        autoHideDuration={3000}
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
