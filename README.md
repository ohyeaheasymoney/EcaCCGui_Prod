# ECA Command Center

Web-based automation platform for Dell server provisioning, network switch configuration, and infrastructure management. Built on Flask + Ansible with a modular vanilla JS frontend.

## Features

- **7 Automation Workflows**
  - Server Build & Configure (I/J Class)
  - Post-Provisioning Setup (TSR, cleanup, power actions)
  - Quick QC Validation
  - Cisco Switch Automation
  - Juniper Switch Automation
  - Console Switch Setup
  - PDU Setup
- **Job Management** — Create, clone, delete jobs with per-job file storage, inventory, and run history
- **Inventory Generation** — CSV workbook parsing with ARP-based network discovery
- **Task Presets** — Full Stack, Quick Deploy, or Custom task selection per workflow
- **Live Status** — Real-time log streaming, host status matrix, progress tracking
- **TSR Collection** — Collect, download, delete, and re-run Technical Support Reports per host
- **Dell Firmware Catalog** — Auto-generated from uploaded firmware with Dell catalog cross-reference
- **Run History** — Per-run reports, log downloads, and run comparison
- **Dark/Light Theme** — Toggle with persistent preference

## Architecture

```
                  ┌──────────┐
  Browser ──────▶ │  Nginx   │ :80
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
| Frontend | Vanilla JS (modular), CSS |
| Database | SQLite (`jobs/jobs.db`) |
| Automation | Ansible Playbooks |
| Reverse Proxy | Nginx (optional, recommended for production) |

## Project Structure

```
ansible-ui/
├── server.py                  # Flask app entry point + API routes
├── config_backend.py          # Business logic, job/inventory/TSR management
├── start.sh                   # Production launcher (gunicorn)
├── nginx.conf                 # Nginx reverse proxy config
├── requirements.txt           # Python dependencies
├── jobs/                      # Job storage (SQLite DB + per-job folders)
│   ├── jobs.db
│   └── {job_id}/
│       ├── job.json
│       ├── input/             # Uploaded workbooks, firmware, configs
│       ├── runs/              # Per-run logs and reports
│       ├── TSR/               # Collected TSR files
│       └── QuickQC/           # QC results
└── static/
    ├── index.html             # Single-page app shell
    ├── styles.css             # All styles (dark/light themes)
    ├── api.js                 # Fetch wrapper (apiGet, apiPost, etc.)
    ├── utils.js               # Shared helpers, toasts, modals
    ├── dashboard.js           # Job list, filters, sorting, search
    ├── wizard.js              # Main app init + routing
    ├── wizard-modal.js        # New job creation wizard
    ├── workflow-logic.js      # Workflow definitions
    ├── ui-config.js           # UI constants
    ├── theme.js               # Dark/light theme toggle
    ├── job-panel-core.js      # Job panel shell, tabs, shared state
    ├── job-panel-customer.js  # Customer/workflow definitions, selectors
    ├── job-panel-files.js     # File upload, preview, delete, catalog
    ├── job-panel-inventory.js # Inventory generation, host picker
    ├── job-panel-tasks.js     # Task presets, checkboxes, preflight checks
    ├── job-panel-execution.js # Run/stop controls
    ├── job-panel-status.js    # Live log, progress, host status matrix
    ├── job-panel-history.js   # Run history, reports, comparison
    └── job-panel-tsr.js       # TSR collection status, download, re-run
```

## Deployment

### Prerequisites

- Python 3.9+
- `ansible-playbook` in `$PATH`
- Access to playbooks at `/var/lib/rundeck/projects/ansible/DellServerAuto/MainPlayBook/Test4/DellServerAuto_4`
- `sudo arp-scan` configured with NOPASSWD in sudoers (for inventory network discovery)

### 1. Clone and install

```bash
git clone git@github.com:ohyeaheasymoney/EcaAutomationOps.git
cd EcaAutomationOps
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install gunicorn
```

### 2. Development server

```bash
python3 server.py
```

Runs on `http://0.0.0.0:5000` with auto-reload. Good for local testing.

### 3. Production server (Gunicorn)

```bash
bash start.sh
```

This launches Gunicorn with 4 workers and 4 threads (16 concurrent requests), 300s timeout for long-running playbooks, on port 5000.

### 4. Production with Nginx (recommended)

Nginx handles static files, gzip compression, and large firmware uploads (up to 2GB).

```bash
# Copy the included nginx config
sudo cp nginx.conf /etc/nginx/conf.d/eca.conf

# Test and reload nginx
sudo nginx -t
sudo systemctl reload nginx
```

Then access the app on port 80 instead of 5000.

### 5. Running as a system service (optional)

Create a systemd unit to auto-start on boot:

```bash
sudo tee /etc/systemd/system/eca.service << 'EOF'
[Unit]
Description=ECA Command Center
After=network.target

[Service]
Type=exec
User=eca
WorkingDirectory=/home/eca/Downloads/UI/ansible-ui
ExecStart=/home/eca/Downloads/UI/ansible-ui/venv/bin/gunicorn server:app -w 4 --threads 4 -b 0.0.0.0:5000 --timeout 300 --access-logfile -
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now eca
```

Check status:

```bash
sudo systemctl status eca
journalctl -u eca -f
```

### Restarting

```bash
# If running via start.sh
pkill -f gunicorn && bash start.sh

# If running as systemd service
sudo systemctl restart eca

# If running dev server
pkill -f "python.*server.py" && python3 server.py
```

## Configuration

Key settings in `config_backend.py`:

| Variable | Default | Description |
|----------|---------|-------------|
| `JOBS_ROOT` | `./jobs` | Where job folders and SQLite DB live |
| `PLAYBOOK_ROOT` | `/var/lib/rundeck/.../DellServerAuto_4` | Ansible playbook directory |
| `MAX_CONCURRENT_RUNS` | `5` | Max simultaneous ansible-playbook processes |
| `ALLOWED_UPLOAD_EXTS` | `.csv .xml .yml .exe .bin .img .tgz` | Accepted upload file types |
| `NFS_HOST` | `192.168.0.120` | NFS server for shared storage |

## Workflows

| Workflow | Playbook | Task Tags |
|----------|----------|-----------|
| Server Build (J Class) | `ConfigMain._J_class.yaml` | powerup, lldp, rackslot, assettag, update, reboot, xml, idrac |
| Server Build (I Class) | `ConfigMain._I_class.yaml` | powerup, lldp, rackslot, assettag, update, reboot, xml, reboot |
| Post-Provisioning | `post_provisioning.yaml` | diagnostics, disablelld, tsr, cleanup, shutdown, postlogs |
| Quick QC | `Quick_QC.yaml` | *(runs entire playbook)* |
| Cisco Switch | vendor-specific | model-dependent |
| Juniper Switch | vendor-specific | port range selection |
| PDU Setup | vendor-specific | IP, vendor (Gelu/Ratnier), deployment type |

## Logs

- **Application log**: `server.log` (rotating, 10MB x 3 backups)
- **Per-run logs**: `jobs/{job_id}/runs/{run_id}/ansible_stdout.log`
- **Gunicorn access log**: stdout (visible in `journalctl` if using systemd)
