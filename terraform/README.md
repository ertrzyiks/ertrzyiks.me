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

### Secret Management Options

Managing secrets securely is critical. Here are popular options:

#### 1. Environment Variables (Simple)
Set variables in your shell or CI/CD environment:
```bash
export TF_VAR_dokku_ssh_host="ertrzyiks.me"
export TF_VAR_dokku_ssh_cert="$(cat ~/.ssh/id_rsa)"
terraform apply
```

#### 2. Terraform Cloud/Enterprise (Recommended for Teams)
- Store variables securely in Terraform Cloud workspace
- Supports encrypted remote state
- Includes built-in secret management and access controls
- [Documentation](https://www.terraform.io/cloud-docs/workspaces/variables)

#### 3. HashiCorp Vault (Enterprise-Grade)
- Centralized secret storage and management
- Dynamic secret generation
- Audit logging and access policies
- Use the [Vault provider](https://registry.terraform.io/providers/hashicorp/vault/latest/docs)

```hcl
# For KV v2 secrets engine (recommended)
data "vault_kv_secret_v2" "ssh_key" {
  mount = "secret"
  name  = "dokku/ssh_key"
}

provider "dokku" {
  ssh_cert = data.vault_kv_secret_v2.ssh_key.data["private_key"]
}
```

#### 4. AWS Secrets Manager (For AWS Users)
- Native AWS secret storage
- Automatic rotation support
- IAM-based access control

```hcl
data "aws_secretsmanager_secret_version" "ssh_key" {
  secret_id = "dokku/ssh_key"
}

provider "dokku" {
  ssh_cert = jsondecode(data.aws_secretsmanager_secret_version.ssh_key.secret_string)["private_key"]
}
```

#### 5. SOPS (Secrets OPerationS)
- Encrypt files directly in your repository
- Supports multiple key providers (AWS KMS, GCP KMS, Azure Key Vault, PGP)
- Use with [sops provider](https://registry.terraform.io/providers/carlpett/sops/latest/docs)

```bash
# Encrypt your tfvars file
sops -e terraform.tfvars > terraform.tfvars.enc
```

#### 6. git-crypt
- Transparent file encryption in git repositories
- Simple setup for small teams
- Automatically encrypts/decrypts on push/pull

```bash
git-crypt init
echo "terraform.tfvars filter=git-crypt diff=git-crypt" >> .gitattributes
```

#### 7. CI/CD Secret Storage
Most CI/CD platforms have built-in secret management:
- **GitHub Actions**: Use encrypted secrets in repository/organization settings
- **GitLab CI**: Use CI/CD variables with masking and protection
- **CircleCI**: Use project environment variables
- **Jenkins**: Use credentials plugin

Example for GitHub Actions:
```yaml
- name: Terraform Apply
  env:
    TF_VAR_dokku_ssh_host: ${{ secrets.DOKKU_SSH_HOST }}
    TF_VAR_dokku_ssh_cert: ${{ secrets.DOKKU_SSH_CERT }}
  run: terraform apply -auto-approve
```

**Best Practices:**
- Never commit `terraform.tfvars` or any file containing secrets
- Use `.gitignore` to prevent accidental commits
- Rotate secrets regularly
- Use least-privilege access principles
- Enable audit logging where available

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
