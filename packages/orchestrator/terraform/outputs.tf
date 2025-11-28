# Optional: keep your human summary
output "vm_summary" {
  value = [
    for name, vm in proxmox_virtual_environment_vm.vm :
    format("Host: %s (vmid: %s)", name, vm.vm_id)
  ]
}

# Best-guess primary IPv4 per VM:
# 1) prefer 172.16.0.0/16 addresses
# 2) else first non-loopback/non-APIPA
output "ips" {
  value = {
    for name, vm in proxmox_virtual_environment_vm.vm :
    name => coalesce(
      try([for ip in flatten(vm.ipv4_addresses) : ip if startswith(ip, "172.16.")][0], null),
      try([for ip in flatten(vm.ipv4_addresses) : ip if !(startswith(ip, "127.") || startswith(ip, "169.254."))][0], null)
    )
  }
}