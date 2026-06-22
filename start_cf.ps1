Remove-Item -Force api_tunnel.log -ErrorAction SilentlyContinue
Remove-Item -Force ui_tunnel.log -ErrorAction SilentlyContinue

Write-Host "Starting API Cloudflare Tunnel..."
Start-Process -NoNewWindow -FilePath "cloudflared" -ArgumentList "tunnel --url http://localhost:5143" -RedirectStandardError "api_tunnel.log"

# Wait for URL
$apiUrl = ""
for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path api_tunnel.log) {
        $content = Get-Content api_tunnel.log -Raw
        if ($content -match "(https://[a-zA-Z0-9-]+\.trycloudflare\.com)") {
            $apiUrl = $matches[1]
            break
        }
    }
}

if (-not $apiUrl) {
    Write-Host "Failed to get API Tunnel URL"
    exit 1
}

Write-Host "API Tunnel URL: $apiUrl"

Write-Host "Updating .env..."
$envPath = "PrivateCommPlatform.Ui\.env"
"VITE_API_URL=$apiUrl`nVITE_SIGNALR_URL=$apiUrl" | Set-Content $envPath

Write-Host "Starting Frontend Server..."
Set-Location PrivateCommPlatform.Ui
# Stop any node process on port 3000 just in case
netstat -ano | findstr :3000 | ForEach-Object { 
    $parts = $_ -split '\s+'
    if ($parts.Count -gt 4) {
        $pid = $parts[-1]
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
}

Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "run dev"
Set-Location ..

Write-Host "Starting UI Cloudflare Tunnel..."
Start-Process -NoNewWindow -FilePath "cloudflared" -ArgumentList "tunnel --url http://localhost:3000" -RedirectStandardError "ui_tunnel.log"

$uiUrl = ""
for ($i=0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path ui_tunnel.log) {
        $content = Get-Content ui_tunnel.log -Raw
        if ($content -match "(https://[a-zA-Z0-9-]+\.trycloudflare\.com)") {
            $uiUrl = $matches[1]
            break
        }
    }
}

if (-not $uiUrl) {
    Write-Host "Failed to get UI Tunnel URL"
    exit 1
}

Write-Host "UI Tunnel URL: $uiUrl"
Write-Host "SUCCESS"
