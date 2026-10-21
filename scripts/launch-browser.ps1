# Locate a Chromium browser by absolute path and launch it with CDP enabled.
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
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--remote-debugging-address=127.0.0.1",
  "--remote-debugging-port=$port",
  "--user-data-dir=$userDataDir",
  "about:blank"
)
Write-Output ("Launching " + $browser)
Start-Process -FilePath $browser -ArgumentList $argList -WindowStyle Hidden