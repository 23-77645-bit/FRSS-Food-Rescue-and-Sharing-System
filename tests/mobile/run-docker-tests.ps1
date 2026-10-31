[CmdletBinding()]
param(
    [string]$DeviceAddress,
    [string]$EnvFile = ".env.mobile"
)

$ErrorActionPreference = "Stop"
$composeArgs = @("compose", "-f", "compose.mobile.yml")

function Read-DotEnvValue {
    param([string]$Path, [string]$Name)

    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $line = Get-Content -LiteralPath $Path |
        Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
        Select-Object -Last 1
    if ($null -eq $line) { return $null }
    return (($line -split "=", 2)[1]).Trim().Trim('"').Trim("'")
}

if ([string]::IsNullOrWhiteSpace($DeviceAddress)) {
    $DeviceAddress = Read-DotEnvValue -Path $EnvFile -Name "ANDROID_UDID"
}

function Get-DeviceAddressMatch {
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
    $result = [regex]::Match($Value.Trim(), '^(?<ip>(?:\d{1,3}\.){3}\d{1,3}):(?<port>\d{1,5})$')
    if ($result.Success) { return $result }
    return $null
}

$match = Get-DeviceAddressMatch -Value $DeviceAddress
if ($null -eq $match) {
    Write-Host "Open Android Settings > Developer options > Wireless debugging." -ForegroundColor Yellow
    Write-Host "Use the numeric 'IP address & port' on the MAIN screen, not the pairing-dialog port." -ForegroundColor Yellow
    $DeviceAddress = Read-Host "Enter the current address (example: 192.168.1.16:34621)"
    $match = Get-DeviceAddressMatch -Value $DeviceAddress
}
if ($null -eq $match) {
    throw "The address must end with a numeric port, for example 192.168.1.16:34621. CURRENT_PORT and DEBUGGING_PORT are placeholders, not commands."
}

$DeviceAddress = $DeviceAddress.Trim()

$octets = $match.Groups['ip'].Value.Split('.') | ForEach-Object { [int]$_ }
$port = [int]$match.Groups['port'].Value
if (($octets | Where-Object { $_ -gt 255 }).Count -gt 0 -or $port -lt 1 -or $port -gt 65535) {
    throw "ANDROID_UDID contains an invalid IP address or port: $DeviceAddress"
}

Write-Host "Starting the mobile test container..."
& docker @composeArgs up -d --build
if ($LASTEXITCODE -ne 0) { throw "Docker Compose could not start the mobile service." }

Write-Host "Waiting for Appium to become ready..."
$ready = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
        $status = Invoke-RestMethod -Uri "http://127.0.0.1:4723/status" -TimeoutSec 2
        if ($status.value.ready -eq $true) { $ready = $true; break }
    } catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $ready) {
    & docker @composeArgs logs --tail 80 mobile
    throw "Appium did not become ready within 60 seconds."
}

Write-Host "Connecting ADB to $DeviceAddress..."
& docker @composeArgs exec -T mobile adb connect $DeviceAddress
if ($LASTEXITCODE -ne 0) {
    throw "ADB could not connect. Check the current IP address and port on the main Wireless debugging screen."
}

$devices = (& docker @composeArgs exec -T mobile adb devices -l) -join "`n"
Write-Host $devices
$escapedDevice = [regex]::Escape($DeviceAddress)
if ($devices -notmatch "(?m)^$escapedDevice\s+device(?:\s|$)") {
    throw "The phone is not online in ADB. Keep it unlocked, leave Wireless debugging enabled, and pair again only if Android no longer lists this Docker ADB key."
}

Write-Host "Running read-only mobile smoke tests against $DeviceAddress..."
& docker @composeArgs exec -T -e "ANDROID_UDID=$DeviceAddress" mobile npm run test:mobile
if ($LASTEXITCODE -ne 0) {
    throw "The mobile smoke tests failed. Review the test output above for the failing assertion or session error. For Appium diagnostics, run: docker compose -f compose.mobile.yml logs --tail 120 mobile"
}
