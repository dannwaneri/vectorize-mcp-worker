$apiKey = "REDACTED"
$headers = @{ "Authorization" = "Bearer $apiKey"; "Content-Type" = "application/json" }
$baseUrl = "https://vectorize-mcp-worker.fpl-test.workers.dev"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "V4 Route Performance Comparison" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# First, ingest test data
Write-Host "`nIngesting test data..." -ForegroundColor Yellow
$body = @{
    id = "python-docs"
    content = "Python numpy.array function creates arrays. Error 404 means not found. FPL Gameweek 17 starts January 5th."
    category = "docs"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$baseUrl/ingest" -Method Post -Headers $headers -Body $body

# Test 1: Entity Lookup (SQL Route)
Write-Host "`n--- Test 1: Entity Lookup ---" -ForegroundColor Green
Write-Host "Query: What is Haaland's player ID?"
Write-Host "Expected Route: SQL"
$body = @{ query = "What is Haaland player ID?" } | ConvertTo-Json
$result = Invoke-RestMethod -Uri "$baseUrl/search?mode=v4" -Method Post -Headers $headers -Body $body
Write-Host "Route: $($result.metadata.route)" -ForegroundColor Cyan
Write-Host "Route Time: $($result.metadata.routeTime)" -ForegroundColor Cyan
Write-Host "Total Time: $($result.performance.totalTime)" -ForegroundColor Cyan

# Test 2: Keyword Exact (BM25 Route)
Write-Host "`n--- Test 2: Keyword Exact ---" -ForegroundColor Green
Write-Host "Query: numpy.array"
Write-Host "Expected Route: BM25"
$body = @{ query = "numpy.array" } | ConvertTo-Json
$result = Invoke-RestMethod -Uri "$baseUrl/search?mode=v4" -Method Post -Headers $headers -Body $body
Write-Host "Route: $($result.metadata.route)" -ForegroundColor Cyan
Write-Host "Route Time: $($result.metadata.routeTime)" -ForegroundColor Cyan
Write-Host "Total Time: $($result.performance.totalTime)" -ForegroundColor Cyan

# Test 3: Semantic Search (Vector Route)
Write-Host "`n--- Test 3: Semantic Search ---" -ForegroundColor Green
Write-Host "Query: Players similar to Salah"
Write-Host "Expected Route: VECTOR"
$body = @{ query = "Players similar to Salah" } | ConvertTo-Json
$result = Invoke-RestMethod -Uri "$baseUrl/search?mode=v4" -Method Post -Headers $headers -Body $body
Write-Host "Route: $($result.metadata.route)" -ForegroundColor Cyan
Write-Host "Route Time: $($result.metadata.routeTime)" -ForegroundColor Cyan
Write-Host "Total Time: $($result.performance.totalTime)" -ForegroundColor Cyan

# Test 4: Graph Reasoning (Graph Route)
Write-Host "`n--- Test 4: Graph Reasoning ---" -ForegroundColor Green
Write-Host "Query: Who owns Liverpool players?"
Write-Host "Expected Route: GRAPH"
$body = @{ query = "Who owns Liverpool players?" } | ConvertTo-Json
$result = Invoke-RestMethod -Uri "$baseUrl/search?mode=v4" -Method Post -Headers $headers -Body $body
Write-Host "Route: $($result.metadata.route)" -ForegroundColor Cyan
Write-Host "Route Time: $($result.metadata.routeTime)" -ForegroundColor Cyan
Write-Host "Total Time: $($result.performance.totalTime)" -ForegroundColor Cyan

# Comparison V3 vs V4
Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "V3 vs V4 Performance Comparison" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Write-Host "`n--- V3 (Hybrid Search) ---" -ForegroundColor Yellow
$body = @{ query = "What is Haaland player ID?" } | ConvertTo-Json
$v3Result = Invoke-RestMethod -Uri "$baseUrl/search" -Method Post -Headers $headers -Body $body
Write-Host "Version: $($v3Result.version)"
Write-Host "Total Time: $($v3Result.performance.totalTime)"

Write-Host "`n--- V4 (SQL Route) ---" -ForegroundColor Yellow
$body = @{ query = "What is Haaland player ID?" } | ConvertTo-Json
$v4Result = Invoke-RestMethod -Uri "$baseUrl/search?mode=v4" -Method Post -Headers $headers -Body $body
Write-Host "Version: $($v4Result.version)"
Write-Host "Route: $($v4Result.metadata.route)"
Write-Host "Total Time: $($v4Result.performance.totalTime)"

Write-Host "`n=========================================" -ForegroundColor Green
Write-Host "✅ All Tests Complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green