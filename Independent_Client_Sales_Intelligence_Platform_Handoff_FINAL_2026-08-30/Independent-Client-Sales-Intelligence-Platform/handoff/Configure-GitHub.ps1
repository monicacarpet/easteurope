param(
  [Parameter(Mandatory = $true)][string]$Repository
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$VariableFile = Join-Path $Root "generated/github-repository-variables.env"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) is required. Install it, then authenticate to the client-owned GitHub account."
}
if (-not (Test-Path $VariableFile)) {
  throw "Run scripts/generate_client_setup.py with the completed client-config.json first."
}

gh auth status
gh variable set --repo $Repository --env-file $VariableFile

$RepositorySecretNames = @(
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OUTREACH_MAIL_EMAIL",
  "OUTREACH_MAIL_PASSWORD",
  "STOCK_MAIL_EMAIL",
  "STOCK_MAIL_SECURITY_PASSWORD",
  "GEMINI_API_KEY",
  "STOCK_GEMINI_API_KEY",
  "STOCK_AUDIT_BCC_EMAIL"
)

foreach ($Name in $RepositorySecretNames) {
  $SecureValue = Read-Host "Enter $Name (leave blank only if optional)" -AsSecureString
  $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    $PlainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
    if (-not [string]::IsNullOrWhiteSpace($PlainValue)) {
      $PlainValue | gh secret set $Name --repo $Repository
    }
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)
  }
}

$DatabaseEnvironmentSecretNames = @(
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_PROJECT_ID"
)

foreach ($Name in $DatabaseEnvironmentSecretNames) {
  $SecureValue = Read-Host "Enter production-database $Name" -AsSecureString
  $Pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    $PlainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer)
    if ([string]::IsNullOrWhiteSpace($PlainValue)) {
      throw "$Name is required for protected database deployments."
    }
    $PlainValue | gh secret set $Name --repo $Repository --env "production-database"
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Pointer)
  }
}

Write-Host "Repository variables, repository secrets, and protected database secrets were assigned to $Repository. AUTOMATION_ENABLED is still false."
