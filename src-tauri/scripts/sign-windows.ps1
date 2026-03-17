param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$TargetPath
)

$ErrorActionPreference = "Stop"

function Get-SignToolPath {
  $fromPath = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($fromPath) {
    return $fromPath.Source
  }

  $patterns = @(
    "$env:ProgramFiles(x86)\Windows Kits\10\bin\*\x64\signtool.exe",
    "$env:ProgramFiles(x86)\Windows Kits\10\App Certification Kit\signtool.exe"
  )

  $tool = Get-ChildItem -Path $patterns -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1

  if (-not $tool) {
    throw "signtool.exe was not found. Install the Windows SDK or add signtool.exe to PATH."
  }

  return $tool.FullName
}

function Get-CodeSigningCertificate {
  if (-not [string]::IsNullOrWhiteSpace($env:WINDOWS_CERTIFICATE_THUMBPRINT)) {
    $thumbprint = ($env:WINDOWS_CERTIFICATE_THUMBPRINT -replace "\s", "").ToUpperInvariant()
    $cert = Get-ChildItem Cert:\CurrentUser\My |
      Where-Object { $_.Thumbprint -eq $thumbprint } |
      Select-Object -First 1

    if (-not $cert) {
      throw "Code signing certificate with thumbprint $thumbprint was not found in Cert:\\CurrentUser\\My."
    }

    return $cert
  }

  $certs = @(Get-ChildItem Cert:\CurrentUser\My |
    Where-Object {
      $_.HasPrivateKey -and
      ($_.EnhancedKeyUsageList | Where-Object { $_.FriendlyName -eq "Code Signing" })
    } |
    Sort-Object NotAfter -Descending)

  if ($certs.Count -eq 0) {
    return $null
  }

  return $certs[0]
}

$resolvedTarget = (Resolve-Path -LiteralPath $TargetPath).Path
$certificate = Get-CodeSigningCertificate

if (-not $certificate) {
  if ($env:GITHUB_ACTIONS -eq "true") {
    throw "No code signing certificate is available for CI release signing."
  }

  Write-Host "No code signing certificate found. Skipping Authenticode signing for local build."
  exit 0
}

$signTool = Get-SignToolPath
$timestampUrl = if ([string]::IsNullOrWhiteSpace($env:WINDOWS_TIMESTAMP_URL)) {
  "https://timestamp.digicert.com"
} else {
  $env:WINDOWS_TIMESTAMP_URL
}

$arguments = @(
  "sign",
  "/sha1", $certificate.Thumbprint,
  "/fd", "sha256",
  "/td", "sha256",
  "/tr", $timestampUrl,
  $resolvedTarget
)

Write-Host "Authenticode signing $resolvedTarget"
& $signTool @arguments

if ($LASTEXITCODE -ne 0) {
  throw "signtool.exe exited with code $LASTEXITCODE while signing $resolvedTarget"
}
