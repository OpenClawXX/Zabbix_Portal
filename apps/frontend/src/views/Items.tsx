"use client";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import PlaylistAddOutlinedIcon from "@mui/icons-material/PlaylistAddOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { type Host, api } from "../app/api";

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
  { value: 0, label: "None" },
  { value: 1, label: "Info" },
  { value: 2, label: "Low" },
  { value: 3, label: "Medium" },
  { value: 4, label: "High" },
  { value: 5, label: "Critical" },
];

const severityColor = (p: string): "default" | "info" | "warning" | "error" => {
  const n = Number(p);
  if (n <= 1) return "info";
  if (n <= 2) return "warning";
  return "error";
};

// Common Zabbix agent item keys with suggested name and value type.
// Selecting one auto-fills all three fields.
const COMMON_ITEM_KEYS = [
  { key: "system.cpu.util",             name: "CPU utilization",                valueType: 0 },
  { key: "system.cpu.util[,user]",      name: "CPU user utilization",            valueType: 0 },
  { key: "system.cpu.util[,system]",    name: "CPU system utilization",          valueType: 0 },
  { key: "system.cpu.load[percpu,avg1]",name: "CPU load per core (1 min avg)",   valueType: 0 },
  { key: "system.cpu.load[percpu,avg5]",name: "CPU load per core (5 min avg)",   valueType: 0 },
  { key: "vm.memory.size[available]",   name: "Available memory",                valueType: 3 },
  { key: "vm.memory.size[pavailable]",  name: "Available memory (%)",            valueType: 0 },
  { key: "vm.memory.size[used]",        name: "Used memory",                     valueType: 3 },
  { key: "system.swap.size[,pfree]",    name: "Free swap space (%)",             valueType: 0 },
  { key: "vfs.fs.size[/,pfree]",        name: "Free disk space on / (%)",        valueType: 0 },
  { key: "vfs.fs.size[/,pused]",        name: "Used disk space on / (%)",        valueType: 0 },
  { key: "vfs.fs.size[/,free]",         name: "Free disk space on / (bytes)",    valueType: 3 },
  { key: "net.if.in[eth0,bytes]",       name: "Network inbound (eth0)",          valueType: 3 },
  { key: "net.if.out[eth0,bytes]",      name: "Network outbound (eth0)",         valueType: 3 },
  { key: "system.uptime",               name: "System uptime",                   valueType: 3 },
  { key: "agent.ping",                  name: "Agent ping",                      valueType: 3 },
  { key: "agent.version",              name: "Agent version",                    valueType: 1 },
  { key: "proc.num[]",                  name: "Number of running processes",     valueType: 3 },
  { key: "system.hostname",             name: "System hostname",                 valueType: 1 },
];

type Item = { itemid: string; name: string; key_: string; value_type: string; delay: string };
type Trigger = {
  triggerid: string;
  description: string;
  expression: string;
  priority: string;
  status: string;
};

// ── Help content ──────────────────────────────────────────────────────

