# Overwatch Control Plane — User Guide

> **Purpose:** This guide explains how to use the Overwatch portal, what each section does, and how to diagnose and fix common errors.
> **Audience:** All users — operators, team leads, and administrators.

---

## Table of Contents

1. [What Is Overwatch?](#1-what-is-overwatch)
2. [Logging In](#2-logging-in)
3. [The Interface](#3-the-interface)
4. [Roles and Permissions](#4-roles-and-permissions)
5. [Section Guide](#5-section-guide)
   - [Overview](#51-overview)
   - [Hosts](#52-hosts)
   - [Dashboard](#53-dashboard)
   - [Monitoring](#54-monitoring)
   - [Services & SLA](#55-services--sla)
   - [Reports](#56-reports)
   - [Data Collection (Admin)](#57-data-collection-admin)
   - [Alerts (Admin)](#58-alerts-admin)
   - [Users (Admin)](#59-users-admin)
   - [Administration (Admin)](#510-administration-admin)
6. [Notification System](#6-notification-system)
7. [Common Errors & Fixes](#7-common-errors--fixes)

---

## 1. What Is Overwatch?

Overwatch is the internal monitoring control plane for your infrastructure. It sits in front of a Zabbix monitoring server and adds:

- **Role-based access control** — operators, team leads, admins, and auditors each see different things
- **Team management** — group users into teams with assigned hosts
- **Simplified workflows** — add monitoring to a host, define custom alert rules, bulk-import hosts from CSV/Excel, and export inventory
- **Live problem feed** — real-time alerts with sound notifications and acknowledgement

All data comes from Zabbix in real time. Overwatch does not store metrics itself — it is a control and visibility layer on top of Zabbix.

---

## 2. Logging In

1. Open the Overwatch URL in your browser.
2. Enter your **username** and **password**.
3. Click **Sign In**.

If you do not have an account, ask your administrator or team lead to create one for you.

**Forgotten password:** Passwords can only be reset by an administrator. Contact your team lead or an admin — they can set a new password for your account from the Users page.

---

## 3. The Interface

### Sidebar

The left sidebar is your main navigation. It contains:

| Element | Description |
|---|---|
| **Overwatch logo** | Always visible at the top |
| **Dark / Light mode toggle** | Moon/sun icon next to the logo |
| **Navigation groups** | Expandable sections (Monitoring, Services, Reports, etc.) — click a group header to expand/collapse it |
| **Notification Center** | Inbox icon — opens your full alert history |
| **Active problems count** | Shows how many unacknowledged Zabbix problems exist right now; turns red when there are active problems |
| **Sound controls** | Mute/unmute button and music-note icon for choosing the alert sound |
| **Backend API / Zabbix status dots** | Green = connected, Red = unreachable — at the bottom of the sidebar |
| **Your username and role** | At the very bottom, with a logout button |

### Status Dots

The two dots at the bottom of the sidebar update every **10 seconds**:

- **Backend API** — green means the Overwatch backend is running and reachable
- **Zabbix** — green means the backend can reach your Zabbix server

If either dot is red, data across the portal will be stale or unavailable.

### Data Refresh

All pages refresh automatically. Most tables and metrics update every **10 seconds** while the page is open. You do not need to manually refresh your browser.

---

## 4. Roles and Permissions

Every user has one or more roles. Roles control what you can see and do.

| Role | What they can do |
|---|---|
| **Root** | Full access to everything. Can manage all users, teams, and system settings. Can grant any role. |
| **Team Lead** | Can manage users within their team, assign hosts, and see all admin sections. Cannot manage other team leads or root users. |
| **Operator** | Can view hosts, metrics, problems, and acknowledge alerts. Cannot create or delete users or change system settings. |
| **Auditor** | Read-only access. Can view everything but cannot make changes or acknowledge problems. Only root can grant this role. |

**Admin sections** (Data Collection, Alerts, Users, Administration) are only visible to **Root** and **Team Lead** roles. Operators and Auditors do not see these menu items.

---

## 5. Section Guide

### 5.1 Overview

**Path:** Click **Overview** in the sidebar (the first item).

The overview page is your main dashboard. It shows:

- **Total hosts** and how many are currently available vs. unreachable
- **Active problems** count broken down by severity (Critical, High, Medium, Low, Info)
- **Recent problems** — a live list of the most recent Zabbix trigger events
- **Per-team summary** — how many hosts and active problems each team owns

Use this page to get a quick health snapshot without drilling into individual hosts.

---

### 5.2 Hosts

**Path:** Click **Hosts** in the sidebar.

The Hosts page lists every host Zabbix knows about, with:

- **Status** chip — Available (green), Unavailable (red), or Unknown (grey)
- **IP address** and **DNS name**
- **Last seen** timestamp
- **Agent status** — whether the Zabbix agent is responding

#### Adding a host

Click **Add Host** (top right). Fill in:
- **Hostname** — must match exactly what Zabbix uses
- **IP address** — the agent's IP
- **Host group** — required by Zabbix; select from the dropdown
- **Templates** — optional; apply monitoring templates (e.g. "Linux by Zabbix agent")

#### Importing hosts from CSV or Excel

Click **Import** to bulk-add hosts. Download the template first to see the required columns. Required fields are `host` (hostname) and `ip`. Optional: `group`, `templates`, `description`.

#### Exporting hosts

Click **Export**, then choose **Excel (.xlsx)** or **CSV (.csv)**. The export includes: Hostname, IP, DNS, Status, Availability, Proxy, Host Groups, Templates, and Description.

#### Deleting a host

Click the delete icon on a host row. A confirmation dialog will appear — the deletion removes the host from Zabbix permanently.

---

### 5.3 Dashboard

**Path:** Click **Dashboard** in the sidebar.

The Dashboard shows live graphs and charts for your monitored hosts:

- Select a host from the dropdown to see its graphs
- Graphs are served directly from Zabbix — they update live
- You can view CPU usage, memory, network traffic, and any other metrics that have graphs configured in Zabbix

If no graphs appear, the host either has no graph definitions in Zabbix or the host is unreachable.

---

### 5.4 Monitoring

The Monitoring section has five sub-pages, accessible from the sidebar under the **Monitoring** group.

#### Problems

**Path:** Monitoring → Problems

Shows all currently active Zabbix trigger problems. Each row shows:
- Severity (colour-coded: Critical = dark red, High = red, Medium = orange, Low = yellow, Info = blue)
- Host name
- Problem description
- Time the problem started and how long it has been active
- Whether it has been acknowledged

**Click any row** to expand it and see the full detail: host, duration, who acknowledged it, when, and any acknowledgement note.

**To acknowledge a problem:**
1. Find the problem in the table
2. Click the **Ack** button on the right side of the row
3. Enter an optional note explaining the action
4. Click **Confirm**

Acknowledging a problem marks it in Zabbix and removes it from the active count in the sidebar badge. It does **not** resolve the problem — the problem stays open until the trigger condition clears in Zabbix.

#### Latest Data

**Path:** Monitoring → Latest Data

Shows the last collected value for every monitored item on a selected host.

1. Choose a host from the dropdown
2. Use the search box to filter by item name or key
3. Each row shows: item name, item key, value type, polling interval, last value, and when it was last collected

**Status chips:**
- **Enabled** (green) — item is active
- **Disabled** (grey) — item exists but is not collecting
- **No data** (red) — the item has not reported within its expected polling interval; this usually means the host agent is unreachable

A yellow banner at the top of the table will appear when the host's agent interface is unreachable.

#### Items

**Path:** Monitoring → Items

Manages monitoring items on hosts. Select a host to see all items configured on it.

**Click any row** to expand it and see full details: type, interval, source, full key, and exact last-collected timestamp.

**Adding an item:**
1. Select a host
2. Click **Add Item**
3. Fill in the name, key (e.g. `agent.ping`), type, value type, and polling interval
4. Click **Save**

If the host agent is unreachable, a warning banner appears at the top. Items from that host will show a **No data** chip.

#### Triggers

**Path:** Monitoring → Triggers

Manages alert triggers. A trigger is a condition on an item that, when true, creates a problem. For example: "alert if CPU usage > 90% for 5 minutes."

**Adding a trigger:**
1. Select a host and item
2. Set the condition (operator and threshold)
3. Set the severity
4. Click **Create Trigger**

#### Graphs

**Path:** Monitoring → Graphs

Time-series charts for item values. Select a host and an item, then choose a time range. The chart shows historical values pulled from Zabbix item history.

---

### 5.5 Services & SLA

**Path:** Services group in the sidebar → **Services** or **SLA**

#### Services

Lists all Zabbix services (business service nodes). You can create, edit, and delete services. Services represent logical parts of your infrastructure (e.g. "Payment API", "Database Cluster") and can be nested.

#### SLA

Lists SLA definitions. Each SLA has:
- **Target SLO** — the percentage uptime you are committed to (e.g. 99.9%)
- **Period** — how the SLO is measured (daily, weekly, monthly, quarterly, annually)
- **Service tags** — which services this SLA applies to

You can create and delete SLAs here.

---

### 5.6 Reports

**Path:** Reports group in the sidebar.

| Sub-page | What it shows |
|---|---|
| **Availability report** | Uptime percentages for hosts over a chosen period |
| **Top 100 triggers** | The triggers that fired most frequently |
| **Audit log** | Who did what and when in Zabbix (logins, config changes) |
| **Action log** | Records of Zabbix actions (notifications sent, remote commands executed) |
| **Notifications** | History of notifications sent by Zabbix media types |
| **Problem history** | Past (resolved) problems — searchable by host and time range |

---

### 5.7 Data Collection (Admin)

**Visible to:** Root and Team Lead only.

This section manages the building blocks of Zabbix monitoring configuration:

| Sub-page | What it does |
|---|---|
| **Template groups** | Organisational containers for templates |
| **Host groups** | Logical groups hosts belong to (required when adding a host) |
| **Templates** | Reusable monitoring configurations applied to hosts |
| **Maintenance** | Schedule maintenance windows so problems are suppressed during planned downtime |
| **Event correlation** | Rules for de-duplicating related problems |
| **Discovery** | Automatic host and service discovery rules |

---

### 5.8 Alerts (Admin)

**Visible to:** Root and Team Lead only.

#### Alert Rules

**Path:** Monitoring → Alert Rules (or Alerts → Alert rules in the sidebar)

Custom threshold-based alerts defined in Overwatch itself (not Zabbix triggers). These run on a 60-second check loop and fire when an item value crosses a threshold.

**Creating an alert rule:**
1. Click **Add Rule**
2. Select the host and item to watch
3. Choose the operator (`>`, `<`, `=`, etc.) and threshold value
4. Set the severity
5. Optionally assign a custom alert sound for this rule
6. Click **Save**

When the rule fires, a notification popup appears (bottom-right corner) and it is logged in the Notification Center.

#### Trigger Actions, Service Actions, Discovery Actions, Autoregistration, Internal Actions

These pages reflect Zabbix action configurations — what happens automatically when a trigger fires (e.g. send an email, run a script). These are read from Zabbix and are managed here for visibility; detailed editing should be done in the Zabbix frontend for complex action configurations.

#### Media Types

Lists configured Zabbix media types (email servers, webhook URLs, SMS gateways). These are how Zabbix delivers notifications externally.

#### Scripts

Lists Zabbix global scripts that can be executed against hosts.

---

### 5.9 Users (Admin)

**Visible to:** Root and Team Lead only.

#### Users

**Path:** Users group → Users

Lists all portal users. From here you can:
- **Create a user** — set username, password, and role
- **Edit a user** — change their role or reset their password
- **Delete a user** — removes them from the portal (does not affect Zabbix)

Role assignment rules:
- You cannot assign a role higher than your own
- Only Root can assign the **Auditor** role

#### Teams

**Path:** Users group → Teams

Teams are groups of users that share a set of assigned hosts. Each user belongs to one team.

To create a team:
1. Click **Create Team**
2. Enter a team name
3. Add members and assign their roles within the team
4. Assign hosts to the team

#### User Groups, Roles, API Tokens, Authentication

These pages show the corresponding Zabbix configuration. **User Groups** are Zabbix-side groups (distinct from portal teams). **Roles** are Zabbix permission profiles. **API Tokens** lists tokens generated in Zabbix. **Authentication** shows Zabbix's global auth settings (LDAP, SAML, etc.).

---

### 5.10 Administration (Admin)

**Visible to:** Root and Team Lead only.

| Sub-page | What it does |
|---|---|
| **Housekeeping** | Zabbix data retention settings — how long history and trends are kept |
| **Proxies** | Lists Zabbix proxy servers used for distributed monitoring |
| **Proxy groups** | Groups of proxies for load-balanced data collection |
| **Macros** | Global Zabbix macros (e.g. `{$SNMP_COMMUNITY}`) used in templates |
| **Queue** | Shows the Zabbix server's internal processing queue — useful for diagnosing collection delays |

---

## 6. Notification System

### Popup Notifications

When a new Zabbix problem or custom alert rule fires, a notification card appears in the **bottom-right corner** of the screen. Each card shows:
- Severity (colour-coded header)
- How long ago it fired
- Host name and problem description
- An **Acknowledge** button (for Zabbix problems)

Low and Info severity notifications auto-dismiss after 8 seconds. Critical/High/Medium stay until you dismiss them. If more than 3 stack up, a "Dismiss all" link appears.

### Notification Center

Click the **Inbox icon** in the sidebar to open the Notification Center drawer. It has two tabs:

- **Alert History** — every notification you have received since opening the portal (up to 200, stored in your browser). Shows source (Zabbix or custom Rule), severity, time, and acknowledgement status. You can acknowledge directly from here.
- **Active Problems** — the current list of all open Zabbix problems that have not yet been resolved. You can acknowledge from here too.

**Mark all as read** — clears the unread badge without deleting history.
**Clear history** — hides all current history entries. New notifications will still appear.

### Alert Sounds

By default the portal plays a sound when a new problem arrives. Controls are in the sidebar next to the active problems count:

- **Volume icon** — mute or unmute all alert sounds
- **Music note icon** — choose a sound preset: Beep, Chime, Ping, or Alarm. Severity affects the sound (more beeps / higher frequency for higher severity). You can also upload your own audio file.

Alert sounds are synthesised in the browser — no audio files are downloaded and this works fully offline.

---

## 7. Common Errors & Fixes

### "Backend API" dot is red

**What it means:** The frontend cannot reach the Overwatch backend service.

**Fixes:**
1. Check that the backend pod/container is running: `kubectl get pods -n <namespace>` and look for the backend pod. If it is in `CrashLoopBackOff` or `Error`, read its logs: `kubectl logs <pod-name> -n <namespace>`.
2. Verify the backend service is reachable: `kubectl get svc -n <namespace>`.
3. If running locally, make sure the backend is started: `uvicorn Zabbix_Main:app --host 0.0.0.0 --port 6769`.

---

### "Zabbix" dot is red

**What it means:** The backend is running but cannot connect to the Zabbix API.

**Fixes:**
1. Verify `ZABBIX_URL` is set correctly in the backend environment and that the URL is reachable from the backend pod/container.
2. Check `ZABBIX_USER` and `ZABBIX_PASS` are correct. Log in to the Zabbix web UI directly with those credentials to confirm.
3. If using HTTPS with a self-signed certificate, check that `ZABBIX_SSL_VERIFY=false` is set (only on a trusted network).
4. Check backend logs for lines containing `ZabbixAPI` or `login failed`.

---

### Login says "Invalid credentials"

**Fixes:**
1. Check caps lock is off.
2. Ask an administrator to reset your password from the Users page.
3. If it is the first-time root login, the default username is `Admin` and password is `admin` (unless changed during setup).

---

### Page shows no data / tables are empty

**What it usually means:** Either the backend or Zabbix is unreachable, or the selected host has no configured items/triggers.

**Fixes:**
1. Check both status dots are green.
2. Try refreshing the page (the portal auto-refreshes, but a full page reload forces a fresh fetch).
3. Confirm the selected host is available in Zabbix and has items configured.
4. Check that your user account has access to the relevant host group in Zabbix.

---

### "Host agent unreachable" banner on Items or Latest Data

**What it means:** Zabbix cannot collect data from that host's Zabbix agent. Items will show a **No data** chip and last values will be hidden.

**Fixes:**
1. Verify the host is powered on and reachable on the network.
2. Confirm the Zabbix agent service is running on the host: `systemctl status zabbix-agent` (or `zabbix-agent2`).
3. Check firewall rules — Zabbix server needs to reach the agent on port **10050** (passive checks) or the agent needs to reach the server on port **10051** (active checks).
4. In Zabbix, go to Monitoring → Hosts and check the host's availability icon for more detail.

---

### Problem acknowledged but badge count did not update

The badge refreshes automatically every 10 seconds and also immediately after acknowledging. If it does not update:
1. Wait up to 10 seconds — the next poll will correct it.
2. If it still does not update, refresh the page.
3. If the problem persists, check the backend logs for errors from the `/problems` endpoint.

---

### Export downloads an empty or corrupted file

**Fixes:**
1. Ensure the backend is connected (both status dots green).
2. Try the other format — if XLSX is broken, try CSV, and vice versa.
3. Check that there are hosts to export. If the host list is empty (no hosts in Zabbix), the export will produce a file with only headers.
4. For XLSX: open with LibreOffice if Excel shows a corruption warning — sometimes Excel flags correctly-formatted files on first open.

---

### Custom alert rule is not firing

**Fixes:**
1. Confirm the rule is saved and enabled (check the Alert Rules page).
2. The rule check runs every **60 seconds** — allow up to 1 minute after the threshold is crossed.
3. Verify the item you selected is actively collecting data (check Latest Data for that host and item — it should not show a **No data** chip).
4. Check that the threshold and operator are correct. For example, `> 90` will only fire if the value is strictly greater than 90, not equal.

---

### SLA or Services page shows "No services found"

**What it means:** No services or SLAs are defined in Zabbix, or the API call failed silently.

**Fixes:**
1. Confirm services exist in Zabbix (Zabbix → Services).
2. Verify the Zabbix user configured in the backend has permission to read services (`ZABBIX_USER` needs at least read access to services in Zabbix).
3. Check backend logs for errors from the `/services` or `/sla` endpoints.
4. Note: SLA is a Zabbix 6.0+ feature. If your Zabbix version is older, the SLA tab will always be empty.

---

### Cannot create a user / role is greyed out

**What it means:** You are trying to assign a role higher than your own — this is blocked by the system.

Example: A Team Lead cannot assign the **Root** role. Only a Root user can do that.

**Fix:** Ask a Root user to make the change.

---

### Graphs page shows "No graphs available"

**Fixes:**
1. Ensure the selected host has graph definitions in Zabbix. Go to Zabbix → Monitoring → Hosts → Graphs for that host.
2. Templates often define graphs — confirm the host has templates applied (check the Hosts page → template column for that host).
3. If the host is unreachable (red availability), graph images from Zabbix will fail to load.

---

## Getting Help

If an issue is not covered above, check the following in order:

1. **Backend logs** — `kubectl logs <backend-pod> -n <namespace>` (or `docker logs backend` locally). Most errors are logged with context.
2. **Browser console** — open Developer Tools (F12) → Console tab. API errors appear there with HTTP status codes.
3. **Network tab** — in Developer Tools → Network, look for red (failed) requests to `/api/*`. The response body usually contains the error message.
4. **Zabbix directly** — log in to the Zabbix web UI with the service account credentials (`ZABBIX_URL` from the backend config) to confirm whether the issue is in Zabbix or in Overwatch.
