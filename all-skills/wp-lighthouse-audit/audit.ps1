# audit.ps1 — WP Lighthouse audit, median of N runs (mobile + desktop)
#
# Usage:
#   .\audit.ps1 -Url "https://site.com/" -Tag "before"
#   .\audit.ps1 -Url "https://site.com/" -Tag "after" -Runs 3
#
# Output: $env:TEMP\lh-<Tag>\{mobile,desktop}-<n>.json
# Parse with Python/Node snippet in SKILL.md Stage 3.
#
# If PowerShell blocks the script:
#   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
# (no admin needed — CurrentUser scope)

param(
  [Parameter(Mandatory=$true)][string]$Url,
  [Parameter(Mandatory=$true)][string]$Tag,
  [int]$Runs = 3
)

$ErrorActionPreference = "Stop"

# Locate Chrome (system install first, then user install)
$Chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
if (!(Test-Path $Chrome)) {
  $Chrome = "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
}
if (!(Test-Path $Chrome)) {
  Write-Error "Chrome not found. Install from https://www.google.com/chrome/"
}

# Verify Node
try { $null = node --version } catch {
  Write-Error "Node.js not found. Install LTS from https://nodejs.org/"
}

$OutDir = "$env:TEMP\lh-$Tag"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "Target  : $Url"
Write-Host "Tag     : $Tag"
Write-Host "Runs    : $Runs (per form-factor)"
Write-Host "Chrome  : $Chrome"
Write-Host "Output  : $OutDir`n"

foreach ($ff in @("mobile", "desktop")) {
  for ($i = 1; $i -le $Runs; $i++) {
    Write-Host "-> $ff run $i/$Runs"
    $preset = if ($ff -eq "mobile") {
      @("--form-factor=mobile", "--throttling-method=simulate")
    } else {
      @("--preset=desktop")
    }
    npx -y lighthouse@latest $Url `
      --only-categories=performance,accessibility,best-practices,seo `
      @preset `
      --output=json --output-path="$OutDir\$ff-$i.json" `
      --chrome-path="$Chrome" `
      --chrome-flags="--headless=new --no-sandbox" --quiet
  }
}

Write-Host "`nDone. Files: $OutDir"
Write-Host "Next: parse with Python/Node (see SKILL.md Stage 3) and compute median."
