"use client";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import HttpIcon from "@mui/icons-material/Http";
import NetworkCheckIcon from "@mui/icons-material/NetworkCheck";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import TerminalIcon from "@mui/icons-material/Terminal";
import PlaylistAddOutlinedIcon from "@mui/icons-material/PlaylistAddOutlined";
import RouterIcon from "@mui/icons-material/Router";
import ClearIcon from "@mui/icons-material/Clear";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Collapse,
  Skeleton,
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
import { SearchableSelect } from "../components/SearchableSelect";
import { type Host, api } from "../app/api";
import { useFavorites } from "../lib/favorites";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import WifiOffIcon from "@mui/icons-material/WifiOff";

const valueTypes = [
  { value: 0, label: "Float" },
  { value: 1, label: "String" },
  { value: 2, label: "Log" },
  { value: 3, label: "Integer" },
  { value: 4, label: "Text" },
];

const httpMethods = [
  { value: 0, label: "GET" },
  { value: 1, label: "POST" },
  { value: 2, label: "PUT" },
  { value: 3, label: "HEAD" },
];

const serviceTypes = [
  { value: "icmp_ping",  label: "ICMP Ping",           port: null, description: "Returns 0/1 — up or down" },
  { value: "icmp_loss",  label: "ICMP Packet Loss",    port: null, description: "Returns % packet loss" },
  { value: "icmp_time",  label: "ICMP Response Time",  port: null, description: "Returns round-trip time (s)" },
  { value: "http",       label: "HTTP",                port: 80,   description: "TCP check on port 80" },
  { value: "https",      label: "HTTPS",               port: 443,  description: "TCP check on port 443" },
  { value: "ssh",        label: "SSH",                 port: 22,   description: "TCP check on port 22" },
  { value: "smtp",       label: "SMTP",                port: 25,   description: "TCP check on port 25" },
  { value: "ftp",        label: "FTP",                 port: 21,   description: "TCP check on port 21" },
  { value: "tcp_port",   label: "TCP Port",            port: null, description: "Custom TCP port check" },
];

const icmpTypes = new Set(["icmp_ping", "icmp_loss", "icmp_time"]);


const severities = [
  { value: 0, label: "None" },
  { value: 1, label: "Info" },
  { value: 2, label: "Low" },
  { value: 3, label: "Medium" },
  { value: 4, label: "High" },
  { value: 5, label: "Critical" },
];


type ParamDef =
  | { type: "text";   label: string; default?: string; placeholder?: string; helperText?: string; required?: boolean }
  | { type: "select"; label: string; default?: string; helperText?: string; required?: boolean; options: { value: string; label: string }[] };

const KEY_PARAM_DEFS: Record<string, ParamDef[]> = {
  "system.cpu.util": [
    { type: "text",   label: "CPU index",    default: "", placeholder: "empty = all CPUs",   helperText: "Leave empty for all CPUs, or specify index: 0, 1, 2…" },
    { type: "select", label: "Metric type",  default: "", options: [
      { value: "",          label: "Total (all types)" },
      { value: "user",      label: "User" },
      { value: "system",    label: "System" },
      { value: "idle",      label: "Idle" },
      { value: "iowait",    label: "I/O wait" },
      { value: "softirq",   label: "Soft IRQ" },
      { value: "interrupt", label: "Interrupt" },
      { value: "nice",      label: "Nice" },
    ]},
    { type: "select", label: "Averaging interval", default: "avg1", options: [
      { value: "avg1",  label: "1-minute average" },
      { value: "avg5",  label: "5-minute average" },
      { value: "avg15", label: "15-minute average" },
    ]},
  ],
  "system.cpu.load": [
    { type: "select", label: "CPU scope", default: "", options: [
      { value: "",       label: "All CPUs (total load)" },
      { value: "percpu", label: "Per-CPU average" },
    ]},
    { type: "select", label: "Averaging interval", default: "avg1", options: [
      { value: "avg1",  label: "1-minute average" },
      { value: "avg5",  label: "5-minute average" },
      { value: "avg15", label: "15-minute average" },
    ]},
  ],
  "vfs.fs.size": [
    { type: "text",   label: "Filesystem / mount point", default: "/", placeholder: "/", required: true, helperText: "e.g. / or /var or C: (Windows)" },
    { type: "select", label: "Metric", default: "pfree", options: [
      { value: "total",  label: "Total (bytes)" },
      { value: "free",   label: "Free (bytes)" },
      { value: "used",   label: "Used (bytes)" },
      { value: "pfree",  label: "Free (%)" },
      { value: "pused",  label: "Used (%)" },
    ]},
  ],
  "vfs.fs.inode": [
    { type: "text",   label: "Filesystem / mount point", default: "/", placeholder: "/", required: true },
    { type: "select", label: "Metric", default: "pfree", options: [
      { value: "total",  label: "Total inodes" },
      { value: "free",   label: "Free inodes" },
      { value: "used",   label: "Used inodes" },
      { value: "pfree",  label: "Free (%)" },
      { value: "pused",  label: "Used (%)" },
    ]},
  ],
  "vfs.dev.read": [
    { type: "text",   label: "Device", default: "", placeholder: "empty = all devices", helperText: "e.g. sda, nvme0n1 — leave empty for all" },
    { type: "select", label: "Metric", default: "ops", options: [
      { value: "ops",   label: "Operations / s" },
      { value: "bytes", label: "Bytes / s" },
      { value: "sps",   label: "Sectors / s" },
      { value: "await", label: "Wait time (ms)" },
    ]},
  ],
  "vfs.dev.write": [
    { type: "text",   label: "Device", default: "", placeholder: "empty = all devices", helperText: "e.g. sda, nvme0n1 — leave empty for all" },
    { type: "select", label: "Metric", default: "ops", options: [
      { value: "ops",   label: "Operations / s" },
      { value: "bytes", label: "Bytes / s" },
      { value: "sps",   label: "Sectors / s" },
      { value: "await", label: "Wait time (ms)" },
    ]},
  ],
  "net.if.in": [
    { type: "text",   label: "Interface name", default: "eth0", placeholder: "eth0", required: true, helperText: "e.g. eth0, ens3, ens160" },
    { type: "select", label: "Metric", default: "bytes", options: [
      { value: "bytes",   label: "Bytes / s" },
      { value: "packets", label: "Packets / s" },
      { value: "errors",  label: "Errors / s" },
      { value: "dropped", label: "Dropped / s" },
    ]},
  ],
  "net.if.out": [
    { type: "text",   label: "Interface name", default: "eth0", placeholder: "eth0", required: true, helperText: "e.g. eth0, ens3, ens160" },
    { type: "select", label: "Metric", default: "bytes", options: [
      { value: "bytes",   label: "Bytes / s" },
      { value: "packets", label: "Packets / s" },
      { value: "errors",  label: "Errors / s" },
      { value: "dropped", label: "Dropped / s" },
    ]},
  ],
  "net.if.total": [
    { type: "text",   label: "Interface name", default: "eth0", placeholder: "eth0", required: true },
    { type: "select", label: "Metric", default: "bytes", options: [
      { value: "bytes",   label: "Bytes / s" },
      { value: "packets", label: "Packets / s" },
      { value: "errors",  label: "Errors / s" },
      { value: "dropped", label: "Dropped / s" },
    ]},
  ],
  "net.tcp.listen": [
    { type: "text", label: "Port", default: "80", placeholder: "80", required: true, helperText: "Returns 1 if listening, 0 if not" },
  ],
  "net.tcp.port": [
    { type: "text", label: "IP address", default: "", placeholder: "empty = host IP", helperText: "Leave empty to use the monitored host's address" },
    { type: "text", label: "Port", default: "80", placeholder: "80", required: true },
  ],
  "proc.num": [
    { type: "text",   label: "Process name",          default: "", placeholder: "e.g. nginx",       helperText: "Leave empty to count all processes" },
    { type: "text",   label: "Run-as user",            default: "", placeholder: "e.g. www-data",    helperText: "Optional: filter by owner username" },
    { type: "select", label: "Process state", default: "", options: [
      { value: "",      label: "Any state" },
      { value: "run",   label: "Running" },
      { value: "sleep", label: "Sleeping" },
      { value: "zomb",  label: "Zombie" },
      { value: "disk",  label: "Uninterruptible sleep (D)" },
    ]},
    { type: "text",   label: "Command line regex",    default: "", placeholder: "optional regex",    helperText: "Optional: filter by matching command line" },
  ],
  "proc.mem": [
    { type: "text",   label: "Process name", default: "", placeholder: "e.g. nginx", required: true },
    { type: "text",   label: "Run-as user",  default: "", placeholder: "optional" },
    { type: "select", label: "Memory metric", default: "rss", options: [
      { value: "rss",   label: "RSS — resident set size" },
      { value: "vsize", label: "VSZ — virtual size" },
      { value: "pmem",  label: "% of total memory" },
    ]},
  ],
  "proc.cpu.util": [
    { type: "text",   label: "Process name", default: "", placeholder: "e.g. nginx", required: true },
    { type: "text",   label: "Run-as user",  default: "", placeholder: "optional" },
    { type: "select", label: "CPU metric", default: "", options: [
      { value: "",       label: "Total (user + system)" },
      { value: "user",   label: "User CPU only" },
      { value: "system", label: "System CPU only" },
    ]},
  ],
  "vm.memory.size": [
    { type: "select", label: "Metric", default: "available", options: [
      { value: "total",      label: "Total (bytes)" },
      { value: "available",  label: "Available (bytes)" },
      { value: "used",       label: "Used (bytes)" },
      { value: "free",       label: "Free (bytes)" },
      { value: "shared",     label: "Shared (bytes)" },
      { value: "pavailable", label: "Available (%)" },
      { value: "pused",      label: "Used (%)" },
    ]},
  ],
  "system.swap.size": [
    { type: "text",   label: "Swap device", default: "", placeholder: "empty = all swap devices" },
    { type: "select", label: "Metric", default: "pfree", options: [
      { value: "total", label: "Total (bytes)" },
      { value: "free",  label: "Free (bytes)" },
      { value: "used",  label: "Used (bytes)" },
      { value: "pfree", label: "Free (%)" },
      { value: "pused", label: "Used (%)" },
    ]},
  ],
  "vfs.file.exists": [
    { type: "text", label: "File path", default: "", placeholder: "/var/run/app.pid", required: true, helperText: "Full absolute path to the file" },
  ],
  "vfs.file.size": [
    { type: "text", label: "File path", default: "", placeholder: "/var/log/app.log", required: true },
  ],
  "vfs.file.contents": [
    { type: "text", label: "File path", default: "", placeholder: "/etc/hostname", required: true },
  ],
  "vfs.file.md5sum": [
    { type: "text", label: "File path", default: "", placeholder: "/etc/passwd", required: true },
  ],
  "vfs.file.cksum": [
    { type: "text", label: "File path", default: "", placeholder: "/etc/passwd", required: true },
  ],
  "vfs.file.time": [
    { type: "text",   label: "File path", default: "", placeholder: "/var/log/app.log", required: true },
    { type: "select", label: "Time type", default: "modify", options: [
      { value: "modify", label: "Last modified" },
      { value: "access", label: "Last accessed" },
      { value: "change", label: "Last changed (inode)" },
    ]},
  ],
  "vfs.file.regexp": [
    { type: "text", label: "File path",       default: "", placeholder: "/var/log/app.log", required: true },
    { type: "text", label: "Pattern (regex)", default: "", placeholder: "error|ERROR",       required: true, helperText: "Regular expression to search for in file" },
    { type: "text", label: "Encoding",        default: "", placeholder: "optional, e.g. UTF-8" },
    { type: "text", label: "Start line",      default: "", placeholder: "optional" },
    { type: "text", label: "End line",        default: "", placeholder: "optional" },
    { type: "text", label: "Output format",   default: "", placeholder: "optional, e.g. \\1 for first group" },
  ],
  "service.info": [
    { type: "text",   label: "Service name", default: "", placeholder: "e.g. MSSQLSERVER", required: true, helperText: "Windows service name (not the display name)" },
    { type: "select", label: "Parameter",    default: "state", options: [
      { value: "state",       label: "State (0 = running)" },
      { value: "displayname", label: "Display name" },
      { value: "path",        label: "Executable path" },
      { value: "user",        label: "Run-as user" },
      { value: "startup",     label: "Startup type" },
      { value: "description", label: "Description" },
    ]},
  ],
  "perf_counter": [
    { type: "text", label: "Counter path", default: "", placeholder: "\\\\Processor(_Total)\\\\% Processor Time", required: true, helperText: "Full Windows performance counter path" },
  ],
  "eventlog": [
    { type: "text",   label: "Log name",     default: "System",  placeholder: "System",   required: true, helperText: "Windows event log: System, Application, Security…" },
    { type: "text",   label: "Event source", default: "",        placeholder: "optional" },
    { type: "select", label: "Severity", default: "Error", options: [
      { value: "",             label: "Any" },
      { value: "Information",  label: "Information" },
      { value: "Warning",      label: "Warning" },
      { value: "Error",        label: "Error" },
      { value: "FailureAudit", label: "Failure Audit" },
      { value: "SuccessAudit", label: "Success Audit" },
    ]},
  ],
};

const assembleAgentKey = (base: string, params: string[]): string => {
  const trimmed = [...params];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") trimmed.pop();
  return trimmed.length > 0 ? `${base}[${trimmed.join(",")}]` : base;
};

// Sorted by group so MUI Autocomplete groupBy works correctly.
const COMMON_ITEM_KEYS = [
  // Agent
  { group: "Agent",   key: "agent.ping",                              name: "Agent ping (1 = alive)",                   valueType: 3 },
  { group: "Agent",   key: "agent.version",                           name: "Agent version",                            valueType: 1 },
  { group: "Agent",   key: "agent.hostname",                          name: "Agent hostname",                           valueType: 1 },
  // CPU
  { group: "CPU",     key: "system.cpu.util",                         name: "CPU utilization (%)",                      valueType: 0 },
  { group: "CPU",     key: "system.cpu.util[,user]",                  name: "CPU user utilization (%)",                 valueType: 0 },
  { group: "CPU",     key: "system.cpu.util[,system]",                name: "CPU system utilization (%)",               valueType: 0 },
  { group: "CPU",     key: "system.cpu.util[,idle]",                  name: "CPU idle time (%)",                        valueType: 0 },
  { group: "CPU",     key: "system.cpu.util[,iowait]",                name: "CPU I/O wait (%)",                         valueType: 0 },
  { group: "CPU",     key: "system.cpu.util[,softirq]",               name: "CPU softirq (%)",                          valueType: 0 },
  { group: "CPU",     key: "system.cpu.load[percpu,avg1]",            name: "CPU load per core (1 min avg)",            valueType: 0 },
  { group: "CPU",     key: "system.cpu.load[percpu,avg5]",            name: "CPU load per core (5 min avg)",            valueType: 0 },
  { group: "CPU",     key: "system.cpu.load[percpu,avg15]",           name: "CPU load per core (15 min avg)",           valueType: 0 },
  { group: "CPU",     key: "system.cpu.num",                          name: "Number of CPUs",                           valueType: 3 },
  // Disk
  { group: "Disk",    key: "vfs.fs.size[/,pfree]",                    name: "Free disk space on / (%)",                 valueType: 0 },
  { group: "Disk",    key: "vfs.fs.size[/,pused]",                    name: "Used disk space on / (%)",                 valueType: 0 },
  { group: "Disk",    key: "vfs.fs.size[/,free]",                     name: "Free disk space on / (bytes)",             valueType: 3 },
  { group: "Disk",    key: "vfs.fs.size[/,used]",                     name: "Used disk space on / (bytes)",             valueType: 3 },
  { group: "Disk",    key: "vfs.fs.size[/,total]",                    name: "Total disk space on / (bytes)",            valueType: 3 },
  { group: "Disk",    key: "vfs.fs.inode[/,pfree]",                   name: "Free inodes on / (%)",                     valueType: 0 },
  { group: "Disk",    key: "vfs.dev.read[,ops]",                      name: "Disk read operations/s",                   valueType: 0 },
  { group: "Disk",    key: "vfs.dev.write[,ops]",                     name: "Disk write operations/s",                  valueType: 0 },
  { group: "Disk",    key: "vfs.dev.read[,bytes]",                    name: "Disk read throughput (bytes/s)",           valueType: 0 },
  { group: "Disk",    key: "vfs.dev.write[,bytes]",                   name: "Disk write throughput (bytes/s)",          valueType: 0 },
  // File
  { group: "File",    key: "vfs.file.exists[/path/to/file]",          name: "File exists (1=yes, 0=no)",                valueType: 3 },
  { group: "File",    key: "vfs.file.size[/path/to/file]",            name: "File size (bytes)",                        valueType: 3 },
  { group: "File",    key: "vfs.file.time[/path/to/file,modify]",     name: "File last modified (Unix timestamp)",      valueType: 3 },
  { group: "File",    key: "vfs.file.regexp[/path/to/file,pattern]",  name: "Pattern found in file (1=yes)",            valueType: 3 },
  { group: "File",    key: "vfs.file.contents[/path/to/file]",        name: "File contents (≤ 64 KB)",                  valueType: 1 },
  { group: "File",    key: "vfs.file.md5sum[/path/to/file]",          name: "File MD5 checksum",                        valueType: 1 },
  { group: "File",    key: "vfs.file.cksum[/path/to/file]",           name: "File CRC32 checksum",                      valueType: 3 },
  // Memory
  { group: "Memory",  key: "vm.memory.size[available]",               name: "Available memory (bytes)",                 valueType: 3 },
  { group: "Memory",  key: "vm.memory.size[pavailable]",              name: "Available memory (%)",                     valueType: 0 },
  { group: "Memory",  key: "vm.memory.size[used]",                    name: "Used memory (bytes)",                      valueType: 3 },
  { group: "Memory",  key: "vm.memory.size[pused]",                   name: "Used memory (%)",                          valueType: 0 },
  { group: "Memory",  key: "vm.memory.size[total]",                   name: "Total memory (bytes)",                     valueType: 3 },
  { group: "Memory",  key: "vm.memory.size[free]",                    name: "Free memory (bytes)",                      valueType: 3 },
  { group: "Memory",  key: "system.swap.size[,pfree]",                name: "Free swap (%)",                            valueType: 0 },
  { group: "Memory",  key: "system.swap.size[,pused]",                name: "Used swap (%)",                            valueType: 0 },
  { group: "Memory",  key: "system.swap.size[,free]",                 name: "Free swap (bytes)",                        valueType: 3 },
  { group: "Memory",  key: "system.swap.size[,used]",                 name: "Used swap (bytes)",                        valueType: 3 },
  { group: "Memory",  key: "system.swap.size[,total]",                name: "Total swap (bytes)",                       valueType: 3 },
  // Network
  { group: "Network", key: "net.if.in[eth0,bytes]",                   name: "Network in — eth0 (bytes/s)",              valueType: 3 },
  { group: "Network", key: "net.if.out[eth0,bytes]",                  name: "Network out — eth0 (bytes/s)",             valueType: 3 },
  { group: "Network", key: "net.if.total[eth0,bytes]",                name: "Network total — eth0 (bytes/s)",           valueType: 3 },
  { group: "Network", key: "net.if.in[eth0,packets]",                 name: "Network in — eth0 (packets/s)",            valueType: 3 },
  { group: "Network", key: "net.if.out[eth0,packets]",                name: "Network out — eth0 (packets/s)",           valueType: 3 },
  { group: "Network", key: "net.if.in[eth0,errors]",                  name: "Network in errors — eth0",                 valueType: 3 },
  { group: "Network", key: "net.if.out[eth0,errors]",                 name: "Network out errors — eth0",                valueType: 3 },
  { group: "Network", key: "net.if.in[eth0,dropped]",                 name: "Network in dropped — eth0",                valueType: 3 },
  { group: "Network", key: "net.tcp.listen[80]",                      name: "TCP port 80 listening (0/1)",              valueType: 3 },
  { group: "Network", key: "net.tcp.listen[443]",                     name: "TCP port 443 listening (0/1)",             valueType: 3 },
  { group: "Network", key: "net.tcp.listen[22]",                      name: "TCP port 22 listening (0/1)",              valueType: 3 },
  { group: "Network", key: "net.tcp.port[,80]",                       name: "TCP port 80 open check (0/1)",             valueType: 3 },
  // Process
  { group: "Process", key: "proc.num[]",                              name: "Total processes",                          valueType: 3 },
  { group: "Process", key: "proc.num[,,,run]",                        name: "Processes in running state",               valueType: 3 },
  { group: "Process", key: "proc.num[,,,sleep]",                      name: "Processes in sleep state",                 valueType: 3 },
  { group: "Process", key: "proc.num[,,,zomb]",                       name: "Zombie processes",                         valueType: 3 },
  { group: "Process", key: "proc.mem[nginx,,,,rss]",                  name: "Memory used by nginx (bytes)",             valueType: 3 },
  { group: "Process", key: "proc.cpu.util[nginx]",                    name: "CPU used by nginx (%)",                    valueType: 0 },
  { group: "Process", key: "proc.num[sshd]",                          name: "sshd process count",                       valueType: 3 },
  // System
  { group: "System",  key: "system.uptime",                           name: "System uptime (seconds)",                  valueType: 3 },
  { group: "System",  key: "system.hostname",                         name: "System hostname",                          valueType: 1 },
  { group: "System",  key: "system.uname",                            name: "OS name (uname)",                          valueType: 1 },
  { group: "System",  key: "system.localtime",                        name: "Local time (Unix timestamp)",              valueType: 3 },
  { group: "System",  key: "system.users.num",                        name: "Logged-in user count",                     valueType: 3 },
  { group: "System",  key: "system.boottime",                         name: "Boot time (Unix timestamp)",               valueType: 3 },
  // Windows
  { group: "Windows", key: "vfs.fs.size[C:,pfree]",                   name: "C: free space (%)",                        valueType: 0 },
  { group: "Windows", key: "vfs.fs.size[C:,pused]",                   name: "C: used space (%)",                        valueType: 0 },
  { group: "Windows", key: "vfs.fs.size[C:,free]",                    name: "C: free space (bytes)",                    valueType: 3 },
  { group: "Windows", key: "vfs.fs.size[D:,pfree]",                   name: "D: free space (%)",                        valueType: 0 },
  { group: "Windows", key: "service.info[service_name,state]",        name: "Windows service state",                    valueType: 3 },
  { group: "Windows", key: "perf_counter[\\Processor(_Total)\\% Processor Time]", name: "Windows CPU usage (%)",        valueType: 0 },
  { group: "Windows", key: "perf_counter[\\Memory\\Available MBytes]",name: "Windows available memory (MB)",           valueType: 0 },
  { group: "Windows", key: "perf_counter[\\LogicalDisk(C:)\\% Free Space]", name: "Windows C: free space (%)",         valueType: 0 },
  { group: "Windows", key: "eventlog[System,,Error]",                 name: "Windows System event log (errors)",        valueType: 2 },
  { group: "Windows", key: "eventlog[Application,,Error]",            name: "Windows Application event log (errors)",   valueType: 2 },
  { group: "Windows", key: "vfs.file.exists[C:\\path\\to\\file.txt]", name: "File exists on Windows path (1/0)",        valueType: 3 },
];

