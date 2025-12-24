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
