variable "pm_api_url"          { type = string }
variable "pm_api_token_id"     { type = string }
variable "pm_api_token_secret" { type = string }
variable "ssh_username"		   { type = string }
variable "ssh_password"		   { type = string }

variable "target_node"   { type = string }
variable "template_id"   { type = number }                 # VMID of CI-ready template
variable "datastore_id"  { type = string }                 # "local-lvm" preferred

variable "bridge" {
	type = string
	default = "vmbr5"
}
variable "pool_id" {
	type = string
	default = "DCR"
}
variable "cores" {
	type = number
	default = 2
}
variable "memory_mb" {
	type = number
	default = 4096
}
variable "vmid_base" {
	type = number
	default = 5005
}

# Minimal list of machines; edit as we add more
variable "machines" {
  type = list(object({ name = string }))
  default = [
    { name = "wordpress" },
    { name = "gitea" }
  ]
}
