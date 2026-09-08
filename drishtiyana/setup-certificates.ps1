# DRISHTIYANA - Certificate Installation & Regeneration Script
# This script:
# 1. Installs mkcert Root CA into Windows Trusted Root store
# 2. Regenerates certificates with proper SANs for all network interfaces
# 3. Ensures all websites (viewer, admin, mobile) show as secure

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  DRISHTIYANA - SSL Certificate Setup" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# Check if mkcert is available
if (-not (Get-Command mkcert -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: mkcert not found in PATH" -ForegroundColor Red
    Write-Host "Please install: winget install FiloSottile.mkcert" -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/4] mkcert version:" -ForegroundColor White
mkcert -version
Write-Host ""

# Get mkcert root CA location
$mkcertCARoot = mkcert -CAROOT
Write-Host "[2/4] mkcert Root CA location: $mkcertCARoot" -ForegroundColor White
Write-Host ""

# Path to root CA
$rootCAPath = Join-Path $mkcertCARoot "rootCA.pem"
if (-not (Test-Path $rootCAPath)) {
    Write-Host "ERROR: rootCA.pem not found at $rootCAPath" -ForegroundColor Red
    exit 1
}

Write-Host "[3/4] Installing mkcert Root CA into Windows Trusted Root Store..." -ForegroundColor White

# Install Root CA into Windows Trusted Root Certification Authorities store
try {
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($rootCAPath)
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
    $store.Open("ReadWrite")
    $existingCert = $store.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
    if ($existingCert) {
        Write-Host "   Root CA already installed in Trusted Root store" -ForegroundColor Green
    } else {
        $store.Add($cert)
        Write-Host "   Root CA INSTALLED successfully in Trusted Root store" -ForegroundColor Green
    }
    $store.Close()
} catch {
    Write-Host "   ERROR installing Root CA: $_" -ForegroundColor Red
    Write-Host "   Try running this script as Administrator" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Now regenerate certificates with proper SANs
Write-Host "[4/4] Regenerating certificates with all network interfaces..." -ForegroundColor White

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$certDir = Join-Path $scriptDir "server\certs"
if (-not (Test-Path $certDir)) {
    New-Item -ItemType Directory -Path $certDir -Force | Out-Null
}

# Get all local IP addresses
$localIps = @()
$interfaces = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.InterfaceAlias -notlike "*Virtual*" }
foreach ($iface in $interfaces) {
    if ($iface.PrefixLength -ge 24 -and $iface.Address -notmatch "^169\.254\.") {
        $localIps += $iface.IPAddress
    }
}

# If no LAN IPs found, try alternative method
if ($localIps.Count -eq 0) {
    $ifaces = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()
    foreach ($iface in $ifaces) {
        if ($iface.NetworkInterfaceType -eq "Ethernet" -or $iface.NetworkInterfaceType -eq "Wireless80211") {
            $props = $iface.GetIPProperties()
            foreach ($addr in $props.UnicastAddresses) {
                if ($addr.Address.AddressFamily -eq "InterNetwork" -and $addr.Address -notmatch "^169\.254\.") {
                    $localIps += $addr.Address.IPAddressToString
                }
            }
        }
    }
}

# Remove duplicates
$localIps = $localIps | Select-Object -Unique

Write-Host "   Generating certificate for domains: localhost, 127.0.0.1, ::1"
foreach ($ip in $localIps) {
    Write-Host "                                      $ip"
}

# Generate new certificate
$domains = @("localhost", "127.0.0.1", "::1") + $localIps
$genResult = mkcert -install
if ($LASTEXITCODE -ne 0) {
    # -install might fail if already installed, that's ok
    Write-Host "   (mkcert -install returned non-zero, but CA may already be installed)"
}

$genResult = mkcert -key-file (Join-Path $certDir "key.pem") -cert-file (Join-Path $certDir "cert.pem") @domains
if ($LASTEXITCODE -eq 0) {
    Write-Host "   Certificates generated successfully!" -ForegroundColor Green
} else {
    Write-Host "   ERROR generating certificates" -ForegroundColor Red
    exit 1
}

# Verify the new certificate
Write-Host ""
Write-Host "=== VERIFICATION ===" -ForegroundColor Cyan
$newCert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(Join-Path $certDir "cert.pem")
Write-Host "Certificate valid until:" $newCert.NotAfter
Write-Host ""

# Check SANs
$sanExt = $newCert.Extensions | Where-Object { $_.Oid.FriendlyName -eq "Subject Alternative Name" }
if ($sanExt) {
    Write-Host "Certificate covers:" -ForegroundColor Green
    $sanExt.Format(0) | ForEach-Object { Write-Host "  - $_" }
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "  CERTIFICATE SETUP COMPLETE!" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANT: You may need to:" -ForegroundColor Yellow
Write-Host "1. RESTART your browser (close all windows completely)" -ForegroundColor Yellow
Write-Host "2. Clear SSL state: Internet Options -> Content -> Clear SSL state" -ForegroundColor Yellow
Write-Host "3. Restart the DRISHTIYANA server" -ForegroundColor Yellow
Write-Host ""
Write-Host "After this, all sites should show as SECURE (HTTPS):" -ForegroundColor Green
Write-Host "  - https://localhost:3001/viewer" -ForegroundColor Green
Write-Host "  - https://localhost:3001/admin" -ForegroundColor Green
Write-Host "  - https://<IP>:3001/mobile" -ForegroundColor Green
