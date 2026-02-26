# ECA Command Center — Production

Web-based automation platform for Dell server provisioning, network switch configuration, and infrastructure management. Built on Flask + Ansible with a modular vanilla JS frontend.

**Production instance:** `10.3.3.10:5000`
**App directory:** `/home/eca/Downloads/UI/EcaCCGui_Prod`
**Default login:** `admin` / `admin`

---

## Quick Start (5 minutes)

```bash
# 1. Clone
git clone git@github.com:ohyeaheasymoney/EcaCCGui_Prod.git
cd EcaCCGui_Prod

# 2. Install Python deps
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Run
python3 server.py
```

Open `http://<your-ip>:5000` — login with `admin` / `admin`.

For production, use `bash start.sh` (Gunicorn) or `sudo bash deploy.sh` (full automated deploy with systemd + nginx).

---

## Features

- **7 Automation Workflows** — Server Build (I/J Class), Post-Provisioning, Quick QC, Cisco Switch, Juniper Switch, Console Switch, PDU Setup
- **Job Management** — Create, clone, delete jobs with per-job file storage, inventory, and run history
- **Inventory Generation** — CSV workbook parsing with ARP-based network discovery
- **Task Presets** — Full Stack, Quick Deploy, or Custom task selection per workflow
- **Live Status** — Real-time log streaming, host status matrix, progress tracking
- **Multi-Group Parallel Runs** — Run multiple task groups simultaneously
- **TSR Collection** — Collect, download, delete Technical Support Reports per host
- **Dell Firmware Catalog** — Auto-generated from uploaded firmware with Dell catalog cross-reference
- **Run History** — Per-run reports, log downloads, and run comparison
- **Templates** — Save job configs as reusable templates
- **Admin Panel** — User management, customer/workflow CRUD, audit log
- **Dark/Light Theme** — Toggle with persistent preference

---

## Architecture

```
                  ┌──────────┐
  Browser ──────> │  Nginx   │ :80
                  │ (proxy)  │
                  └────┬─────┘
                       │
                  ┌────▼─────┐
                  │ Gunicorn │ :5000  (4 workers x 4 threads)
                  │  Flask   │
                  └────┬─────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
     ┌────▼────┐ ┌─────▼─────┐ ┌───▼───┐
     │ SQLite  │ │ Ansible   │ │ Jobs/ │
     │ jobs.db │ │ Playbooks │ │ Files │
     └─────────┘ └───────────┘ └───────┘
```

| Layer | Tech |
|-------|------|
| Backend | Flask, Flask-CORS, Gunicorn |
| Frontend | Vanilla JS (modular, 17 files), CSS |
| Database | SQLite WAL mode (`jobs/jobs.db`) |
| Automation | Ansible Playbooks (21 YAML files) |
| Reverse Proxy | Nginx (optional, recommended) |

---

## Project Structure

