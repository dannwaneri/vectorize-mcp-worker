$apiKey = "REDACTED"
$headers = @{ "Authorization" = "Bearer $apiKey"; "Content-Type" = "application/json" }
$baseUrl = "https://vectorize-mcp-worker.fpl-test.workers.dev"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Semantic Highlighting Performance Tests" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Test different query types and measure highlighting time
$tests = @(
    @{name="Short Query (1 word)"; query="CECILIA"},
    @{name="Medium Query (3 words)"; query="Access Bank transaction"},
    @{name="Long Query (10+ words)"; query="What is the transaction status for transfers from Access Bank to First Bank of Nigeria?"},
    @{name="Keyword-rich Query"; query="N30000 BOBMANUEL CECILIA transaction reference"},
    @{name="Semantic Query"; query="successful bank transfer receipt"}
)

$results = @()

foreach ($test in $tests) {
    Write-Host "`n--- $($test.name) ---" -ForegroundColor Green
    Write-Host "Query: '$($test.query)'" -ForegroundColor Yellow
    
    # With highlighting
    $body = @{ query = $test.query; topK = 3; highlight = $true } | ConvertTo-Json
    $startTime = Get-Date
    $result = Invoke-RestMethod -Uri "$baseUrl/search?mode=v4&highlight=true" -Method Post -Headers $headers -Body $body
    $totalTime = ((Get-Date) - $startTime).TotalMilliseconds
    
    $highlightTime = if ($result.performance.highlightingTime) { 
        [int]($result.performance.highlightingTime -replace 'ms','')
    } else { 0 }
    
    $routeTime = if ($result.performance.totalTime) {
        [int]($result.performance.totalTime -replace 'ms','')
    } else { 0 }
    
    Write-Host "Route time: $($routeTime)ms" -ForegroundColor Cyan
    Write-Host "Highlighting time: $($highlightTime)ms" -ForegroundColor Cyan
    Write-Host "Total time: $([int]$totalTime)ms" -ForegroundColor Cyan
    
    $highlightCount = if ($result.results[0].highlights) { $result.results[0].highlights.Count } else { 0 }
    Write-Host "Highlights: $highlightCount" -ForegroundColor White
    
    $results += @{
        query = $test.name
        routeTime = $routeTime
        highlightTime = $highlightTime
        totalTime = [int]$totalTime
        highlights = $highlightCount
    }
}

# Summary
Write-Host "`n=========================================" -ForegroundColor Green
Write-Host "Performance Summary" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

$avgHighlightTime = ($results | ForEach-Object { $_.highlightTime } | Measure-Object -Average).Average
$maxHighlightTime = ($results | ForEach-Object { $_.highlightTime } | Measure-Object -Maximum).Maximum
$minHighlightTime = ($results | ForEach-Object { $_.highlightTime } | Measure-Object -Minimum).Minimum

Write-Host "`nHighlighting Performance:" -ForegroundColor Cyan
Write-Host "  Average: $([int]$avgHighlightTime)ms" -ForegroundColor White
Write-Host "  Min: $([int]$minHighlightTime)ms" -ForegroundColor Green
Write-Host "  Max: $([int]$maxHighlightTime)ms" -ForegroundColor Yellow

if ($avgHighlightTime -lt 100) {
    Write-Host "`n✅ EXCELLENT! Average highlighting under 100ms target" -ForegroundColor Green
} elseif ($avgHighlightTime -lt 150) {
    Write-Host "`n✅ GOOD! Average highlighting under 150ms (acceptable)" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  Average highlighting above 150ms - needs optimization" -ForegroundColor Yellow
}

Write-Host "`nDetailed Results:" -ForegroundColor Cyan
$results | ForEach-Object {
    Write-Host "  $($_.query): $($_.highlightTime)ms (route: $($_.routeTime)ms, highlights: $($_.highlights))" -ForegroundColor White
}