"use client";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import HttpIcon from "@mui/icons-material/Http";
import NetworkCheckIcon from "@mui/icons-material/NetworkCheck";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import TerminalIcon from "@mui/icons-material/Terminal";
import PlaylistAddOutlinedIcon from "@mui/icons-material/PlaylistAddOutlined";
import RouterIcon from "@mui/icons-material/Router";
import ClearIcon from "@mui/icons-material/Clear";
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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Switch,
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

type TriggerPreset = {
  label: string;
  group: string;
  itemKey: string;
  name: string;
  operator: string;
  threshold: string;
  severity: number;
};

const TRIGGER_PRESETS: TriggerPreset[] = [
  // Agent
  { group: "Agent",   label: "Agent not reachable",               itemKey: "agent.ping",                    name: "Agent not reachable on {HOST.NAME}",            operator: "=",  threshold: "0",   severity: 4 },
  // CPU
  { group: "CPU",     label: "CPU > 95% — critical",              itemKey: "system.cpu.util",               name: "Critical CPU utilization on {HOST.NAME}",       operator: ">",  threshold: "95",  severity: 5 },
  { group: "CPU",     label: "CPU > 90% — high",                  itemKey: "system.cpu.util",               name: "High CPU utilization on {HOST.NAME}",           operator: ">",  threshold: "90",  severity: 4 },
  { group: "CPU",     label: "CPU > 80% — warning",               itemKey: "system.cpu.util",               name: "CPU utilization warning on {HOST.NAME}",        operator: ">",  threshold: "80",  severity: 2 },
  { group: "CPU",     label: "CPU load > 10/core — critical",     itemKey: "system.cpu.load[percpu,avg1]",  name: "Critical CPU load on {HOST.NAME}",              operator: ">",  threshold: "10",  severity: 5 },
  { group: "CPU",     label: "CPU load > 5/core — high",          itemKey: "system.cpu.load[percpu,avg1]",  name: "High CPU load on {HOST.NAME}",                  operator: ">",  threshold: "5",   severity: 3 },
  // Disk
  { group: "Disk",    label: "Disk / used > 95% — critical",      itemKey: "vfs.fs.size[/,pused]",          name: "Critical disk usage on {HOST.NAME}",            operator: ">",  threshold: "95",  severity: 5 },
  { group: "Disk",    label: "Disk / used > 90% — high",          itemKey: "vfs.fs.size[/,pused]",          name: "High disk usage on {HOST.NAME}",                operator: ">",  threshold: "90",  severity: 4 },
  { group: "Disk",    label: "Disk / used > 85% — warning",       itemKey: "vfs.fs.size[/,pused]",          name: "Disk space warning on {HOST.NAME}",             operator: ">",  threshold: "85",  severity: 3 },
  { group: "Disk",    label: "Disk / free < 5% — critical",       itemKey: "vfs.fs.size[/,pfree]",          name: "Critical low disk on {HOST.NAME}",              operator: "<",  threshold: "5",   severity: 5 },
  { group: "Disk",    label: "Disk / free < 15% — warning",       itemKey: "vfs.fs.size[/,pfree]",          name: "Low disk space on {HOST.NAME}",                 operator: "<",  threshold: "15",  severity: 3 },
  { group: "Disk",    label: "Disk read ops > 1000/s",            itemKey: "vfs.dev.read[,ops]",            name: "High disk read activity on {HOST.NAME}",        operator: ">",  threshold: "1000",severity: 2 },
  { group: "Disk",    label: "Disk write ops > 1000/s",           itemKey: "vfs.dev.write[,ops]",           name: "High disk write activity on {HOST.NAME}",       operator: ">",  threshold: "1000",severity: 2 },
  // File
  { group: "File",    label: "File appeared (exists = 1)",        itemKey: "vfs.file.exists[/path/to/file]",name: "File appeared on {HOST.NAME}",                  operator: "=",  threshold: "1",   severity: 3 },
  { group: "File",    label: "File missing (exists = 0)",         itemKey: "vfs.file.exists[/path/to/file]",name: "File missing on {HOST.NAME}",                   operator: "=",  threshold: "0",   severity: 4 },
  // Memory
  { group: "Memory",  label: "Memory available < 5% — critical",  itemKey: "vm.memory.size[pavailable]",    name: "Critical memory shortage on {HOST.NAME}",       operator: "<",  threshold: "5",   severity: 5 },
  { group: "Memory",  label: "Memory available < 10% — high",     itemKey: "vm.memory.size[pavailable]",    name: "Low available memory on {HOST.NAME}",           operator: "<",  threshold: "10",  severity: 4 },
  { group: "Memory",  label: "Memory available < 20% — warning",  itemKey: "vm.memory.size[pavailable]",    name: "Memory running low on {HOST.NAME}",             operator: "<",  threshold: "20",  severity: 2 },
  { group: "Memory",  label: "Swap free < 10% — high",            itemKey: "system.swap.size[,pfree]",      name: "Critically low swap space on {HOST.NAME}",      operator: "<",  threshold: "10",  severity: 4 },
  { group: "Memory",  label: "Swap free < 20% — warning",         itemKey: "system.swap.size[,pfree]",      name: "Low swap space on {HOST.NAME}",                 operator: "<",  threshold: "20",  severity: 2 },
  // Network
  { group: "Network", label: "Port 80 not listening",             itemKey: "net.tcp.listen[80]",            name: "HTTP port 80 down on {HOST.NAME}",              operator: "=",  threshold: "0",   severity: 4 },
  { group: "Network", label: "Port 443 not listening",            itemKey: "net.tcp.listen[443]",           name: "HTTPS port 443 down on {HOST.NAME}",            operator: "=",  threshold: "0",   severity: 4 },
  { group: "Network", label: "Port 22 not listening",             itemKey: "net.tcp.listen[22]",            name: "SSH port 22 down on {HOST.NAME}",               operator: "=",  threshold: "0",   severity: 4 },
  { group: "Network", label: "Network errors > 100/s",            itemKey: "net.if.in[eth0,errors]",        name: "High network errors on {HOST.NAME}",            operator: ">",  threshold: "100", severity: 3 },
  // Process
  { group: "Process", label: "Zombie processes > 5",              itemKey: "proc.num[,,,zomb]",             name: "Zombie processes detected on {HOST.NAME}",      operator: ">",  threshold: "5",   severity: 3 },
  { group: "Process", label: "Too many processes > 500",          itemKey: "proc.num[]",                    name: "Too many processes on {HOST.NAME}",             operator: ">",  threshold: "500", severity: 3 },
  { group: "Process", label: "sshd not running",                  itemKey: "proc.num[sshd]",                name: "sshd not running on {HOST.NAME}",               operator: "=",  threshold: "0",   severity: 4 },
  // System
  { group: "System",  label: "Host rebooted (uptime < 10 min)",   itemKey: "system.uptime",                 name: "{HOST.NAME} was recently rebooted",             operator: "<",  threshold: "600", severity: 2 },
  { group: "System",  label: "Too many users logged in > 10",     itemKey: "system.users.num",              name: "Too many users logged in on {HOST.NAME}",       operator: ">",  threshold: "10",  severity: 2 },
];

