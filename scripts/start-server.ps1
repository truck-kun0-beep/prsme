$env:NEXT_TELEMETRY_DISABLED = "1"
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm.cmd","run","start" -WindowStyle Hidden -PassThru -RedirectStandardOutput "server.out.txt" -RedirectStandardError "server.err.txt"
Write-Output ("PID=" + $proc.Id)