```
EcaCCGui_Prod/
├── server.py                  # Flask app — 42 API routes
├── config_backend.py          # Backend engine — jobs, inventory, execution, auth (~3580 lines)
├── config.py                  # SSH creds, CSV paths, column mappings
├── generate_inventory.py      # ARP-scan inventory builder
├── format_dell_inventoryTemplate.py  # QuickQC processor + firmware validator
├── CreateCatalogFile.py       # Dell firmware catalog builder
├── rename_file.py             # TSR file renamer (called by playbooks)
├── rename_json_serial.py      # QuickQC JSON renamer (called by playbooks)
├── manage_users.py            # CLI user management tool
├── start.sh                   # Production launcher (gunicorn)
├── deploy.sh                  # Full automated deployment script
├── nginx.conf                 # Nginx reverse proxy config
├── requirements.txt           # Python dependencies
├── ansible.cfg                # Ansible configuration
├── hosts                      # Generated Ansible inventory
├── vars.yml                   # Generated Ansible variables
│
├── # ── Ansible Playbooks ──
├── ConfigMain._J_class.yaml   # Server build — J Class
├── ConfigMain._I_class.yaml   # Server build — I Class
├── post_provisioning.yaml     # Post-provisioning (TSR, cleanup, power)
├── Quick_QC.yaml              # Quick QC validation
├── PowerUp.yaml               # Power on servers
├── PowerDown.yaml             # Power off servers
├── powercycle.yaml            # Power cycle servers
├── Enable_LLDP.yaml           # Enable LLDP on iDRAC
├── Disable_LLDP.yaml          # Disable LLDP on iDRAC
├── RackSlot.yaml              # Set rack slot location
├── asset_tag.yaml             # Set asset tags
├── Firmware.yaml              # Push firmware updates
├── ImportXML.yaml             # Import BIOS/iDRAC XML config
├── Configure_iDRAC.yml        # Configure iDRAC settings
├── Diagnostics.yaml           # Run Dell diagnostics
├── supportAssist.yaml         # SupportAssist collection
├── Cleanup.yaml               # Post-build cleanup
├── QuickDellInventoryDellModsTemplate.yaml  # Dell inventory template
├── change_asset_tags.yml      # Bulk asset tag changes
├── changeracklocation.yml     # Change rack location
│
├── customers.json             # Customer definitions (runtime, auto-generated)
├── workflows.json             # Workflow definitions (runtime, auto-generated)
├── users.json                 # User accounts (runtime, auto-generated)
├── audit.log                  # Audit trail (runtime)
├── server.log                 # Application log (runtime)
│
├── jobs/                      # Job storage
│   ├── jobs.db                # SQLite database
│   └── {job_id}/
│       ├── job.json           # Job metadata
│       ├── input/             # Uploaded workbooks, firmware, configs
│       ├── runs/              # Per-run logs and reports
│       │   └── {run_id}/
│       │       ├── ansible_stdout.log
│       │       └── report.html
│       ├── firmware/          # Firmware files + catalog
│       ├── TSR/               # Collected TSR files
│       └── QuickQC/           # QC results (JSON, CSV, TXT)
│
└── static/
    ├── index.html             # Single-page app shell
    ├── styles.css             # All styles (dark/light themes)
    ├── api.js                 # Fetch wrapper (apiGet, apiPost, etc.)
    ├── utils.js               # Shared helpers, HTML escaping, toasts
    ├── dashboard.js           # Job list, KPIs, polling, DOM reconciliation
    ├── wizard.js              # App init, routing, keyboard shortcuts
    ├── wizard-modal.js        # New job creation wizard
    ├── workflow-logic.js      # Workflow label mappings
    ├── theme.js               # Dark/light theme toggle
    ├── admin.js               # Admin panel (users, customers, workflows, audit)
    ├── job-panel-core.js      # Job panel shell, tabs, shared state
    ├── job-panel-customer.js  # Customer/workflow selectors, task definitions
    ├── job-panel-files.js     # File upload, preview, delete, catalog
    ├── job-panel-inventory.js # Inventory generation, host picker
    ├── job-panel-tasks.js     # Task presets, checkboxes, preflight checks
    ├── job-panel-groups.js    # Multi-group parallel run configuration
    ├── job-panel-execution.js # Run/stop controls
    ├── job-panel-status.js    # Live log, progress, host status matrix
    ├── job-panel-history.js   # Run history, reports, comparison
    └── job-panel-tsr.js       # TSR collection status, download, re-run
```

---

## Deployment

### Option 1: Automated Deploy (recommended)

```bash
sudo bash deploy.sh
```

This handles everything: system packages, virtualenv, app files, systemd service, sudoers, and optionally nginx. Configurable via environment variables:

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `ECA_USER` | `eca` | Linux user to run the app |
| `ECA_APP_DIR` | `/home/$ECA_USER/eca-command-center` | Where app files are deployed |
| `ECA_PLAYBOOK_DIR` | `/home/eca/Downloads/UI/EcaCCGui_Prod` | Ansible playbook directory |
| `ECA_PORT` | `5000` | HTTP port |

### Option 2: Manual Deploy

#### Prerequisites

- RHEL/CentOS 9 or similar (tested on `5.14.0-645.el9`)
- Python 3.9+
- `ansible-playbook` in `$PATH`
- `arp-scan` installed (`dnf install arp-scan`)
- Network access to iDRAC management interfaces

#### Install