type ItemContext = { hint: string; suggestedOperator: string; chips: string[]; unit: string };

const detectItemContext = (key: string): ItemContext | null => {
  if (!key) return null;
  if (/agent\.ping|icmpping\[|net\.tcp\.(listen|service|port)/.test(key))
    return { hint: "Returns 1 (up) or 0 (down)", suggestedOperator: "=", chips: ["0", "1"], unit: "" };
  if (/system\.cpu\.util/.test(key))
    return { hint: "CPU % (0 – 100)", suggestedOperator: ">", chips: ["70", "80", "90", "95"], unit: "%" };
  if (/system\.cpu\.load/.test(key))
    return { hint: "Load per CPU core", suggestedOperator: ">", chips: ["3", "5", "10"], unit: "" };
  if (/vm\.memory\.size\[pavailable\]|vm\.memory\.size\[pfree\]/.test(key))
    return { hint: "Free memory % (lower = worse)", suggestedOperator: "<", chips: ["20", "10", "5"], unit: "%" };
  if (/vm\.memory\.size\[pused\]/.test(key))
    return { hint: "Used memory % (higher = worse)", suggestedOperator: ">", chips: ["80", "90", "95"], unit: "%" };
  if (/system\.swap\.size\[,pfree\]/.test(key))
    return { hint: "Free swap % (lower = worse)", suggestedOperator: "<", chips: ["20", "10"], unit: "%" };
  if (/system\.swap\.size\[,pused\]/.test(key))
    return { hint: "Used swap % (higher = worse)", suggestedOperator: ">", chips: ["80", "90", "95"], unit: "%" };
  if (/vfs\.fs\.size\[.*,pfree\]/.test(key))
    return { hint: "Free disk % (lower = worse)", suggestedOperator: "<", chips: ["20", "10", "5"], unit: "%" };
  if (/vfs\.fs\.size\[.*,pused\]/.test(key))
    return { hint: "Used disk % (higher = worse)", suggestedOperator: ">", chips: ["80", "90", "95"], unit: "%" };
  if (/vfs\.fs\.size\[/.test(key))
    return { hint: "Disk size in bytes", suggestedOperator: "<", chips: ["536870912", "1073741824"], unit: "B" };
  if (/vm\.memory\.size\[/.test(key))
    return { hint: "Memory in bytes", suggestedOperator: "<", chips: ["536870912", "268435456"], unit: "B" };
  if (/net\.if\.(in|out|total)\[.*bytes\]/.test(key))
    return { hint: "Throughput in bytes/s", suggestedOperator: ">", chips: ["10485760", "104857600"], unit: "B/s" };
  if (/net\.if\.(in|out)\[.*errors\]/.test(key))
    return { hint: "Error packet count/s", suggestedOperator: ">", chips: ["10", "100", "500"], unit: "" };
  if (/proc\.num\[,,,zomb\]/.test(key))
    return { hint: "Zombie process count", suggestedOperator: ">", chips: ["1", "5", "10"], unit: "" };
  if (/proc\.num/.test(key))
    return { hint: "Process count", suggestedOperator: ">", chips: ["0", "5", "10", "500"], unit: "" };
  if (/system\.uptime/.test(key))
    return { hint: "Uptime in seconds (less = recently rebooted)", suggestedOperator: "<", chips: ["300", "600", "3600"], unit: "s" };
  if (/system\.users\.num/.test(key))
    return { hint: "Logged-in user count", suggestedOperator: ">", chips: ["5", "10", "20"], unit: "" };
  if (/vfs\.file\.exists/.test(key))
    return { hint: "1 = file present, 0 = file missing", suggestedOperator: "=", chips: ["0", "1"], unit: "" };
  if (/vfs\.file\.size/.test(key))
    return { hint: "File size in bytes", suggestedOperator: ">", chips: ["1048576", "104857600"], unit: "B" };
  if (/icmppingsec/.test(key))
    return { hint: "Round-trip time in seconds", suggestedOperator: ">", chips: ["0.1", "0.5", "1", "2"], unit: "s" };
  if (/icmppingloss/.test(key))
    return { hint: "Packet loss %", suggestedOperator: ">", chips: ["10", "50", "100"], unit: "%" };
  return null;
};

type BulkResult = { hostname: string; item_id?: string | null; trigger_id?: string | null; error: string | null };

type Item = { itemid: string; name: string; key_: string; value_type: string; delay: string };
type Trigger = { triggerid: string; description: string; expression: string; priority: string; status: string };

// ── Help panels ───────────────────────────────────────────────────────

const ItemHelp = () => (
  <Accordion disableGutters elevation={0} sx={{ border: "1px solid", borderColor: "primary.main", borderRadius: "8px !important", bgcolor: "rgba(25,118,210,0.04)", "&:before": { display: "none" } }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 18, color: "primary.main" }} />} sx={{ minHeight: 40, "& .MuiAccordionSummary-content": { my: 0.5 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <HelpOutlineIcon sx={{ fontSize: 16, color: "primary.main" }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: "primary.main" }}>How to create an agent item</Typography>
      </Box>
    </AccordionSummary>
    <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8rem" }}>
          An item defines what data Zabbix collects from a host via the Zabbix agent. Pick a key that tells the agent what to measure.
        </Typography>
        <Stack spacing={0.5}>
          {[
            ["system.cpu.util[,user]", "CPU user utilization (%)"],
            ["vm.memory.size[available]", "Available memory (bytes)"],
            ["net.if.in[eth0,bytes]", "Network inbound traffic"],
            ["vfs.fs.size[/,pfree]", "Free disk space on / (%)"],
            ["agent.ping", "Agent connectivity check"],
          ].map(([key, desc]) => (
            <Box key={key} sx={{ display: "flex", gap: 1, alignItems: "baseline" }}>
              <Typography sx={{ fontFamily: "monospace", fontSize: "0.72rem", color: "primary.light", flexShrink: 0, minWidth: 240 }}>{key}</Typography>
              <Typography variant="caption" color="text.secondary">{desc}</Typography>
            </Box>
          ))}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
          Use <strong>Integer</strong> or <strong>Float</strong> for numeric metrics — these can be graphed and used in triggers.
        </Typography>
      </Stack>
    </AccordionDetails>
  </Accordion>
);

const TriggerHelp = () => (
  <Accordion disableGutters elevation={0} sx={{ border: "1px solid", borderColor: "primary.main", borderRadius: "8px !important", bgcolor: "rgba(25,118,210,0.04)", "&:before": { display: "none" } }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 18, color: "primary.main" }} />} sx={{ minHeight: 40, "& .MuiAccordionSummary-content": { my: 0.5 } }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
        <HelpOutlineIcon sx={{ fontSize: 16, color: "primary.main" }} />
        <Typography variant="caption" sx={{ fontWeight: 700, color: "primary.main" }}>How to create a trigger</Typography>
      </Box>
    </AccordionSummary>
    <AccordionDetails sx={{ pt: 0, pb: 1.5 }}>
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8rem" }}>
          A trigger fires an alert when an item's value crosses a threshold. The item key must already exist on the selected host.
        </Typography>
        <Box sx={{ bgcolor: "action.hover", borderRadius: 1, p: 1.5, border: "1px solid", borderColor: "divider" }}>
          <Typography variant="caption" sx={{ fontWeight: 700, display: "block", mb: 1, color: "text.primary" }}>Example — alert when CPU exceeds 90%</Typography>
          <Stack spacing={0.5}>
            {[["Item key", "system.cpu.util[,user]"], ["Trigger name", "High CPU on {HOST.NAME}"], ["Condition", "> 90"], ["Severity", "High"]].map(([label, val]) => (
              <Box key={label} sx={{ display: "flex", gap: 1 }}>
                <Typography variant="caption" sx={{ color: "text.disabled", minWidth: 90, fontSize: "0.72rem" }}>{label}</Typography>
                <Typography variant="caption" sx={{ fontFamily: "monospace", fontSize: "0.72rem", color: "text.primary" }}>{val}</Typography>
              </Box>
            ))}
          </Stack>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
          Use <code>{"{HOST.NAME}"}</code> in the trigger name — Zabbix expands it automatically.
        </Typography>
      </Stack>
    </AccordionDetails>
  </Accordion>
);

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

type ServerItemKey = { key: string; name: string; valueType: number; group: string };

export const Items = () => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [hostsLoading, setHostsLoading] = useState(true);
  const [serverItemKeys, setServerItemKeys] = useState<ServerItemKey[]>([]);
  const [itemKeysLoading, setItemKeysLoading] = useState(true);

  useEffect(() => {
    api.listHosts()
      .then((r) => setHosts(r.hosts))
      .catch(() => {})
      .finally(() => setHostsLoading(false));
    api.listItemKeys()
      .then((r) => setServerItemKeys(r.items.map((i) => ({ key: i.key_, name: i.name, valueType: parseInt(i.value_type, 10), group: i.group }))))
      .catch(() => {})
      .finally(() => setItemKeysLoading(false));
  }, []);

  // ── Item type tab ─────────────────────────────────────────────────────
  const [itemType, setItemType] = useState<"agent" | "http" | "service" | "script" | "filewatch" | "database">("agent");

  // ── Agent item state ──────────────────────────────────────────────────
  const [hostname, setHostname] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemKey, setItemKey] = useState("");
  const [valueType, setValueType] = useState(3);

  // ── HTTP item state ───────────────────────────────────────────────────
  const [httpHostname, setHttpHostname] = useState("");
  const [httpItemName, setHttpItemName] = useState("");
  const [httpUrl, setHttpUrl] = useState("");
  const [httpMethod, setHttpMethod] = useState(0);
  const [httpStatusCodes, setHttpStatusCodes] = useState("200");
  const [httpTimeout, setHttpTimeout] = useState("15s");
  const [httpVerifyTLS, setHttpVerifyTLS] = useState(true);
  const [httpFollowRedirects, setHttpFollowRedirects] = useState(true);
  const [httpPostBody, setHttpPostBody] = useState("");
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

  // ── Bulk item state ───────────────────────────────────────────────────
  const [bulkItemMode, setBulkItemMode] = useState(false);
  const [bulkItemHosts, setBulkItemHosts] = useState<Host[]>([]);
  const [bulkItemResults, setBulkItemResults] = useState<BulkResult[]>([]);
  const [itemSaving, setItemSaving] = useState(false);

  // ── Trigger state ─────────────────────────────────────────────────────
  const [selectedPreset, setSelectedPreset] = useState<TriggerPreset | null>(null);

  const [triggerHost, setTriggerHost] = useState("");
  const [triggerItemKey, setTriggerItemKey] = useState("");
  const [triggerName, setTriggerName] = useState("");
  const [operator, setOperator] = useState(">");
  const [threshold, setThreshold] = useState("");
  const [severity, setSeverity] = useState(3);
  const [triggerItems, setTriggerItems] = useState<{ itemid: string; name: string; key_: string }[]>([]);
  const [triggerItemsLoading, setTriggerItemsLoading] = useState(false);
  const [triggerSaving, setTriggerSaving] = useState(false);

  // ── Bulk trigger state ────────────────────────────────────────────────
  const [bulkTriggerMode, setBulkTriggerMode] = useState(false);
  const [bulkTriggerHosts, setBulkTriggerHosts] = useState<Host[]>([]);
  const [bulkTriggerResults, setBulkTriggerResults] = useState<BulkResult[]>([]);

  // ── Manage items / triggers ───────────────────────────────────────────
  const [searchItemHost, setSearchItemHost] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [searchTriggerHost, setSearchTriggerHost] = useState("");
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [loadingTriggers, setLoadingTriggers] = useState(false);
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [confirmDeleteTriggerId, setConfirmDeleteTriggerId] = useState<string | null>(null);
  // Inline lists auto-loaded from the selected host in each form
  const [inlineItems, setInlineItems] = useState<Item[]>([]);
  const [loadingInlineItems, setLoadingInlineItems] = useState(false);
  const [inlineTriggers, setInlineTriggers] = useState<Trigger[]>([]);
  const [loadingInlineTriggers, setLoadingInlineTriggers] = useState(false);

  // ── Toast ─────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({ open: false, message: "", severity: "success" });
  const showToast = (message: string, sev: "success" | "error") => setToast({ open: true, message, severity: sev });

  // Load trigger items when host changes
  useEffect(() => {
    if (!triggerHost) { setTriggerItems([]); setTriggerItemKey(""); return; }
    setTriggerItemsLoading(true);
    api.listItems(triggerHost, true)
      .then((r) => { setTriggerItems(r.items.filter((i) => i.value_type === "0" || i.value_type === "3")); setTriggerItemKey(""); })
      .catch(() => setTriggerItems([]))
      .finally(() => setTriggerItemsLoading(false));
  }, [triggerHost]);

  // Auto-fill port when service type changes
  useEffect(() => {
    const found = serviceTypes.find((s) => s.value === svcType);
    setSvcPort(found?.port != null ? String(found.port) : "");
    setSvcItemName("");
  }, [svcType]);

  // ── Handlers ─────────────────────────────────────────────────────────

  const onCreateAgentItem = async (targetHost: string) => {
    await api.addItem({ hostname: targetHost, item_name: itemName, item_key: itemKey, value_type: valueType });
  };

  const onCreateHttpItem = async (targetHost: string) => {
    await api.addHttpItem({
      hostname: targetHost, item_name: httpItemName, url: httpUrl,
      request_method: httpMethod, status_codes: httpStatusCodes, timeout: httpTimeout,
      verify_peer: httpVerifyTLS, follow_redirects: httpFollowRedirects,
      posts: httpPostBody, value_type: httpValueType,
      authtype: httpAuthType,
      username: httpAuthType ? httpUsername : undefined,
      password: httpAuthType ? httpPassword : undefined,
      regex_preprocessing: httpRegexEnabled,
      regex_pattern: httpRegexEnabled ? httpRegexPattern : undefined,
      regex_output: httpRegexEnabled ? httpRegexOutput : undefined,
      regex_no_match_value: httpRegexEnabled ? httpRegexNoMatch : undefined,
    });
  };

  const onCreateServiceItem = async (targetHost: string) => {
    await api.addServiceItem({
      hostname: targetHost, service_type: svcType,
      port: svcPort ? Number(svcPort) : null,
      item_name: svcItemName || undefined,
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
    });
    if (res.trigger_error) showToast(`Item created, but trigger failed: ${res.trigger_error}`, "error");
  };

  const onCreateDbItem = async (targetHost: string) => {
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
    await api.addScriptItem({
      hostname: targetHost,
      script_type: scriptType,
      script_mode: scriptMode,
      script: scriptContent,
      file_arg: scriptFileArg || undefined,
      item_name: scriptItemName || undefined,
      value_type: scriptValueType,
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
          result = await api.bulkAddItems({ ...basePayload, item_name: itemName, item_key: itemKey, value_type: valueType });
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
        const targetHost = itemType === "agent" ? hostname : itemType === "http" ? httpHostname : itemType === "script" ? scriptHostname : itemType === "filewatch" ? fwHostname : svcHostname;
        if (itemType === "agent") await onCreateAgentItem(targetHost);
        else if (itemType === "http") await onCreateHttpItem(targetHost);
        else if (itemType === "script") await onCreateScriptItem(targetHost);
        else if (itemType === "filewatch") await onCreateFileWatchItem(targetHost);
        else if (itemType === "database") await onCreateDbItem(targetHost);
        else await onCreateServiceItem(targetHost);
        if (itemType !== "filewatch" || !toast.open) showToast("Item added successfully.", "success");
        if (itemType === "agent") { setItemName(""); setItemKey(""); }
        else if (itemType === "http") { setHttpItemName(""); setHttpUrl(""); setHttpPostBody(""); }
        else if (itemType === "script") { setScriptContent(""); setScriptFileArg(""); setScriptItemName(""); }
        else if (itemType === "filewatch") { setFwFilePath(""); setFwItemName(""); setFwTriggerName(""); }
        else if (itemType === "database") { setDbDsn(""); setDbDescription(""); setDbSqlQuery(""); setDbConnString(""); setDbExtraParam(""); setDbOdbcItemName(""); setDbAgent2ItemName(""); }
        else { setSvcItemName(""); }
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setItemSaving(false);
    }
  };

  const onSubmitTrigger = async () => {
    const parsedThreshold = Number(threshold);
    if (!Number.isFinite(parsedThreshold)) { showToast("Threshold must be a valid number.", "error"); return; }
    setTriggerSaving(true);
    setBulkTriggerResults([]);
    try {
      if (bulkTriggerMode) {
        const hostnames = bulkTriggerHosts.map((h) => h.host);
        if (!hostnames.length) { showToast("Select at least one host.", "error"); return; }
        const result = await api.bulkAddTriggers({ hostnames, item_key: triggerItemKey, trigger_name: triggerName, threshold: parsedThreshold, operator, priority: severity });
        setBulkTriggerResults(result.results);
        showToast(result.message, result.results.some((r) => r.error) ? "error" : "success");
      } else {
        await api.addTrigger({ hostname: triggerHost, item_key: triggerItemKey, trigger_name: triggerName, threshold: parsedThreshold, operator, severity });
        showToast("Trigger added successfully.", "success");
        setTriggerName("");
        setThreshold("");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setTriggerSaving(false);
    }
  };

  const onLoadItems = async () => {
    if (!searchItemHost) return;
    setLoadingItems(true);
    try {
      const res = await api.listItems(searchItemHost);
      setItems(res.items);
      if (res.items.length === 0) showToast("No custom items found for this host.", "success");
    } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
    finally { setLoadingItems(false); }
  };

  const onDeleteItem = async (itemid: string) => {
    try {
      await api.deleteItem(itemid);
      setItems((prev) => prev.filter((i) => i.itemid !== itemid));
      setInlineItems((prev) => prev.filter((i) => i.itemid !== itemid));
      showToast("Item deleted.", "success");
    } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };

  const onLoadTriggers = async () => {
    if (!searchTriggerHost) return;
    setLoadingTriggers(true);
    try {
      const res = await api.listTriggers(searchTriggerHost);
      setTriggers(res.triggers);
      if (res.triggers.length === 0) showToast("No custom triggers found for this host.", "success");
    } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
    finally { setLoadingTriggers(false); }
  };

  const onDeleteTrigger = async (triggerid: string) => {
    try {
      await api.deleteTrigger(triggerid);
      setTriggers((prev) => prev.filter((t) => t.triggerid !== triggerid));
      setInlineTriggers((prev) => prev.filter((t) => t.triggerid !== triggerid));
      showToast("Trigger deleted.", "success");
    } catch (e) { showToast(e instanceof Error ? e.message : String(e), "error"); }
  };

  // ── Reusable sub-components ───────────────────────────────────────────

  const HostSelect = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <FormControl size="small" fullWidth>
      <InputLabel>{label}</InputLabel>
      <Select label={label} value={value} onChange={(e) => onChange(e.target.value)} disabled={hostsLoading}
        startAdornment={hostsLoading ? <CircularProgress size={14} sx={{ ml: 1, mr: 0.5 }} /> : undefined}>
        {hosts.map((h) => <MenuItem key={h.hostid} value={h.host}>{h.host}</MenuItem>)}
      </Select>
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
  const activeItemHost = itemType === "agent" ? hostname : itemType === "http" ? httpHostname : itemType === "script" ? scriptHostname : itemType === "filewatch" ? fwHostname : itemType === "database" ? dbHostname : svcHostname;
  const setActiveItemHost = itemType === "agent" ? setHostname : itemType === "http" ? setHttpHostname : itemType === "script" ? setScriptHostname : itemType === "filewatch" ? setFwHostname : itemType === "database" ? setDbHostname : setSvcHostname;

  // Auto-load existing items when host is selected in the Add item form
  useEffect(() => {
    if (!activeItemHost || bulkItemMode) { setInlineItems([]); return; }
    setLoadingInlineItems(true);
    api.listItems(activeItemHost)
      .then((r) => setInlineItems(r.items))
      .catch(() => setInlineItems([]))
      .finally(() => setLoadingInlineItems(false));
  }, [activeItemHost, bulkItemMode]);

  // Auto-load existing triggers when host is selected in the Add trigger form
  useEffect(() => {
    if (!triggerHost || bulkTriggerMode) { setInlineTriggers([]); return; }
    setLoadingInlineTriggers(true);
    api.listTriggers(triggerHost)
      .then((r) => setInlineTriggers(r.triggers))
      .catch(() => setInlineTriggers([]))
      .finally(() => setLoadingInlineTriggers(false));
  }, [triggerHost, bulkTriggerMode]);

  // Determine if the submit button should be disabled
  const itemSubmitDisabled = (() => {
    if (itemSaving) return true;
    if (bulkItemMode && !bulkItemHosts.length) return true;
    if (!bulkItemMode && !activeItemHost) return true;
    if (itemType === "agent") return !itemName || !itemKey;
    if (itemType === "http") return !httpItemName || !httpUrl;
    if (itemType === "script") return !scriptContent;
    if (itemType === "filewatch") return !fwFilePath;
    if (itemType === "database") {
      if (dbMode === "odbc") return !dbDsn || !dbDescription || !dbSqlQuery;
      return !dbConnString || !dbMetric;
    }
    return false; // service type — service type is always set
  })();

  return (
    <Stack spacing={3}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
        <PlaylistAddOutlinedIcon sx={{ fontSize: 28, color: "primary.main" }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Items & Triggers</Typography>
          <Typography variant="body2" color="text.secondary">Add or remove monitoring items and alert triggers.</Typography>
        </Box>
      </Box>

      {/* ── Add item ── */}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Add item</Typography>
            <Typography color="text.secondary" variant="body2">Attach a new metric check to a host.</Typography>

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
              </Select>
            </FormControl>

            {itemType === "agent" && <ItemHelp />}
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
                <Autocomplete freeSolo size="small"
                  options={serverItemKeys.length > 0 ? serverItemKeys : COMMON_ITEM_KEYS}
                  getOptionLabel={(opt) => typeof opt === "string" ? opt : `${opt.key} — ${opt.name}`}
                  groupBy={(opt) => (typeof opt === "string" ? "" : opt.group)}
                  loading={itemKeysLoading}
                  inputValue={itemKey}
                  onInputChange={(_, v, reason) => { if (reason === "input" || reason === "clear") setItemKey(v); }}
                  onChange={(_, v) => {
                    if (v === null) setItemKey("");
                    else if (typeof v === "string") setItemKey(v);
                    else { setItemKey(v.key); if (!itemName) setItemName(v.name); setValueType(v.valueType); }
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
                <TextField select size="small" label="Value type" value={valueType} onChange={(e) => setValueType(Number(e.target.value))}>
                  {valueTypes.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
              </>
            )}

            {/* ── HTTP agent form ── */}
            {itemType === "http" && (
              <>
                <TextField size="small" label="Item name *" value={httpItemName} onChange={(e) => setHttpItemName(e.target.value)} placeholder="e.g. API health check" />
                <TextField size="small" label="URL *" value={httpUrl} onChange={(e) => setHttpUrl(e.target.value)} placeholder="https://example.com/health" />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField select size="small" label="Method" value={httpMethod} onChange={(e) => setHttpMethod(Number(e.target.value))} fullWidth>
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
                  <TextField size="small" label="Timeout" value={httpTimeout} onChange={(e) => setHttpTimeout(e.target.value)} fullWidth placeholder="15s"
                    helperText="e.g. 15s, 1m" />
                  {httpValueType === 3 && (
                    <TextField size="small" label="Expected status codes" value={httpStatusCodes} onChange={(e) => setHttpStatusCodes(e.target.value)} fullWidth
                      placeholder="200" helperText="Comma-separated, e.g. 200,201,301" />
                  )}
                </Stack>
                <Stack direction="row" spacing={2}>
                  <FormControlLabel control={<Switch checked={httpVerifyTLS} onChange={(_, v) => setHttpVerifyTLS(v)} size="small" />} label={<Typography variant="body2">Verify TLS</Typography>} />
                  <FormControlLabel control={<Switch checked={httpFollowRedirects} onChange={(_, v) => setHttpFollowRedirects(v)} size="small" />} label={<Typography variant="body2">Follow redirects</Typography>} />
                </Stack>
                {(httpMethod === 1 || httpMethod === 2) && (
                  <TextField size="small" label="Request body" value={httpPostBody} onChange={(e) => setHttpPostBody(e.target.value)} multiline minRows={3} placeholder='{"key": "value"}' />
                )}

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
              </>
            )}

            {bulkItemResults.length > 0 && <BulkResults results={bulkItemResults} label="Bulk item add" />}

            <Box>
              <Button variant="contained" color="secondary" onClick={onSubmitItem} disabled={itemSubmitDisabled}>
                {itemSaving ? <><CircularProgress size={16} sx={{ mr: 1 }} />Adding…</> : bulkItemMode ? "Add to all hosts" : "Add item"}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* ── Delete items ── */}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Delete item</Typography>
            <Typography color="text.secondary" variant="body2">Look up a host's custom items and remove the ones you no longer need.</Typography>
            <Divider />
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ flex: 1 }}>
                <HostSelect label="Host" value={searchItemHost} onChange={(v) => { setSearchItemHost(v); setItems([]); }} />
              </Box>
              {searchItemHost && (
                <Tooltip title="Clear selection">
                  <IconButton size="small" onClick={() => { setSearchItemHost(""); setItems([]); }}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Button variant="outlined" onClick={onLoadItems} disabled={!searchItemHost || loadingItems}
                startIcon={loadingItems ? <CircularProgress size={16} /> : <SearchOutlinedIcon />}
                sx={{ whiteSpace: "nowrap", minWidth: 100 }}>
                Load
              </Button>
            </Stack>
            {items.length > 0 && (
              <Stack spacing={1}>
                {items.map((item) => (
                  <Box key={item.itemid} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.5, py: 1, borderRadius: 1.5, border: "1px solid", borderColor: "divider", backgroundColor: "action.hover" }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{item.name}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>{item.key_} · every {item.delay}</Typography>
                    </Box>
                    <Tooltip title="Delete item">
                      <IconButton color="error" size="small" onClick={() => setConfirmDeleteItemId(item.itemid)}>
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
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Add trigger</Typography>
            <Typography color="text.secondary" variant="body2">Create an alert rule on an existing item (expression uses <code>.last()</code>).</Typography>
            <TriggerHelp />

            <Autocomplete size="small" options={TRIGGER_PRESETS} value={selectedPreset}
              getOptionLabel={(o) => o.label}
              groupBy={(o) => o.group}
              onChange={(_, v) => {
                setSelectedPreset(v);
                if (v) {
                  setTriggerItemKey(v.itemKey);
                  setTriggerName(v.name);
                  setOperator(v.operator);
                  setThreshold(v.threshold);
                  setSeverity(v.severity);
                }
              }}
              renderOption={(props, opt) => (
                <Box component="li" {...props} key={`${opt.group}-${opt.itemKey}-${opt.threshold}`}>
                  <Box>
                    <Typography sx={{ fontSize: "0.82rem", fontWeight: 500 }}>{opt.label}</Typography>
                    <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                      {opt.itemKey} {opt.operator} {opt.threshold} · {severities.find((s) => s.value === opt.severity)?.label}
                    </Typography>
                  </Box>
                </Box>
              )}
              renderInput={(params) => (
                <TextField {...params} label="Load from preset" placeholder="Search presets by name or category…"
                  helperText="Selecting a preset fills all fields below — edit them before saving" />
              )}
            />

            <Divider />

            {/* Bulk mode toggle */}
            <FormControlLabel
              control={<Switch checked={bulkTriggerMode} onChange={(_, v) => { setBulkTriggerMode(v); setBulkTriggerResults([]); }} size="small" />}
              label={<Typography variant="body2">Apply to multiple hosts</Typography>}
            />

            {/* Host selection */}
            {bulkTriggerMode
              ? <MultiHostSelect label="Hosts *" value={bulkTriggerHosts} onChange={setBulkTriggerHosts} />
              : <HostSelect label="Host *" value={triggerHost} onChange={setTriggerHost} />
            }

            {/* Existing triggers on this host — auto-loaded for inline delete */}
            {!bulkTriggerMode && triggerHost && (
              <Box>
                {loadingInlineTriggers ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <CircularProgress size={12} />
                    <Typography variant="caption" color="text.secondary">Loading triggers…</Typography>
                  </Box>
                ) : inlineTriggers.length > 0 ? (
                  <>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                      Existing triggers on this host ({inlineTriggers.length}) — click × to delete
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {inlineTriggers.map((t) => (
                        <Tooltip key={t.triggerid} title={t.expression} placement="top">
                          <Chip
                            label={t.description}
                            size="small"
                            color="warning"
                            variant="outlined"
                            onDelete={() => setConfirmDeleteTriggerId(t.triggerid)}
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
                  <Typography variant="caption" color="text.disabled">No custom triggers on this host yet.</Typography>
                )}
              </Box>
            )}

            <Autocomplete freeSolo size="small" fullWidth disabled={!bulkTriggerMode && !triggerHost} loading={triggerItemsLoading}
              options={triggerItems} getOptionLabel={(opt) => typeof opt === "string" ? opt : `${opt.key_} — ${opt.name}`}
              inputValue={triggerItemKey}
              onInputChange={(_, v, reason) => { if (reason === "input" || reason === "clear") setTriggerItemKey(v); }}
              onChange={(_, v) => {
                const key = v === null ? "" : typeof v === "string" ? v : v.key_;
                setTriggerItemKey(key);
                const ctx = detectItemContext(key);
                if (ctx) setOperator(ctx.suggestedOperator);
              }}
              renderOption={(props, opt) => (
                <Box component="li" {...props} key={opt.itemid}>
                  <Box>
                    <Typography sx={{ fontSize: "0.82rem", fontWeight: 500 }}>{opt.name}</Typography>
                    <Typography sx={{ fontSize: "0.72rem", fontFamily: "monospace", color: "text.secondary" }}>{opt.key_}</Typography>
                  </Box>
                </Box>
              )}
              renderInput={(params) => (
                <TextField {...params} label="Item key *" placeholder={!bulkTriggerMode && !triggerHost ? "Select a host first" : "Select or type a key"}
                  InputProps={{ ...params.InputProps, endAdornment: <>{triggerItemsLoading && <CircularProgress size={14} />}{params.InputProps.endAdornment}</> }} />
              )}
            />

            {/* Context badge — appears once a key is typed/selected */}
            {(() => {
              const ctx = detectItemContext(triggerItemKey);
              return ctx ? (
                <Alert severity="info" icon={false} sx={{ py: 0.5, fontSize: "0.8rem" }}>
                  <strong>Item returns:</strong> {ctx.hint}
                  {ctx.unit && <> · unit: <code>{ctx.unit}</code></>}
                </Alert>
              ) : null;
            })()}

            <TextField size="small" label="Trigger name" value={triggerName} onChange={(e) => setTriggerName(e.target.value)} placeholder="e.g. High CPU on {HOST.NAME}" />
            <Stack direction="row" spacing={2} alignItems="flex-start">
              <TextField select size="small" label="Operator" value={operator} onChange={(e) => setOperator(e.target.value)} sx={{ width: 110, flexShrink: 0 }}>
                {operators.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <TextField size="small" label="Threshold" value={threshold} onChange={(e) => setThreshold(e.target.value)} fullWidth placeholder="e.g. 90" />
                {(() => {
                  const ctx = detectItemContext(triggerItemKey);
                  return ctx?.chips.length ? (
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.75 }}>
                      {ctx.chips.map((c) => (
                        <Chip key={c} label={`${c}${ctx.unit}`} size="small" variant="outlined" clickable
                          color={threshold === c ? "primary" : "default"}
                          onClick={() => setThreshold(c)}
                          sx={{ fontSize: "0.7rem", height: 22 }} />
                      ))}
                    </Box>
                  ) : null;
                })()}
              </Box>
            </Stack>
            <TextField select size="small" label="Severity" value={severity} onChange={(e) => setSeverity(Number(e.target.value))}>
              {severities.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </TextField>

            {bulkTriggerResults.length > 0 && <BulkResults results={bulkTriggerResults} label="Bulk trigger add" />}

            <Box>
              <Button variant="contained" onClick={onSubmitTrigger}
                disabled={(bulkTriggerMode ? !bulkTriggerHosts.length : !triggerHost) || !triggerItemKey || !triggerName || threshold.trim() === "" || triggerSaving}>
                {triggerSaving ? <><CircularProgress size={16} sx={{ mr: 1 }} />Adding…</> : bulkTriggerMode ? "Add to all hosts" : "Add trigger"}
              </Button>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* ── Delete triggers ── */}
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Delete trigger</Typography>
            <Typography color="text.secondary" variant="body2">Look up a host's custom triggers and remove the ones you no longer need.</Typography>
            <Divider />
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ flex: 1 }}>
                <HostSelect label="Host" value={searchTriggerHost} onChange={(v) => { setSearchTriggerHost(v); setTriggers([]); }} />
              </Box>
              {searchTriggerHost && (
                <Tooltip title="Clear selection">
                  <IconButton size="small" onClick={() => { setSearchTriggerHost(""); setTriggers([]); }}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Button variant="outlined" onClick={onLoadTriggers} disabled={!searchTriggerHost || loadingTriggers}
                startIcon={loadingTriggers ? <CircularProgress size={16} /> : <SearchOutlinedIcon />}
                sx={{ whiteSpace: "nowrap", minWidth: 100 }}>
                Load
              </Button>
            </Stack>
            {triggers.length > 0 && (
              <Stack spacing={1}>
                {triggers.map((t) => (
                  <Box key={t.triggerid} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 1.5, py: 1, borderRadius: 1.5, border: "1px solid", borderColor: "divider", backgroundColor: "action.hover" }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{t.description}</Typography>
                        <Chip label={severities[Number(t.priority)]?.label ?? t.priority} size="small" color={severityColor(t.priority)} sx={{ height: 18, fontSize: "0.6rem", flexShrink: 0 }} />
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }} noWrap>{t.expression}</Typography>
                    </Box>
                    <Tooltip title="Delete trigger">
                      <IconButton color="error" size="small" onClick={() => setConfirmDeleteTriggerId(t.triggerid)} sx={{ ml: 1, flexShrink: 0 }}>
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

      {/* ── Confirm delete item ── */}
      <Dialog open={confirmDeleteItemId !== null} onClose={() => setConfirmDeleteItemId(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete item?</DialogTitle>
        <DialogContent><Typography>This will permanently remove the item from Zabbix. This cannot be undone.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteItemId(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={async () => { if (!confirmDeleteItemId) return; await onDeleteItem(confirmDeleteItemId); setConfirmDeleteItemId(null); }}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* ── Confirm delete trigger ── */}
      <Dialog open={confirmDeleteTriggerId !== null} onClose={() => setConfirmDeleteTriggerId(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete trigger?</DialogTitle>
        <DialogContent><Typography>This will permanently remove the trigger from Zabbix. This cannot be undone.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteTriggerId(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={async () => { if (!confirmDeleteTriggerId) return; await onDeleteTrigger(confirmDeleteTriggerId); setConfirmDeleteTriggerId(null); }}>Delete</Button>
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
