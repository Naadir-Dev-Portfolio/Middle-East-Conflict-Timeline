param(
  [switch]$Probe,
  [switch]$OpenIfReady
)

$url = 'http://localhost:3000/'
$attempts = if ($Probe -or $OpenIfReady) { 1 } else { 90 }

for ($attempt = 0; $attempt -lt $attempts; $attempt++) {
  try {
    $page = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 3
    if ($page.StatusCode -eq 200 -and $page.Content -match '<title>Middle East Conflict Timeline') {
      if (-not $Probe) { Start-Process $url }
      exit 0
    }
  } catch {
  }
  Start-Sleep -Milliseconds 700
}

if ($Probe -or $OpenIfReady) { exit 1 }

Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show(
  'The timeline server did not become ready. Check the launcher window for the error.',
  'Conflict Timeline'
) | Out-Null
exit 1
