

# Dynamic Cyber Range — One-Pass Install & Run Guide

> Run everything **inside Proxmox** as VMs. You must already have **Proxmox VE** installed. Perform all commands **as root** on the orchestrator VM.

---

## 1) Create the Orchestrator VM (in Proxmox)

- **OS:** Ubuntu Server 24.04 (Noble)
- **QEMU Agent:** Enabled
- **Disk:** 32 GB (QEMU Image)
- **CPU:** 2 cores (Type: `host` OK)
- **RAM:** 4 GB
- **Network:** Must reach the cyber-range subnet **and** the Internet

Start the VM and log in as `root`.

---

## 2) Install Dependencies (Terraform + Salt master)

Follow vendor guides (Ubuntu 24.04):

- **Terraform:** https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli  
- **Salt master:** https://docs.saltproject.io/salt/install-guide/en/latest/index.html

Verify:
```bash
terraform -version
salt-master --version
systemctl enable --now salt-master

---

## 3) Clone the repo and Install Node dependencies

cd /opt
git clone https://github.com/hacknride/dynamic-cyber-range
cd dynamic-cyber-range
npm install

--

## 4) Prepare the Golden Ubuntu Template (for range VMs)

Create a separate template VM (Ubuntu 24.04) to be cloned by Terraform:

CPU: 2 cores

RAM: 4 GB

Disk: ~3.5 GB usable

Install Salt minion and point it to your orchestrator (Salt master).

Optional: install qemu-guest-agent, update packages, add base tools.

Reference guide (cloud-init approach):
https://technotim.live/posts/cloud-init-cloud-image/

Record the VMID of this template (e.g., 5000).

--

## 5) Configure Terraform (Proxmox provider)

Create terraform/terraform.tfvars:

pm_api_url          = "https://<proxmox-ip>:<proxmox-port>/api2/json"
pm_api_token_id     = "orchestrator@pve!terraform"
pm_api_token_secret = "<token-on-proxmox>"

ssh_username = "root"
ssh_password = "<root-password>"

target_node  = "<target-node>"
template_id  = 5000
datastore_id = "<datastore>"
bridge       = "<bridge>"

pool_id   = "DCR"
vmid_base = 5010


Notes:

pm_api_token_id/secret: Create under Datacenter → Permissions → API Tokens for a service account with admin rights.

target_node, datastore_id, bridge: Must exist on that node.

template_id: The VMID of your Ubuntu template.

Initialize Terraform:

cd /opt/dynamic-cyber-range/terraform
terraform init

--

## 6) Configure the Project .env (root of repo)

Create /opt/dynamic-cyber-range/.env:

# Change ports only if you need to
FRONTEND_PORT=5173
BACKEND_PORT=6247

# Optional: secure dashboard → orchestrator calls
# Generate with: openssl rand -hex 32
ORCHESTRATOR_SECRET=<hex-secret>

--

## 7) Start the Platform

From the repo root:

cd /opt/dynamic-cyber-range
npm run dcr:prod


This starts:

Backend API on port 6247

Frontend dashboard (Vite) on port 5173 (proxying /api → backend)

--

## 8) Basic Sanity Checks

From your workstation/browser:

Dashboard: http://<orchestrator-vm-ip>:5173

API health:

curl http://<orchestrator-vm-ip>:6247/api/status


Terraform initialized (should not error):

terraform -chdir=/opt/dynamic-cyber-range/terraform state list

--

## 9) Use the Dashboard

Open the dashboard (http://<orchestrator-vm-ip>:5173).

Select difficulty, Linux/Windows counts, and scenario vectors.

Click Deploy range.

The orchestrator (Terraform → Proxmox) clones VMs from your template and boots them.

Salt applies scenario states to each VM.

When health checks pass, the range is ready.

--

## 10) (Optional) Run at Boot via systemd

A sample unit file dcr.service is in the repo root. Install it:

cp /opt/dynamic-cyber-range/dcr.service /etc/systemd/system/dcr.service
systemctl daemon-reload
systemctl enable --now dcr
systemctl status dcr

--

## 11) Quick Troubleshooting

Frontend can’t reach API
Ensure backend is on BACKEND_PORT and the Vite dev server proxies /api → http://localhost:<BACKEND_PORT>.

Terraform errors
Re-check terraform.tfvars: API token scope, target_node, datastore_id, bridge, template_id.

Salt minions not connecting
Verify minion config (master IP/hostname), networking/firewall, then accept keys:

salt-key -A
salt '*' test.ping
