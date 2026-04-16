# Prints TCP port info for SQLEXPRESS so you can set SQL_SERVER_TCP=127.0.0.1,<port> in .env
$root = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server'
if (-not (Test-Path $root)) {
  Write-Host 'No SQL Server registry root found.'
  exit 1
}
$found = $false
Get-ChildItem $root -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^MSSQL\d+\.SQLEXPRESS$' } | ForEach-Object {
  $tcpPath = Join-Path $_.PSPath 'MSSQLServer\SuperSocketNetLib\Tcp\IPAll'
  if (Test-Path $tcpPath) {
    $found = $true
    $p = Get-ItemProperty $tcpPath
    $dyn = $p.TcpDynamicPorts
    $static = $p.TcpPort
    Write-Host "Registry: $($_.PSChildName)"
    Write-Host "  TCP Dynamic Ports: $dyn"
    Write-Host "  TCP Port (static): $static"
    $port = if ($static -and [int]$static -gt 0) { $static } elseif ($dyn -and [int]$dyn -gt 0) { $dyn } else { '' }
    if ($port) {
      Write-Host ''
      Write-Host 'Add to your project .env (uncomment / merge with your file):'
      Write-Host "SQL_SERVER_TCP=127.0.0.1,$port"
    } else {
      Write-Host ''
      Write-Host 'Enable TCP/IP: SQL Server Configuration Manager -> Protocols for SQLEXPRESS -> TCP/IP -> Enabled, then restart SQL Server (SQLEXPRESS).'
    }
  }
}
if (-not $found) {
  Write-Host 'No MSSQL*.SQLEXPRESS key found. Is SQL Express installed?'
  exit 1
}
