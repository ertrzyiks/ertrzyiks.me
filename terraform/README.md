# Terraform Configuration for Dokku Apps

This directory contains Terraform configuration for provisioning Dokku applications.

## Apps

This configuration creates two Dokku apps:
- **blog** - The blog application (blog.ertrzyiks.me)
- **home** - The home application (ertrzyiks.me)

## Prerequisites

1. [Terraform](https://www.terraform.io/downloads.html) installed (version 1.0 or later)
2. SSH access to your Dokku server
3. SSH private key for authentication

## Usage

### Initialize Terraform

```bash
cd terraform
terraform init
```

### Configure Variables

Create a `terraform.tfvars` file (not committed to git) with your Dokku server details:

```hcl
dokku_ssh_host = "your-dokku-server.com"
dokku_ssh_user = "dokku"
dokku_ssh_port = 22
dokku_ssh_cert = file("~/.ssh/id_rsa")
```

Alternatively, you can set environment variables:

```bash
export TF_VAR_dokku_ssh_host="your-dokku-server.com"
export TF_VAR_dokku_ssh_cert="$(cat ~/.ssh/id_rsa)"
```

### Plan Changes

Review what Terraform will create:

```bash
terraform plan
```

### Apply Configuration

Create the Dokku apps:

```bash
terraform apply
```

### Destroy Resources

Remove the Dokku apps (use with caution):

```bash
terraform destroy
```

## Provider

This configuration uses the [aliksend/dokku](https://registry.terraform.io/providers/aliksend/dokku/latest/docs) Terraform provider.