const ItemHelp = () => (
  <Accordion
    disableGutters
    elevation={0}
    sx={{
      border: "1px solid",
      borderColor: "primary.main",
      borderRadius: "8px !important",
      bgcolor: "rgba(25,118,210,0.04)",
      "&:before": { display: "none" },
    }}
  >
    <AccordionSummary
      expandIcon={<ExpandMoreIcon sx={{ fontSize: 18, color: "primary.main" }} />}
      sx={{ minHeight: 40, "& .MuiAccordionSummary-content": { my: 0.5 } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <HelpOutlineIcon sx={{ fontSize: 16, color: "primary.main" }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: "primary.main" }}>
          How to create an item
        </Typography>
      </Box>
    </AccordionSummary>
    <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8rem" }}>
          An item defines what data Zabbix collects from a host. You pick the host, give the item a
          readable name, and provide an{" "}
          <Box component="span" sx={{ fontFamily: "monospace", fontSize: "0.78rem" }}>
            item key
          </Box>{" "}
          that tells the Zabbix agent how to collect the data.
        </Typography>
        <Box>
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, display: "block", mb: 0.5, color: "text.primary" }}
          >
            Common item keys
          </Typography>
          <Stack spacing={0.5}>
            {[
              ["system.cpu.util[,user]", "CPU user utilization (%)"],
              ["vm.memory.size[available]", "Available memory (bytes)"],
              ["net.if.in[eth0,bytes]", "Network inbound traffic"],
              ["vfs.fs.size[/,pfree]", "Free disk space on / (%)"],
              ["system.uptime", "System uptime (seconds)"],
              ["agent.ping", "Agent connectivity check"],
            ].map(([key, desc]) => (
              <Box key={key} sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                <Typography
                  sx={{
                    fontFamily: "monospace",
                    fontSize: "0.72rem",
                    color: "primary.light",
                    flexShrink: 0,
                    minWidth: 240,
                  }}
                >
                  {key}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {desc}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
          Use <strong>Integer</strong> or <strong>Float</strong> as the value type for numeric
          metrics — these can be graphed and used in triggers. Text / String values cannot be
          thresholded.
        </Typography>
      </Stack>
    </AccordionDetails>
  </Accordion>
);

const TriggerHelp = () => (
  <Accordion
    disableGutters
    elevation={0}
    sx={{
      border: "1px solid",
      borderColor: "primary.main",
      borderRadius: "8px !important",
      bgcolor: "rgba(25,118,210,0.04)",
      "&:before": { display: "none" },
    }}
  >
    <AccordionSummary
      expandIcon={<ExpandMoreIcon sx={{ fontSize: 18, color: "primary.main" }} />}
      sx={{ minHeight: 40, "& .MuiAccordionSummary-content": { my: 0.5 } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <HelpOutlineIcon sx={{ fontSize: 16, color: "primary.main" }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: "primary.main" }}>
          How to create a trigger
        </Typography>
      </Box>
    </AccordionSummary>
    <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8rem" }}>
          A trigger fires an alert in Zabbix when an item's value crosses a threshold. The item key
          you choose must already exist on the selected host.
        </Typography>
        <Box
          sx={{
            bgcolor: "action.hover",
            borderRadius: 1,
            p: 1.5,
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, display: "block", mb: 1, color: "text.primary" }}
          >
            Example — alert when CPU exceeds 90 %
          </Typography>
          <Stack spacing={0.5}>
            {[
              ["Item key", "system.cpu.util[,user]"],
              ["Trigger name", "High CPU on {HOST.NAME}"],
              ["Condition", "> 90"],
              ["Severity", "High"],
            ].map(([label, val]) => (
              <Box key={label} sx={{ display: "flex", gap: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ color: "text.disabled", minWidth: 90, fontSize: "0.72rem" }}
                >
                  {label}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ fontFamily: "monospace", fontSize: "0.72rem", color: "text.primary" }}
                >
                  {val}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
          Use{" "}
          <Box component="span" sx={{ fontFamily: "monospace", fontSize: "0.72rem" }}>
            {"{HOST.NAME}"}
          </Box>{" "}
          in the trigger name — Zabbix expands it automatically. Trigger names must be unique per
          host.
        </Typography>
      </Stack>
    </AccordionDetails>
  </Accordion>
);

// ── Main view ─────────────────────────────────────────────────────────

export const Items = () => {
  // ── Hosts (shared across all forms) ──────────────────────────────────
  const [hosts, setHosts] = useState<Host[]>([]);
  const [hostsLoading, setHostsLoading] = useState(true);

  useEffect(() => {
    api
      .listHosts()
      .then((r) => setHosts(r.hosts))
      .catch(() => {})
      .finally(() => setHostsLoading(false));
  }, []);

  // ── Add item ──────────────────────────────────────────────────────────
  const [hostname, setHostname] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemKey, setItemKey] = useState("");
  const [valueType, setValueType] = useState(3);

  // ── Trigger presets (CPU / system) ───────────────────────────────────
  const TRIGGER_PRESETS = [
    {
      label: "CPU > 90%",
      itemKey: "system.cpu.util",
      name: "High CPU utilization on {HOST.NAME}",
      operator: ">",
      threshold: "90",
      severity: 4, // High
    },
    {
      label: "CPU > 80%",
      itemKey: "system.cpu.util",
      name: "CPU utilization warning on {HOST.NAME}",
      operator: ">",
      threshold: "80",
      severity: 2, // Warning
    },
    {
      label: "Memory < 10%",
      itemKey: "vm.memory.size[pavailable]",
      name: "Low available memory on {HOST.NAME}",
      operator: "<",
      threshold: "10",
      severity: 4,
    },
    {
      label: "Disk > 85%",
      itemKey: "vfs.fs.size[/,pused]",
      name: "Disk space critical on {HOST.NAME}",
      operator: ">",
      threshold: "85",
      severity: 3, // Average
    },
    {
      label: "CPU load > 5",
      itemKey: "system.cpu.load[percpu,avg1]",
      name: "High CPU load on {HOST.NAME}",
      operator: ">",
      threshold: "5",
      severity: 3,
    },
    {
      label: "Swap < 20%",
      itemKey: "system.swap.size[,pfree]",
      name: "Low swap space on {HOST.NAME}",
      operator: "<",
      threshold: "20",
      severity: 2,
    },
  ] as const;

  // ── Add trigger ───────────────────────────────────────────────────────
  const [triggerHost, setTriggerHost] = useState("");
  const [triggerItemKey, setTriggerItemKey] = useState("");
  const [triggerName, setTriggerName] = useState("");
  const [operator, setOperator] = useState(">");
  const [threshold, setThreshold] = useState("");
  const [severity, setSeverity] = useState(3);
  const [triggerItems, setTriggerItems] = useState<
    { itemid: string; name: string; key_: string }[]
  >([]);
  const [triggerItemsLoading, setTriggerItemsLoading] = useState(false);

  useEffect(() => {
    if (!triggerHost) {
      setTriggerItems([]);
      setTriggerItemKey("");
      return;
    }
    setTriggerItemsLoading(true);
    api
      .listItems(triggerHost, true)
      .then((r) => {
        setTriggerItems(r.items.filter((i) => i.value_type === "0" || i.value_type === "3"));
        setTriggerItemKey("");
      })
      .catch(() => setTriggerItems([]))
      .finally(() => setTriggerItemsLoading(false));
  }, [triggerHost]);

  // ── Manage items ──────────────────────────────────────────────────────
  const [searchItemHost, setSearchItemHost] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // ── Manage triggers ───────────────────────────────────────────────────
  const [searchTriggerHost, setSearchTriggerHost] = useState("");
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [loadingTriggers, setLoadingTriggers] = useState(false);

  // ── Toast ─────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });
  const showToast = (message: string, sev: "success" | "error") =>
    setToast({ open: true, message, severity: sev });

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
      await api.addTrigger({
        hostname: triggerHost,
        item_key: triggerItemKey,
        trigger_name: triggerName,
        operator,
        threshold: parsedThreshold,
        severity,
      });
      showToast("Trigger added successfully.", "success");
      setTriggerName("");
      setThreshold("");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    }
  };

  const onLoadItems = async () => {
    if (!searchItemHost) return;
    setLoadingItems(true);
    try {
      const res = await api.listItems(searchItemHost);
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
    if (!searchTriggerHost) return;
    setLoadingTriggers(true);
    try {
      const res = await api.listTriggers(searchTriggerHost);
      setTriggers(res.triggers);
      if (res.triggers.length === 0)
        showToast("No custom triggers found for this host.", "success");
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

  const HostSelect = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <FormControl size="small" fullWidth>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={hostsLoading}
        startAdornment={
          hostsLoading ? <CircularProgress size={14} sx={{ ml: 1, mr: 0.5 }} /> : undefined
        }
      >
        {hosts.map((h) => (
          <MenuItem key={h.hostid} value={h.host}>
            {h.host}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <PlaylistAddOutlinedIcon sx={{ fontSize: 28, color: "primary.main" }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Items & Triggers
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Add or remove monitoring items and alert triggers.
          </Typography>
        </Box>
      </Box>

      {/* ── Add item ── */}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Add item
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Attach a new metric check to an existing host.
            </Typography>
            <ItemHelp />
            <Divider />
            <HostSelect label="Host *" value={hostname} onChange={setHostname} />
            <TextField
              size="small"
              label="Item name"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="e.g. CPU User Time"
            />
            <Autocomplete
              freeSolo
              size="small"
              options={COMMON_ITEM_KEYS}
              getOptionLabel={(opt) =>
                typeof opt === "string" ? opt : `${opt.key} — ${opt.name}`
              }
              inputValue={itemKey}
              onInputChange={(_, v, reason) => {
                // "reset" fires after onChange sets the key — ignore it to prevent
                // the display label from overwriting the real item key.
                if (reason === "input" || reason === "clear") setItemKey(v);
              }}
              onChange={(_, v) => {
                if (v === null) {
                  setItemKey("");
                } else if (typeof v === "string") {
                  setItemKey(v);
                } else {
                  setItemKey(v.key);
                  if (!itemName) setItemName(v.name);
                  setValueType(v.valueType);
                }
              }}
              renderOption={(props, opt) => (
                <Box component="li" {...props} key={opt.key}>
                  <Box>
                    <Typography sx={{ fontSize: "0.82rem", fontFamily: "monospace", fontWeight: 500 }}>
                      {opt.key}
                    </Typography>
                    <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                      {opt.name} · {valueTypes.find((t) => t.value === opt.valueType)?.label}
                    </Typography>
                  </Box>
                </Box>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Item key *"
                  placeholder="e.g. system.cpu.util[,user]"
                  helperText="Select a common key or type your own — selecting auto-fills name and value type"
                />
              )}
            />
            <TextField
              select
              size="small"
              label="Value type"
              value={valueType}
              onChange={(e) => setValueType(Number(e.target.value))}
            >
              {valueTypes.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </TextField>
            <Box>
              <Button
                variant="contained"
                color="secondary"
                onClick={onCreate}
                disabled={!hostname || !itemName || !itemKey}
              >
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
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Delete item
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Look up a host's custom items and remove the ones you no longer need.
            </Typography>
            <Divider />
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ flex: 1 }}>
                <HostSelect
                  label="Host"
                  value={searchItemHost}
                  onChange={(v) => {
                    setSearchItemHost(v);
                    setItems([]);
                  }}
                />
              </Box>
              <Button
                variant="outlined"
                onClick={onLoadItems}
                disabled={!searchItemHost || loadingItems}
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
                      border: "1px solid",
                      borderColor: "divider",
                      backgroundColor: "action.hover",
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {item.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {item.key_} · every {item.delay}
                      </Typography>
                    </Box>
                    <Tooltip title="Delete item">
                      <IconButton
                        color="error"
                        size="small"
                        onClick={() => void onDeleteItem(item.itemid)}
                      >
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
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Add trigger
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Create an alert rule on an existing item (expression uses{" "}
              <code>.last()</code>).
            </Typography>
            <TriggerHelp />

            {/* Quick presets for common CPU / system triggers */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.75, display: "block" }}>
                Quick presets (requires standard Linux agent template)
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                {TRIGGER_PRESETS.map((p) => (
                  <Chip
                    key={`${p.itemKey}-${p.threshold}`}
                    label={p.label}
                    size="small"
                    clickable
                    color="primary"
                    variant="outlined"
                    onClick={() => {
                      setTriggerItemKey(p.itemKey);
                      setTriggerName(p.name);
                      setOperator(p.operator);
                      setThreshold(p.threshold);
                      setSeverity(p.severity);
                    }}
                    sx={{ fontSize: "0.75rem" }}
                  />
                ))}
              </Box>
            </Box>

            <Divider />
            <HostSelect label="Host *" value={triggerHost} onChange={setTriggerHost} />

            {/* Item key — autocomplete from host items, also accepts free-text (e.g. from presets) */}
            <Autocomplete
              freeSolo
              size="small"
              fullWidth
              disabled={!triggerHost}
              loading={triggerItemsLoading}
              options={triggerItems}
              getOptionLabel={(opt) =>
                typeof opt === "string" ? opt : `${opt.key_} — ${opt.name}`
              }
              inputValue={triggerItemKey}
              onInputChange={(_, v, reason) => {
                // "reset" fires after onChange already set the exact key_ — ignore it
                // to prevent the display label from overwriting the real key value.
                if (reason === "input" || reason === "clear") setTriggerItemKey(v);
              }}
              onChange={(_, v) => {
                if (v === null) setTriggerItemKey("");
                else if (typeof v === "string") setTriggerItemKey(v);
                else setTriggerItemKey(v.key_);
              }}
              renderOption={(props, opt) => (
                <Box component="li" {...props} key={opt.itemid}>
                  <Box>
                    <Typography sx={{ fontSize: "0.82rem", fontWeight: 500 }}>{opt.name}</Typography>
                    <Typography sx={{ fontSize: "0.72rem", fontFamily: "monospace", color: "text.secondary" }}>
                      {opt.key_}
                    </Typography>
                  </Box>
                </Box>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Item key *"
                  placeholder={triggerHost ? "Select or type a key" : "Select a host first"}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {triggerItemsLoading && <CircularProgress size={14} />}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />

            <TextField
              size="small"
              label="Trigger name"
              value={triggerName}
              onChange={(e) => setTriggerName(e.target.value)}
              placeholder="e.g. High CPU on {HOST.NAME}"
            />
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                select
                size="small"
                label="Operator"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                fullWidth
              >
                {operators.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="Threshold"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                fullWidth
                placeholder="e.g. 90"
              />
            </Stack>
            <TextField
              select
              size="small"
              label="Severity"
              value={severity}
              onChange={(e) => setSeverity(Number(e.target.value))}
            >
              {severities.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.label}
                </MenuItem>
              ))}
            </TextField>
            <Box>
              <Button
                variant="contained"
                onClick={onCreateTrigger}
                disabled={!triggerHost || !triggerItemKey || !triggerName || threshold.trim() === ""}
              >
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
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Delete trigger
            </Typography>
            <Typography color="text.secondary" variant="body2">
              Look up a host's custom triggers and remove the ones you no longer need.
            </Typography>
            <Divider />
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ flex: 1 }}>
                <HostSelect
                  label="Host"
                  value={searchTriggerHost}
                  onChange={(v) => {
                    setSearchTriggerHost(v);
                    setTriggers([]);
                  }}
                />
              </Box>
              <Button
                variant="outlined"
                onClick={onLoadTriggers}
                disabled={!searchTriggerHost || loadingTriggers}
                startIcon={
                  loadingTriggers ? <CircularProgress size={16} /> : <SearchOutlinedIcon />
                }
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
                      border: "1px solid",
                      borderColor: "divider",
                      backgroundColor: "action.hover",
                    }}
                  >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                          {t.description}
                        </Typography>
                        <Chip
                          label={severities[Number(t.priority)]?.label ?? t.priority}
                          size="small"
                          color={severityColor(t.priority)}
                          sx={{ height: 18, fontSize: "0.6rem", flexShrink: 0 }}
                        />
                      </Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block" }}
                        noWrap
                      >
                        {t.expression}
                      </Typography>
                    </Box>
                    <Tooltip title="Delete trigger">
                      <IconButton
                        color="error"
                        size="small"
                        onClick={() => void onDeleteTrigger(t.triggerid)}
                        sx={{ ml: 1, flexShrink: 0 }}
                      >
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
