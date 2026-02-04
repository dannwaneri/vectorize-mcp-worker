$apiKey = "REDACTED"
$headers = @{ "Authorization" = "Bearer $apiKey"; "Content-Type" = "application/json" }
$baseUrl = "https://vectorize-mcp-worker.fpl-test.workers.dev"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Cache Test with Multi-word Query" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$query = "Access Bank transaction"  # ✅ Better query

# First request
Write-Host "`n--- First Request ---" -ForegroundColor Yellow
$body = @{ query = $query; topK = 3; highlight = $true } | ConvertTo-Json

$startTime = Get-Date
$result1 = Invoke-RestMethod -Uri "$baseUrl/search?mode=v4&highlight=true" -Method Post -Headers $headers -Body $body
$time1 = ((Get-Date) - $startTime).TotalMilliseconds

$highlightTime1 = if ($result1.performance.highlightingTime) { 
    [int]($result1.performance.highlightingTime -replace 'ms','')
} else { 0 }

Write-Host "Highlighting time: $($highlightTime1)ms"
Write-Host "Total time: $([int]$time1)ms"
Write-Host "Highlights: $($result1.results[0].highlights.Count)" -ForegroundColor $(if ($result1.results[0].highlights.Count -gt 0) { "Green" } else { "Red" })

Start-Sleep -Seconds 2

# Second request (cached)
Write-Host "`n--- Second Request (Cached) ---" -ForegroundColor Yellow

$startTime = Get-Date
$result2 = Invoke-RestMethod -Uri "$baseUrl/search?mode=v4&highlight=true" -Method Post -Headers $headers -Body $body
$time2 = ((Get-Date) - $startTime).TotalMilliseconds

$highlightTime2 = if ($result2.performance.highlightingTime) { 
    [int]($result2.performance.highlightingTime -replace 'ms','')
} else { 0 }

Write-Host "Highlighting time: $($highlightTime2)ms"
Write-Host "Total time: $([int]$time2)ms"
Write-Host "Highlights: $($result2.results[0].highlights.Count)" -ForegroundColor $(if ($result2.results[0].highlights.Count -gt 0) { "Green" } else { "Red" })

# Summary
Write-Host "`n=========================================" -ForegroundColor Green
if ($highlightTime2 -lt $highlightTime1) {
    $improvement = [int](($highlightTime1 - $highlightTime2) / $highlightTime1 * 100)
    Write-Host "Cache improvement: $improvement%" -ForegroundColor Green
    
    if ($highlightTime2 -lt 50) {
        Write-Host "🎉 CACHED HIGHLIGHTING IS FAST!" -ForegroundColor Green
    }
}