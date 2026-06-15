{toc:minLevel=1|maxLevel=2|printable=false}

----

h1. What Is Overwatch?

Overwatch is the internal monitoring control plane for your infrastructure. It sits in front of a Zabbix monitoring server and adds:

- *Role-based access control* — operators, team leads, admins, and auditors each see different things
- *Team management* — group users into teams with assigned hosts
- *Simplified workflows* — add monitoring to a host, define custom alert rules, bulk-import hosts from CSV/Excel, and export inventory
- *Live problem feed* — real-time alerts with sound notifications and acknowledgement

{info:title=Important}
All data comes from Zabbix in real time. Overwatch does not store metrics itself — it is a control and visibility layer on top of Zabbix.
{info}

----

h1. Logging In

# Open the Overwatch URL in your browser.
# Enter your *username* and *password*.
# Click *Sign In*.

{note:title=Forgotten password?}
Passwords can only be reset by an administrator. Contact your team lead or an admin — they can set a new password for your account from the Users page.
{note}

----

h1. The Interface

h2. Sidebar

The left sidebar is your main navigation.

|| Element || Description ||
| *Overwatch logo* | Always visible at the top |
| *Dark / Light mode toggle* | Moon/sun icon next to the logo |
| *Navigation groups* | Expandable sections — click a group header to expand or collapse |
| *Notification Center* | Inbox icon — opens your full alert history |
| *Active problems count* | Shows unacknowledged Zabbix problems; turns red when problems exist |
| *Sound controls* | Mute/unmute button and music-note icon for choosing the alert sound |
| *Backend API / Zabbix dots* | Green = connected, Red = unreachable — at the bottom of the sidebar |
| *Your username and role* | At the very bottom, with a logout button |

h2. Status Dots

The two coloured dots at the bottom of the sidebar update every *10 seconds*:

- *Backend API* — green means the Overwatch backend is running and reachable
- *Zabbix* — green means the backend can reach your Zabbix server

{warning:title=Red status dot?}
If either dot is red, data across the portal will be stale or unavailable. See the *Troubleshooting* section at the bottom of this page.
{warning}

h2. Data Refresh

All pages refresh automatically every *10 seconds*. You do not need to manually refresh your browser.

----

h1. Roles and Permissions

|| Role || What they can do ||
| *Root* | Full access to everything. Can manage all users, teams, and system settings. Can grant any role. |
| *Team Lead* | Can manage users within their team, assign hosts, and see all admin sections. Cannot manage other team leads or root users. |
| *Operator* | Can view hosts, metrics, and problems and acknowledge alerts. Cannot create or delete users or change system settings. |
| *Auditor* | Read-only access. Can view everything but cannot make changes or acknowledge problems. Only Root can grant this role. |

{info}
The admin sections (Data Collection, Alerts, Users, Administration) are only visible to *Root* and *Team Lead* roles.
{info}

----

h1. Section Guide

h2. Overview

The overview page is your main health dashboard. It shows:

- *Total hosts* and how many are currently available vs. unreachable
- *Active problems* count broken down by severity
- *Recent problems* — a live list of the most recent Zabbix trigger events
- *Per-team summary* — how many hosts and active problems each team owns

----

h2. Hosts

h3. What you can do here

- View all hosts with their status, IP address, DNS name, last seen time, and agent status
- Add, import, delete, and export hosts

h3. Adding a host

# Click *Add Host* (top right).
# Fill in: Hostname, IP address, Host group (required), and Templates (optional).
# Click *Save*.

h3. Importing hosts from CSV or Excel

# Click *Import*.
# Download the template first to see the required column format.
# Required columns: {{host}} (hostname) and {{ip}}. Optional: {{group}}, {{templates}}, {{description}}.
# Upload your file and confirm.

h3. Exporting hosts

Click *Export*, then choose *Excel (.xlsx)* or *CSV (.csv)*. The export includes: Hostname, IP, DNS, Status, Availability, Proxy, Host Groups, Templates, and Description.

h3. Deleting a host

Click the delete icon on the host row. A confirmation dialog will appear. This removes the host from Zabbix permanently.

{warning:title=Deletion is permanent}
Deleting a host from Overwatch removes it from Zabbix. All associated items, triggers, and history are deleted. This cannot be undone.
{warning}

----

h2. Dashboard

Select a host from the dropdown to view its live Zabbix graphs (CPU, memory, network traffic, and any other metrics with graph definitions). Graphs update in real time.

{note}
If no graphs appear, the host either has no graph definitions configured in Zabbix or the host is currently unreachable.
{note}

----

h2. Monitoring

h3. Problems

Shows all currently active Zabbix trigger problems.

|| Severity colour || Level ||
| Dark red | Critical |
| Red | High |
| Orange | Medium |
| Yellow | Low |
| Blue | Info |

*Click any row* to expand it and see: full host detail, duration, who acknowledged it, when, and the acknowledgement note.