```bash
git clone git@github.com:ohyeaheasymoney/EcaCCGui_Prod.git /home/eca/Downloads/UI/EcaCCGui_Prod
cd /home/eca/Downloads/UI/EcaCCGui_Prod
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

#### Dependencies (requirements.txt)

```
Flask>=3.0.0
flask-cors>=4.0.0
filelock>=3.12.0
gunicorn>=21.2.0
```

#### Sudoers for ARP scan

Inventory generation requires `arp-scan` with root privileges:

```bash
echo "eca ALL=(ALL) NOPASSWD: /usr/sbin/arp-scan" | sudo tee /etc/sudoers.d/eca-arp-scan
sudo chmod 440 /etc/sudoers.d/eca-arp-scan
```

#### Development server

```bash
python3 server.py
# Runs on http://0.0.0.0:5000
```

#### Production server (Gunicorn)

```bash
bash start.sh
```

| Setting | Value |
|---------|-------|
| Workers | 4 |
| Threads per worker | 4 |
| Concurrent requests | 16 |
| Timeout | 300s (long-running playbooks) |
| Bind | `0.0.0.0:5000` |

#### Nginx reverse proxy (optional)

```bash
sudo cp nginx.conf /etc/nginx/conf.d/eca.conf
sudo nginx -t && sudo systemctl reload nginx
```

Nginx handles: static file serving, gzip compression, 2GB upload limit for firmware, 300s proxy timeout.

#### Systemd service

```bash
sudo tee /etc/systemd/system/eca-prod.service << 'EOF'
[Unit]
Description=ECA Command Center (Production)
After=network.target

[Service]
Type=exec
User=eca
WorkingDirectory=/home/eca/Downloads/UI/EcaCCGui_Prod
ExecStart=/home/eca/Downloads/UI/EcaCCGui_Prod/venv/bin/gunicorn server:app -w 4 --threads 4 -b 0.0.0.0:5000 --timeout 300 --access-logfile -
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now eca-prod
```

#### Restarting

```bash
# Systemd service
sudo systemctl restart eca-prod

# Manual gunicorn
pkill -f gunicorn && bash start.sh

# Dev server
pkill -f "python.*server.py" && python3 server.py
```

---

## Configuration Reference

### Environment Variables

Set these before starting the server:

| Variable | Default | Description |
|----------|---------|-------------|
| `ECA_SECRET_KEY` | Random (per-worker) | Flask session signing key. **Set this in production** or sessions break across workers |
| `ECA_CORS_ORIGINS` | `http://localhost:5000` | Comma-separated allowed CORS origins |

### config.py — SSH and CSV Settings

| Variable | Value | Description |
|----------|-------|-------------|
| `BASE_DIR` | Auto-detected | Root directory (where `config.py` lives) |
| `SSH_USER` | `root` | Default SSH/iDRAC username for inventory |
| `SSH_PASS` | `HWMPAMP3RHMN` | Default SSH/iDRAC password for inventory |
| `MAC_FILE_PATH` | `{BASE_DIR}/asset_db_tags2.csv` | Workbook CSV for serial, MAC, asset tag, rack mappings |
| `FIRMWARE_CSV` | `{BASE_DIR}/Firmware/Firmware.csv` | Expected firmware versions for QC validation |
| `MAC_COLUMN_NAME` | `mac_address` | Column header in the workbook for management MAC addresses |
| `INVENTORY_FILENAME` | `hosts` | Output Ansible inventory filename |

### config_backend.py — Backend Settings

| Variable | Value | Description |
|----------|-------|-------------|
| `UI_BASE_DIR` | Auto-detected | App root directory |
| `JOBS_ROOT` | `{UI_BASE_DIR}/jobs` | Job storage (SQLite DB + per-job folders) |
| `PLAYBOOK_ROOT` | `{UI_BASE_DIR}` | Ansible playbook directory |
| `NFS_HOST` | `10.3.3.10` | NFS server IP for shared storage |
| `MAX_CONCURRENT_RUNS` | `50` | Max simultaneous ansible-playbook processes |
| `MAX_RUN_TIMEOUT` | `14400` (4 hours) | Stale process reaper kills runs exceeding this |
| `DEFAULT_INVENTORY_NAME` | `target_hosts` | Default name for generated inventory files |
| `DELL_CATALOG_URL` | `https://downloads.dell.com/catalog/Catalog.xml.gz` | Dell firmware catalog source |
| `ALLOWED_UPLOAD_EXTS` | `.csv .xml .yml .yaml .exe .bin .img .tgz` | Accepted file upload types |

