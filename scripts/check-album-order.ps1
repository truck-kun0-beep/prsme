[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$r = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/media/search?kind=album&q=random+access+memories" -UseBasicParsing -TimeoutSec 30
$j = $r.Content | ConvertFrom-Json
$i = 0
foreach ($res in $j.results) {
  Write-Host ("$i  " + $res.title + " | " + $res.provider + " | cover=" + $(if ($res.coverUrl) { "yes" } else { "NULL" }))
  $i++
  if ($i -ge 6) { break }
}