*To acknowledge a problem:*
# Find the problem in the table.
# Click the *Ack* button on the right side of the row.
# Enter an optional note.
# Click *Confirm*.

{info}
Acknowledging a problem marks it in Zabbix and removes it from the sidebar badge count. The problem stays open until its trigger condition clears in Zabbix.
{info}

h3. Latest Data

Shows the last collected value for every monitored item on a selected host.

# Choose a host from the dropdown.
# Use the search box to filter by item name or key.

*Status chips:*

|| Chip || Meaning ||
| Enabled (green) | Item is active and collecting |
| Disabled (grey) | Item exists but is paused |
| No data (red) | Item has not reported within its expected polling interval — usually means the host agent is unreachable |

{warning}
A yellow banner appears at the top of the table when the host agent is unreachable. All items will show *No data* until the agent comes back online.
{warning}

h3. Items

Manages monitoring items on hosts. Select a host to see all its items. *Click any row* to expand and see: type, interval, source, full key, and exact last-collected timestamp.

*Adding an item:*
# Select a host.
# Click *Add Item*.
# Fill in: name, key (e.g. {{agent.ping}}), type, value type, and polling interval.
# Click *Save*.

h3. Triggers

A trigger is a condition on an item that creates a problem when true (e.g. "alert if CPU > 90% for 5 minutes").

*Adding a trigger:*
# Select a host and item.
# Set the condition operator and threshold.
# Set the severity.
# Click *Create Trigger*.

h3. Graphs

Time-series charts for item values. Select a host and an item, then choose a time range to view historical data pulled from Zabbix.

----

h2. Services & SLA

h3. Services

Lists all Zabbix services (logical business nodes such as "Payment API" or "Database Cluster"). You can create, edit, and delete services here.

h3. SLA

Lists SLA definitions. Each SLA has a target uptime percentage (SLO), a measurement period, and service tags that define which services it applies to.

{note}
SLA is a Zabbix 6.0+ feature. If your Zabbix version is older, the SLA tab will always be empty.
{note}

----

h2. Reports

|| Sub-page || What it shows ||
| *Availability report* | Uptime percentages for hosts over a chosen period |
| *Top 100 triggers* | The triggers that fired most frequently |
| *Audit log* | Who did what and when in Zabbix (logins, config changes) |
| *Action log* | Records of Zabbix actions (notifications sent, remote commands run) |
| *Notifications* | History of notifications sent by Zabbix media types |
| *Problem history* | Past (resolved) problems — searchable by host and time range |

----

h2. Data Collection _(Admin only)_

|| Sub-page || What it does ||
| *Template groups* | Organisational containers for templates |
| *Host groups* | Logical groups hosts belong to (required when adding a host) |
| *Templates* | Reusable monitoring configurations applied to hosts |
| *Maintenance* | Schedule maintenance windows so problems are suppressed during planned downtime |
| *Event correlation* | Rules for de-duplicating related problems |
| *Discovery* | Automatic host and service discovery rules |

----

h2. Alerts _(Admin only)_

h3. Alert Rules

Custom threshold-based alerts defined in Overwatch (separate from Zabbix triggers). These run on a 60-second check loop.

*Creating an alert rule:*
# Click *Add Rule*.
# Select the host and item to watch.
# Choose the operator ({{>}}, {{<}}, {{=}}, etc.) and threshold value.
# Set the severity.
# Optionally assign a custom alert sound for this rule.
# Click *Save*.

{tip}
When the rule fires, a notification popup appears in the bottom-right corner and is logged in the Notification Center.
{tip}

h3. Other alert sub-pages

|| Sub-page || What it does ||
| *Trigger / Service / Discovery Actions* | What Zabbix does automatically when a trigger fires (send email, run script, etc.) |
| *Autoregistration* | Rules for auto-adding newly discovered hosts |
| *Media Types* | Email servers, webhook URLs, SMS gateways configured in Zabbix |
| *Scripts* | Zabbix global scripts that can be run against hosts |

----

h2. Users _(Admin only)_

h3. Users page

Lists all portal users. You can create, edit, and delete users here.

{note:title=Role assignment rules}
- You cannot assign a role higher than your own.
- Only Root can assign the *Auditor* role.
{note}

h3. Teams

Teams are groups of users that share a set of assigned hosts.

*Creating a team:*
# Click *Create Team*.
# Enter a team name.
# Add members and assign their roles within the team.
# Assign hosts to the team.

h3. Other user sub-pages

|| Sub-page || What it shows ||
| *User Groups* | Zabbix-side permission groups (separate from portal teams) |
| *User Roles* | Zabbix permission profiles |
| *API Tokens* | Tokens generated in Zabbix for API access |
| *Authentication* | Zabbix global auth settings (LDAP, SAML, etc.) |

----

h2. Administration _(Admin only)_

