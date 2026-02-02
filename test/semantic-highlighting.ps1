$apiKey = "REDACTED"
$headers = @{ "Authorization" = "Bearer $apiKey"; "Content-Type" = "application/json" }
$baseUrl = "https://vectorize-mcp-worker.fpl-test.workers.dev"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Semantic Highlighting Test" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Test 1: Receipt name search with highlighting
Write-Host "`n--- Test 1: Name Search with Highlighting ---" -ForegroundColor Green
$body = @{ 
    query = "BOBMANUEL CECILIA"
    topK = 1
    highlight = $true
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "$baseUrl/search?mode=v4&highlight=true" -Method Post -Headers $headers -Body $body

Write-Host "Query: $($result.query)" -ForegroundColor Yellow
Write-Host "Results found: $($result.results.Count)" -ForegroundColor Yellow
Write-Host "Route used: $($result.metadata.route)" -ForegroundColor Cyan

# Check first result
$firstResult = $result.results[0]
Write-Host "`nResult ID: $($firstResult.id)" -ForegroundColor Cyan
Write-Host "Score: $($firstResult.score)" -ForegroundColor Cyan

# Check for highlights property
if ($null -ne $firstResult.highlights) {
    $highlightCount = $firstResult.highlights.Count
    Write-Host "Highlights found: $highlightCount" -ForegroundColor Green
    
    if ($highlightCount -gt 0) {
        Write-Host "`n✅ HIGHLIGHTING WORKING!" -ForegroundColor Green
        foreach ($h in $firstResult.highlights) {
            Write-Host "  - Text: '$($h.text.Substring(0, [Math]::Min(50, $h.text.Length)))...'" -ForegroundColor White
            Write-Host "    Score: $($h.score)" -ForegroundColor Gray
        }
        
        # Show snippets if available
        if ($null -ne $firstResult.snippets -and $firstResult.snippets.Count -gt 0) {
            Write-Host "`nBest snippet:" -ForegroundColor Magenta
            Write-Host "  $($firstResult.snippets[0])" -ForegroundColor White
        }
    } else {
        Write-Host "`n⚠️  Highlights array is EMPTY" -ForegroundColor Yellow
        Write-Host "This means no sentences scored above threshold (0.5)" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n❌ NO HIGHLIGHTS PROPERTY" -ForegroundColor Red
}

# Check if highlightedContent differs from content
if ($null -ne $firstResult.highlightedContent) {
    $hasMarkTags = $firstResult.highlightedContent -match "<mark"
    if ($hasMarkTags) {
        Write-Host "`n✅ Content has <mark> tags!" -ForegroundColor Green
    } else {
        Write-Host "`n⚠️  highlightedContent exists but has no <mark> tags" -ForegroundColor Yellow
    }
}

# Test 2: Technical query
Write-Host "`n--- Test 2: Semantic Query ---" -ForegroundColor Green
$body = @{ 
    query = "Access Bank transaction successful"
    topK = 3
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "$baseUrl/search?mode=v4&highlight=true" -Method Post -Headers $headers -Body $body

Write-Host "Query: $($result.query)" -ForegroundColor Yellow
Write-Host "Route used: $($result.metadata.route)" -ForegroundColor Cyan

if ($result.results[0].highlights.Count -gt 0) {
    Write-Host "Highlights: $($result.results[0].highlights.Count)" -ForegroundColor Green
    Write-Host "First highlight score: $($result.results[0].highlights[0].score)" -ForegroundColor Gray
} else {
    Write-Host "⚠️  No highlights found (might be expected for this query)" -ForegroundColor Yellow
}

# Test 3: Without highlighting
Write-Host "`n--- Test 3: Without Highlighting (Performance) ---" -ForegroundColor Green
$body = @{ 
    query = "BOBMANUEL CECILIA"
    topK = 1
    highlight = $false
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "$baseUrl/search?mode=v4&highlight=false" -Method Post -Headers $headers -Body $body

Write-Host "Query: $($result.query)" -ForegroundColor Yellow
Write-Host "Total time: $($result.performance.totalTime)" -ForegroundColor Yellow

# Should NOT have highlights
if ($null -eq $result.results[0].highlights -or $result.results[0].highlights.Count -eq 0) {
    Write-Host "✅ Correctly skipped highlighting" -ForegroundColor Green
} else {
    Write-Host "⚠️  Highlighting ran even though highlight=false" -ForegroundColor Yellow
}

Write-Host "`n=========================================" -ForegroundColor Green
Write-Host "✅ Tests Complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green