### Runtime Files (auto-generated, do not commit)

| File | Description |
|------|-------------|
| `users.json` | User accounts and password hashes |
| `customers.json` | Customer definitions (paths auto-heal on relocation) |
| `workflows.json` | Workflow definitions and task lists |
| `jobs/jobs.db` | SQLite database (WAL mode, auto-indexed) |
| `audit.log` | Admin action audit trail |
| `server.log` | Application log (rotating, 10MB x 3 backups) |
| `dell_catalog_cache.xml` | Cached Dell firmware catalog |
| `hosts` | Last generated Ansible inventory |
| `vars.yml` | Last generated Ansible variables |

---

## Workflows

### Server Workflows

| Workflow | Playbook | Tags | Description |
|----------|----------|------|-------------|
| **Server Build (J Class)** | `ConfigMain._J_class.yaml` | powerup, lldp, rackslot, assettag, update, reboot, xml (iDRAC) | Full J-class rack server build and configure |
| **Server Build (I Class)** | `ConfigMain._I_class.yaml` | powerup, lldp, rackslot, assettag, update, reboot, xml | Full I-class (high-density/blade) server build |
| **Post-Provisioning** | `post_provisioning.yaml` | diagnostics, disablelld, tsr, cleanup, shutdown | Post-build: diagnostics, TSR, cleanup, power down |
| **Quick QC** | `Quick_QC.yaml` | *(runs entire playbook)* | Inventory validation, firmware checks, pass/fail |

### Network Workflows

| Workflow | Playbook | Operations | Description |
|----------|----------|------------|-------------|
| **Cisco Switch** | `CiscoSwitch.yaml` | Firmware Update, Basic Config Setup | Nexus 9300/9500 switch automation |
| **Juniper Switch** | `JuniperSwitch.yaml` | Firmware Update, Basic Config, Enable LLDP | Juniper switch automation with port ranges |
| **Console Switch** | `ConsoleSwitch.yaml` | Firmware Update, Basic Config, Enable LLDP | ACS8008MDAC-400 console switch setup |

### Power Workflow

| Workflow | Playbook | Description |
|----------|----------|-------------|
| **PDU Setup** | `PDU.yaml` | Configure rack PDUs (Gelu/Raritan) using power cable mapping |

---

## Customers

Default customers (editable via Admin panel):

| ID | Label | Server Class | Workflows |
|----|-------|-------------|-----------|
| `servicenow` | ServiceNow | Yes (I/J) | All 7 workflows |
| `openai` | OpenAI | No | Cisco, Juniper, Console switch only |
| `aes` | AES | No | Cisco, Juniper, Console switch only |
| `traderjoes` | Trader Joe's | No | Cisco, Juniper, Console switch only |

Customers are stored in `customers.json` and editable at runtime via **Admin > Customers**. Paths auto-correct to the app's current location on every server start.

---

## Authentication

- **Method:** Server-side Flask sessions (cookie-based)
- **Default account:** `admin` / `admin` (created on first start if `users.json` missing)
- **Roles:** `admin` (full access + admin panel) and `user` (job operations only)
- **Password hashing:** SHA-256
- **Session key:** Set `ECA_SECRET_KEY` env var for production (required for multi-worker Gunicorn)

### Managing users via CLI

```bash
cd /home/eca/Downloads/UI/EcaCCGui_Prod
source venv/bin/activate

# List users
python3 manage_users.py list

# Add a user
python3 manage_users.py add <username> <password> --role admin

# Remove a user
python3 manage_users.py remove <username>
```

Or use the Admin panel in the web UI.

---

## API Reference (42 routes)

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Serve the web UI |
| `GET` | `/api/health` | Health check (DB, playbooks, writable) — returns `ok` or `degraded` |
| `POST` | `/api/login` | Authenticate (`{username, password}`) |
| `POST` | `/api/logout` | Clear session |
| `GET` | `/api/me` | Current user info |

### Jobs (auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/jobs` | List all jobs |
| `POST` | `/api/jobs` | Create job (`{jobName, workflow, customer, rackId, ...}`) |
| `GET` | `/api/jobs/:id` | Get job details |
| `PATCH` | `/api/jobs/:id` | Update job fields |
| `DELETE` | `/api/jobs/:id` | Delete job (admin only) |
| `POST` | `/api/jobs/:id/clone` | Clone job with optional overrides |

