# config.py

# ── Base Directories ─────────────────────────────────────────────
BASE_DIR = "/home/eca/Downloads/DellServerAuto/Test4"  # NFS location where shared files are stored
PROJECT_DIR = "/var/lib/rundeck/projects/ansible/DellServerAuto/MainPlayBook/Test4"  # Path to the Ansible playbook directory

# ── CSV Paths ────────────────────────────────────────────────────
MAC_FILE_PATH = f"{BASE_DIR}/asset_db_tags2.csv"  # Use the Workbook for serial, mac address, asset tag, and rack mappings
DEFAULT_CSV = MAC_FILE_PATH
FIRMWARE_CSV = f"{BASE_DIR}/Firmware/Firmware.csv"  # Expected firmware versions list

# ── Inventory Output Files ───────────────────────────────────────
INVENTORY_DIRECTORY = PROJECT_DIR
INVENTORY_FILENAME = "hosts"
MISSING_FILE = f"{PROJECT_DIR}/missing_rack_asset_inventory"
FAILED_INVENTORY_PATH = f"{PROJECT_DIR}/failed_hosts_inventory"

# ── SSH Credentials ──────────────────────────────────────────────
SSH_USER = "root"
SSH_PASS = "HWMPAMP3RHMN"  # Override if needed per environment
DEFAULT_SSH_USER = SSH_USER
DEFAULT_SSH_PASS = SSH_PASS

# ── CSV Column Mapping ───────────────────────────────────────────
MAC_COLUMN_NAME = "mac_address"  # Column header to identify management MAC address