type DbMetric = { value: string; label: string; vtype: number; hasExtra: boolean; extraLabel?: string };
const DB_AGENT2_METRICS: Record<string, DbMetric[]> = {
  postgresql: [
    { value: "ping",        label: "Ping (1=up, 0=down)",    vtype: 3, hasExtra: false },
    { value: "version",     label: "Server version",         vtype: 4, hasExtra: false },
    { value: "connections", label: "Connection stats (JSON)", vtype: 4, hasExtra: false },
    { value: "db_size",     label: "Database size (bytes)",   vtype: 3, hasExtra: true,  extraLabel: "Database name" },
  ],
  mysql: [
    { value: "ping",        label: "Ping (1=up, 0=down)",    vtype: 3, hasExtra: false },
    { value: "version",     label: "Server version",         vtype: 4, hasExtra: false },
    { value: "connections", label: "Active connections",     vtype: 3, hasExtra: false },
    { value: "db_size",     label: "Database size (bytes)",   vtype: 3, hasExtra: true,  extraLabel: "Database name" },
  ],
  mongodb: [
    { value: "ping",        label: "Ping (1=up, 0=down)",    vtype: 3, hasExtra: false },
    { value: "version",     label: "Server version",         vtype: 4, hasExtra: false },
    { value: "connections", label: "Current connections",    vtype: 3, hasExtra: false },
  ],
  mssql: [
    { value: "ping",        label: "Ping (1=up, 0=down)",    vtype: 3, hasExtra: false },
    { value: "version",     label: "Server version",         vtype: 4, hasExtra: false },
    { value: "connections", label: "Active connections",     vtype: 3, hasExtra: false },
  ],
};

type BulkResult = { hostname: string; item_id: string | null; error: string | null };
type Item = { itemid: string; name: string; key_: string; value_type: string; delay: string };
type AllItem = { itemid: string; name: string; key_: string; value_type: string; delay: string; status: string; state: string; hostname: string; tags: Array<{ tag: string; value: string }>; lastvalue: string; lastclock: number | null; templateid: string };

const timeAgo = (ts: number | null): string => {
  if (!ts) return "";
  const secs = Math.floor(Date.now() / 1000) - ts;
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
};

// Parse a Zabbix delay string (e.g. "30s", "1m", "5m", "0") to seconds.
// Returns 0 for unparseable / passive items so we skip staleness checks.
const parseDelaySecs = (delay: string): number => {
  if (!delay || delay === "0") return 0;
  const m = delay.match(/^(\d+)([smhd]?)$/i);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  const unit = (m[2] || "s").toLowerCase();
  if (unit === "m") return n * 60;
  if (unit === "h") return n * 3600;
  if (unit === "d") return n * 86400;
  return n;
};

// An item is stale when Zabbix hasn't collected a value in >3× the polling interval.
// We use 3× as a buffer to allow for slight delays and missed polls.
const isItemStale = (item: AllItem): boolean => {
  if (item.state === "1") return false; // "Not Supported" has its own chip
  const delaySecs = parseDelaySecs(item.delay);
  if (delaySecs === 0) return false;  // passive / dependent / no-interval item
  if (!item.lastclock) return true;   // never collected any data
  return Math.floor(Date.now() / 1000) - item.lastclock > delaySecs * 3;
};

// ── Bulk results list ─────────────────────────────────────────────────