### Files (auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/jobs/:id/files` | Upload file (`multipart/form-data`, role: workbook/firmware/bios_xml) |
| `GET` | `/api/jobs/:id/files/:role/:name` | Download file |
| `DELETE` | `/api/jobs/:id/files/:role/:name` | Delete file |

### Inventory (auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/jobs/:id/generate_inventory` | Run ARP scan, generate Ansible inventory |
| `GET` | `/api/jobs/:id/inventory_hosts` | Parse and return discovered hosts |

### Execution (auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/jobs/:id/run` | Run job (`{tags, groups, workflowOverride}`) |
| `POST` | `/api/jobs/:id/stop` | Stop job (optional `{groupId}`) |
| `GET` | `/api/jobs/:id/log` | Stream log (`?offset=N&group=G`) |

### Firmware (auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/jobs/:id/firmware` | Get firmware metadata |
| `POST` | `/api/jobs/:id/generate_catalog` | Generate filtered Dell catalog |

### TSR (auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/jobs/:id/tsr` | Download all TSRs as ZIP |
| `GET` | `/api/jobs/:id/tsr_status` | Per-serial TSR status |
| `DELETE` | `/api/jobs/:id/tsr/:filename` | Delete a TSR file |
| `POST` | `/api/jobs/:id/tsr_selected` | Download selected TSRs as ZIP |

### History & Outputs (auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/jobs/:id/runs` | List run history |
| `GET` | `/api/jobs/:id/runs/:run/report` | Download HTML run report |
| `GET` | `/api/jobs/:id/outputs/:type` | List output files (PDU, switches) |
| `GET` | `/api/jobs/:id/download_output` | Download single output (`?path=...`) |
| `POST` | `/api/jobs/:id/download_outputs` | Download multiple outputs as ZIP |

### Dashboard & Templates (auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/dashboard/stats` | Dashboard KPIs |
| `GET` | `/api/templates` | List templates |
| `POST` | `/api/templates` | Save job as template |
| `DELETE` | `/api/templates/:id` | Delete template (admin only) |
| `POST` | `/api/templates/:id/create` | Create job from template |

### Config (auth required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/config/customers` | Customer definitions |
| `GET` | `/api/config/workflows` | Workflow definitions |

### Admin (admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/users` | List users |
| `POST` | `/api/admin/users` | Create user |
| `DELETE` | `/api/admin/users/:name` | Delete user |
| `PATCH` | `/api/admin/users/:name/role` | Change role |
| `PATCH` | `/api/admin/users/:name/password` | Reset password |
| `GET/PUT/DELETE` | `/api/admin/customers/:id` | Customer CRUD |
| `GET/PUT/DELETE` | `/api/admin/workflows/:id` | Workflow CRUD |
| `GET` | `/api/admin/stats` | Admin KPIs |
| `GET` | `/api/admin/audit` | Audit log (`?limit=50&offset=0&action=...`) |
| `GET` | `/api/admin/audit/export` | Export audit log as CSV |

---

## Logs

| Log | Location | Rotation |
|-----|----------|----------|
| Application | `server.log` | 10MB x 3 backups |
| Audit trail | `audit.log` | Append-only |
| Per-run Ansible | `jobs/{id}/runs/{run}/ansible_stdout.log` | Per-run |
| Gunicorn access | stdout (`journalctl -u eca-prod -f`) | systemd journal |

---

## Troubleshooting

```bash
# Check if the server is healthy
curl http://10.3.3.10:5000/api/health

# Check systemd service
sudo systemctl status eca-prod
journalctl -u eca-prod -f

# Check what's running
ps aux | grep gunicorn
ps aux | grep ansible-playbook

# Reset admin password via CLI
cd /home/eca/Downloads/UI/EcaCCGui_Prod
source venv/bin/activate
python3 manage_users.py add admin newpassword --role admin

# Verify Ansible works
ansible-playbook --version
ansible-playbook -i hosts Quick_QC.yaml --list-tasks

# Verify ARP scan works
sudo arp-scan --localnet

# Check DB integrity
sqlite3 jobs/jobs.db "PRAGMA integrity_check;"
```
