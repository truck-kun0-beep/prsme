# Phase 4.1 — launch the CDP browser WITHOUT --headless so external image
# hosts are reachable for the artwork-load verification.
$candidates = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$browser = $candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $browser) { Write-Output "no chromium browser found"; exit 1 }
$port = 9334
$userDataDir = "$env:TEMP\prsme-cdp-$port"
$argList = @(
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-features=msEdgeFirstRunExperience",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--remote-debugging-address=127.0.0.1",
  "--remote-debugging-port=$port",
  "--user-data-dir=$userDataDir",
  "about:blank"
)
Write-Output ("Launching (windowed) " + $browser)
Start-Process -FilePath $browser -ArgumentList $argList -WindowStyle Minimized