|| Sub-page || What it does ||
| *Housekeeping* | Data retention settings — how long history and trends are kept |
| *Proxies* | Zabbix proxy servers used for distributed monitoring |
| *Proxy groups* | Groups of proxies for load-balanced data collection |
| *Macros* | Global Zabbix macros (e.g. {{$SNMP_COMMUNITY}}) used in templates |
| *Queue* | Zabbix server's internal processing queue — useful for diagnosing collection delays |

----

h1. Notification System

h2. Popup Notifications

When a new problem fires, a notification card appears in the *bottom-right corner*. Each card shows: severity, how long ago it fired, host name, problem description, and an *Acknowledge* button.

- Low/Info severity notifications auto-dismiss after *8 seconds*
- Critical/High/Medium stay until you dismiss them
- If more than 3 stack up, a *Dismiss all* link appears

h2. Notification Center

Click the *Inbox icon* in the sidebar to open the Notification Center. It has two tabs:

|| Tab || What it shows ||
| *Alert History* | Every notification since opening the portal (up to 200, stored in your browser). You can acknowledge directly from here. |
| *Active Problems* | All currently open Zabbix problems. You can acknowledge from here too. |

*Mark all as read* — clears the unread badge without deleting history.
*Clear history* — hides current history entries. New notifications will still appear.

h2. Alert Sounds

Controls are in the sidebar next to the active problems count:

- *Volume icon* — mute or unmute all alert sounds
- *Music note icon* — choose a preset: *Beep*, *Chime*, *Ping*, or *Alarm*. Higher severity = more beeps / higher frequency.
- You can also *upload your own audio file* from the sound menu.

{tip}
Alert sounds are synthesised in the browser — no audio files are downloaded. This works fully offline.
{tip}

----

h1. Troubleshooting

|| Symptom || Why it happens || How to fix it ||
| *"Backend API" dot is red* | The frontend cannot reach the Overwatch backend service. | Check the backend pod is running: {{"kubectl get pods -n <namespace>"}}. Read its logs if it is crashing: {{"kubectl logs <pod-name>"}}. Locally: make sure the backend server is started. |
| *"Zabbix" dot is red* | The backend is running but cannot connect to Zabbix. | Verify {{ZABBIX_URL}}, {{ZABBIX_USER}}, and {{ZABBIX_PASS}} are correct. Try logging in to the Zabbix web UI directly with those credentials. Check for {{ZabbixAPI}} errors in the backend logs. |
| *"Invalid credentials" on login* | Wrong username or password. | Check caps lock. Ask an admin to reset your password from the Users page. Default first-time credentials are username {{Admin}}, password {{admin}}. |
| *Page shows no data / tables are empty* | Backend or Zabbix is unreachable, or the host has no configured items. | Check both status dots are green. Try a full page reload. Confirm the host has items configured in Zabbix. |
| *"Host agent unreachable" banner* | Zabbix cannot collect data from the host's agent. | Confirm the host is powered on and reachable. Check the Zabbix agent service is running on the host: {{"systemctl status zabbix-agent"}}. Check firewall rules — Zabbix needs port *10050* (passive) or the agent needs port *10051* (active). |
| *Acknowledged problem — badge did not update* | The badge refreshes every 10 seconds. | Wait up to 10 seconds. If it still does not update, refresh the page. |
| *Export downloads an empty or corrupted file* | Backend unreachable, or no hosts exist to export. | Confirm both status dots are green. Try the other format (XLSX vs CSV). If the host list is empty, the export will only contain headers. |
| *Custom alert rule is not firing* | The check runs every 60 seconds, or the item is not collecting data. | Wait up to 1 minute after the threshold is crossed. Check Latest Data for that host — the item should not show a *No data* chip. Verify the operator and threshold are correct. |
| *SLA tab is always empty* | No SLAs defined in Zabbix, or Zabbix version is older than 6.0. | Confirm SLAs exist in Zabbix directly. Verify the Zabbix service account has read access to services. Check the backend logs for {{/sla}} errors. |
| *Cannot assign a role / option is greyed out* | You are trying to assign a role higher than your own — this is blocked by the system. | Ask a Root user to make the change. |
| *Graphs page shows "No graphs available"* | Host has no graph definitions, or the host is unreachable. | Confirm graph definitions exist in Zabbix (Monitoring → Hosts → Graphs for that host). Confirm the host has templates applied. |

h2. Still stuck?

Check these in order:

# *Backend logs* — {{"kubectl logs <backend-pod> -n <namespace>"}} (or {{"docker logs backend"}} locally). Most errors are logged with context.
# *Browser console* — open Developer Tools (F12) → Console tab. API errors appear there.
# *Network tab* — Developer Tools → Network. Look for red (failed) requests to {{/api/*}}. The response body usually contains the error message.
# *Zabbix directly* — log in to the Zabbix web UI with the service account credentials to confirm whether the issue is in Zabbix or in Overwatch.
