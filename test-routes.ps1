$ErrorActionPreference = "Continue"
$baseUrl = "http://localhost:2323"

$serverJob = Start-Job -ScriptBlock {
    Set-Location "C:\Users\User\Desktop\vs code\The Fifth Element\app\Atelier\reserch\mailapi"
    node index.js
} -Name "mailapi-server"

Start-Sleep -Seconds 4

Write-Host "`n=== Testing Routes ===" -ForegroundColor Cyan

Write-Host "`n--- GET /keys ---" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "$baseUrl/keys" -Method Get -TimeoutSec 10
    $r | ConvertTo-Json -Depth 5
} catch { Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "`n--- GET /credits ---" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "$baseUrl/credits" -Method Get -TimeoutSec 10
    $r | ConvertTo-Json -Depth 5
} catch { Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "`n--- POST /add-key ---" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "$baseUrl/add-key?key=test-api-key-123&provider=scraperapi&label=test-key&monthlyCredits=1000" -Method Post -TimeoutSec 10
    $r | ConvertTo-Json -Depth 5
} catch { Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "`n--- GET /keys (after add) ---" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "$baseUrl/keys" -Method Get -TimeoutSec 10
    $r | ConvertTo-Json -Depth 5
} catch { Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "`n--- GET /generate ---" -ForegroundColor Yellow
try {
    $r = Invoke-RestMethod -Uri "$baseUrl/generate" -Method Get -TimeoutSec 30
    $r | ConvertTo-Json -Depth 5
} catch { Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red }

Write-Host "`n=== All Tests Complete ===" -ForegroundColor Cyan

Stop-Job -Name "mailapi-server" -ErrorAction SilentlyContinue
Remove-Job -Name "mailapi-server" -Force -ErrorAction SilentlyContinue