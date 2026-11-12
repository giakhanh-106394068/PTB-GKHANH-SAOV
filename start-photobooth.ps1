$ErrorActionPreference = "SilentlyContinue"

$project = [System.IO.Path]::GetFullPath($env:PHOTOBOOTH_DIR).TrimEnd([char]92)
$portBase = [int]$env:PHOTOBOOTH_PORT
$server = Join-Path $project "server.mjs"
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source

function Get-Runtime($port) {
  try {
    return Invoke-RestMethod -UseBasicParsing -Uri ("http://127.0.0.1:" + $port + "/api/runtime") -TimeoutSec 1
  } catch {
    return $null
  }
}

function Test-ListeningPort($port) {
  $line = netstat.exe -ano 2>$null | Select-String -Pattern (":" + $port + "\s+.*LISTENING")
  return [bool]$line
}

function Test-SameProject($runtime) {
  if ($runtime.gestureModulesSupported -ne $true -or [string]::IsNullOrWhiteSpace([string]$runtime.rootDirectory)) {
    return $false
  }
  try {
    $runtimeRoot = [System.IO.Path]::GetFullPath([string]$runtime.rootDirectory).TrimEnd([char]92)
    return [System.String]::Equals($runtimeRoot, $project, [System.StringComparison]::OrdinalIgnoreCase)
  } catch {
    return $false
  }
}

$port = $null
for ($candidate = $portBase; $candidate -lt ($portBase + 20); $candidate++) {
  $runtime = Get-Runtime $candidate
  if (Test-SameProject $runtime) {
    $port = $candidate
    break
  }
  if (-not (Test-ListeningPort $candidate)) {
    $port = $candidate
    break
  }
}

if ($null -eq $port -or -not $node -or -not (Test-Path -LiteralPath $server)) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show("Khong the tim thay Node.js, server.mjs hoac cong trong khoang cho phep.", "SAOV Photobooth") | Out-Null
  exit 1
}

$url = "http://127.0.0.1:" + $port + "/"
$ready = Test-SameProject (Get-Runtime $port)

if (-not $ready) {
  $env:PORT = [string]$port
  $serverArgument = [char]34 + $server + [char]34
  Start-Process -FilePath $node -ArgumentList $serverArgument -WorkingDirectory $project -WindowStyle Hidden | Out-Null
  for ($i = 0; $i -lt 40 -and -not $ready; $i++) {
    Start-Sleep -Milliseconds 250
    $ready = Test-SameProject (Get-Runtime $port)
  }
}

if ($ready) {
  Start-Process $url
} else {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show(("Khong the khoi dong photobooth tai cong " + $port + ". Hay kiem tra Node.js va file server.mjs."), "SAOV Photobooth") | Out-Null
  exit 1
}
