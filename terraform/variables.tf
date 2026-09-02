variable "dokku_ssh_host" {
  description = "The hostname or IP address of the Dokku server"
  type        = string
}

variable "dokku_ssh_user" {
  description = "The SSH user for connecting to Dokku server (typically 'dokku')"
  type        = string
  default     = "dokku"
}

variable "dokku_ssh_port" {
  description = "The SSH port for connecting to Dokku server"
  type        = number
  default     = 22
}

variable "dokku_ssh_cert" {
  description = "The SSH private key for authentication"
  type        = string
  sensitive   = true
}

variable "checkly_api_key" {
  description = "Checkly user API key, used to manage uptime checks (see checkly.tf)"
  type        = string
  sensitive   = true
}

variable "checkly_account_id" {
  description = "Checkly account ID that owns the checks in checkly.tf"
  type        = string
}
