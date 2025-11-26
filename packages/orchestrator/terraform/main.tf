# Creates virtual machines in Proxmox VE based on the local.machines_map
# See documentation to see how to pass in local.machines_map
resource "proxmox_virtual_environment_vm" "vm" {
  for_each  = local.machines_map
  name      = each.value.name
  vm_id     = var.vmid_base + each.value.idx
  node_name = var.target_node
  pool_id   = var.pool_id
  tags      = ["DCR"]

  # Ensure we clone the appropriate windows and/or linux template (specify it in terraform.tfvars)
  clone {
    vm_id = var.template_id
    full  = true
  }

  # CPU configuration
  cpu {
    sockets = 1
    cores   = var.cores
  }

  # Memory configuration
  memory { dedicated = var.memory_mb }

  # Enable QEMU Guest Agent so we can pull IP addresses
  agent {
    enabled = true
    timeout = "1m"
  } 

  # Ensure guest asks for IP address on first boot and gets hostname.
  initialization {
    ip_config {
      ipv4 { address = "dhcp" }
    }
    user_data_file_id = proxmox_virtual_environment_file.user_data[each.key].id
  }

  # Disk configuration
  disk {
    interface    = "scsi0"
    size         = 12
    datastore_id = var.datastore_id
  }

  # Set the boot order to boot from disk first, then network
  boot_order = ["scsi0", "net0"]

  # Network configuration
  network_device {
    model  = "virtio"
    bridge = var.bridge
  }
}