const BulkResults = ({ results, label }: { results: BulkResult[]; label: string }) => {
  const ok = results.filter((r) => !r.error).length;
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, overflow: "hidden" }}>
      <Box sx={{ px: 1.5, py: 1, bgcolor: "action.hover", borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography variant="caption" sx={{ fontWeight: 700 }}>
          {label}: {ok}/{results.length} succeeded
        </Typography>
      </Box>
      <Stack divider={<Divider />}>
        {results.map((r) => (
          <Box key={r.hostname} sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, py: 0.75 }}>
            {r.error
              ? <ErrorOutlineIcon sx={{ fontSize: 16, color: "error.main", flexShrink: 0 }} />
              : <CheckCircleOutlineIcon sx={{ fontSize: 16, color: "success.main", flexShrink: 0 }} />}
            <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }} noWrap>{r.hostname}</Typography>
            {r.error && (
              <Typography variant="caption" color="error.main" noWrap sx={{ maxWidth: 260 }}>{r.error}</Typography>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  );
};

// ── Main view ─────────────────────────────────────────────────────────

type ServerItemKey = {
  key: string; name: string; valueType: number; group: string;
  delay?: string; units?: string; history?: string; trends?: string; description?: string;
};


// ── Main Items view ────────────────────────────────────────────────────

export const Items = () => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [hostsLoading, setHostsLoading] = useState(true);
  const [serverItemKeys, setServerItemKeys] = useState<ServerItemKey[]>([]);
  const [itemKeysLoading, setItemKeysLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchHosts = () =>
      api.listHosts()
        .then((r) => { if (!cancelled) setHosts(r.hosts); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setHostsLoading(false); });
    void fetchHosts();
    const t = window.setInterval(fetchHosts, 10_000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, []);

  useEffect(() => {
    api.listItemKeys()
      .then((r) => setServerItemKeys(r.items.map((i) => ({
        key: i.key_, name: i.name, valueType: parseInt(i.value_type, 10), group: i.group,
        delay: i.delay, units: i.units, history: i.history, trends: i.trends, description: i.description,
      }))))
      .catch(() => {})
      .finally(() => setItemKeysLoading(false));
  }, []);

  // ── Item type tab ─────────────────────────────────────────────────────
  const [itemType, setItemType] = useState<"agent" | "http" | "service" | "script" | "filewatch" | "database" | "snmp" | "snmptrap" | "internal" | "trapper" | "external" | "ipmi" | "ssh" | "telnet" | "jmx" | "calculated" | "dependent" | "scriptitem" | "browser">("agent");

  // ── Agent item state ──────────────────────────────────────────────────
  const [hostname, setHostname] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemKey, setItemKey] = useState("");
  const [valueType, setValueType] = useState(3);
  const [agentParamMode, setAgentParamMode] = useState(false);
  const [agentKeyBase, setAgentKeyBase] = useState("");
  const [agentKeyParams, setAgentKeyParams] = useState<string[]>([]);
  const effectiveItemKey = agentParamMode && agentKeyBase
    ? assembleAgentKey(agentKeyBase, agentKeyParams)
    : itemKey;
  const [itemDelay, setItemDelay] = useState("1m");
  const [itemUnits, setItemUnits] = useState("");
  const [itemHistory, setItemHistory] = useState("31d");
  const [itemTrends, setItemTrends] = useState("365d");
  const [itemDescription, setItemDescription] = useState("");
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [agentTimeoutMode, setAgentTimeoutMode] = useState<"global" | "override">("global");
  const [agentTimeout, setAgentTimeout] = useState("3s");
  const [agentCustomIntervals, setAgentCustomIntervals] = useState<{ type: "flexible" | "scheduling"; interval: string; period: string }[]>([]);

  // ── HTTP item state ───────────────────────────────────────────────────
  const [httpHostname, setHttpHostname] = useState("");
  const [httpItemName, setHttpItemName] = useState("");
  const [httpUrl, setHttpUrl] = useState("");
  const [httpMethod, setHttpMethod] = useState(0);
  const [httpStatusCodes, setHttpStatusCodes] = useState("200");
  const [httpTimeout, setHttpTimeout] = useState("15s");
  const [httpVerifyTLS, setHttpVerifyTLS] = useState(true);
  const [httpVerifyHost, setHttpVerifyHost] = useState(true);
  const [httpFollowRedirects, setHttpFollowRedirects] = useState(true);
  const [httpPostBody, setHttpPostBody] = useState("");
  const [httpPostBodyType, setHttpPostBodyType] = useState(0); // 0=Raw 2=JSON 3=XML
  const [httpRetrieveMode, setHttpRetrieveMode] = useState(0); // 0=body 1=headers 2=both
  const [httpHeaders, setHttpHeaders] = useState<{name: string; value: string}[]>([]);
  const [httpQueryFields, setHttpQueryFields] = useState<{name: string; value: string}[]>([]);
  const [httpProxy, setHttpProxy] = useState("");
  const [httpSslCertFile, setHttpSslCertFile] = useState("");
  const [httpSslKeyFile, setHttpSslKeyFile] = useState("");
  const [httpSslKeyPassword, setHttpSslKeyPassword] = useState("");
  const [httpConvertToJson, setHttpConvertToJson] = useState(false);
  const [httpAllowTraps, setHttpAllowTraps] = useState(false);
  const [httpEnabled, setHttpEnabled] = useState(true);
  const [httpValueType, setHttpValueType] = useState(3);

  // ── Service item state ────────────────────────────────────────────────
  const [svcHostname, setSvcHostname] = useState("");
  const [svcType, setSvcType] = useState("icmp_ping");
  const [svcPort, setSvcPort] = useState<string>("");
  const [svcItemName, setSvcItemName] = useState("");

  // ── File watch state ──────────────────────────────────────────────────
  const [fwHostname, setFwHostname] = useState("");
  const [fwFilePath, setFwFilePath] = useState("");
  const [fwCheckType, setFwCheckType] = useState<"checksum" | "mtime" | "size" | "exists" | "folder_latest">("checksum");
  const [fwFolderOs, setFwFolderOs] = useState<"linux" | "windows">("linux");
  const [fwItemName, setFwItemName] = useState("");
  const [fwCreateTrigger, setFwCreateTrigger] = useState(true);
  const [fwTriggerName, setFwTriggerName] = useState("");
  const [fwTriggerPriority, setFwTriggerPriority] = useState(2);
  const [fwTriggerType, setFwTriggerType] = useState<"change" | "age">("change");
  const [fwMaxAgeMinutes, setFwMaxAgeMinutes] = useState(60);

  // ── HTTP auth + preprocessing state ──────────────────────────────────
  const [httpAuthType, setHttpAuthType] = useState(0);
  const [httpUsername, setHttpUsername] = useState("");
  const [httpPassword, setHttpPassword] = useState("");
  const [httpRegexEnabled, setHttpRegexEnabled] = useState(false);
  const [httpRegexPattern, setHttpRegexPattern] = useState("");
  const [httpRegexOutput, setHttpRegexOutput] = useState("\\1");
  const [httpRegexNoMatch, setHttpRegexNoMatch] = useState("0");

  // ── Script item state ─────────────────────────────────────────────────
  const [scriptHostname, setScriptHostname] = useState("");
  const [scriptType, setScriptType] = useState<"bash" | "powershell">("bash");
  const [scriptMode, setScriptMode] = useState<"command" | "file">("command");
  const [scriptContent, setScriptContent] = useState("");
  const [scriptFileArg, setScriptFileArg] = useState("");
  const [scriptItemName, setScriptItemName] = useState("");
  const [scriptValueType, setScriptValueType] = useState(1);

  // ── Database item state ───────────────────────────────────────────────
  const [dbHostname, setDbHostname] = useState("");
  const [dbMode, setDbMode] = useState<"odbc" | "agent2">("agent2");
  // ODBC
  const [dbDsn, setDbDsn] = useState("");
  const [dbDescription, setDbDescription] = useState("");
  const [dbSqlQuery, setDbSqlQuery] = useState("");
  const [dbOdbcValueType, setDbOdbcValueType] = useState(3);
  const [dbOdbcUsername, setDbOdbcUsername] = useState("");
  const [dbOdbcPassword, setDbOdbcPassword] = useState("");
  const [dbOdbcItemName, setDbOdbcItemName] = useState("");
  // Agent2
  const [dbEngine, setDbEngine] = useState("postgresql");
  const [dbMetric, setDbMetric] = useState("ping");
  const [dbConnString, setDbConnString] = useState("");
  const [dbExtraParam, setDbExtraParam] = useState("");
  const [dbAgent2ItemName, setDbAgent2ItemName] = useState("");

  // ── Shared host for new item types ───────────────────────────────────
  const [genericHostname, setGenericHostname] = useState("");

  // ── SNMP state ───────────────────────────────────────────────────────
  const [snmpItemName, setSnmpItemName] = useState("");
  const [snmpOid, setSnmpOid] = useState("");
  const [snmpVersion, setSnmpVersion] = useState(2);
  const [snmpCommunity, setSnmpCommunity] = useState("public");
  const [snmpV3SecName, setSnmpV3SecName] = useState("");
  const [snmpV3SecLevel, setSnmpV3SecLevel] = useState(0);
  const [snmpV3AuthProto, setSnmpV3AuthProto] = useState(0);
  const [snmpV3AuthPass, setSnmpV3AuthPass] = useState("");
  const [snmpV3PrivProto, setSnmpV3PrivProto] = useState(0);
  const [snmpV3PrivPass, setSnmpV3PrivPass] = useState("");
  const [snmpV3Context, setSnmpV3Context] = useState("");
  const [snmpValueType, setSnmpValueType] = useState(3);

  // ── SNMP Trap state ──────────────────────────────────────────────────
  const [snmpTrapItemName, setSnmpTrapItemName] = useState("");
  const [snmpTrapKey, setSnmpTrapKey] = useState("snmptrap.fallback");
  const [snmpTrapValueType, setSnmpTrapValueType] = useState(1);

  // ── Internal item state ──────────────────────────────────────────────
  const [internalItemName, setInternalItemName] = useState("");
  const [internalKey, setInternalKey] = useState("");
  const [internalValueType, setInternalValueType] = useState(3);

  // ── Trapper item state ───────────────────────────────────────────────
  const [trapperItemName, setTrapperItemName] = useState("");
  const [trapperKey, setTrapperKey] = useState("");
  const [trapperValueType, setTrapperValueType] = useState(4);
  const [trapperAllowTraps, setTrapperAllowTraps] = useState(true);

  // ── External check state ─────────────────────────────────────────────
  const [externalItemName, setExternalItemName] = useState("");
  const [externalKey, setExternalKey] = useState("");
  const [externalValueType, setExternalValueType] = useState(4);

  // ── IPMI state ───────────────────────────────────────────────────────
  const [ipmiItemName, setIpmiItemName] = useState("");
  const [ipmiSensor, setIpmiSensor] = useState("");
  const [ipmiValueType, setIpmiValueType] = useState(0);

  // ── SSH state ────────────────────────────────────────────────────────
  const [sshItemName, setSshItemName] = useState("");
  const [sshParams, setSshParams] = useState("");
  const [sshAuthType, setSshAuthType] = useState(0);
  const [sshUsername, setSshUsername] = useState("");
  const [sshPassword, setSshPassword] = useState("");
  const [sshPublicKey, setSshPublicKey] = useState("");
  const [sshPrivateKey, setSshPrivateKey] = useState("");
  const [sshValueType, setSshValueType] = useState(1);

  // ── Telnet state ─────────────────────────────────────────────────────
  const [telnetItemName, setTelnetItemName] = useState("");
  const [telnetParams, setTelnetParams] = useState("");
  const [telnetUsername, setTelnetUsername] = useState("");
  const [telnetPassword, setTelnetPassword] = useState("");
  const [telnetValueType, setTelnetValueType] = useState(1);

  // ── JMX state ────────────────────────────────────────────────────────
  const [jmxItemName, setJmxItemName] = useState("");
  const [jmxKey, setJmxKey] = useState("");
  const [jmxEndpoint, setJmxEndpoint] = useState("");
  const [jmxUsername, setJmxUsername] = useState("");
  const [jmxPassword, setJmxPassword] = useState("");
  const [jmxValueType, setJmxValueType] = useState(3);

  // ── Calculated state ─────────────────────────────────────────────────
  const [calcItemName, setCalcItemName] = useState("");
  const [calcKey, setCalcKey] = useState("");
  const [calcFormula, setCalcFormula] = useState("");
  const [calcValueType, setCalcValueType] = useState(0);

  // ── Dependent state ──────────────────────────────────────────────────
  const [depItemName, setDepItemName] = useState("");
  const [depKey, setDepKey] = useState("");
  const [depMasterItemId, setDepMasterItemId] = useState("");
  const [, setDepMasterSearch] = useState("");
  const [depValueType, setDepValueType] = useState(4);

  // ── Zabbix Script item (type=21 JS) state ────────────────────────────
  const [jsItemName, setJsItemName] = useState("");
  const [jsKey, setJsKey] = useState("");
  const [jsParams, setJsParams] = useState("");
  const [jsParameters, setJsParameters] = useState<{ name: string; value: string }[]>([]);
  const [jsValueType, setJsValueType] = useState(4);
  const [jsTimeout, setJsTimeout] = useState("");

  // ── Browser item state ───────────────────────────────────────────────
  const [browserItemName, setBrowserItemName] = useState("");
  const [browserKey, setBrowserKey] = useState("");
  const [browserParams, setBrowserParams] = useState("");
  const [browserParameters, setBrowserParameters] = useState<{ name: string; value: string }[]>([]);
  const [browserValueType, setBrowserValueType] = useState(4);
  const [browserTimeout, setBrowserTimeout] = useState("");

  // ── Bulk item state ───────────────────────────────────────────────────
  const [bulkItemMode, setBulkItemMode] = useState(false);
  const [bulkItemHosts, setBulkItemHosts] = useState<Host[]>([]);
  const [bulkItemResults, setBulkItemResults] = useState<BulkResult[]>([]);
  const [itemSaving, setItemSaving] = useState(false);

  // ── Trigger state ─────────────────────────────────────────────────────
  // ── Manage items ─────────────────────────────────────────────────────
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<AllItem | null>(null);
  const [editForm, setEditForm] = useState({ name: "", delay: "", status: "0", key_: "" });
  const [editSaving, setEditSaving] = useState(false);
  // Inline list auto-loaded from the selected host in each form
  const [inlineItems, setInlineItems] = useState<Item[]>([]);
  const [loadingInlineItems, setLoadingInlineItems] = useState(false);

  // ── Browse all items ──────────────────────────────────────────────────
  const [browseItems, setBrowseItems] = useState<AllItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseSearch, setBrowseSearch] = useState("");
  const [browseHostFilter, setBrowseHostFilter] = useState("");
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);

  // ── Toast ─────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({ open: false, message: "", severity: "success" });
  const showToast = (message: string, sev: "success" | "error") => setToast({ open: true, message, severity: sev });

  const onLoadAllItems = async (hostFilter?: string) => {
    setBrowseLoading(true);
    try {
      const res = await api.listAllItems({ limit: 2000, hostname: hostFilter || browseHostFilter || undefined });
      setBrowseItems(res.items);
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBrowseLoading(false);
    }
  };

  useEffect(() => {
    void onLoadAllItems(browseHostFilter);
  }, [browseHostFilter]);

  const { toggle: toggleFavItem, isFav: isFavItem } = useFavorites("favorite_items");

  const browseFiltered = browseItems
    .filter((item: AllItem) => {
      const words = browseSearch.toLowerCase().split(/\s+/).filter(Boolean);
      const name = item.name.toLowerCase();
      const key = item.key_.toLowerCase();
      const matchesSearch = words.length === 0 || words.every((w) => name.includes(w) || key.includes(w));
      const matchesHost = !browseHostFilter || item.hostname === browseHostFilter;
      return matchesSearch && matchesHost;
    })
    .sort((a, b) => {
      const af = isFavItem(a.itemid) ? 0 : 1;
      const bf = isFavItem(b.itemid) ? 0 : 1;
      return af - bf;
    });


  // Auto-fill port when service type changes
  useEffect(() => {
    const found = serviceTypes.find((s) => s.value === svcType);
    setSvcPort(found?.port != null ? String(found.port) : "");
    setSvcItemName("");
  }, [svcType]);

  // ── Handlers ─────────────────────────────────────────────────────────

  const onCreateAgentItem = async (targetHost: string) => {
    const customParts = agentCustomIntervals
      .filter((ci) => ci.type === "scheduling" ? ci.interval : ci.interval && ci.period)
      .map((ci) => ci.type === "flexible" ? `${ci.interval}/${ci.period}` : ci.interval);
    const assembledDelay = customParts.length ? `${itemDelay};${customParts.join(";")}` : itemDelay;
    await api.addItem({
      hostname: targetHost, item_name: itemName, item_key: effectiveItemKey, value_type: valueType,
      delay: assembledDelay, units: itemUnits || undefined,
      history: itemHistory, trends: itemTrends,
      description: itemDescription || undefined,
      status: agentEnabled ? 0 : 1,
      timeout: agentTimeoutMode === "override" ? agentTimeout : undefined,
    });
  };

  const commonItemSettings = {
    delay: itemDelay, units: itemUnits || undefined,
    history: itemHistory, trends: itemTrends,
    description: itemDescription || undefined,
  };

  const onCreateHttpItem = async (targetHost: string) => {
    const headersStr = httpHeaders.filter((h) => h.name).map((h) => `${h.name}: ${h.value}`).join("\n");
    const queryFields = httpQueryFields.filter((q) => q.name);
    await api.addHttpItem({
      hostname: targetHost, item_name: httpItemName, url: httpUrl,
      request_method: httpMethod, status_codes: httpStatusCodes, timeout: httpTimeout,
      verify_peer: httpVerifyTLS, verify_host: httpVerifyHost,
      follow_redirects: httpFollowRedirects,
      posts: httpPostBody || undefined, post_type: httpPostBodyType,
      retrieve_mode: httpRetrieveMode,
      value_type: httpValueType,
      headers: headersStr || undefined,
      query_fields: queryFields.length ? queryFields : undefined,
      http_proxy: httpProxy || undefined,
      authtype: httpAuthType,
      username: httpAuthType ? httpUsername : undefined,
      password: httpAuthType ? httpPassword : undefined,
      ssl_cert_file: httpSslCertFile || undefined,
      ssl_key_file: httpSslKeyFile || undefined,
      ssl_key_password: httpSslKeyFile && httpSslKeyPassword ? httpSslKeyPassword : undefined,
      convert_to_json: httpConvertToJson || undefined,
      allow_traps: httpAllowTraps || undefined,
      status: httpEnabled ? 0 : 1,
      regex_preprocessing: httpRegexEnabled,
      regex_pattern: httpRegexEnabled ? httpRegexPattern : undefined,
      regex_output: httpRegexEnabled ? httpRegexOutput : undefined,
      regex_no_match_value: httpRegexEnabled ? httpRegexNoMatch : undefined,
      ...commonItemSettings,
    });
  };

  const onCreateServiceItem = async (targetHost: string) => {
    await api.addServiceItem({
      hostname: targetHost, service_type: svcType,
      port: svcPort ? Number(svcPort) : null,
      item_name: svcItemName || undefined,
      delay: itemDelay, history: itemHistory, trends: itemTrends,
      description: itemDescription || undefined,
    });
  };

  const onCreateFileWatchItem = async (targetHost: string) => {
    const res = await api.addFileWatchItem({
      hostname: targetHost,
      file_path: fwFilePath,
      check_type: fwCheckType,
      folder_os: fwFolderOs,
      item_name: fwItemName || undefined,
      create_trigger: fwCreateTrigger,
      trigger_name: fwTriggerName || undefined,
      trigger_priority: fwTriggerPriority,
      trigger_type: fwTriggerType,
      max_age_minutes: fwMaxAgeMinutes,
      delay: itemDelay, history: itemHistory, trends: itemTrends,
      description: itemDescription || undefined,
    });
    if (res.trigger_error) showToast(`Item created, but trigger failed: ${res.trigger_error}`, "error");
  };

  const onCreateDbItem = async (targetHost: string) => {
    const customParts = agentCustomIntervals
      .filter((ci) => ci.type === "scheduling" ? ci.interval : ci.interval && ci.period)
      .map((ci) => ci.type === "flexible" ? `${ci.interval}/${ci.period}` : ci.interval);
    const assembledDelay = customParts.length ? `${itemDelay};${customParts.join(";")}` : itemDelay;
    if (dbMode === "odbc") {
      await api.addDbOdbcItem({
        hostname: targetHost,
        dsn: dbDsn,
        sql_query: dbSqlQuery,
        description: dbDescription,
        item_name: dbOdbcItemName || undefined,
        value_type: dbOdbcValueType,
        username: dbOdbcUsername || undefined,
        password: dbOdbcPassword || undefined,
        delay: assembledDelay, units: itemUnits || undefined,
        history: itemHistory, trends: itemTrends,
        status: agentEnabled ? 0 : 1,
        timeout: agentTimeoutMode === "override" ? agentTimeout : undefined,
      });
    } else {
      const metaDef = DB_AGENT2_METRICS[dbEngine]?.find((m) => m.value === dbMetric);
      await api.addDbAgent2Item({
        hostname: targetHost,
        engine: dbEngine,
        conn_string: dbConnString,
        metric: dbMetric,
        extra_param: metaDef?.hasExtra ? dbExtraParam : undefined,
        item_name: dbAgent2ItemName || undefined,
      });
    }
  };

  const onCreateScriptItem = async (targetHost: string) => {
    const customParts = agentCustomIntervals
      .filter((ci) => ci.type === "scheduling" ? ci.interval : ci.interval && ci.period)
      .map((ci) => ci.type === "flexible" ? `${ci.interval}/${ci.period}` : ci.interval);
    const assembledDelay = customParts.length ? `${itemDelay};${customParts.join(";")}` : itemDelay;
    await api.addScriptItem({
      hostname: targetHost,
      script_type: scriptType,
      script_mode: scriptMode,
      script: scriptContent,
      file_arg: scriptFileArg || undefined,
      item_name: scriptItemName || undefined,
      value_type: scriptValueType,
      ...commonItemSettings,
      delay: assembledDelay,
      status: agentEnabled ? 0 : 1,
      timeout: agentTimeoutMode === "override" ? agentTimeout : undefined,
    });
  };

  const onCreateSnmpItem = async (targetHost: string) => {
    await api.addSnmpItem({
      hostname: targetHost, item_name: snmpItemName, snmp_oid: snmpOid,
      snmp_version: snmpVersion, value_type: snmpValueType,
      snmp_community: snmpVersion < 3 ? snmpCommunity : undefined,
      snmpv3_securityname: snmpVersion === 3 ? snmpV3SecName : undefined,
      snmpv3_securitylevel: snmpVersion === 3 ? snmpV3SecLevel : undefined,
      snmpv3_authprotocol: snmpVersion === 3 && snmpV3SecLevel >= 1 ? snmpV3AuthProto : undefined,
      snmpv3_authpassphrase: snmpVersion === 3 && snmpV3SecLevel >= 1 ? snmpV3AuthPass : undefined,
      snmpv3_privprotocol: snmpVersion === 3 && snmpV3SecLevel === 2 ? snmpV3PrivProto : undefined,
      snmpv3_privpassphrase: snmpVersion === 3 && snmpV3SecLevel === 2 ? snmpV3PrivPass : undefined,
      snmpv3_contextname: snmpVersion === 3 ? snmpV3Context : undefined,
      delay: itemDelay, units: itemUnits || undefined, history: itemHistory, trends: itemTrends,
      description: itemDescription || undefined, status: agentEnabled ? 0 : 1,
    });
  };

  const onCreateSnmpTrapItem = async (targetHost: string) => {
    await api.addSnmpTrapItem({
      hostname: targetHost, item_name: snmpTrapItemName, item_key: snmpTrapKey,
      value_type: snmpTrapValueType, history: itemHistory, trends: itemTrends,
      description: itemDescription || undefined, status: agentEnabled ? 0 : 1,
    });
  };

  const onCreateInternalItem = async (targetHost: string) => {
    await api.addInternalItem({
      hostname: targetHost, item_name: internalItemName, item_key: internalKey,
      value_type: internalValueType, delay: itemDelay,
      history: itemHistory, trends: itemTrends,
      description: itemDescription || undefined, status: agentEnabled ? 0 : 1,
    });
  };

  const onCreateTrapperItem = async (targetHost: string) => {
    await api.addTrapperItem({
      hostname: targetHost, item_name: trapperItemName, item_key: trapperKey,
      value_type: trapperValueType, allow_traps: trapperAllowTraps,
      history: itemHistory, trends: itemTrends,
      description: itemDescription || undefined, status: agentEnabled ? 0 : 1,
    });
  };

  const onCreateExternalItem = async (targetHost: string) => {
    await api.addExternalItem({
      hostname: targetHost, item_name: externalItemName, item_key: externalKey,
      value_type: externalValueType, delay: itemDelay,
      history: itemHistory, trends: itemTrends,
      description: itemDescription || undefined, status: agentEnabled ? 0 : 1,
    });
  };

  const onCreateIpmiItem = async (targetHost: string) => {
    await api.addIpmiItem({
      hostname: targetHost, item_name: ipmiItemName || undefined, ipmi_sensor: ipmiSensor,
      value_type: ipmiValueType, delay: itemDelay,
      history: itemHistory, trends: itemTrends,
      description: itemDescription || undefined, status: agentEnabled ? 0 : 1,
    });
  };

  const onCreateSshItem = async (targetHost: string) => {
    await api.addSshItem({
      hostname: targetHost, item_name: sshItemName, params: sshParams,
      authtype: sshAuthType, username: sshUsername || undefined,
      password: sshAuthType === 0 ? sshPassword || undefined : undefined,
      publickey: sshAuthType === 1 ? sshPublicKey || undefined : undefined,
      privatekey: sshAuthType === 1 ? sshPrivateKey || undefined : undefined,
      value_type: sshValueType, delay: itemDelay,
      history: itemHistory, trends: itemTrends,
      description: itemDescription || undefined, status: agentEnabled ? 0 : 1,
    });
  };

  const onCreateTelnetItem = async (targetHost: string) => {
    await api.addTelnetItem({
      hostname: targetHost, item_name: telnetItemName, params: telnetParams,
      username: telnetUsername || undefined, password: telnetPassword || undefined,
      value_type: telnetValueType, delay: itemDelay,
      history: itemHistory, trends: itemTrends,
      description: itemDescription || undefined, status: agentEnabled ? 0 : 1,
    });
  };

  const onCreateJmxItem = async (targetHost: string) => {
    await api.addJmxItem({
      hostname: targetHost, item_name: jmxItemName, item_key: jmxKey,
      jmx_endpoint: jmxEndpoint || undefined,
      username: jmxUsername || undefined, password: jmxPassword || undefined,
      value_type: jmxValueType, delay: itemDelay,
      history: itemHistory, trends: itemTrends,
      description: itemDescription || undefined, status: agentEnabled ? 0 : 1,
    });
  };

  const onCreateCalculatedItem = async (targetHost: string) => {
    await api.addCalculatedItem({
      hostname: targetHost, item_name: calcItemName, item_key: calcKey, formula: calcFormula,
      value_type: calcValueType, delay: itemDelay,
      history: itemHistory, trends: itemTrends,
      description: itemDescription || undefined, status: agentEnabled ? 0 : 1,
    });
  };

  const onCreateDependentItem = async (targetHost: string) => {
    await api.addDependentItem({
      hostname: targetHost, item_name: depItemName, item_key: depKey, master_itemid: depMasterItemId,
      value_type: depValueType, history: itemHistory, trends: itemTrends,
      description: itemDescription || undefined, status: agentEnabled ? 0 : 1,
    });
  };

  const onCreateZabbixScriptItem = async (targetHost: string) => {
    await api.addZabbixScriptItem({
      hostname: targetHost, item_name: jsItemName, item_key: jsKey, params: jsParams,
      parameters: jsParameters.filter((p) => p.name),
      value_type: jsValueType, delay: itemDelay,
      history: itemHistory, trends: itemTrends,
      timeout: jsTimeout || undefined,
      description: itemDescription || undefined, status: agentEnabled ? 0 : 1,
    });
  };

  const onCreateBrowserItem = async (targetHost: string) => {
    await api.addBrowserItem({
      hostname: targetHost, item_name: browserItemName, item_key: browserKey, params: browserParams,
      parameters: browserParameters.filter((p) => p.name),
      value_type: browserValueType, delay: itemDelay,
      history: itemHistory, trends: itemTrends,
      timeout: browserTimeout || undefined,
      description: itemDescription || undefined, status: agentEnabled ? 0 : 1,
    });
  };

  const onSubmitItem = async () => {
    setItemSaving(true);
    setBulkItemResults([]);
    try {
      if (bulkItemMode) {
        const hostnames = bulkItemHosts.map((h) => h.host);
        if (!hostnames.length) { showToast("Select at least one host.", "error"); return; }
        const basePayload = { hostnames, item_type: itemType };
        let result;
        if (itemType === "agent") {
          result = await api.bulkAddItems({ ...basePayload, item_name: itemName, item_key: effectiveItemKey, value_type: valueType, delay: itemDelay, units: itemUnits || undefined, history: itemHistory, trends: itemTrends, description: itemDescription || undefined });
        } else if (itemType === "http") {
          result = await api.bulkAddItems({ ...basePayload, item_name: httpItemName, url: httpUrl, request_method: httpMethod, status_codes: httpStatusCodes, timeout: httpTimeout, verify_peer: httpVerifyTLS, follow_redirects: httpFollowRedirects, posts: httpPostBody, value_type: httpValueType });
        } else if (itemType === "script") {
          result = await api.bulkAddItems({ ...basePayload, script_type: scriptType, script_mode: scriptMode, script: scriptContent, file_arg: scriptFileArg || undefined, item_name: scriptItemName || undefined, value_type: scriptValueType });
        } else {
          result = await api.bulkAddItems({ ...basePayload, service_type: svcType, port: svcPort ? Number(svcPort) : null, item_name: svcItemName || undefined });
        }
        setBulkItemResults(result.results);
        showToast(result.message, result.results.some((r) => r.error) ? "error" : "success");
      } else {
        const targetHost = itemType === "agent" ? hostname : itemType === "http" ? httpHostname : itemType === "script" ? scriptHostname : itemType === "filewatch" ? fwHostname : itemType === "database" ? dbHostname : genericTypes.includes(itemType) ? genericHostname : svcHostname;
        if (itemType === "agent") await onCreateAgentItem(targetHost);
        else if (itemType === "http") await onCreateHttpItem(targetHost);
        else if (itemType === "script") await onCreateScriptItem(targetHost);
        else if (itemType === "filewatch") await onCreateFileWatchItem(targetHost);
        else if (itemType === "database") await onCreateDbItem(targetHost);
        else if (itemType === "snmp") await onCreateSnmpItem(targetHost);
        else if (itemType === "snmptrap") await onCreateSnmpTrapItem(targetHost);
        else if (itemType === "internal") await onCreateInternalItem(targetHost);
        else if (itemType === "trapper") await onCreateTrapperItem(targetHost);
        else if (itemType === "external") await onCreateExternalItem(targetHost);
        else if (itemType === "ipmi") await onCreateIpmiItem(targetHost);
        else if (itemType === "ssh") await onCreateSshItem(targetHost);
        else if (itemType === "telnet") await onCreateTelnetItem(targetHost);
        else if (itemType === "jmx") await onCreateJmxItem(targetHost);
        else if (itemType === "calculated") await onCreateCalculatedItem(targetHost);
        else if (itemType === "dependent") await onCreateDependentItem(targetHost);
        else if (itemType === "scriptitem") await onCreateZabbixScriptItem(targetHost);
        else if (itemType === "browser") await onCreateBrowserItem(targetHost);
        else await onCreateServiceItem(targetHost);
        if (itemType !== "filewatch" || !toast.open) showToast("Item added successfully.", "success");
        void onLoadAllItems();
        if (itemType === "agent") { setItemName(""); setItemKey(""); setAgentParamMode(false); setAgentKeyBase(""); setAgentKeyParams([]); setItemDelay("1m"); setItemUnits(""); setItemHistory("31d"); setItemTrends("365d"); setItemDescription(""); setAgentEnabled(true); setAgentTimeoutMode("global"); setAgentTimeout("3s"); setAgentCustomIntervals([]); }
        else if (itemType === "http") { setHttpItemName(""); setHttpUrl(""); setHttpPostBody(""); setHttpHeaders([]); setHttpQueryFields([]); setHttpProxy(""); setHttpRetrieveMode(0); setHttpPostBodyType(0); }
        else if (itemType === "script") { setScriptContent(""); setScriptFileArg(""); setScriptItemName(""); setAgentEnabled(true); setAgentTimeoutMode("global"); setAgentTimeout("3s"); setAgentCustomIntervals([]); }
        else if (itemType === "filewatch") { setFwFilePath(""); setFwItemName(""); setFwTriggerName(""); }
        else if (itemType === "database") { setDbDsn(""); setDbDescription(""); setDbSqlQuery(""); setDbConnString(""); setDbExtraParam(""); setDbOdbcItemName(""); setDbAgent2ItemName(""); setAgentEnabled(true); setAgentTimeoutMode("global"); setAgentTimeout("3s"); setAgentCustomIntervals([]); }
        else if (itemType === "snmp") { setSnmpItemName(""); setSnmpOid(""); setSnmpCommunity("public"); setSnmpV3SecName(""); setSnmpV3AuthPass(""); setSnmpV3PrivPass(""); setSnmpV3Context(""); }
        else if (itemType === "snmptrap") { setSnmpTrapItemName(""); setSnmpTrapKey("snmptrap.fallback"); }
        else if (itemType === "internal") { setInternalItemName(""); setInternalKey(""); }
        else if (itemType === "trapper") { setTrapperItemName(""); setTrapperKey(""); }
        else if (itemType === "external") { setExternalItemName(""); setExternalKey(""); }
        else if (itemType === "ipmi") { setIpmiItemName(""); setIpmiSensor(""); }
        else if (itemType === "ssh") { setSshItemName(""); setSshParams(""); setSshUsername(""); setSshPassword(""); setSshPublicKey(""); setSshPrivateKey(""); }
        else if (itemType === "telnet") { setTelnetItemName(""); setTelnetParams(""); setTelnetUsername(""); setTelnetPassword(""); }
        else if (itemType === "jmx") { setJmxItemName(""); setJmxKey(""); setJmxEndpoint(""); setJmxUsername(""); setJmxPassword(""); }
        else if (itemType === "calculated") { setCalcItemName(""); setCalcKey(""); setCalcFormula(""); }
        else if (itemType === "dependent") { setDepItemName(""); setDepKey(""); setDepMasterItemId(""); setDepMasterSearch(""); }
        else if (itemType === "scriptitem") { setJsItemName(""); setJsKey(""); setJsParams(""); setJsParameters([]); setJsTimeout(""); }
        else if (itemType === "browser") { setBrowserItemName(""); setBrowserKey(""); setBrowserParams(""); setBrowserParameters([]); setBrowserTimeout(""); }
        else { setSvcItemName(""); }
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setItemSaving(false);
    }
  };





  const onDeleteItem = async (itemid: string) => {
    try {
      await api.deleteItem(itemid);
      setBrowseItems((prev) => prev.filter((i) => i.itemid !== itemid));
      setInlineItems((prev) => prev.filter((i) => i.itemid !== itemid));
      showToast("Item deleted.", "success");
    } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };





  // ── Reusable sub-components ───────────────────────────────────────────

  const HostSelect = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <FormControl size="small" fullWidth>
      <InputLabel>{label}</InputLabel>
      <SearchableSelect label={label} value={value} onChange={(e) => onChange(e.target.value)} disabled={hostsLoading}
        startAdornment={hostsLoading ? <CircularProgress size={14} sx={{ ml: 1, mr: 0.5 }} /> : undefined}>
        {hosts.map((h) => <MenuItem key={h.hostid} value={h.host}>{h.host}</MenuItem>)}
      </SearchableSelect>
    </FormControl>
  );

  const MultiHostSelect = ({ value, onChange, label }: { value: Host[]; onChange: (v: Host[]) => void; label: string }) => (
    <Autocomplete multiple size="small" options={hosts} value={value} onChange={(_, v) => onChange(v)}
      getOptionLabel={(o) => o.host} isOptionEqualToValue={(o, v) => o.hostid === v.hostid}
      loading={hostsLoading}
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={value.length ? "" : "Select hosts…"}
          InputProps={{ ...params.InputProps, endAdornment: <>{hostsLoading && <CircularProgress size={14} />}{params.InputProps.endAdornment}</> }} />
      )}
      renderTags={(value, getTagProps) =>
        value.map((opt, index) => {
          const { key, ...tagProps } = getTagProps({ index });
          return <Chip key={key} label={opt.host} size="small" {...tagProps} />;
        })
      }
    />
  );

  // Determine which single-host state is active
  const genericTypes = ["snmp", "snmptrap", "internal", "trapper", "external", "ipmi", "ssh", "telnet", "jmx", "calculated", "dependent", "scriptitem", "browser"];
  const activeItemHost = itemType === "agent" ? hostname : itemType === "http" ? httpHostname : itemType === "script" ? scriptHostname : itemType === "filewatch" ? fwHostname : itemType === "database" ? dbHostname : genericTypes.includes(itemType) ? genericHostname : svcHostname;
  const setActiveItemHost = itemType === "agent" ? setHostname : itemType === "http" ? setHttpHostname : itemType === "script" ? setScriptHostname : itemType === "filewatch" ? setFwHostname : itemType === "database" ? setDbHostname : genericTypes.includes(itemType) ? setGenericHostname : setSvcHostname;

  // Auto-load existing items when host is selected in the Add item form
  useEffect(() => {
    if (!activeItemHost || bulkItemMode) { setInlineItems([]); return; }
    setLoadingInlineItems(true);
    api.listItems(activeItemHost)
      .then((r) => setInlineItems(r.items))
      .catch(() => setInlineItems([]))
      .finally(() => setLoadingInlineItems(false));
  }, [activeItemHost, bulkItemMode]);


  // Determine if the submit button should be disabled
  const itemSubmitDisabled = (() => {
    if (itemSaving) return true;
    if (bulkItemMode && !bulkItemHosts.length) return true;
    if (!bulkItemMode && !activeItemHost) return true;
    if (itemType === "agent") return !itemName || !effectiveItemKey;
    if (itemType === "http") return !httpItemName || !httpUrl;
    if (itemType === "script") return !scriptContent;
    if (itemType === "filewatch") return !fwFilePath;
    if (itemType === "database") {
      if (dbMode === "odbc") return !dbDsn || !dbDescription || !dbSqlQuery;
      return !dbConnString || !dbMetric;
    }
    if (itemType === "snmp") return !snmpItemName || !snmpOid;
    if (itemType === "snmptrap") return !snmpTrapItemName;
    if (itemType === "internal") return !internalItemName || !internalKey;
    if (itemType === "trapper") return !trapperItemName || !trapperKey;
    if (itemType === "external") return !externalItemName || !externalKey;
    if (itemType === "ipmi") return !ipmiSensor;
    if (itemType === "ssh") return !sshItemName || !sshParams;
    if (itemType === "telnet") return !telnetItemName || !telnetParams;
    if (itemType === "jmx") return !jmxItemName || !jmxKey;
    if (itemType === "calculated") return !calcItemName || !calcKey || !calcFormula;
    if (itemType === "dependent") return !depItemName || !depKey || !depMasterItemId;
    if (itemType === "scriptitem") return !jsItemName || !jsKey || !jsParams;
    if (itemType === "browser") return !browserItemName || !browserKey || !browserParams;
    return false; // service type — service type is always set
  })();

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <PlaylistAddOutlinedIcon sx={{ fontSize: 28, color: "primary.main" }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Items</Typography>
            <Typography variant="body2" color="text.secondary">Manage monitoring items and service health monitors.</Typography>
          </Box>
        </Box>
        <Button variant="contained" startIcon={<PlaylistAddOutlinedIcon />} onClick={() => setAddItemOpen(true)}>Add Item</Button>
      </Box>

      {/* ── Items management table ── */}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems="center">
              <TextField size="small" placeholder="Search by name or key…" value={browseSearch}
                onChange={(e) => setBrowseSearch(e.target.value)} sx={{ flex: 1 }}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><SearchOutlinedIcon sx={{ fontSize: 18, color: "text.disabled" }} /></InputAdornment>,
                  endAdornment: browseSearch ? <InputAdornment position="end"><IconButton size="small" onClick={() => setBrowseSearch("")}><ClearIcon sx={{ fontSize: 16 }} /></IconButton></InputAdornment> : undefined,
                }}
              />
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Filter by host</InputLabel>
                <SearchableSelect label="Filter by host" value={browseHostFilter} onChange={(e) => setBrowseHostFilter(e.target.value)}>
                  <MenuItem value=""><em>All hosts</em></MenuItem>
                  {hosts.map((h) => (
                    <MenuItem key={h.hostid} value={h.host}>{h.host}</MenuItem>
                  ))}
                </SearchableSelect>
              </FormControl>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                {browseLoading ? "Loading…" : `${browseFiltered.length} of ${browseItems.length} items${browseItems.length === 2000 ? " (limit)" : ""}`}
              </Typography>
              <Button size="small" variant="outlined" startIcon={browseLoading ? <CircularProgress size={14} /> : <RefreshIcon />}
                onClick={() => void onLoadAllItems()} disabled={browseLoading}>
                Refresh
              </Button>
            </Stack>
            {/* Host unreachable banner — shown when filtering by a specific host */}
            {(() => {
              if (!browseHostFilter) return null;
              const h = hosts.find((hh) => hh.host === browseHostFilter);
              if (!h?.interfaces?.length) return null;
              const primary = h.interfaces.find((i) => i.type === "1") ?? h.interfaces[0];
              if (primary?.available !== "2") return null;
              return (
                <Alert
                  severity="warning"
                  icon={<WifiOffIcon fontSize="inherit" />}
                  sx={{ py: 0.5, fontSize: "0.82rem" }}
                >
                  <strong>Host agent unreachable.</strong> Zabbix cannot collect data from this host.
                  Items showing a <strong>No data</strong> chip have not reported within their expected
                  polling interval — values below are stale.
                </Alert>
              );
            })()}

            <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, maxHeight: 520, overflow: "auto" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 28, pr: 0, bgcolor: "background.paper" }} />
                    <TableCell sx={{ width: 36, bgcolor: "background.paper" }} />
                    <TableCell sx={{ fontWeight: 700, bgcolor: "background.paper" }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap", bgcolor: "background.paper" }}>Host</TableCell>
                    <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap", bgcolor: "background.paper" }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap", bgcolor: "background.paper" }}>Last Value</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: "background.paper" }}>Key</TableCell>
                    <TableCell sx={{ fontWeight: 700, whiteSpace: "nowrap", bgcolor: "background.paper" }}>Interval</TableCell>
                    <TableCell sx={{ fontWeight: 700, bgcolor: "background.paper" }}>Tags</TableCell>
                    <TableCell sx={{ fontWeight: 700, width: 50, bgcolor: "background.paper" }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {browseLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((__, j) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells
                          <TableCell key={j}><Skeleton variant="text" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : browseFiltered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 4, color: "text.secondary" }}>
                        {browseSearch || browseHostFilter ? "No items match the current filters." : "No items found. Add one with the button above."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    browseFiltered.map((item) => {
                      const isExpanded = expandedItemId === item.itemid;
                      return (
                        <>
                          <TableRow
                            key={item.itemid}
                            hover
                            onClick={() => setExpandedItemId(isExpanded ? null : item.itemid)}
                            sx={{ cursor: "pointer", ...(isItemStale(item) ? { bgcolor: "rgba(239,68,68,0.04)" } : {}) }}
                          >
                            {/* Expand arrow */}
                            <TableCell sx={{ width: 28, pr: 0 }}>
                              <IconButton size="small" sx={{ p: 0.25 }}>
                                {isExpanded
                                  ? <KeyboardArrowDownIcon sx={{ fontSize: 16 }} />
                                  : <KeyboardArrowRightIcon sx={{ fontSize: 16 }} />}
                              </IconButton>
                            </TableCell>
                            {/* Favourite */}
                            <TableCell padding="checkbox">
                              <Tooltip title={isFavItem(item.itemid) ? "Remove from favourites" : "Add to favourites"}>
                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleFavItem(item.itemid); }} sx={{ color: isFavItem(item.itemid) ? "warning.main" : "action.disabled" }}>
                                  {isFavItem(item.itemid) ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                            {/* Name */}
                            <TableCell>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                <Typography variant="body2">{item.name}</Typography>
                                {item.templateid === "0" && (
                                  <Chip label="custom" size="small" color="primary" variant="outlined" sx={{ height: 14, fontSize: "0.55rem", fontWeight: 700, px: 0.25 }} />
                                )}
                              </Box>
                            </TableCell>
                            {/* Host */}
                            <TableCell><Typography variant="body2" sx={{ fontWeight: 500, whiteSpace: "nowrap" }}>{item.hostname}</Typography></TableCell>
                            {/* Status */}
                            <TableCell>
                              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.4 }}>
                                <Chip label={item.status === "0" ? "Enabled" : "Disabled"} size="small" color={item.status === "0" ? "success" : "default"} variant="outlined" sx={{ height: 18, fontSize: "0.65rem" }} />
                                {item.state === "1" && (
                                  <Chip label="Not Supported" size="small" color="error" variant="filled" sx={{ height: 16, fontSize: "0.6rem" }} />
                                )}
                                {item.state !== "1" && isItemStale(item) && (
                                  <Tooltip title={item.lastclock ? `Last data ${timeAgo(item.lastclock)} — host may be unreachable` : "Never collected — host may be unreachable"} placement="top">
                                    <Chip label="No data" size="small" variant="filled" sx={{ height: 16, fontSize: "0.6rem", bgcolor: "#EF4444", color: "#fff" }} />
                                  </Tooltip>
                                )}
                              </Box>
                            </TableCell>
                            {/* Last Value */}
                            <TableCell>
                              <Tooltip title={item.lastclock ? `Last collected ${timeAgo(item.lastclock)}` : "No data collected yet"} placement="top">
                                <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.75rem", color: item.lastvalue && !isItemStale(item) ? "text.primary" : "text.disabled", whiteSpace: "nowrap" }}>
                                  {isItemStale(item) ? "—" : (item.lastvalue || "—")}
                                </Typography>
                              </Tooltip>
                            </TableCell>
                            {/* Key */}
                            <TableCell sx={{ maxWidth: 220 }}>
                              <Tooltip title={item.key_} placement="top">
                                <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.75rem", color: "text.secondary", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {item.key_}
                                </Typography>
                              </Tooltip>
                            </TableCell>
                            {/* Interval */}
                            <TableCell><Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>{item.delay}</Typography></TableCell>
                            {/* Tags */}
                            <TableCell>
                              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.4 }}>
                                {(item.tags ?? []).map((t: { tag: string; value: string }) => (
                                  <Chip key={`${t.tag}:${t.value}`} label={t.value ? `${t.tag}: ${t.value}` : t.tag} size="small" variant="outlined" sx={{ height: 16, fontSize: "0.6rem" }} />
                                ))}
                              </Box>
                            </TableCell>
                            {/* Actions */}
                            <TableCell>
                              <Stack direction="row" spacing={0.5}>
                                <Tooltip title="Edit item">
                                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); setEditItem(item); setEditForm({ name: item.name, delay: item.delay, status: item.status, key_: item.key_ }); }}>
                                    <EditOutlinedIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete item">
                                  <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setConfirmDeleteItemId(item.itemid); }}>
                                    <DeleteOutlineIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            </TableCell>
                          </TableRow>

                          {/* Expanded detail row */}
                          <TableRow key={`${item.itemid}-detail`}>
                            <TableCell colSpan={10} sx={{ py: 0, border: isExpanded ? undefined : "none" }}>
                              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                <Box sx={{ px: 3, py: 1.5, bgcolor: "action.hover", borderRadius: 1, my: 0.5 }}>
                                  <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.07em", fontSize: "0.6rem" }}>
                                    Item details
                                  </Typography>
                                  <Box sx={{ display: "flex", gap: 4, mt: 0.75, flexWrap: "wrap" }}>
                                    <Box>
                                      <Typography variant="caption" color="text.disabled">Type</Typography>
                                      <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
                                        {valueTypes.find((vt) => vt.value === Number(item.value_type))?.label ?? `Type ${item.value_type}`}
                                      </Typography>
                                    </Box>
                                    <Box>
                                      <Typography variant="caption" color="text.disabled">Interval</Typography>
                                      <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>{item.delay || "—"}</Typography>
                                    </Box>
                                    <Box>
                                      <Typography variant="caption" color="text.disabled">Source</Typography>
                                      <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
                                        {item.templateid === "0" ? "Custom item" : "From template"}
                                      </Typography>
                                    </Box>
                                    <Box>
                                      <Typography variant="caption" color="text.disabled">Last collected</Typography>
                                      <Typography variant="body2" sx={{ fontSize: "0.8rem" }}>
                                        {item.lastclock ? new Date(item.lastclock * 1000).toLocaleString() : "Never"}
                                      </Typography>
                                    </Box>
                                  </Box>
                                  <Box sx={{ mt: 1, px: 1.5, py: 0.75, bgcolor: "background.paper", borderRadius: 1, borderLeft: "3px solid", borderColor: "divider" }}>
                                    <Typography variant="caption" color="text.disabled">Key</Typography>
                                    <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.78rem", wordBreak: "break-all", mt: 0.25 }}>
                                      {item.key_}
                                    </Typography>
                                  </Box>
                                </Box>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        </>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </CardContent>
      </Card>

      {/* ── Add item dialog ── */}
      <Dialog open={addItemOpen} onClose={() => setAddItemOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add Item</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>

            {/* Item type selector */}
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel>Item type</InputLabel>
              <Select label="Item type" value={itemType} onChange={(e) => { setItemType(e.target.value as typeof itemType); setBulkItemResults([]); }}>
                <MenuItem value="agent">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <RouterIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">Zabbix Agent</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="http">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <HttpIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">HTTP Agent</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="service">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <NetworkCheckIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">Service Check</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="script">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <TerminalIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">Script Check</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="filewatch">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <FolderOpenIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">File Watch</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="database">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <StorageOutlinedIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">Database Monitor</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="snmp">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <RouterIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">SNMP Agent</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="snmptrap">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <RouterIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">SNMP Trap</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="internal">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <RouterIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">Zabbix Internal</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="trapper">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <RouterIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">Zabbix Trapper</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="external">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <RouterIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">External Check</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="ipmi">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <RouterIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">IPMI Agent</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="ssh">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <TerminalIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">SSH Agent</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="telnet">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <TerminalIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">Telnet Agent</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="jmx">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <RouterIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">JMX Agent</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="calculated">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <RouterIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">Calculated</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="dependent">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <RouterIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">Dependent Item</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="scriptitem">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <TerminalIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">Zabbix Script (JS)</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="browser">
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <HttpIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2">Browser (JS)</Typography>
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>


            {itemType === "http" && (
              <Alert severity="info" icon={<HttpIcon fontSize="small" />} sx={{ py: 0.5 }}>
                The <strong>Zabbix server</strong> makes the HTTP request and stores the result. The host does not need a Zabbix agent.
              </Alert>
            )}
            {itemType === "service" && (
              <Alert severity="info" icon={<NetworkCheckIcon fontSize="small" />} sx={{ py: 0.5 }}>
                The Zabbix server tests reachability (ICMP / TCP). The host needs an <strong>agent interface</strong> configured but not necessarily a running agent.
              </Alert>
            )}
            {itemType === "script" && (
              <Alert severity="warning" icon={<TerminalIcon fontSize="small" />} sx={{ py: 0.5 }}>
                Runs a command or script on the host via the Zabbix agent (<code>system.run</code>). Requires <strong>EnableRemoteCommands=1</strong> in the agent config on each target host.
              </Alert>
            )}
            {itemType === "filewatch" && (
              <Alert severity="info" icon={<FolderOpenIcon fontSize="small" />} sx={{ py: 0.5 }}>
                Monitors a file property using standard Zabbix agent keys — <strong>no remote commands needed</strong>. Optionally auto-creates a trigger that fires whenever the value changes.
              </Alert>
            )}
            {itemType === "database" && dbMode === "odbc" && (
              <Alert severity="warning" icon={<StorageOutlinedIcon fontSize="small" />} sx={{ py: 0.5 }}>
                <strong>ODBC</strong> — the Zabbix server makes the query using an ODBC DSN. The DSN must be pre-configured on the Zabbix server (e.g. in <code>/etc/odbc.ini</code>). The host does not need an agent.
              </Alert>
            )}
            {itemType === "database" && dbMode === "agent2" && (
              <Alert severity="warning" icon={<StorageOutlinedIcon fontSize="small" />} sx={{ py: 0.5 }}>
                <strong>Agent2 plugin</strong> — requires Zabbix Agent2 with the <strong>{dbEngine}</strong> plugin installed and enabled on the target host. The agent connects to the database directly.
              </Alert>
            )}
            {itemType === "snmp" && (
              <Alert severity="info" icon={<RouterIcon fontSize="small" />} sx={{ py: 0.5 }}>
                Polls the host via <strong>SNMP</strong>. The host must have an <strong>SNMP interface</strong> configured in Zabbix and an SNMP agent running.
              </Alert>
            )}
            {itemType === "snmptrap" && (
              <Alert severity="info" icon={<RouterIcon fontSize="small" />} sx={{ py: 0.5 }}>
                Receives <strong>SNMP traps</strong> sent to the Zabbix server. The Zabbix server must have its SNMP trap receiver configured.
              </Alert>
            )}
            {itemType === "internal" && (
              <Alert severity="info" icon={<RouterIcon fontSize="small" />} sx={{ py: 0.5 }}>
                Monitors the <strong>Zabbix server/proxy itself</strong> — e.g. queue depth, host counts, process performance. No agent or host interface needed.
              </Alert>
            )}
            {itemType === "trapper" && (
              <Alert severity="info" icon={<RouterIcon fontSize="small" />} sx={{ py: 0.5 }}>
                Accepts values <strong>pushed by zabbix_sender</strong> or any application that can POST to the Zabbix trapper port (10051). The host sends data on its own schedule.
              </Alert>
            )}
            {itemType === "external" && (
              <Alert severity="warning" icon={<RouterIcon fontSize="small" />} sx={{ py: 0.5 }}>
                Runs an <strong>external script</strong> on the Zabbix server (in <code>ExternalScripts</code> dir). The script name becomes the item key. Output is the collected value.
              </Alert>
            )}
            {itemType === "ipmi" && (
              <Alert severity="info" icon={<RouterIcon fontSize="small" />} sx={{ py: 0.5 }}>
                Polls hardware sensors via <strong>IPMI/BMC</strong>. The host must have an IPMI interface configured with correct credentials in Zabbix.
              </Alert>
            )}
            {itemType === "ssh" && (
              <Alert severity="warning" icon={<TerminalIcon fontSize="small" />} sx={{ py: 0.5 }}>
                Connects to the host via <strong>SSH</strong> and runs a shell command. Zabbix server makes the connection — credentials are stored in the item config.
              </Alert>
            )}
            {itemType === "telnet" && (
              <Alert severity="warning" icon={<TerminalIcon fontSize="small" />} sx={{ py: 0.5 }}>
                Connects to the host via <strong>Telnet</strong> and runs a command. Not recommended for production — no encryption. Use SSH when possible.
              </Alert>
            )}
            {itemType === "jmx" && (
              <Alert severity="info" icon={<RouterIcon fontSize="small" />} sx={{ py: 0.5 }}>
                Polls a Java application via <strong>JMX</strong>. Requires the Zabbix Java Gateway and a <strong>JMX interface</strong> configured on the host.
              </Alert>
            )}
            {itemType === "calculated" && (
              <Alert severity="info" icon={<RouterIcon fontSize="small" />} sx={{ py: 0.5 }}>
                Computes a value from other Zabbix items using a <strong>mathematical formula</strong>. No external data collection — Zabbix calculates on its side.
              </Alert>
            )}
            {itemType === "dependent" && (
              <Alert severity="info" icon={<RouterIcon fontSize="small" />} sx={{ py: 0.5 }}>
                Derives its value from a <strong>master item</strong> via preprocessing. The master item collects data; this item transforms or extracts from it.
              </Alert>
            )}
            {itemType === "scriptitem" && (
              <Alert severity="info" icon={<TerminalIcon fontSize="small" />} sx={{ py: 0.5 }}>
                Executes a <strong>JavaScript snippet</strong> inside Zabbix (Duktape engine). Useful for custom transformations or calling external APIs from Zabbix server.
              </Alert>
            )}
            {itemType === "browser" && (
              <Alert severity="info" icon={<HttpIcon fontSize="small" />} sx={{ py: 0.5 }}>
                Runs a <strong>browser automation script</strong> (JavaScript / WebDriver BiDi) via the Zabbix web monitoring engine. Requires Zabbix 7.0+ with a browser monitoring proxy.
              </Alert>
            )}

            <Divider />

            {/* Bulk mode toggle */}
            <FormControlLabel
              control={<Switch checked={bulkItemMode} onChange={(_, v) => { setBulkItemMode(v); setBulkItemResults([]); }} size="small" />}
              label={<Typography variant="body2">Apply to multiple hosts</Typography>}
            />

            {/* Host selection */}
            {bulkItemMode
              ? <MultiHostSelect label="Hosts *" value={bulkItemHosts} onChange={setBulkItemHosts} />
              : <HostSelect label="Host *" value={activeItemHost} onChange={setActiveItemHost} />
            }

            {/* Existing items on this host — auto-loaded for inline delete */}
            {!bulkItemMode && activeItemHost && (
              <Box>
                {loadingInlineItems ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <CircularProgress size={12} />
                    <Typography variant="caption" color="text.secondary">Loading items…</Typography>
                  </Box>
                ) : inlineItems.length > 0 ? (
                  <>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                      Existing items on this host ({inlineItems.length}) — click × to delete
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {inlineItems.map((item) => (
                        <Tooltip key={item.itemid} title={`${item.key_} · every ${item.delay}`} placement="top">
                          <Chip
                            label={item.name}
                            size="small"
                            color="primary"
                            variant="outlined"
                            onDelete={() => setConfirmDeleteItemId(item.itemid)}
                            sx={{
                              fontSize: "0.65rem",
                              height: 22,
                              maxWidth: 220,
                              "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" },
                              "& .MuiChip-deleteIcon": { fontSize: "0.75rem", opacity: 0.6, "&:hover": { opacity: 1 } },
                            }}
                          />
                        </Tooltip>
                      ))}
                    </Box>
                  </>
                ) : (
                  <Typography variant="caption" color="text.disabled">No custom items on this host yet.</Typography>
                )}
              </Box>
            )}

            {/* ── Agent item form ── */}
            {itemType === "agent" && (
              <>
                <TextField size="small" label="Item name" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. CPU User Time" />

                {/* Key selector — switches to param form when a parameterized key is chosen */}
                {!agentParamMode ? (
                  <Autocomplete freeSolo size="small"
                    options={serverItemKeys.length > 0 ? serverItemKeys : COMMON_ITEM_KEYS}
                    getOptionLabel={(opt) => typeof opt === "string" ? opt : `${opt.key} — ${opt.name}`}
                    groupBy={(opt) => (typeof opt === "string" ? "" : opt.group)}
                    loading={itemKeysLoading}
                    inputValue={itemKey}
                    onInputChange={(_, v, reason) => { if (reason === "input" || reason === "clear") setItemKey(v); }}
                    onChange={(_, v) => {
                      if (v === null) { setItemKey(""); return; }
                      const rawKey = typeof v === "string" ? v : v.key;
                      if (typeof v !== "string") {
                        if (!itemName) setItemName(v.name);
                        setValueType(v.valueType);
                        // Auto-fill common settings from the Zabbix template definition
                        const sk = v as ServerItemKey;
                        if (sk.delay)                    setItemDelay(sk.delay);
                        if (sk.units !== undefined)      setItemUnits(sk.units);
                        if (sk.history)                  setItemHistory(sk.history);
                        if (sk.trends)                   setItemTrends(sk.trends);
                        if (sk.description)              setItemDescription(sk.description);
                      }
                      const bracketIdx = rawKey.indexOf("[");
                      const base = bracketIdx >= 0 ? rawKey.slice(0, bracketIdx) : rawKey;
                      const paramDefs = KEY_PARAM_DEFS[base];
                      if (paramDefs && paramDefs.length > 0) {
                        const existingParams = bracketIdx >= 0
                          ? rawKey.slice(bracketIdx + 1, -1).split(",")
                          : [];
                        const initial = paramDefs.map((def, i) => existingParams[i] ?? (def.default ?? ""));
                        setAgentKeyBase(base);
                        setAgentKeyParams(initial);
                        setAgentParamMode(true);
                        setItemKey(rawKey);
                      } else {
                        setItemKey(rawKey);
                      }
                    }}
                    renderOption={(props, opt) => (
                      <Box component="li" {...props} key={typeof opt === "string" ? opt : opt.key}>
                        <Box>
                          <Typography sx={{ fontSize: "0.82rem", fontFamily: "monospace", fontWeight: 500 }}>{typeof opt === "string" ? opt : opt.key}</Typography>
                          {typeof opt !== "string" && (
                            <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>{opt.name} · {valueTypes.find((t) => t.value === opt.valueType)?.label}</Typography>
                          )}
                        </Box>
                      </Box>
                    )}
                    renderInput={(params) => (
                      <TextField {...params} label="Item key *" placeholder="e.g. system.cpu.util[,user]"
                        helperText={itemKeysLoading ? "Loading items from Zabbix…" : `${serverItemKeys.length > 0 ? serverItemKeys.length + " keys from Zabbix" : "Using built-in keys"} — select or type your own`}
                        InputProps={{ ...params.InputProps, endAdornment: <>{itemKeysLoading && <CircularProgress size={14} />}{params.InputProps.endAdornment}</> }} />
                    )}
                  />
                ) : (
                  /* Dynamic parameter form */
                  <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.5 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1.5}>
                      <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600, color: "primary.main" }}>
                        {agentKeyBase}
                      </Typography>
                      <Button size="small" variant="text" sx={{ minWidth: 0, fontSize: "0.72rem" }}
                        onClick={() => { setAgentParamMode(false); setItemKey(agentKeyBase); setAgentKeyBase(""); setAgentKeyParams([]); }}>
                        Change key
                      </Button>
                    </Stack>
                    <Stack spacing={1.5}>
                      {(KEY_PARAM_DEFS[agentKeyBase] ?? []).map((param, i) =>
                        param.type === "select" ? (
                          <TextField key={param.label} select size="small" label={param.label}
                            value={agentKeyParams[i] ?? param.default ?? ""}
                            helperText={param.helperText}
                            onChange={(e) => setAgentKeyParams((prev) => { const next = [...prev]; next[i] = e.target.value; return next; })}>
                            {param.options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                          </TextField>
                        ) : (
                          <TextField key={param.label} size="small" label={param.label}
                            value={agentKeyParams[i] ?? ""}
                            placeholder={param.placeholder}
                            helperText={param.helperText}
                            onChange={(e) => setAgentKeyParams((prev) => { const next = [...prev]; next[i] = e.target.value; return next; })} />
                        )
                      )}
                    </Stack>
                    <Typography variant="caption" sx={{ mt: 1.5, display: "block", fontFamily: "monospace", color: "text.secondary" }}>
                      Key: <strong>{effectiveItemKey}</strong>
                    </Typography>
                  </Box>
                )}

                <TextField select size="small" label="Value type" value={valueType} onChange={(e) => setValueType(Number(e.target.value))}>
                  {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>

                {/* ── Common item settings (mirroring Zabbix item form) ── */}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval *" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)}
                    placeholder="1m" helperText="e.g. 30s, 1m, 5m, 1h" fullWidth />
                  <TextField size="small" label="Units" value={itemUnits} onChange={(e) => setItemUnits(e.target.value)}
                    placeholder="%, B, bps, rpm…" helperText="Displayed after the value" fullWidth />
                </Stack>

                {/* ── Custom intervals ── */}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                    Custom intervals (override the update interval for specific time windows)
                  </Typography>
                  <Stack spacing={1}>
                    {agentCustomIntervals.map((ci, i) => (
                      <Stack key={`ci-${i}`} direction="row" spacing={1} alignItems="flex-start">
                        <TextField select size="small" label="Type" value={ci.type} sx={{ minWidth: 120 }}
                          onChange={(e) => setAgentCustomIntervals((p) => p.map((r, j) => j === i ? { ...r, type: e.target.value as "flexible" | "scheduling", period: "" } : r))}>
                          <MenuItem value="flexible">Flexible</MenuItem>
                          <MenuItem value="scheduling">Scheduling</MenuItem>
                        </TextField>
                        <TextField size="small" label={ci.type === "scheduling" ? "Schedule expression" : "Interval"} value={ci.interval} sx={{ flex: 1 }}
                          placeholder={ci.type === "scheduling" ? "wd1-5h9" : "50s"}
                          helperText={ci.type === "scheduling" ? "e.g. wd1-5h9 = Mon–Fri at 09:00" : "e.g. 50s"}
                          onChange={(e) => setAgentCustomIntervals((p) => p.map((r, j) => j === i ? { ...r, interval: e.target.value } : r))} />
                        {ci.type === "flexible" && (
                          <TextField size="small" label="Period" value={ci.period} sx={{ flex: 1.5 }}
                            placeholder="1-7,00:00-24:00"
                            helperText="days,HH:MM-HH:MM e.g. 1-5,09:00-18:00"
                            onChange={(e) => setAgentCustomIntervals((p) => p.map((r, j) => j === i ? { ...r, period: e.target.value } : r))} />
                        )}
                        <IconButton size="small" sx={{ mt: 0.5 }} onClick={() => setAgentCustomIntervals((p) => p.filter((_, j) => j !== i))}>
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    ))}
                    <Button size="small" variant="text" sx={{ alignSelf: "flex-start", fontSize: "0.75rem" }}
                      onClick={() => setAgentCustomIntervals((p) => [...p, { type: "flexible", interval: "", period: "" }])}>
                      + Add custom interval
                    </Button>
                  </Stack>
                </Box>

                {/* ── Timeout ── */}
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>Timeout</Typography>
                  <Button size="small" variant={agentTimeoutMode === "global" ? "contained" : "outlined"} onClick={() => setAgentTimeoutMode("global")} sx={{ minWidth: 72 }}>Global</Button>
                  <Button size="small" variant={agentTimeoutMode === "override" ? "contained" : "outlined"} onClick={() => setAgentTimeoutMode("override")} sx={{ minWidth: 80 }}>Override</Button>
                  {agentTimeoutMode === "override" && (
                    <TextField size="small" value={agentTimeout} onChange={(e) => setAgentTimeout(e.target.value)}
                      placeholder="3s" helperText="e.g. 3s, 10s, 30s" sx={{ maxWidth: 140 }} />
                  )}
                </Stack>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)}
                    placeholder="31d" helperText="Keep raw data for (e.g. 7d, 31d, 0 = don't store)" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)}
                    placeholder="365d" helperText="Keep hourly aggregates for (e.g. 365d, 0 = don't store)" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="Optional notes about this item" multiline minRows={2} />

                <FormControlLabel
                  control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />}
                  label={<Typography variant="body2">Enabled</Typography>}
                />
              </>
            )}

            {/* ── HTTP agent form ── */}
            {itemType === "http" && (
              <>
                <TextField size="small" label="Item name *" value={httpItemName} onChange={(e) => setHttpItemName(e.target.value)} placeholder="e.g. API health check" />
                <TextField size="small" label="URL *" value={httpUrl} onChange={(e) => setHttpUrl(e.target.value)} placeholder="https://example.com/health" />

                {/* Query fields */}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>Query fields (appended to URL as ?key=value)</Typography>
                  <Stack spacing={1}>
                    {httpQueryFields.map((qf, i) => (
                      <Stack key={`qf-${i}`} direction="row" spacing={1} alignItems="center">
                        <TextField size="small" placeholder="name" value={qf.name} sx={{ flex: 1 }}
                          onChange={(e) => setHttpQueryFields((p) => p.map((r, j) => j === i ? { ...r, name: e.target.value } : r))} />
                        <TextField size="small" placeholder="value" value={qf.value} sx={{ flex: 2 }}
                          onChange={(e) => setHttpQueryFields((p) => p.map((r, j) => j === i ? { ...r, value: e.target.value } : r))} />
                        <IconButton size="small" onClick={() => setHttpQueryFields((p) => p.filter((_, j) => j !== i))}>
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    ))}
                    <Button size="small" variant="text" sx={{ alignSelf: "flex-start", fontSize: "0.75rem" }}
                      onClick={() => setHttpQueryFields((p) => [...p, { name: "", value: "" }])}>
                      + Add query field
                    </Button>
                  </Stack>
                </Box>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField select size="small" label="Method" value={httpMethod}
                    onChange={(e) => { setHttpMethod(Number(e.target.value)); setHttpPostBody(""); setHttpPostBodyType(0); }} fullWidth>
                    {httpMethods.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
                  </TextField>
                  <TextField select size="small" label="Store as" value={httpValueType} onChange={(e) => setHttpValueType(Number(e.target.value))} fullWidth
                    helperText={httpValueType === 3 ? "Stores HTTP response code (e.g. 200)" : httpValueType === 0 ? "Stores response time in seconds" : "Stores full response body text"}>
                    <MenuItem value={3}>Integer — response code</MenuItem>
                    <MenuItem value={0}>Float — response time (s)</MenuItem>
                    <MenuItem value={4}>Text — response body</MenuItem>
                  </TextField>
                </Stack>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField select size="small" label="Retrieve" value={httpRetrieveMode} onChange={(e) => setHttpRetrieveMode(Number(e.target.value))} fullWidth
                    helperText="What the item stores from the response">
                    <MenuItem value={0}>Body only</MenuItem>
                    <MenuItem value={1}>Headers only</MenuItem>
                    <MenuItem value={2}>Body + headers</MenuItem>
                  </TextField>
                  <TextField size="small" label="Timeout" value={httpTimeout} onChange={(e) => setHttpTimeout(e.target.value)} fullWidth placeholder="15s"
                    helperText="e.g. 15s, 1m" />
                </Stack>

                {httpValueType === 3 && (
                  <TextField size="small" label="Expected status codes" value={httpStatusCodes} onChange={(e) => setHttpStatusCodes(e.target.value)}
                    placeholder="200" helperText="Comma-separated, e.g. 200,201,301" />
                )}

                <Stack direction="row" spacing={2} flexWrap="wrap">
                  <FormControlLabel control={<Switch checked={httpVerifyTLS} onChange={(_, v) => setHttpVerifyTLS(v)} size="small" />} label={<Typography variant="body2">Verify TLS certificate</Typography>} />
                  <FormControlLabel control={<Switch checked={httpVerifyHost} onChange={(_, v) => setHttpVerifyHost(v)} size="small" />} label={<Typography variant="body2">Verify hostname</Typography>} />
                  <FormControlLabel control={<Switch checked={httpFollowRedirects} onChange={(_, v) => setHttpFollowRedirects(v)} size="small" />} label={<Typography variant="body2">Follow redirects</Typography>} />
                </Stack>

                {(httpMethod === 1 || httpMethod === 2) && (
                  <>
                    <TextField select size="small" label="Request body type" value={httpPostBodyType} onChange={(e) => setHttpPostBodyType(Number(e.target.value))}>
                      <MenuItem value={0}>Raw</MenuItem>
                      <MenuItem value={2}>JSON</MenuItem>
                      <MenuItem value={3}>XML</MenuItem>
                    </TextField>
                    <TextField size="small" label="Request body" value={httpPostBody} onChange={(e) => setHttpPostBody(e.target.value)} multiline minRows={3}
                      placeholder={httpPostBodyType === 2 ? '{"key": "value"}' : httpPostBodyType === 3 ? "<root><key>value</key></root>" : "raw body content"} />
                  </>
                )}

                {/* Custom headers */}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>Request headers</Typography>
                  <Stack spacing={1}>
                    {httpHeaders.map((h, i) => (
                      <Stack key={`hdr-${i}`} direction="row" spacing={1} alignItems="center">
                        <TextField size="small" placeholder="Header name" value={h.name} sx={{ flex: 1 }}
                          onChange={(e) => setHttpHeaders((p) => p.map((r, j) => j === i ? { ...r, name: e.target.value } : r))} />
                        <TextField size="small" placeholder="Value" value={h.value} sx={{ flex: 2 }}
                          onChange={(e) => setHttpHeaders((p) => p.map((r, j) => j === i ? { ...r, value: e.target.value } : r))} />
                        <IconButton size="small" onClick={() => setHttpHeaders((p) => p.filter((_, j) => j !== i))}>
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    ))}
                    <Button size="small" variant="text" sx={{ alignSelf: "flex-start", fontSize: "0.75rem" }}
                      onClick={() => setHttpHeaders((p) => [...p, { name: "", value: "" }])}>
                      + Add header
                    </Button>
                  </Stack>
                </Box>

                <TextField size="small" label="HTTP proxy" value={httpProxy} onChange={(e) => setHttpProxy(e.target.value)}
                  placeholder="http://proxy.example.com:3128" helperText="Optional: leave empty to use direct connection" />

                <Divider />

                {/* ── SSL ── */}
                <Typography variant="body2" color="text.secondary" fontWeight={500}>SSL / TLS certificate</Typography>
                <Stack spacing={2}>
                  <TextField size="small" label="SSL certificate file" value={httpSslCertFile}
                    onChange={(e) => setHttpSslCertFile(e.target.value)}
                    placeholder="/etc/ssl/client.crt"
                    helperText="Path to client-side certificate file. Leave empty to skip." />
                  <TextField size="small" label="SSL key file" value={httpSslKeyFile}
                    onChange={(e) => setHttpSslKeyFile(e.target.value)}
                    placeholder="/etc/ssl/client.key"
                    helperText="Path to client private key file." />
                  {httpSslKeyFile && (
                    <TextField size="small" label="SSL key password" type="password" value={httpSslKeyPassword}
                      onChange={(e) => setHttpSslKeyPassword(e.target.value)}
                      helperText="Password for the private key file (if encrypted)."
                      autoComplete="new-password" />
                  )}
                </Stack>

                <Divider />

                {/* ── Auth ── */}
                <TextField select size="small" label="Authentication" value={httpAuthType}
                  onChange={(e) => { setHttpAuthType(Number(e.target.value)); setHttpUsername(""); setHttpPassword(""); }}>
                  <MenuItem value={0}>None</MenuItem>
                  <MenuItem value={1}>Basic (username / password)</MenuItem>
                  <MenuItem value={2}>NTLM (Windows)</MenuItem>
                </TextField>
                {httpAuthType > 0 && (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <TextField size="small" label="Username" value={httpUsername} onChange={(e) => setHttpUsername(e.target.value)} fullWidth autoComplete="off" />
                    <TextField size="small" label="Password" type="password" value={httpPassword} onChange={(e) => setHttpPassword(e.target.value)} fullWidth autoComplete="new-password" />
                  </Stack>
                )}

                <Divider />

                {/* ── Regex preprocessing ── */}
                <FormControlLabel
                  control={<Switch checked={httpRegexEnabled} onChange={(_, v) => setHttpRegexEnabled(v)} size="small" />}
                  label={<Typography variant="body2">Apply regex to response body (preprocessing)</Typography>}
                />
                {httpRegexEnabled && (
                  <Stack spacing={2}>
                    <TextField size="small" label="Pattern *" value={httpRegexPattern}
                      onChange={(e) => setHttpRegexPattern(e.target.value)}
                      placeholder='e.g.  "status":"(ok|healthy)"'
                      helperText="PCRE regex — use a capture group ( ) to extract a value" />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                      <TextField size="small" label="Output" value={httpRegexOutput}
                        onChange={(e) => setHttpRegexOutput(e.target.value)} fullWidth
                        placeholder="\1"
                        helperText="\1 = first capture group · use a fixed string like 1 for a flag" />
                      <TextField size="small" label="Value if no match" value={httpRegexNoMatch}
                        onChange={(e) => setHttpRegexNoMatch(e.target.value)} fullWidth
                        placeholder="0"
                        helperText="Stored when the pattern doesn't match" />
                    </Stack>
                  </Stack>
                )}

                <Divider />

                {/* ── Output options / trapping / enabled ── */}
                <Stack spacing={1}>
                  <FormControlLabel
                    control={<Switch checked={httpConvertToJson} onChange={(_, v) => setHttpConvertToJson(v)} size="small" />}
                    label={<Typography variant="body2">Convert to JSON</Typography>}
                  />
                  <FormControlLabel
                    control={<Switch checked={httpAllowTraps} onChange={(_, v) => setHttpAllowTraps(v)} size="small" />}
                    label={<Typography variant="body2">Enable trapping (allow Zabbix sender to push values)</Typography>}
                  />
                  <FormControlLabel
                    control={<Switch checked={httpEnabled} onChange={(_, v) => setHttpEnabled(v)} size="small" />}
                    label={<Typography variant="body2">Enabled</Typography>}
                  />
                </Stack>

                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval *" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)} placeholder="1m" helperText="e.g. 30s, 1m, 5m, 1h" fullWidth />
                  <TextField size="small" label="Units" value={itemUnits} onChange={(e) => setItemUnits(e.target.value)} placeholder="%, B, bps…" helperText="Displayed after the value" fullWidth />
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" helperText="Keep raw data for (e.g. 7d, 31d, 0 = don't store)" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" helperText="Keep hourly aggregates for (e.g. 365d, 0 = don't store)" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} placeholder="Optional notes about this item" multiline minRows={2} />
              </>
            )}

            {/* ── Service check form ── */}
            {itemType === "service" && (
              <>
                <TextField select size="small" label="Service type *" value={svcType} onChange={(e) => setSvcType(e.target.value)}>
                  {serviceTypes.map((s) => (
                    <MenuItem key={s.value} value={s.value}>
                      <Box>
                        <Typography variant="body2">{s.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{s.description}</Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>
                {!icmpTypes.has(svcType) && (
                  <TextField size="small" label="Port" value={svcPort} onChange={(e) => setSvcPort(e.target.value)} type="number" placeholder="e.g. 80" helperText="Auto-filled from service type — override if needed" />
                )}
                <TextField size="small" label="Item name (optional)" value={svcItemName} onChange={(e) => setSvcItemName(e.target.value)} placeholder="Leave blank for auto-generated name" />

                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval *" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)} placeholder="1m" helperText="e.g. 30s, 1m, 5m, 1h" fullWidth />
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" helperText="Keep raw data for" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" helperText="Keep aggregates for" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} placeholder="Optional notes about this item" multiline minRows={2} />
              </>
            )}

            {/* ── File watch form ── */}
            {itemType === "filewatch" && (
              <>
                <TextField
                  size="small" label="File path *" value={fwFilePath}
                  onChange={(e) => setFwFilePath(e.target.value)}
                  placeholder="e.g. /var/log/app.log  or  C:\logs\app.log"
                  helperText="Absolute path to the file on the host"
                />

                <TextField select size="small" label="What to check" value={fwCheckType}
                  onChange={(e) => { setFwCheckType(e.target.value as typeof fwCheckType); setFwTriggerType("change"); }}>
                  <MenuItem value="checksum">
                    <Box>
                      <Typography variant="body2">MD5 checksum — detects content changes</Typography>
                      <Typography variant="caption" color="text.secondary">Zabbix key: vfs.file.md5sum[path] · returns a 32-char hex string</Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem value="mtime">
                    <Box>
                      <Typography variant="body2">Modification time — detects any write</Typography>
                      <Typography variant="caption" color="text.secondary">Zabbix key: vfs.file.time[path,modify] · returns Unix timestamp</Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem value="size">
                    <Box>
                      <Typography variant="body2">File size — detects additions / truncation</Typography>
                      <Typography variant="caption" color="text.secondary">Zabbix key: vfs.file.size[path] · returns bytes</Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem value="exists">
                    <Box>
                      <Typography variant="body2">File existence — detects creation / deletion</Typography>
                      <Typography variant="caption" color="text.secondary">Zabbix key: vfs.file.exists[path] · returns 1 (present) or 0 (missing)</Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem value="folder_latest">
                    <Box>
                      <Typography variant="body2">Latest modified file in folder</Typography>
                      <Typography variant="caption" color="text.secondary">Uses system.run — requires EnableRemoteCommands=1 on the agent</Typography>
                    </Box>
                  </MenuItem>
                </TextField>

                {fwCheckType === "folder_latest" && (
                  <>
                    <Alert severity="warning" icon={<TerminalIcon fontSize="small" />} sx={{ py: 0.5 }}>
                      This check uses <code>system.run</code>. Make sure <strong>EnableRemoteCommands=1</strong> is set in the Zabbix agent config on this host.
                    </Alert>
                    <TextField select size="small" label="Host OS" value={fwFolderOs} onChange={(e) => setFwFolderOs(e.target.value as "linux" | "windows")}>
                      <MenuItem value="linux">Linux / macOS (bash + find)</MenuItem>
                      <MenuItem value="windows">Windows (PowerShell)</MenuItem>
                    </TextField>
                  </>
                )}

                <TextField size="small" label="Item name (optional)" value={fwItemName}
                  onChange={(e) => setFwItemName(e.target.value)}
                  placeholder="Leave blank for auto-generated name" />

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval *" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)} placeholder="1m" helperText="e.g. 30s, 1m, 5m, 1h" fullWidth />
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" helperText="Keep raw data for" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" helperText="Keep aggregates for" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} placeholder="Optional notes about this item" multiline minRows={2} />

                <Divider />

                {fwCheckType !== "folder_latest" && (
                  <FormControlLabel
                    control={<Switch checked={fwCreateTrigger} onChange={(_, v) => setFwCreateTrigger(v)} size="small" />}
                    label={<Typography variant="body2">Auto-create trigger</Typography>}
                  />
                )}

                {fwCreateTrigger && fwCheckType !== "folder_latest" && (
                  <Stack spacing={2}>
                    {/* Trigger type — age trigger only makes sense for mtime */}
                    {fwCheckType === "mtime" && (
                      <TextField select size="small" label="Trigger type" value={fwTriggerType}
                        onChange={(e) => setFwTriggerType(e.target.value as "change" | "age")}>
                        <MenuItem value="change">
                          <Box>
                            <Typography variant="body2">File changed — fires when mtime changes</Typography>
                            <Typography variant="caption" color="text.secondary">Uses change() — fires on any modification</Typography>
                          </Box>
                        </MenuItem>
                        <MenuItem value="age">
                          <Box>
                            <Typography variant="body2">File too old — fires when not updated in X minutes</Typography>
                            <Typography variant="caption" color="text.secondary">Uses now() — requires Zabbix 5.4+</Typography>
                          </Box>
                        </MenuItem>
                      </TextField>
                    )}

                    {fwTriggerType === "age" && fwCheckType === "mtime" && (
                      <TextField size="small" label="Max age (minutes)" type="number"
                        value={fwMaxAgeMinutes} onChange={(e) => setFwMaxAgeMinutes(Number(e.target.value))}
                        helperText="Trigger fires if the file hasn't been modified for longer than this"
                        inputProps={{ min: 1 }} />
                    )}

                    <TextField size="small" label="Trigger name" value={fwTriggerName}
                      onChange={(e) => setFwTriggerName(e.target.value)}
                      placeholder={
                        fwTriggerType === "age"
                          ? `File not updated in ${fwMaxAgeMinutes}m: ${fwFilePath || "/path/to/file"} on {HOST.NAME}`
                          : `File changed: ${fwFilePath || "/path/to/file"} on {HOST.NAME}`
                      }
                      helperText="Leave blank to use the default name above" />
                    <TextField select size="small" label="Severity" value={fwTriggerPriority}
                      onChange={(e) => setFwTriggerPriority(Number(e.target.value))}>
                      {severities.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                    </TextField>
                  </Stack>
                )}
              </>
            )}

            {/* ── Script check form ── */}
            {itemType === "script" && (
              <>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField select size="small" label="Script type" value={scriptType} onChange={(e) => setScriptType(e.target.value as "bash" | "powershell")} fullWidth>
                    <MenuItem value="bash">Bash (Linux / macOS)</MenuItem>
                    <MenuItem value="powershell">PowerShell (Windows)</MenuItem>
                  </TextField>
                  <TextField select size="small" label="Mode" value={scriptMode} onChange={(e) => { setScriptMode(e.target.value as "command" | "file"); setScriptContent(""); setScriptFileArg(""); }} fullWidth>
                    <MenuItem value="command">
                      <Box>
                        <Typography variant="body2">Run command</Typography>
                        <Typography variant="caption" color="text.secondary">Inline shell command, e.g. cat /var/log/app.log | grep ERROR | wc -l</Typography>
                      </Box>
                    </MenuItem>
                    <MenuItem value="file">
                      <Box>
                        <Typography variant="body2">Run script file</Typography>
                        <Typography variant="caption" color="text.secondary">Path to a script already on the host, with an optional file argument</Typography>
                      </Box>
                    </MenuItem>
                  </TextField>
                </Stack>

                {scriptMode === "command" ? (
                  <TextField
                    size="small" label="Command *" value={scriptContent}
                    onChange={(e) => setScriptContent(e.target.value)}
                    multiline minRows={3}
                    placeholder={scriptType === "bash"
                      ? "e.g.  stat -c %s /var/log/app.log\nor:    grep -c ERROR /var/log/app.log"
                      : "e.g.  (Get-Item C:\\logs\\app.log).Length\nor:    (Select-String -Path C:\\logs\\app.log -Pattern 'ERROR').Count"}
                    helperText="The full command is passed to system.run[] on the agent — keep it on one line or use semicolons"
                  />
                ) : (
                  <>
                    <TextField
                      size="small" label="Script path on host *" value={scriptContent}
                      onChange={(e) => setScriptContent(e.target.value)}
                      placeholder={scriptType === "bash" ? "/opt/checks/check_file.sh" : "C:\\checks\\check_file.ps1"}
                      helperText={scriptType === "bash"
                        ? "Absolute path — Zabbix runs:  bash /your/script.sh [file_arg]"
                        : "Absolute path — Zabbix runs:  powershell.exe -File C:\\your\\script.ps1 [file_arg]"}
                    />
                    <TextField
                      size="small" label="File to check (optional)" value={scriptFileArg}
                      onChange={(e) => setScriptFileArg(e.target.value)}
                      placeholder={scriptType === "bash" ? "/var/log/app.log" : "C:\\logs\\app.log"}
                      helperText="Passed as the first argument ($1 / $args[0]) to your script"
                    />
                  </>
                )}

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField select size="small" label="Value type" value={scriptValueType} onChange={(e) => setScriptValueType(Number(e.target.value))} fullWidth
                    helperText="What your script outputs">
                    {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                  </TextField>
                  <TextField size="small" label="Item name (optional)" value={scriptItemName} onChange={(e) => setScriptItemName(e.target.value)}
                    placeholder="Leave blank for auto-generated name" fullWidth />
                </Stack>

                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval *" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)} placeholder="1m" helperText="e.g. 30s, 1m, 5m, 1h" fullWidth />
                  <TextField size="small" label="Units" value={itemUnits} onChange={(e) => setItemUnits(e.target.value)} placeholder="%, B, bps…" helperText="Displayed after the value" fullWidth />
                </Stack>

                {/* ── Custom intervals ── */}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                    Custom intervals (override the update interval for specific time windows)
                  </Typography>
                  <Stack spacing={1}>
                    {agentCustomIntervals.map((ci, i) => (
                      <Stack key={`sci-${i}`} direction="row" spacing={1} alignItems="flex-start">
                        <TextField select size="small" label="Type" value={ci.type} sx={{ minWidth: 120 }}
                          onChange={(e) => setAgentCustomIntervals((p) => p.map((r, j) => j === i ? { ...r, type: e.target.value as "flexible" | "scheduling", period: "" } : r))}>
                          <MenuItem value="flexible">Flexible</MenuItem>
                          <MenuItem value="scheduling">Scheduling</MenuItem>
                        </TextField>
                        <TextField size="small" label={ci.type === "scheduling" ? "Schedule expression" : "Interval"} value={ci.interval} sx={{ flex: 1 }}
                          placeholder={ci.type === "scheduling" ? "wd1-5h9" : "50s"}
                          helperText={ci.type === "scheduling" ? "e.g. wd1-5h9 = Mon–Fri at 09:00" : "e.g. 50s"}
                          onChange={(e) => setAgentCustomIntervals((p) => p.map((r, j) => j === i ? { ...r, interval: e.target.value } : r))} />
                        {ci.type === "flexible" && (
                          <TextField size="small" label="Period" value={ci.period} sx={{ flex: 1.5 }}
                            placeholder="1-7,00:00-24:00"
                            helperText="days,HH:MM-HH:MM e.g. 1-5,09:00-18:00"
                            onChange={(e) => setAgentCustomIntervals((p) => p.map((r, j) => j === i ? { ...r, period: e.target.value } : r))} />
                        )}
                        <IconButton size="small" sx={{ mt: 0.5 }} onClick={() => setAgentCustomIntervals((p) => p.filter((_, j) => j !== i))}>
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    ))}
                    <Button size="small" variant="text" sx={{ alignSelf: "flex-start", fontSize: "0.75rem" }}
                      onClick={() => setAgentCustomIntervals((p) => [...p, { type: "flexible", interval: "", period: "" }])}>
                      + Add custom interval
                    </Button>
                  </Stack>
                </Box>

                {/* ── Timeout ── */}
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>Timeout</Typography>
                  <Button size="small" variant={agentTimeoutMode === "global" ? "contained" : "outlined"} onClick={() => setAgentTimeoutMode("global")} sx={{ minWidth: 72 }}>Global</Button>
                  <Button size="small" variant={agentTimeoutMode === "override" ? "contained" : "outlined"} onClick={() => setAgentTimeoutMode("override")} sx={{ minWidth: 80 }}>Override</Button>
                  {agentTimeoutMode === "override" && (
                    <TextField size="small" value={agentTimeout} onChange={(e) => setAgentTimeout(e.target.value)}
                      placeholder="3s" helperText="e.g. 3s, 10s, 30s" sx={{ maxWidth: 140 }} />
                  )}
                </Stack>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" helperText="Keep raw data for (e.g. 7d, 31d, 0 = don't store)" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" helperText="Keep hourly aggregates for (e.g. 365d, 0 = don't store)" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} placeholder="Optional notes about this item" multiline minRows={2} />
                <FormControlLabel
                  control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />}
                  label={<Typography variant="body2">Enabled</Typography>}
                />
              </>
            )}

            {/* ── Database monitor form ── */}
            {itemType === "database" && (
              <>
                {/* Mode selector */}
                <TextField select size="small" label="Monitor type" value={dbMode}
                  onChange={(e) => { setDbMode(e.target.value as "odbc" | "agent2"); }}>
                  <MenuItem value="agent2">
                    <Box>
                      <Typography variant="body2">Agent2 plugin</Typography>
                      <Typography variant="caption" color="text.secondary">Zabbix Agent2 connects directly to the database on the host</Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem value="odbc">
                    <Box>
                      <Typography variant="body2">ODBC (SQL query)</Typography>
                      <Typography variant="caption" color="text.secondary">Zabbix server uses a DSN to run a SQL query — no agent needed</Typography>
                    </Box>
                  </MenuItem>
                </TextField>

                {dbMode === "agent2" && (
                  <>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                      <TextField select size="small" label="Database engine" value={dbEngine} fullWidth
                        onChange={(e) => { setDbEngine(e.target.value); setDbMetric("ping"); setDbExtraParam(""); }}>
                        <MenuItem value="postgresql">PostgreSQL</MenuItem>
                        <MenuItem value="mysql">MySQL / MariaDB</MenuItem>
                        <MenuItem value="mongodb">MongoDB</MenuItem>
                        <MenuItem value="mssql">Microsoft SQL Server</MenuItem>
                      </TextField>
                      <TextField select size="small" label="Metric" value={dbMetric} fullWidth
                        onChange={(e) => { setDbMetric(e.target.value); setDbExtraParam(""); }}>
                        {(DB_AGENT2_METRICS[dbEngine] ?? []).map((m) => (
                          <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                        ))}
                      </TextField>
                    </Stack>
                    <TextField size="small" label="Connection string *" value={dbConnString}
                      onChange={(e) => setDbConnString(e.target.value)}
                      placeholder={
                        dbEngine === "postgresql" ? "tcp://localhost:5432" :
                        dbEngine === "mysql"      ? "tcp://localhost:3306" :
                        dbEngine === "mongodb"    ? "mongodb://localhost:27017" :
                                                    "sqlserver://localhost:1433"
                      }
                      helperText={`URI or connection string passed to the Agent2 ${dbEngine} plugin`}
                    />
                    {DB_AGENT2_METRICS[dbEngine]?.find((m) => m.value === dbMetric)?.hasExtra && (
                      <TextField size="small"
                        label={`${DB_AGENT2_METRICS[dbEngine]?.find((m) => m.value === dbMetric)?.extraLabel ?? "Extra param"} *`}
                        value={dbExtraParam} onChange={(e) => setDbExtraParam(e.target.value)}
                        placeholder="mydb" helperText="Required for this metric" />
                    )}
                    <TextField size="small" label="Item name (optional)" value={dbAgent2ItemName}
                      onChange={(e) => setDbAgent2ItemName(e.target.value)}
                      placeholder="Leave blank for auto-generated name" />
                  </>
                )}

                {dbMode === "odbc" && (
                  <>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                      <TextField size="small" label="DSN name *" value={dbDsn}
                        onChange={(e) => setDbDsn(e.target.value)}
                        placeholder="e.g. my_postgres_dsn"
                        helperText="ODBC DSN configured on the Zabbix server" fullWidth />
                      <TextField size="small" label="Description (unique key) *" value={dbDescription}
                        onChange={(e) => setDbDescription(e.target.value)}
                        placeholder="e.g. row_count"
                        helperText="Used in the Zabbix item key — must be unique per host" fullWidth />
                    </Stack>
                    <TextField size="small" label="SQL query *" value={dbSqlQuery}
                      onChange={(e) => setDbSqlQuery(e.target.value)}
                      multiline minRows={3}
                      placeholder={"SELECT COUNT(*) FROM orders WHERE status = 'pending'"}
                      helperText="Must return a single scalar value" />
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                      <TextField size="small" label="Username (optional)" value={dbOdbcUsername}
                        onChange={(e) => setDbOdbcUsername(e.target.value)} fullWidth />
                      <TextField size="small" label="Password (optional)" value={dbOdbcPassword} type="password"
                        onChange={(e) => setDbOdbcPassword(e.target.value)} fullWidth />
                    </Stack>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                      <TextField select size="small" label="Value type" value={dbOdbcValueType}
                        onChange={(e) => setDbOdbcValueType(Number(e.target.value))} fullWidth>
                        {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                      </TextField>
                      <TextField size="small" label="Item name (optional)" value={dbOdbcItemName}
                        onChange={(e) => setDbOdbcItemName(e.target.value)}
                        placeholder="Leave blank for auto-generated name" fullWidth />
                    </Stack>
                  </>
                )}

                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval *" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)} placeholder="1m" helperText="e.g. 30s, 1m, 5m, 1h" fullWidth />
                  <TextField size="small" label="Units" value={itemUnits} onChange={(e) => setItemUnits(e.target.value)} placeholder="%, B, bps…" helperText="Displayed after the value" fullWidth />
                </Stack>

                {/* ── Custom intervals ── */}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                    Custom intervals (override the update interval for specific time windows)
                  </Typography>
                  <Stack spacing={1}>
                    {agentCustomIntervals.map((ci, i) => (
                      <Stack key={`dci-${i}`} direction="row" spacing={1} alignItems="flex-start">
                        <TextField select size="small" label="Type" value={ci.type} sx={{ minWidth: 120 }}
                          onChange={(e) => setAgentCustomIntervals((p) => p.map((r, j) => j === i ? { ...r, type: e.target.value as "flexible" | "scheduling", period: "" } : r))}>
                          <MenuItem value="flexible">Flexible</MenuItem>
                          <MenuItem value="scheduling">Scheduling</MenuItem>
                        </TextField>
                        <TextField size="small" label={ci.type === "scheduling" ? "Schedule expression" : "Interval"} value={ci.interval} sx={{ flex: 1 }}
                          placeholder={ci.type === "scheduling" ? "wd1-5h9" : "50s"}
                          helperText={ci.type === "scheduling" ? "e.g. wd1-5h9 = Mon–Fri at 09:00" : "e.g. 50s"}
                          onChange={(e) => setAgentCustomIntervals((p) => p.map((r, j) => j === i ? { ...r, interval: e.target.value } : r))} />
                        {ci.type === "flexible" && (
                          <TextField size="small" label="Period" value={ci.period} sx={{ flex: 1.5 }}
                            placeholder="1-7,00:00-24:00"
                            helperText="days,HH:MM-HH:MM e.g. 1-5,09:00-18:00"
                            onChange={(e) => setAgentCustomIntervals((p) => p.map((r, j) => j === i ? { ...r, period: e.target.value } : r))} />
                        )}
                        <IconButton size="small" sx={{ mt: 0.5 }} onClick={() => setAgentCustomIntervals((p) => p.filter((_, j) => j !== i))}>
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    ))}
                    <Button size="small" variant="text" sx={{ alignSelf: "flex-start", fontSize: "0.75rem" }}
                      onClick={() => setAgentCustomIntervals((p) => [...p, { type: "flexible", interval: "", period: "" }])}>
                      + Add custom interval
                    </Button>
                  </Stack>
                </Box>

                {/* ── Timeout ── */}
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>Timeout</Typography>
                  <Button size="small" variant={agentTimeoutMode === "global" ? "contained" : "outlined"} onClick={() => setAgentTimeoutMode("global")} sx={{ minWidth: 72 }}>Global</Button>
                  <Button size="small" variant={agentTimeoutMode === "override" ? "contained" : "outlined"} onClick={() => setAgentTimeoutMode("override")} sx={{ minWidth: 80 }}>Override</Button>
                  {agentTimeoutMode === "override" && (
                    <TextField size="small" value={agentTimeout} onChange={(e) => setAgentTimeout(e.target.value)}
                      placeholder="3s" helperText="e.g. 3s, 10s, 30s" sx={{ maxWidth: 140 }} />
                  )}
                </Stack>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" helperText="Keep raw data for (e.g. 7d, 31d, 0 = don't store)" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" helperText="Keep hourly aggregates for (e.g. 365d, 0 = don't store)" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} placeholder="Optional notes about this item" multiline minRows={2} />
                <FormControlLabel
                  control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />}
                  label={<Typography variant="body2">Enabled</Typography>}
                />
              </>
            )}

            {/* ── SNMP Agent form ── */}
            {itemType === "snmp" && (
              <>
                <TextField size="small" label="Item name *" value={snmpItemName} onChange={(e) => setSnmpItemName(e.target.value)} />
                <TextField size="small" label="OID *" value={snmpOid} onChange={(e) => setSnmpOid(e.target.value)}
                  placeholder="e.g. .1.3.6.1.2.1.1.3.0" helperText="The SNMP OID to poll" />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField select size="small" label="SNMP version" value={snmpVersion}
                    onChange={(e) => setSnmpVersion(Number(e.target.value))} fullWidth>
                    <MenuItem value={1}>SNMPv1</MenuItem>
                    <MenuItem value={2}>SNMPv2c</MenuItem>
                    <MenuItem value={3}>SNMPv3</MenuItem>
                  </TextField>
                  <TextField select size="small" label="Value type" value={snmpValueType}
                    onChange={(e) => setSnmpValueType(Number(e.target.value))} fullWidth>
                    {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                  </TextField>
                </Stack>
                {snmpVersion < 3 && (
                  <TextField size="small" label="Community" value={snmpCommunity} onChange={(e) => setSnmpCommunity(e.target.value)} placeholder="public" />
                )}
                {snmpVersion === 3 && (
                  <>
                    <TextField size="small" label="Security name" value={snmpV3SecName} onChange={(e) => setSnmpV3SecName(e.target.value)} />
                    <TextField select size="small" label="Security level" value={snmpV3SecLevel} onChange={(e) => setSnmpV3SecLevel(Number(e.target.value))}>
                      <MenuItem value={0}>noAuthNoPriv</MenuItem>
                      <MenuItem value={1}>authNoPriv</MenuItem>
                      <MenuItem value={2}>authPriv</MenuItem>
                    </TextField>
                    {snmpV3SecLevel >= 1 && (
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <TextField select size="small" label="Auth protocol" value={snmpV3AuthProto} onChange={(e) => setSnmpV3AuthProto(Number(e.target.value))} fullWidth>
                          <MenuItem value={0}>MD5</MenuItem>
                          <MenuItem value={1}>SHA1</MenuItem>
                          <MenuItem value={2}>SHA224</MenuItem>
                          <MenuItem value={3}>SHA256</MenuItem>
                          <MenuItem value={4}>SHA384</MenuItem>
                          <MenuItem value={5}>SHA512</MenuItem>
                        </TextField>
                        <TextField size="small" label="Auth passphrase" type="password" value={snmpV3AuthPass} onChange={(e) => setSnmpV3AuthPass(e.target.value)} fullWidth autoComplete="new-password" />
                      </Stack>
                    )}
                    {snmpV3SecLevel === 2 && (
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <TextField select size="small" label="Priv protocol" value={snmpV3PrivProto} onChange={(e) => setSnmpV3PrivProto(Number(e.target.value))} fullWidth>
                          <MenuItem value={0}>DES</MenuItem>
                          <MenuItem value={1}>AES128</MenuItem>
                          <MenuItem value={2}>AES192</MenuItem>
                          <MenuItem value={3}>AES256</MenuItem>
                        </TextField>
                        <TextField size="small" label="Priv passphrase" type="password" value={snmpV3PrivPass} onChange={(e) => setSnmpV3PrivPass(e.target.value)} fullWidth autoComplete="new-password" />
                      </Stack>
                    )}
                    <TextField size="small" label="Context name (optional)" value={snmpV3Context} onChange={(e) => setSnmpV3Context(e.target.value)} />
                  </>
                )}
                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)} placeholder="1m" helperText="e.g. 30s, 1m, 5m" fullWidth />
                  <TextField size="small" label="Units" value={itemUnits} onChange={(e) => setItemUnits(e.target.value)} placeholder="%, B…" fullWidth />
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} multiline minRows={2} />
                <FormControlLabel control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />} label={<Typography variant="body2">Enabled</Typography>} />
              </>
            )}

            {/* ── SNMP Trap form ── */}
            {itemType === "snmptrap" && (
              <>
                <TextField size="small" label="Item name *" value={snmpTrapItemName} onChange={(e) => setSnmpTrapItemName(e.target.value)} />
                <TextField size="small" label="Trap key" value={snmpTrapKey} onChange={(e) => setSnmpTrapKey(e.target.value)}
                  placeholder="snmptrap.fallback" helperText="Use snmptrap[regex] to match specific traps, or snmptrap.fallback for unmatched" />
                <TextField select size="small" label="Value type" value={snmpTrapValueType} onChange={(e) => setSnmpTrapValueType(Number(e.target.value))}>
                  {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} multiline minRows={2} />
                <FormControlLabel control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />} label={<Typography variant="body2">Enabled</Typography>} />
              </>
            )}

            {/* ── Zabbix Internal form ── */}
            {itemType === "internal" && (
              <>
                <TextField size="small" label="Item name *" value={internalItemName} onChange={(e) => setInternalItemName(e.target.value)} />
                <TextField size="small" label="Item key *" value={internalKey} onChange={(e) => setInternalKey(e.target.value)}
                  placeholder="e.g. zabbix[hosts]" helperText="Zabbix internal key — must start with zabbix[…]" />
                <TextField select size="small" label="Value type" value={internalValueType} onChange={(e) => setInternalValueType(Number(e.target.value))}>
                  {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)} placeholder="1m" fullWidth />
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} multiline minRows={2} />
                <FormControlLabel control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />} label={<Typography variant="body2">Enabled</Typography>} />
              </>
            )}

            {/* ── Zabbix Trapper form ── */}
            {itemType === "trapper" && (
              <>
                <TextField size="small" label="Item name *" value={trapperItemName} onChange={(e) => setTrapperItemName(e.target.value)} />
                <TextField size="small" label="Item key *" value={trapperKey} onChange={(e) => setTrapperKey(e.target.value)}
                  placeholder="e.g. app.custom.metric" helperText="The key name senders reference with zabbix_sender -k" />
                <TextField select size="small" label="Value type" value={trapperValueType} onChange={(e) => setTrapperValueType(Number(e.target.value))}>
                  {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                <FormControlLabel
                  control={<Switch checked={trapperAllowTraps} onChange={(_, v) => setTrapperAllowTraps(v)} size="small" />}
                  label={<Typography variant="body2">Allow Zabbix sender (trapping enabled)</Typography>}
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} multiline minRows={2} />
                <FormControlLabel control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />} label={<Typography variant="body2">Enabled</Typography>} />
              </>
            )}

            {/* ── External Check form ── */}
            {itemType === "external" && (
              <>
                <TextField size="small" label="Item name *" value={externalItemName} onChange={(e) => setExternalItemName(e.target.value)} />
                <TextField size="small" label="External script key *" value={externalKey} onChange={(e) => setExternalKey(e.target.value)}
                  placeholder="e.g. check_http.sh[http://example.com]"
                  helperText="Script filename (without path) + optional params in []. Script must exist in ExternalScripts dir." />
                <TextField select size="small" label="Value type" value={externalValueType} onChange={(e) => setExternalValueType(Number(e.target.value))}>
                  {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)} placeholder="1m" fullWidth />
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} multiline minRows={2} />
                <FormControlLabel control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />} label={<Typography variant="body2">Enabled</Typography>} />
              </>
            )}

            {/* ── IPMI Agent form ── */}
            {itemType === "ipmi" && (
              <>
                <TextField size="small" label="IPMI sensor *" value={ipmiSensor} onChange={(e) => setIpmiSensor(e.target.value)}
                  placeholder="e.g. CPU Temp" helperText="IPMI sensor name as reported by the BMC (use ipmitool sensor to list)" />
                <TextField size="small" label="Item name (optional)" value={ipmiItemName} onChange={(e) => setIpmiItemName(e.target.value)}
                  placeholder="Leave blank for auto-generated name" />
                <TextField select size="small" label="Value type" value={ipmiValueType} onChange={(e) => setIpmiValueType(Number(e.target.value))}>
                  {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)} placeholder="1m" fullWidth />
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} multiline minRows={2} />
                <FormControlLabel control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />} label={<Typography variant="body2">Enabled</Typography>} />
              </>
            )}

            {/* ── SSH Agent form ── */}
            {itemType === "ssh" && (
              <>
                <TextField size="small" label="Item name *" value={sshItemName} onChange={(e) => setSshItemName(e.target.value)} />
                <TextField size="small" label="Shell command *" value={sshParams} onChange={(e) => setSshParams(e.target.value)}
                  multiline minRows={3} placeholder="e.g. df -h / | tail -1 | awk '{print $5}'"
                  helperText="Command run on the remote host via SSH" />
                <TextField select size="small" label="Authentication" value={sshAuthType}
                  onChange={(e) => { setSshAuthType(Number(e.target.value)); setSshPassword(""); setSshPublicKey(""); setSshPrivateKey(""); }}>
                  <MenuItem value={0}>Password</MenuItem>
                  <MenuItem value={1}>Public key</MenuItem>
                </TextField>
                <TextField size="small" label="Username" value={sshUsername} onChange={(e) => setSshUsername(e.target.value)} autoComplete="off" />
                {sshAuthType === 0 && (
                  <TextField size="small" label="Password" type="password" value={sshPassword} onChange={(e) => setSshPassword(e.target.value)} autoComplete="new-password" />
                )}
                {sshAuthType === 1 && (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <TextField size="small" label="Public key file" value={sshPublicKey} onChange={(e) => setSshPublicKey(e.target.value)}
                      placeholder="/etc/zabbix/.ssh/id_rsa.pub" fullWidth />
                    <TextField size="small" label="Private key file" value={sshPrivateKey} onChange={(e) => setSshPrivateKey(e.target.value)}
                      placeholder="/etc/zabbix/.ssh/id_rsa" fullWidth />
                  </Stack>
                )}
                <TextField select size="small" label="Value type" value={sshValueType} onChange={(e) => setSshValueType(Number(e.target.value))}>
                  {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)} placeholder="1m" fullWidth />
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} multiline minRows={2} />
                <FormControlLabel control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />} label={<Typography variant="body2">Enabled</Typography>} />
              </>
            )}

            {/* ── Telnet Agent form ── */}
            {itemType === "telnet" && (
              <>
                <TextField size="small" label="Item name *" value={telnetItemName} onChange={(e) => setTelnetItemName(e.target.value)} />
                <TextField size="small" label="Command *" value={telnetParams} onChange={(e) => setTelnetParams(e.target.value)}
                  multiline minRows={2} helperText="Command sent after Telnet login" />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Username" value={telnetUsername} onChange={(e) => setTelnetUsername(e.target.value)} fullWidth autoComplete="off" />
                  <TextField size="small" label="Password" type="password" value={telnetPassword} onChange={(e) => setTelnetPassword(e.target.value)} fullWidth autoComplete="new-password" />
                </Stack>
                <TextField select size="small" label="Value type" value={telnetValueType} onChange={(e) => setTelnetValueType(Number(e.target.value))}>
                  {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)} placeholder="1m" fullWidth />
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} multiline minRows={2} />
                <FormControlLabel control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />} label={<Typography variant="body2">Enabled</Typography>} />
              </>
            )}

            {/* ── JMX Agent form ── */}
            {itemType === "jmx" && (
              <>
                <TextField size="small" label="Item name *" value={jmxItemName} onChange={(e) => setJmxItemName(e.target.value)} />
                <TextField size="small" label="JMX attribute key *" value={jmxKey} onChange={(e) => setJmxKey(e.target.value)}
                  placeholder="e.g. jmx[java.lang:type=Memory,HeapMemoryUsage.used]"
                  helperText="Full JMX object name + attribute in Zabbix jmx[…] format" />
                <TextField size="small" label="JMX endpoint (optional)" value={jmxEndpoint} onChange={(e) => setJmxEndpoint(e.target.value)}
                  placeholder="e.g. service:jmx:rmi:///jndi/rmi://host:12345/jmxrmi"
                  helperText="Override the default endpoint from the host JMX interface" />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Username" value={jmxUsername} onChange={(e) => setJmxUsername(e.target.value)} fullWidth autoComplete="off" />
                  <TextField size="small" label="Password" type="password" value={jmxPassword} onChange={(e) => setJmxPassword(e.target.value)} fullWidth autoComplete="new-password" />
                </Stack>
                <TextField select size="small" label="Value type" value={jmxValueType} onChange={(e) => setJmxValueType(Number(e.target.value))}>
                  {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)} placeholder="1m" fullWidth />
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} multiline minRows={2} />
                <FormControlLabel control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />} label={<Typography variant="body2">Enabled</Typography>} />
              </>
            )}

            {/* ── Calculated form ── */}
            {itemType === "calculated" && (
              <>
                <TextField size="small" label="Item name *" value={calcItemName} onChange={(e) => setCalcItemName(e.target.value)} />
                <TextField size="small" label="Item key *" value={calcKey} onChange={(e) => setCalcKey(e.target.value)}
                  placeholder="e.g. cpu.load.avg" helperText="Unique key for this calculated item" />
                <TextField size="small" label="Formula *" value={calcFormula} onChange={(e) => setCalcFormula(e.target.value)}
                  multiline minRows={3}
                  placeholder="e.g. last(/host/system.cpu.load[percpu,avg1])"
                  helperText="Zabbix calculated expression — references other item values" />
                <TextField select size="small" label="Value type" value={calcValueType} onChange={(e) => setCalcValueType(Number(e.target.value))}>
                  {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)} placeholder="1m" fullWidth />
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} multiline minRows={2} />
                <FormControlLabel control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />} label={<Typography variant="body2">Enabled</Typography>} />
              </>
            )}

            {/* ── Dependent Item form ── */}
            {itemType === "dependent" && (
              <>
                <TextField size="small" label="Item name *" value={depItemName} onChange={(e) => setDepItemName(e.target.value)} />
                <TextField size="small" label="Item key *" value={depKey} onChange={(e) => setDepKey(e.target.value)}
                  placeholder="e.g. app.response.parsed" helperText="Unique key for this dependent item" />
                <TextField size="small" label="Master item ID *" value={depMasterItemId} onChange={(e) => setDepMasterItemId(e.target.value)}
                  placeholder="Zabbix item ID (number)" helperText="Numeric itemid of the master item — find it in the browse table above" />
                <TextField select size="small" label="Value type" value={depValueType} onChange={(e) => setDepValueType(Number(e.target.value))}>
                  {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} multiline minRows={2} />
                <FormControlLabel control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />} label={<Typography variant="body2">Enabled</Typography>} />
              </>
            )}

            {/* ── Zabbix Script (JS) form ── */}
            {itemType === "scriptitem" && (
              <>
                <TextField size="small" label="Item name *" value={jsItemName} onChange={(e) => setJsItemName(e.target.value)} />
                <TextField size="small" label="Item key *" value={jsKey} onChange={(e) => setJsKey(e.target.value)}
                  placeholder="e.g. script.custom.check" helperText="Unique item key" />
                <TextField size="small" label="Script (JavaScript) *" value={jsParams} onChange={(e) => setJsParams(e.target.value)}
                  multiline minRows={5} placeholder={"var req = new HttpRequest();\nreturn req.get('http://127.0.0.1/api/status');"}
                  helperText="JavaScript executed by Zabbix (Duktape engine)" inputProps={{ style: { fontFamily: "monospace", fontSize: "0.8rem" } }} />
                <TextField select size="small" label="Value type" value={jsValueType} onChange={(e) => setJsValueType(Number(e.target.value))}>
                  {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>

                {/* Script parameters */}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                    Script parameters (accessible as <code>value</code> in the script via params array)
                  </Typography>
                  <Stack spacing={1}>
                    {jsParameters.map((p, i) => (
                      <Stack key={`jsp-${i}`} direction="row" spacing={1} alignItems="flex-start">
                        <TextField size="small" label="Name" value={p.name} sx={{ flex: 1 }}
                          onChange={(e) => setJsParameters((prev) => prev.map((r, j) => j === i ? { ...r, name: e.target.value } : r))} />
                        <TextField size="small" label="Value" value={p.value} sx={{ flex: 2 }}
                          onChange={(e) => setJsParameters((prev) => prev.map((r, j) => j === i ? { ...r, value: e.target.value } : r))} />
                        <IconButton size="small" sx={{ mt: 0.5 }} onClick={() => setJsParameters((prev) => prev.filter((_, j) => j !== i))}>
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    ))}
                    <Button size="small" variant="text" sx={{ alignSelf: "flex-start", fontSize: "0.75rem" }}
                      onClick={() => setJsParameters((p) => [...p, { name: "", value: "" }])}>
                      + Add parameter
                    </Button>
                  </Stack>
                </Box>

                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)} placeholder="1m" fullWidth />
                  <TextField size="small" label="Timeout (optional)" value={jsTimeout} onChange={(e) => setJsTimeout(e.target.value)} placeholder="3s" fullWidth />
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} multiline minRows={2} />
                <FormControlLabel control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />} label={<Typography variant="body2">Enabled</Typography>} />
              </>
            )}

            {/* ── Browser (JS) form ── */}
            {itemType === "browser" && (
              <>
                <TextField size="small" label="Item name *" value={browserItemName} onChange={(e) => setBrowserItemName(e.target.value)} />
                <TextField size="small" label="Item key *" value={browserKey} onChange={(e) => setBrowserKey(e.target.value)}
                  placeholder="e.g. browser.check.homepage" helperText="Unique item key" />
                <TextField size="small" label="Browser script (JavaScript) *" value={browserParams} onChange={(e) => setBrowserParams(e.target.value)}
                  multiline minRows={5}
                  placeholder={"await driver.get('https://example.com');\nreturn await driver.getTitle();"}
                  helperText="WebDriver BiDi automation script — runs via Zabbix browser monitoring engine"
                  inputProps={{ style: { fontFamily: "monospace", fontSize: "0.8rem" } }} />
                <TextField select size="small" label="Value type" value={browserValueType} onChange={(e) => setBrowserValueType(Number(e.target.value))}>
                  {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>

                {/* Browser parameters */}
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                    Script parameters (passed to the browser script)
                  </Typography>
                  <Stack spacing={1}>
                    {browserParameters.map((p, i) => (
                      <Stack key={`brp-${i}`} direction="row" spacing={1} alignItems="flex-start">
                        <TextField size="small" label="Name" value={p.name} sx={{ flex: 1 }}
                          onChange={(e) => setBrowserParameters((prev) => prev.map((r, j) => j === i ? { ...r, name: e.target.value } : r))} />
                        <TextField size="small" label="Value" value={p.value} sx={{ flex: 2 }}
                          onChange={(e) => setBrowserParameters((prev) => prev.map((r, j) => j === i ? { ...r, value: e.target.value } : r))} />
                        <IconButton size="small" sx={{ mt: 0.5 }} onClick={() => setBrowserParameters((prev) => prev.filter((_, j) => j !== i))}>
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    ))}
                    <Button size="small" variant="text" sx={{ alignSelf: "flex-start", fontSize: "0.75rem" }}
                      onClick={() => setBrowserParameters((p) => [...p, { name: "", value: "" }])}>
                      + Add parameter
                    </Button>
                  </Stack>
                </Box>

                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="Update interval" value={itemDelay} onChange={(e) => setItemDelay(e.target.value)} placeholder="1m" fullWidth />
                  <TextField size="small" label="Timeout (optional)" value={browserTimeout} onChange={(e) => setBrowserTimeout(e.target.value)} placeholder="3s" fullWidth />
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField size="small" label="History" value={itemHistory} onChange={(e) => setItemHistory(e.target.value)} placeholder="31d" fullWidth />
                  <TextField size="small" label="Trends" value={itemTrends} onChange={(e) => setItemTrends(e.target.value)} placeholder="365d" fullWidth />
                </Stack>
                <TextField size="small" label="Description" value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} multiline minRows={2} />
                <FormControlLabel control={<Switch checked={agentEnabled} onChange={(_, v) => setAgentEnabled(v)} size="small" />} label={<Typography variant="body2">Enabled</Typography>} />
              </>
            )}

            {bulkItemResults.length > 0 && <BulkResults results={bulkItemResults} label="Bulk item add" />}

            <Box>
              <Button variant="contained" color="secondary" onClick={onSubmitItem} disabled={itemSubmitDisabled}>
                {itemSaving ? <><CircularProgress size={16} sx={{ mr: 1 }} />Adding…</> : bulkItemMode ? "Add to all hosts" : "Add item"}
              </Button>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddItemOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>


      {/* ── Edit item dialog ── */}
      <Dialog open={!!editItem} onClose={() => setEditItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Edit item</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField size="small" label="Name *" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            <TextField
              size="small" label="Item key (condition)"
              value={editForm.key_}
              onChange={(e) => setEditForm((f) => ({ ...f, key_: e.target.value }))}
              InputProps={{ sx: { fontFamily: "monospace", fontSize: "0.8rem" } }}
              helperText="The Zabbix item key that defines what data is collected. Changing this may clear existing history."
            />
            <TextField size="small" label="Update interval" value={editForm.delay} onChange={(e) => setEditForm((f) => ({ ...f, delay: e.target.value }))} helperText="e.g. 1m, 30s, 5m" />
            <FormControl size="small" fullWidth>
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value as string }))}>
                <MenuItem value="0">Enabled</MenuItem>
                <MenuItem value="1">Disabled</MenuItem>
              </Select>
            </FormControl>
            {editItem?.state === "1" && (
              <Alert severity="error" sx={{ py: 0.5 }}>
                This item is <strong>Not Supported</strong> — the agent returned an error for the current key. Fix the key above to resolve it.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditItem(null)}>Cancel</Button>
          <Button variant="contained" disabled={editSaving || !editForm.name.trim() || !editForm.key_.trim()} onClick={async () => {
            if (!editItem) return;
            setEditSaving(true);
            try {
              const keyChanged = editForm.key_ !== editItem.key_;
              await api.updateItem(editItem.itemid, {
                name: editForm.name,
                delay: editForm.delay || undefined,
                status: editForm.status,
                key_: keyChanged ? editForm.key_ : undefined,
              });
              showToast("Item updated.", "success");
              setEditItem(null);
              void onLoadAllItems(browseHostFilter || undefined);
            } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
            finally { setEditSaving(false); }
          }}>
            {editSaving ? <CircularProgress size={14} /> : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Confirm delete item ── */}
      <Dialog open={confirmDeleteItemId !== null} onClose={() => setConfirmDeleteItemId(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete item?</DialogTitle>
        <DialogContent><Typography>This will permanently remove the item from Zabbix. This cannot be undone.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteItemId(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={async () => { if (!confirmDeleteItemId) return; await onDeleteItem(confirmDeleteItemId); setConfirmDeleteItemId(null); }}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast((t) => ({ ...t, open: false }))} anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
        <Alert onClose={() => setToast((t) => ({ ...t, open: false }))} severity={toast.severity} variant="filled" sx={{ width: "100%" }}>
          {toast.message}
        </Alert>
      </Snackbar>
    </Stack>
  );
};

