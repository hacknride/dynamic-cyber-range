resource "proxmox_virtual_environment_file" "user_data" {
  for_each     = local.machines_map
  content_type = "snippets"
  datastore_id = "local"
  node_name    = "oss-c220-pve02"

  source_raw {
    data = <<-EOF
    #cloud-config
    hostname: ${each.value.name}
    package_update: true
    packages:
      - salt-minion

    disable_root: false
    ssh_pwauth: true
    chpasswd:
    list: |
      root:root
      expire: False

    write_files:
      - path: /etc/ssh/sshd_config.d/99-override.conf
        owner: root:root
        permissions: '0644'
        content: |
          PermitRootLogin yes
          PasswordAuthentication yes
          KbdInteractiveAuthentication yes
        
      - path: /etc/salt/minion
        owner: root:root
        permissions: '0644'
        content: |
          master: 172.16.5.24
          id: ${each.value.name}
          verify_env: True
          hash_type: sha256

    runcmd:
      - systemctl reload ssh
      - systemctl enable --now salt-minion
    EOF

    file_name = "user-${each.value.name}.yaml"
  }
}