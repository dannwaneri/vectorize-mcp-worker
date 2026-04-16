export function getDashboardHTML(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vectorize MCP Worker - Dashboard</title>
<meta name="description" content="Hybrid RAG with Metadata Filtering, Multimodal Vision, and Intelligent Routing on Cloudflare Edge">
<link rel="icon" href="data:,">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Vectorize MCP Worker",
  "description": "Hybrid RAG with Metadata Filtering, Multimodal Vision, and Intelligent Routing on Cloudflare Edge",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Cloudflare Workers",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "author": { "@type": "Person", "name": "Daniel Nwaneri", "url": "https://github.com/dannwaneri" },
  "softwareVersion": "4.0",
  "url": "https://github.com/dannwaneri/vectorize-mcp-worker"
}
</script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#0f0f0f;color:#fff;min-height:100vh}
.container{max-width:860px;margin:0 auto;padding:32px 20px}
.header{margin-bottom:32px}
.header h1{font-size:2rem;font-weight:800;margin-bottom:8px}
.header p{color:#888;font-size:0.9rem}
.tabs{display:flex;border-bottom:1px solid #2a2a2a;margin-bottom:32px;overflow-x:auto}
.tab{padding:12px 20px;cursor:pointer;font-size:0.875rem;color:#666;border:none;background:none;position:relative;transition:color 0.2s;white-space:nowrap;flex-shrink:0}
.tab.active{color:#e05a4a}
.tab.active::after{content:'';position:absolute;bottom:-1px;left:0;right:0;height:2px;background:#e05a4a;border-radius:2px 2px 0 0}
.tab:hover{color:#fff}
.tab-content{display:none}
.tab-content.active{display:block}
.card{background:#1a1a1a;border:1px solid #262626;border-radius:12px;padding:24px;margin-bottom:16px}
.card-title{font-size:1.2rem;font-weight:700;margin-bottom:20px;color:#fff}
label{display:block;font-size:0.8rem;color:#888;margin-bottom:6px;font-weight:500}
input,textarea,select{width:100%;padding:12px 14px;background:#111;border:1px solid #262626;border-radius:8px;color:#fff;font-size:0.9rem;margin-bottom:12px;transition:border-color 0.2s}
input[type="file"]{padding:8px;cursor:pointer}
input:focus,textarea:focus,select:focus{outline:none;border-color:#e05a4a;box-shadow:0 0 0 3px rgba(224,90,74,0.1)}
input::placeholder,textarea::placeholder{color:#444}
textarea{resize:vertical;min-height:120px;font-family:inherit}
input[type="checkbox"]{width:auto;margin:0;accent-color:#e05a4a;cursor:pointer}
input[type="range"]{width:100%;accent-color:#e05a4a;margin-bottom:4px}
.btn{background:#e05a4a;color:#fff;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;font-size:0.9rem;font-weight:600;transition:background 0.2s;width:100%}
.btn:hover{background:#c94a3a}
.btn:disabled{background:#2a2a2a;color:#555;cursor:not-allowed}
.btn-secondary{background:none;border:1px solid #2a2a2a;color:#888;width:auto}
.btn-secondary:hover{border-color:#e05a4a;color:#e05a4a;background:none}
.btn-danger{background:none;border:1px solid #dc2626;color:#dc2626;width:auto}
.btn-danger:hover{background:#dc2626;color:#fff}
.btn-green{background:#059669;width:auto}
.btn-green:hover{background:#047857}
.flex-row{display:flex;gap:8px;margin-bottom:12px}
.flex-row input{flex:1;margin-bottom:0}
.flex-row .btn{flex-shrink:0;width:auto}
.stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.stat-card{background:#111;border:1px solid #262626;border-radius:10px;padding:16px;text-align:center}
.stat-value{font-size:1.8rem;font-weight:700;color:#e05a4a}
.stat-label{font-size:0.7rem;color:#555;margin-top:4px}
.search-options{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:12px;align-items:center}
.option-row{display:flex;align-items:center;gap:8px;font-size:0.85rem;color:#888}
.option-row label{margin:0;color:#888;cursor:pointer}
.option-row select{width:auto;margin-bottom:0;padding:6px 10px;font-size:0.85rem}
.results{margin-top:4px}
.result{background:#1a1a1a;border:1px solid #262626;border-radius:10px;padding:16px;margin-bottom:10px;border-left:3px solid #e05a4a}
.result-header{display:flex;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:4px;align-items:center}
.result-id{font-size:0.72rem;color:#555;word-break:break-all}
.result-score{font-size:0.72rem;color:#22c55e;font-weight:600}
.result-content{font-size:0.875rem;color:#ccc;line-height:1.6;word-break:break-word}
.result-category{display:inline-block;font-size:0.65rem;background:#e05a4a;color:#fff;padding:2px 8px;border-radius:4px;margin-top:6px}
.image-badge{background:#ea580c;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.7rem;font-weight:600;display:inline-block}
.cost-display{font-size:0.72rem;color:#22c55e;margin-top:4px}
.route-badge{display:inline-block;font-size:0.65rem;padding:2px 8px;border-radius:4px;font-weight:600;margin-left:6px}
.route-sql{background:#059669;color:#fff}
.route-bm25{background:#2563eb;color:#fff}
.route-vector{background:#7c3aed;color:#fff}
.route-graph{background:#d97706;color:#fff}
.route-vision{background:#db2777;color:#fff}
.route-ocr{background:#dc2626;color:#fff}
.highlight-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:#1e3a5f;color:#60a5fa;border-radius:12px;font-size:11px;font-weight:600;margin-left:8px}
.highlight-badge.high-score{background:#052e16;color:#4ade80}
.highlight-badge.medium-score{background:#1c1a07;color:#fbbf24}
.highlight-badge.low-score{background:#2d1515;color:#f87171}
.semantic-highlight{background:linear-gradient(120deg,#fef08a 0%,#fde047 100%);color:#000;padding:2px 4px;border-radius:3px;font-weight:500;transition:all 0.2s;cursor:help;position:relative}
.semantic-highlight:hover{background:linear-gradient(120deg,#fde047 0%,#facc15 100%);box-shadow:0 2px 4px rgba(0,0,0,0.3)}
.semantic-highlight[data-score^="0.9"],.semantic-highlight[data-score="1.00"]{background:linear-gradient(120deg,#86efac 0%,#4ade80 100%)}
.semantic-highlight[data-score^="0.8"]{background:linear-gradient(120deg,#bef264 0%,#a3e635 100%)}
.semantic-highlight[data-score^="0.6"]{background:linear-gradient(120deg,#fed7aa 0%,#fdba74 100%)}
.semantic-highlight[data-score^="0.5"]{background:linear-gradient(120deg,#fecaca 0%,#fca5a5 100%)}
.semantic-highlight::after{content:attr(data-score);position:absolute;bottom:100%;left:50%;transform:translateX(-50%) translateY(-4px);background:rgba(0,0,0,0.9);color:white;padding:4px 8px;border-radius:4px;font-size:11px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity 0.2s}
.semantic-highlight:hover::after{opacity:1}
.result-snippet{margin-top:8px;padding:8px 12px;background:#111;border-left:3px solid #3b82f6;border-radius:4px;font-size:0.8rem;color:#888;font-style:italic}
.snippet-label{font-size:11px;text-transform:uppercase;font-weight:600;color:#555;margin-bottom:4px}
.perf-card{background:#1a1a1a;border:1px solid #262626;border-radius:10px;padding:16px;margin-top:10px}
.perf-title{font-size:0.75rem;color:#666;margin-bottom:8px;display:flex;align-items:center}
.perf-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:8px}
.perf-item{font-size:0.8rem;color:#666}
.perf-item span{color:#22c55e;font-weight:600}
.log{font-size:0.8rem;color:#888;margin-top:12px;padding:14px;background:#111;border:1px solid #262626;border-radius:8px;max-height:140px;overflow-y:auto;font-family:monospace;line-height:1.6;word-break:break-word}
.success{color:#22c55e}
.error{color:#ef4444}
hr.divider{border:none;border-top:1px solid #1e1e1e;margin:4px 0 16px}
.demo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
.demo-btn{background:#111;border:1px solid #262626;color:#888;padding:10px 12px;border-radius:8px;cursor:pointer;font-size:0.8rem;transition:all 0.2s;text-align:left;line-height:1.5}
.demo-btn:hover{border-color:#e05a4a;color:#e05a4a}
.filter-panel{margin-top:12px;padding:16px;background:#111;border:1px solid #262626;border-radius:8px;display:none}
.filter-panel.open{display:block}
.filter-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.filter-group{display:flex;flex-direction:column;gap:4px}
.filter-group label{color:#666;font-size:0.75rem;font-weight:600;margin-bottom:0}
.filter-group input,.filter-group select{font-size:0.8rem;padding:8px 10px;margin-bottom:0}
.filter-active-badge{display:inline-block;background:#e05a4a;color:#fff;font-size:0.65rem;padding:1px 6px;border-radius:10px;margin-left:6px;vertical-align:middle}
.model-table{width:100%;border-collapse:collapse;font-size:0.8rem}
.model-table th{padding:8px 10px;text-align:left;font-weight:600;color:#666;border-bottom:1px solid #262626}
.model-table td{padding:8px 10px;border-bottom:1px solid #1e1e1e;color:#ccc}
.model-table td code{background:#222;padding:1px 4px;border-radius:3px;font-family:monospace;font-size:0.72rem;color:#a5b4fc}
.banner{padding:12px 16px;border-radius:10px;font-size:0.875rem;margin-bottom:16px}
.banner-info{background:#0c1a2e;color:#60a5fa;border:1px solid #1e3a5f}
.footer{text-align:center;padding:24px 16px;color:#444;font-size:0.78rem}
.footer a{color:#666;text-decoration:none}
.footer a:hover{color:#e05a4a}
.file-drop{border:2px dashed #2a2a2a;border-radius:8px;padding:20px;text-align:center;cursor:pointer;transition:all 0.2s;margin-bottom:12px;background:#111}
.file-drop:hover,.file-drop.drag-over{border-color:#e05a4a;background:#1a0f0e}
.file-drop input[type="file"]{display:none}
.file-drop-label{font-size:0.875rem;color:#666;display:block;margin-bottom:0;cursor:pointer}
.file-drop-label span{color:#e05a4a;font-weight:600}
.file-name-badge{display:inline-flex;align-items:center;gap:6px;background:#1a1a1a;border:1px solid #262626;border-radius:6px;padding:4px 10px;font-size:0.78rem;color:#ccc;margin-top:6px}
.or-divider{display:flex;align-items:center;gap:12px;margin:12px 0;color:#444;font-size:0.78rem}
.or-divider::before,.or-divider::after{content:'';flex:1;border-top:1px solid #262626}
/* Advanced / collapsible panels */
.adv-toggle{background:none;border:none;color:#666;font-size:0.78rem;cursor:pointer;padding:0;width:auto;display:flex;align-items:center;gap:4px;margin-bottom:12px}
.adv-toggle:hover{color:#e05a4a}
.adv-panel{background:#111;border:1px solid #262626;border-radius:8px;padding:14px;margin-bottom:12px;display:none}
.adv-panel.open{display:block}
.adv-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.adv-group label{color:#666;font-size:0.75rem;font-weight:600}
.adv-group input,.adv-group select{font-size:0.8rem;padding:8px 10px;margin-bottom:0}
/* Guide / checklist */
.check-list{display:flex;flex-direction:column;gap:10px;margin-bottom:20px}
.check-item{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#111;border:1px solid #262626;border-radius:8px;font-size:0.875rem}
.check-icon{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;flex-shrink:0;font-weight:700}
.check-ok{background:#052e16;color:#4ade80;border:1px solid #166534}
.check-fail{background:#2d1515;color:#f87171;border:1px solid #991b1b}
.check-pending{background:#222;color:#666;border:1px solid #333}
.check-label{flex:1;color:#ccc}
.check-desc{font-size:0.72rem;color:#555;margin-top:2px}
/* Code blocks */
.code-block{position:relative;background:#111;border:1px solid #262626;border-radius:8px;padding:14px 14px 14px 16px;margin-bottom:12px;font-family:monospace;font-size:0.82rem;color:#a5b4fc;line-height:1.7;overflow-x:auto;white-space:pre}
.code-copy{position:absolute;top:8px;right:8px;background:#222;border:1px solid #333;color:#666;border-radius:4px;padding:2px 8px;font-size:0.7rem;cursor:pointer;font-family:system-ui}
.code-copy:hover{background:#333;color:#ccc}
/* Guide steps */
.guide-step{display:flex;gap:14px;margin-bottom:20px}
.step-num{width:28px;height:28px;border-radius:50%;background:#e05a4a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;flex-shrink:0;margin-top:2px}
.step-body{flex:1}
.step-title{font-weight:600;color:#fff;margin-bottom:8px;font-size:0.95rem}
.step-note{font-size:0.78rem;color:#666;margin-top:6px;line-height:1.5}
/* License management */
.license-tabs{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
.license-tab{background:#111;border:1px solid #262626;color:#666;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:0.8rem;transition:all 0.2s}
.license-tab.active{border-color:#e05a4a;color:#e05a4a}
.license-panel{display:none}
.license-panel.active{display:block}
/* Confirm dialog overlay */
.confirm-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;align-items:center;justify-content:center}
.confirm-overlay.open{display:flex}
.confirm-box{background:#1a1a1a;border:1px solid #262626;border-radius:12px;padding:24px;max-width:380px;width:90%}
.confirm-box h3{margin-bottom:10px;color:#fff}
.confirm-box p{font-size:0.875rem;color:#888;margin-bottom:20px;line-height:1.5}
.confirm-actions{display:flex;gap:8px}
.confirm-actions .btn{flex:1}
@media(max-width:640px){
  .container{padding:16px 12px}
  .header h1{font-size:1.4rem}
  .header p{font-size:0.8rem}
  .tab{padding:10px 12px;font-size:0.8rem}
  .card{padding:16px}
  .card-title{font-size:1.05rem;margin-bottom:14px}
  .demo-grid{grid-template-columns:1fr}
  .filter-grid{grid-template-columns:1fr}
  .adv-grid{grid-template-columns:1fr}
  .perf-grid{grid-template-columns:1fr}
  .search-options{flex-direction:column;align-items:flex-start;gap:10px}
  .flex-row{flex-direction:column}
  .flex-row .btn{width:100%}
  .stats-row{gap:8px}
  .stat-value{font-size:1.4rem}
  .stat-card{padding:12px 8px}
  .guide-step{flex-direction:column;gap:8px}
}
@media(max-width:400px){
  .stats-row{grid-template-columns:repeat(3,1fr)}
  .stat-value{font-size:1.1rem}
  .stat-label{font-size:0.62rem}
}
</style>
</head>
<body>
<div class="container">

<div class="header">
  <h1>&#129504; Vectorize MCP Worker</h1>
  <p>Hybrid RAG &middot; Metadata Filtering &middot; Multimodal Vision &middot; Cloudflare Edge</p>
</div>

<div class="tabs">
  <button class="tab active" data-tab="search" onclick="switchTab('search')">&#128269; Search</button>
  <button class="tab" data-tab="ingest" onclick="switchTab('ingest')">&#128229; Ingest</button>
  <button class="tab" data-tab="setup" onclick="switchTab('setup')">&#9881;&#65039; Setup</button>
  <button class="tab" data-tab="guide" onclick="switchTab('guide')">&#128218; Guide</button>
</div>

<!-- ========== SEARCH TAB ========== -->
<div class="tab-content active" id="tab-search">
  <div class="card">
    <h2 class="card-title">Query Your Knowledge</h2>
    <div class="flex-row">
      <input type="text" id="searchQuery" placeholder="Ask anything about your documents or images...">
      <button class="btn" id="searchBtn" onclick="search()" style="width:auto;padding:12px 24px;flex-shrink:0">&#128269; Search</button>
    </div>
    <div class="search-options">
      <div class="option-row">
        <label>Top</label>
        <select id="topK">
          <option value="3">3</option>
          <option value="5" selected>5</option>
          <option value="10">10</option>
          <option value="25">25</option>
          <option value="50">50</option>
        </select>
      </div>
      <div class="option-row">
        <input type="checkbox" id="useRerank" checked>
        <label for="useRerank">Reranker</label>
      </div>
      <div class="option-row">
        <input type="checkbox" id="useHighlighting" checked>
        <label for="useHighlighting">Highlights <span style="font-size:11px;color:#444">(cached 60s)</span></label>
      </div>
    </div>
    <div id="highlightControls" style="margin-bottom:12px;padding:12px 14px;background:#111;border:1px solid #262626;border-radius:8px;display:none">
      <label style="font-size:12px;color:#666;display:block;margin-bottom:6px">Similarity Threshold: <span id="thresholdValue" style="color:#e05a4a;font-weight:600">0.75</span></label>
      <input type="range" id="highlightThreshold" min="0.5" max="0.9" step="0.05" value="0.75">
      <div style="font-size:11px;color:#444;margin-top:2px">Lower = more highlights &nbsp;&bull;&nbsp; Higher = fewer but more relevant</div>
    </div>
    <button type="button" class="btn btn-secondary" id="filterToggleBtn" onclick="toggleFilters()" style="padding:8px 16px;font-size:0.8rem;margin-bottom:0">&#9660; Filters</button>
    <div class="filter-panel" id="filterPanel">
      <div class="filter-grid">
        <div class="filter-group">
          <label>Source Type</label>
          <select id="f_source_type">
            <option value="">(any)</option>
            <option value="text">text</option>
            <option value="pdf">pdf</option>
            <option value="image">image</option>
            <option value="audio">audio</option>
            <option value="video">video</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Category</label>
          <input type="text" id="f_category" placeholder="e.g. finance">
        </div>
        <div class="filter-group">
          <label>Tags (comma-separated)</label>
          <input type="text" id="f_tags" placeholder="e.g. finance,q1">
        </div>
        <div class="filter-group">
          <label>Tenant ID</label>
          <input type="text" id="f_tenant_id" placeholder="e.g. acme">
        </div>
        <div class="filter-group">
          <label>MIME Type</label>
          <select id="f_mime_type">
            <option value="">(any)</option>
            <option value="text/plain">text/plain</option>
            <option value="application/pdf">application/pdf</option>
            <option value="image/png">image/png</option>
            <option value="image/jpeg">image/jpeg</option>
            <option value="image/webp">image/webp</option>
          </select>
        </div>
        <div class="filter-group">
          <label>File Name</label>
          <input type="text" id="f_file_name" placeholder="e.g. report.pdf">
        </div>
        <div class="filter-group" style="grid-column:span 2">
          <label>Date Created &mdash; From / To</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <input type="date" id="f_date_from" style="margin-bottom:0">
            <input type="date" id="f_date_to" style="margin-bottom:0">
          </div>
        </div>
      </div>
      <button type="button" onclick="clearFilters()" class="btn btn-secondary" style="padding:6px 14px;font-size:0.8rem;margin-top:12px">Clear Filters</button>
    </div>
  </div>

  <!-- Intent Classifier Debug -->
  <div class="card" style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="toggleIntentPanel()">
      <h2 class="card-title" style="margin-bottom:0;font-size:1rem;color:#888">&#129517; Debug: Test Intent Routing</h2>
      <button class="btn btn-secondary" id="intentToggleBtn" style="padding:4px 12px;font-size:0.75rem">&#9660; Show</button>
    </div>
    <div id="intentPanel" style="display:none;margin-top:16px">
      <p style="font-size:0.8rem;color:#555;margin-bottom:12px">See which V4 route your query would be sent to before running a full search.</p>
      <div class="flex-row">
        <input type="text" id="intentQuery" placeholder="e.g. What are my Q1 sales figures?">
        <button class="btn" onclick="classifyIntent()" style="width:auto;padding:12px 20px;flex-shrink:0">Classify</button>
      </div>
      <div id="intentResult" style="display:none;padding:14px;background:#111;border:1px solid #262626;border-radius:8px;font-size:0.85rem;line-height:1.6"></div>
    </div>
  </div>

  <div id="searchResults" class="results"></div>
  <div id="searchPerf" class="perf-card" style="display:none"></div>
</div>

<!-- ========== INGEST TAB ========== -->
<div class="tab-content" id="tab-ingest">
  <div class="card">
    <h2 class="card-title">&#127919; Try Demo Features</h2>
    <p style="color:#666;font-size:0.875rem;margin-bottom:16px">Explore hybrid retrieval, metadata filtering, and multimodal results with one click</p>
    <div class="demo-grid">
      <button class="demo-btn" onclick="switchTab('search');searchImages()">&#128444;&#65039; Multimodal<br><span style="color:#555;font-size:0.75rem">"dashboard navigation"</span></button>
      <button class="demo-btn" onclick="switchTab('search');searchFiltered()">&#128269; Filtered Search<br><span style="color:#555;font-size:0.75rem">source_type = image</span></button>
      <button class="demo-btn" onclick="switchTab('search');searchFinancial()">&#128179; OCR Query<br><span style="color:#555;font-size:0.75rem">"Access Bank transaction"</span></button>
    </div>
    <div id="demoLog" class="log" style="display:none"></div>
  </div>

  <hr class="divider">

  <!-- Ingest Document -->
  <div class="card">
    <h2 class="card-title">&#128196; Ingest Document</h2>
    <label>Document ID</label>
    <input type="text" id="docId" placeholder="my-article-001">
    <label>Category <span style="color:#555;font-weight:400">(optional)</span></label>
    <input type="text" id="docCategory" placeholder="e.g., docs, articles, notes">
    <label>Upload File <span style="color:#555;font-weight:400">(.txt, .md, .csv, .json)</span></label>
    <div class="file-drop" id="docFileDrop" onclick="document.getElementById('docFile').click()" ondragover="handleDocDragOver(event)" ondragleave="handleDocDragLeave(event)" ondrop="handleDocDrop(event)">
      <input type="file" id="docFile" accept=".txt,.md,.csv,.json" onchange="handleDocFile(event)">
      <label class="file-drop-label">&#128196; Drop a file here or <span>browse</span></label>
      <div id="docFileName" style="display:none" class="file-name-badge">&#128196; <span id="docFileNameText"></span> <button onclick="clearDocFile(event)" style="background:none;border:none;color:#666;cursor:pointer;padding:0;width:auto;font-size:0.9rem;line-height:1">&#10005;</button></div>
    </div>
    <div class="or-divider">or paste text</div>
    <textarea id="docContent" placeholder="Paste any text — articles, docs, notes. It will be automatically chunked and indexed..."></textarea>

    <!-- Advanced metadata -->
    <button class="adv-toggle" onclick="toggleAdv('docAdv',this)">&#9660; Advanced metadata</button>
    <div class="adv-panel" id="docAdv">
      <div class="adv-grid">
        <div class="adv-group">
          <label>Title</label>
          <input type="text" id="docTitle" placeholder="e.g. Q1 Sales Report">
        </div>
        <div class="adv-group">
          <label>Source Type</label>
          <select id="docSourceType">
            <option value="">auto</option>
            <option value="text">text</option>
            <option value="pdf">pdf</option>
            <option value="audio">audio</option>
            <option value="video">video</option>
          </select>
        </div>
        <div class="adv-group">
          <label>Tags <span style="color:#555;font-weight:400">(comma-separated)</span></label>
          <input type="text" id="docTags" placeholder="finance,q1,report">
        </div>
        <div class="adv-group">
          <label>MIME Type</label>
          <input type="text" id="docMimeType" placeholder="text/plain">
        </div>
        <div class="adv-group">
          <label>File Name</label>
          <input type="text" id="docMetaFileName" placeholder="report.txt">
        </div>
        <div class="adv-group">
          <label>Tenant ID</label>
          <input type="text" id="docTenantId" placeholder="acme">
        </div>
      </div>
    </div>

    <button class="btn" onclick="ingestDoc()">Ingest Document</button>
    <div id="ingestLog" class="log" style="display:none"></div>
  </div>

  <hr class="divider">

  <!-- Ingest Image -->
  <div class="card">
    <h2 class="card-title">&#128248; Ingest Image</h2>
    <label>Image ID</label>
    <input type="text" id="imageId" placeholder="receipt-001">
    <label>Category <span style="color:#555;font-weight:400">(optional)</span></label>
    <input type="text" id="imageCategory" placeholder="e.g., receipts, screenshots, diagrams">
    <label>Image Type</label>
    <select id="imageType">
      <option value="auto">Auto-detect</option>
      <option value="screenshot">Screenshot</option>
      <option value="document">Scanned Document / OCR</option>
      <option value="diagram">Diagram / Chart</option>
      <option value="photo">Photo</option>
    </select>
    <label>Upload Image</label>
    <input type="file" id="imageFile" accept="image/*">
    <button class="btn" onclick="ingestImage()">Ingest Image</button>
    <div id="imageLog" class="log" style="display:none"></div>
  </div>

  <hr class="divider">

  <!-- Find Similar Images -->
  <div class="card">
    <h2 class="card-title">&#128270; Find Similar Images</h2>
    <p style="color:#666;font-size:0.875rem;margin-bottom:16px">Upload an image to find visually similar ones already in your knowledge base.</p>
    <label>Upload Query Image</label>
    <input type="file" id="similarImageFile" accept="image/*">
    <div class="option-row" style="margin-bottom:12px">
      <label style="margin:0">Top results</label>
      <select id="similarTopK" style="width:auto;margin:0;padding:6px 10px;font-size:0.85rem">
        <option value="3">3</option>
        <option value="5" selected>5</option>
        <option value="10">10</option>
      </select>
    </div>
    <button class="btn" onclick="findSimilarImages()">Find Similar</button>
    <div id="similarLog" class="log" style="display:none"></div>
    <div id="similarResults" class="results"></div>
  </div>

  <hr class="divider">

  <!-- Delete Document -->
  <div class="card">
    <h2 class="card-title" style="color:#f87171">&#128465;&#65039; Delete Document</h2>
    <p style="color:#666;font-size:0.875rem;margin-bottom:14px">Permanently removes a document and all its chunks from the index and database.</p>
    <label>Document ID</label>
    <div class="flex-row">
      <input type="text" id="deleteDocId" placeholder="my-article-001">
      <button class="btn btn-danger" onclick="openDeleteConfirm()" style="flex-shrink:0">Delete</button>
    </div>
    <div id="deleteLog" class="log" style="display:none"></div>
  </div>
</div>

<!-- ========== SETUP TAB ========== -->
<div class="tab-content" id="tab-setup">

  <!-- Index Stats -->
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 class="card-title" style="margin-bottom:0">&#128202; Index Stats</h2>
      <button class="btn btn-secondary" onclick="loadStats()" style="padding:8px 16px;font-size:0.8rem">Refresh</button>
    </div>
    <div style="font-size:0.75rem;color:#22c55e;margin-bottom:16px;display:flex;align-items:center;gap:6px">
      <span style="display:inline-block;width:8px;height:8px;background:#22c55e;border-radius:50%"></span>
      Live on Cloudflare Edge &nbsp;&bull;&nbsp; <span style="color:#555">Metadata filtering enabled</span>
    </div>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-value" id="vectorCount">&#8212;</div><div class="stat-label">Vectors</div></div>
      <div class="stat-card"><div class="stat-value" id="docCount">&#8212;</div><div class="stat-label">Documents</div></div>
      <div class="stat-card"><div class="stat-value" id="dimensions">&#8212;</div><div class="stat-label">Dimensions</div></div>
    </div>
  </div>

  <!-- Query Analytics -->
  <div class="card" id="analyticsSection">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 class="card-title" style="margin-bottom:0">&#128270; Query Analytics</h2>
      <span id="analyticsQueryCount" style="font-size:0.78rem;color:#555">&#8212;</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
      <div class="stat-card">
        <div id="analyticsAvgLatency" style="font-size:1.4rem;font-weight:700;color:#fff">&#8212;</div>
        <div style="font-size:0.7rem;color:#555;margin-top:4px">Avg latency (ms)</div>
      </div>
      <div class="stat-card">
        <div id="analyticsCacheRate" style="font-size:1.4rem;font-weight:700;color:#22c55e">&#8212;</div>
        <div style="font-size:0.7rem;color:#555;margin-top:4px">Cache hit rate</div>
      </div>
      <div class="stat-card">
        <div id="analyticsTotalQueries" style="font-size:1.4rem;font-weight:700;color:#e05a4a">&#8212;</div>
        <div style="font-size:0.7rem;color:#555;margin-top:4px">Total queries</div>
      </div>
    </div>
    <div id="analyticsTopFilters" style="display:none;margin-bottom:16px">
      <div style="font-size:0.75rem;font-weight:600;color:#666;margin-bottom:8px">Top filters used</div>
      <div id="analyticsTopFiltersList" style="display:flex;flex-wrap:wrap;gap:6px"></div>
    </div>
    <div>
      <div style="font-size:0.75rem;font-weight:600;color:#666;margin-bottom:10px">Recent queries (last 10)</div>
      <div id="analyticsRecentQueries" style="font-size:0.78rem;color:#555">No queries yet &mdash; run a search to see analytics.</div>
    </div>
  </div>

  <!-- Cost Calculator -->
  <div class="card">
    <h2 class="card-title">&#128176; Cost Calculator</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <label>Queries per Day</label>
        <input type="number" id="queriesPerDay" value="1000" min="100" max="100000">
        <button class="btn" onclick="loadCostAnalytics()">Calculate</button>
      </div>
      <div id="costResults" style="background:#111;border:1px solid #262626;border-radius:8px;padding:16px">
        <div style="font-size:0.75rem;color:#555;margin-bottom:8px">Monthly Cost Projection</div>
        <div id="costProjection" style="color:#555;font-size:0.875rem">Click &ldquo;Calculate&rdquo; to see projection</div>
      </div>
    </div>
    <div id="costBreakdown" style="display:none;margin-top:16px"></div>
  </div>

  <div id="ghBanner" class="banner banner-info" style="display:flex;justify-content:space-between;align-items:center">
    <a href="https://github.com/dannwaneri/vectorize-mcp-worker" target="_blank" style="color:#60a5fa;text-decoration:none;font-weight:500">&#11088; Star on GitHub &mdash; Help spread the word!</a>
    <button onclick="document.getElementById('ghBanner').style.display='none'" style="background:none;border:none;color:#555;cursor:pointer;font-size:1rem;width:auto;padding:0;line-height:1">&#10005;</button>
  </div>

  <div class="card">
    <h2 class="card-title">&#128273; Authentication</h2>
    <label>API Key <span style="color:#555;font-weight:400">(required for protected endpoints)</span></label>
    <div class="flex-row">
      <input type="password" id="apiKey" placeholder="Enter your API key">
      <button class="btn" onclick="testAuth()" style="width:auto;padding:12px 20px;flex-shrink:0">Test</button>
    </div>
    <div id="authStatus" class="log" style="display:none"></div>
    <div id="tenantBadge" style="display:none;margin-top:10px;padding:10px 14px;background:#0c1a2e;border:1px solid #1e3a5f;border-radius:8px;font-size:0.8rem;color:#a5b4fc">
      <strong>Tenant:</strong> <span id="tenantName" style="font-family:monospace"></span>
      <span id="adminBadge" style="display:none;background:#e05a4a;color:#fff;padding:1px 6px;border-radius:4px;font-size:0.7rem;margin-left:6px">ADMIN</span>
    </div>
  </div>

  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 class="card-title" style="margin-bottom:0">&#128640; Intelligent Routing (V4)</h2>
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0;font-size:0.9rem;color:#888">
        <input type="checkbox" id="useV4Mode" style="width:auto;margin:0">
        Enable
      </label>
    </div>
    <div id="v4Info" style="display:none">
      <p style="font-size:0.875rem;color:#666;margin-bottom:14px">Intelligent query routing based on intent classification</p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
        <div class="stat-card"><div style="font-size:0.7rem;color:#555">SQL Route</div><div style="font-size:1.1rem;font-weight:700;color:#22c55e;margin-top:4px">~45ms</div></div>
        <div class="stat-card"><div style="font-size:0.7rem;color:#555">BM25 Route</div><div style="font-size:1.1rem;font-weight:700;color:#22c55e;margin-top:4px">~50ms</div></div>
        <div class="stat-card"><div style="font-size:0.7rem;color:#555">Cost Savings</div><div style="font-size:1.1rem;font-weight:700;color:#22c55e;margin-top:4px">88%</div></div>
      </div>
    </div>
  </div>

  <div class="card" id="modelsPanel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 class="card-title" style="margin-bottom:0">&#129302; AI Models</h2>
      <button onclick="toggleModelsPanel()" id="modelsPanelToggle" class="btn btn-secondary" style="padding:6px 14px;font-size:0.78rem">&#9660; Details</button>
    </div>
    <div id="modelsPanelBody" style="display:none">
      <div id="activeModelBanner" style="padding:10px 14px;background:#0c1a2e;border:1px solid #1e3a5f;border-radius:8px;font-size:0.8rem;color:#a5b4fc;margin-bottom:16px">Loading active model...</div>
      <table class="model-table">
        <thead><tr><th>Key</th><th>Model</th><th>Dims</th><th>Note</th></tr></thead>
        <tbody id="embeddingModelRows">
          <tr><td><code>bge-small</code></td><td><code>@cf/baai/bge-small-en-v1.5</code></td><td>384</td><td style="color:#666">Default. Fast, backward-compatible.</td></tr>
          <tr><td><code>bge-m3</code></td><td><code>@cf/baai/bge-m3</code></td><td>1024</td><td style="color:#666">Multilingual. Needs 1024d index.</td></tr>
          <tr><td><code>qwen3-0.6b</code></td><td><code>@cf/qwen/qwen3-embedding-0.6b</code></td><td>1024</td><td style="color:#e05a4a;font-weight:600">&#9733; Best 2026. Needs 1024d index.</td></tr>
        </tbody>
      </table>
      <div style="margin-top:12px;padding:10px 14px;background:#111;border-left:3px solid #e05a4a;border-radius:4px;font-size:0.75rem;color:#666;line-height:1.6">
        <strong style="color:#ccc">To switch model:</strong> create a new 1024d Vectorize index, update
        <code style="background:#222;padding:1px 4px;border-radius:3px;color:#a5b4fc">wrangler.toml</code> with
        <code style="background:#222;padding:1px 4px;border-radius:3px;color:#a5b4fc">EMBEDDING_MODEL = "qwen3-0.6b"</code>, then re-ingest all documents.
      </div>
    </div>
  </div>

  <!-- License Management -->
  <div class="card">
    <h2 class="card-title">&#128203; License Management</h2>
    <div class="license-tabs">
      <button class="license-tab active" onclick="switchLicenseTab('validate',this)">Validate</button>
      <button class="license-tab" onclick="switchLicenseTab('create',this)">Create <span style="font-size:0.65rem;color:#e05a4a">(admin)</span></button>
      <button class="license-tab" onclick="switchLicenseTab('list',this)">List <span style="font-size:0.65rem;color:#e05a4a">(admin)</span></button>
      <button class="license-tab" onclick="switchLicenseTab('revoke',this)">Revoke <span style="font-size:0.65rem;color:#e05a4a">(admin)</span></button>
    </div>

    <div class="license-panel active" id="lp-validate">
      <label>License Key</label>
      <div class="flex-row">
        <input type="text" id="licenseKeyValidate" placeholder="LIC-XXXX-XXXX-XXXX">
        <button class="btn btn-green" onclick="validateLicense()" style="flex-shrink:0">Validate</button>
      </div>
      <div id="licenseValidateLog" class="log" style="display:none"></div>
    </div>

    <div class="license-panel" id="lp-create">
      <label>Email</label>
      <input type="email" id="licenseEmail" placeholder="user@example.com">
      <label>Plan</label>
      <select id="licensePlan">
        <option value="basic">Basic</option>
        <option value="pro">Pro</option>
        <option value="enterprise">Enterprise</option>
      </select>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label>Max Documents</label>
          <input type="number" id="licenseMaxDocs" value="1000" min="1">
        </div>
        <div>
          <label>Max Queries/Day</label>
          <input type="number" id="licenseMaxQueries" value="10000" min="1">
        </div>
      </div>
      <button class="btn btn-green" onclick="createLicense()">Create License</button>
      <div id="licenseCreateLog" class="log" style="display:none"></div>
    </div>

    <div class="license-panel" id="lp-list">
      <button class="btn" onclick="listLicenses()" style="margin-bottom:12px">Load All Licenses</button>
      <div id="licenseListLog" class="log" style="display:none"></div>
      <div id="licenseListResults" style="margin-top:8px"></div>
    </div>

    <div class="license-panel" id="lp-revoke">
      <label>License Key to Revoke</label>
      <div class="flex-row">
        <input type="text" id="licenseKeyRevoke" placeholder="LIC-XXXX-XXXX-XXXX">
        <button class="btn btn-danger" onclick="revokeLicense()" style="flex-shrink:0">Revoke</button>
      </div>
      <div id="licenseRevokeLog" class="log" style="display:none"></div>
    </div>
  </div>
</div>

<!-- ========== GUIDE TAB ========== -->
<div class="tab-content" id="tab-guide">
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 class="card-title" style="margin-bottom:0">&#9989; Setup Status</h2>
      <button class="btn btn-secondary" onclick="checkSetupStatus()" style="padding:8px 16px;font-size:0.8rem">Run Check</button>
    </div>
    <div class="check-list" id="setupChecklist">
      <div class="check-item"><div class="check-icon check-pending" id="chk-api-icon">?</div><div><div class="check-label">API Key</div><div class="check-desc" id="chk-api-desc">Click &ldquo;Run Check&rdquo; to verify</div></div></div>
      <div class="check-item"><div class="check-icon check-pending" id="chk-vectorize-icon">?</div><div><div class="check-label">Vectorize Index</div><div class="check-desc" id="chk-vectorize-desc">Click &ldquo;Run Check&rdquo; to verify</div></div></div>
      <div class="check-item"><div class="check-icon check-pending" id="chk-d1-icon">?</div><div><div class="check-label">D1 Database</div><div class="check-desc" id="chk-d1-desc">Click &ldquo;Run Check&rdquo; to verify</div></div></div>
      <div class="check-item"><div class="check-icon check-pending" id="chk-ai-icon">?</div><div><div class="check-label">Workers AI Binding</div><div class="check-desc" id="chk-ai-desc">Click &ldquo;Run Check&rdquo; to verify</div></div></div>
    </div>
  </div>

  <div class="card">
    <h2 class="card-title">&#128295; Setup Your Own Instance</h2>

    <div class="guide-step">
      <div class="step-num">1</div>
      <div class="step-body">
        <div class="step-title">Clone the repository</div>
        <div id="cb1" class="code-block">git clone https://github.com/dannwaneri/vectorize-mcp-worker.git
cd vectorize-mcp-worker
npm install<button class="code-copy" onclick="copyCode('cb1')">copy</button></div>
      </div>
    </div>

    <div class="guide-step">
      <div class="step-num">2</div>
      <div class="step-body">
        <div class="step-title">Create Cloudflare resources</div>
        <div id="cb2" class="code-block"># Create Vectorize index (384d for default model)
wrangler vectorize create mcp-knowledge-base --dimensions=384 --metric=cosine

# Create D1 database
wrangler d1 create mcp-knowledge-db<button class="code-copy" onclick="copyCode('cb2')">copy</button></div>
        <div class="step-note">Copy the <code style="background:#222;color:#a5b4fc;padding:1px 4px;border-radius:3px">database_id</code> from the D1 output and paste it into your <code style="background:#222;color:#a5b4fc;padding:1px 4px;border-radius:3px">wrangler.toml</code>.</div>
      </div>
    </div>

    <div class="guide-step">
      <div class="step-num">3</div>
      <div class="step-body">
        <div class="step-title">Run database migrations</div>
        <div id="cb3" class="code-block">wrangler d1 execute mcp-knowledge-db --file=./schema.sql<button class="code-copy" onclick="copyCode('cb3')">copy</button></div>
      </div>
    </div>

    <div class="guide-step">
      <div class="step-num">4</div>
      <div class="step-body">
        <div class="step-title">Set your API key secret</div>
        <div id="cb4" class="code-block">wrangler secret put API_KEY
# Enter a strong random key when prompted
# Generate one: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"<button class="code-copy" onclick="copyCode('cb4')">copy</button></div>
      </div>
    </div>

    <div class="guide-step">
      <div class="step-num">5</div>
      <div class="step-body">
        <div class="step-title">Deploy</div>
        <div id="cb5" class="code-block">wrangler deploy<button class="code-copy" onclick="copyCode('cb5')">copy</button></div>
        <div class="step-note">Your worker will be live at <code style="background:#222;color:#a5b4fc;padding:1px 4px;border-radius:3px">https://&lt;worker-name&gt;.&lt;subdomain&gt;.workers.dev</code></div>
      </div>
    </div>

    <div class="guide-step">
      <div class="step-num">6</div>
      <div class="step-body">
        <div class="step-title">First ingest &amp; search</div>
        <div class="step-note" style="color:#888;font-size:0.875rem">
          1. Go to <strong style="color:#fff">Ingest</strong> &rarr; paste any text into the Document form &rarr; click <strong style="color:#e05a4a">Ingest Document</strong><br>
          2. Go to <strong style="color:#fff">Search</strong> &rarr; ask a question about the text &rarr; results appear below
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <h2 class="card-title">&#128101; Connect via MCP (Claude Desktop / Cursor)</h2>
    <p style="font-size:0.875rem;color:#666;margin-bottom:14px">Add this to your Claude Desktop or Cursor MCP config to use this worker as a knowledge tool.</p>
    <div id="cb6" class="code-block">{
  "mcpServers": {
    "vectorize": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://&lt;your-worker&gt;.workers.dev/mcp",
        "--header",
        "Authorization: Bearer YOUR_API_KEY"
      ]
    }
  }
}<button class="code-copy" onclick="copyCode('cb6')">copy</button></div>
    <div class="step-note" style="margin-top:8px">Replace <code style="background:#222;color:#a5b4fc;padding:1px 4px;border-radius:3px">&lt;your-worker&gt;</code> with your actual worker subdomain and <code style="background:#222;color:#a5b4fc;padding:1px 4px;border-radius:3px">YOUR_API_KEY</code> with the secret you set in step 4.</div>
  </div>

  <div class="card">
    <h2 class="card-title">&#128279; Links</h2>
    <div style="display:flex;flex-direction:column;gap:10px">
      <a href="https://github.com/dannwaneri/vectorize-mcp-worker" target="_blank" style="color:#60a5fa;text-decoration:none;font-size:0.9rem;display:flex;align-items:center;gap:8px">&#128279; GitHub Repository</a>
      <a href="https://github.com/dannwaneri/vectorize-mcp-worker/blob/main/CHANGELOG.md" target="_blank" style="color:#60a5fa;text-decoration:none;font-size:0.9rem;display:flex;align-items:center;gap:8px">&#128196; Changelog</a>
      <a href="https://github.com/dannwaneri/vectorize-mcp-worker/issues" target="_blank" style="color:#60a5fa;text-decoration:none;font-size:0.9rem;display:flex;align-items:center;gap:8px">&#128030; Report an Issue</a>
      <a href="https://developers.cloudflare.com/vectorize/" target="_blank" style="color:#60a5fa;text-decoration:none;font-size:0.9rem;display:flex;align-items:center;gap:8px">&#9729;&#65039; Cloudflare Vectorize Docs</a>
    </div>
  </div>
</div>

<!-- Delete Confirm Dialog -->
<div class="confirm-overlay" id="deleteConfirmOverlay">
  <div class="confirm-box">
    <h3>&#128465;&#65039; Delete Document</h3>
    <p>This will permanently remove <strong id="deleteConfirmId" style="color:#f87171"></strong> and all its chunks from the index. This cannot be undone.</p>
    <div class="confirm-actions">
      <button class="btn btn-secondary" onclick="closeDeleteConfirm()">Cancel</button>
      <button class="btn btn-danger" onclick="deleteDoc()" style="background:#dc2626;color:#fff;border:none">Delete</button>
    </div>
  </div>
</div>

<div class="footer">
  &#9889; Powered by <a href="https://developers.cloudflare.com/workers/" target="_blank">Cloudflare Workers</a> +
  <a href="https://developers.cloudflare.com/vectorize/" target="_blank">Vectorize</a> +
  <a href="https://developers.cloudflare.com/d1/" target="_blank">D1</a> +
  <a href="https://developers.cloudflare.com/workers-ai/" target="_blank">Llama 4 Scout Vision</a>
</div>
</div>

<script>
const API_BASE = '';
const getHeaders = () => {
  const h = {'Content-Type':'application/json'};
  const key = document.getElementById('apiKey').value;
  if(key) h['Authorization'] = 'Bearer ' + key;
  return h;
};

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('.tab[data-tab="' + tabName + '"]').classList.add('active');
  document.getElementById('tab-' + tabName).classList.add('active');
}

function switchLicenseTab(name, el) {
  document.querySelectorAll('.license-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.license-panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('lp-' + name).classList.add('active');
}

function toggleIntentPanel() {
  const panel = document.getElementById('intentPanel');
  const btn = document.getElementById('intentToggleBtn');
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : 'block';
  btn.innerHTML = open ? '&#9660; Show' : '&#9650; Hide';
}

function toggleAdv(id, btn) {
  const panel = document.getElementById(id);
  const open = panel.classList.toggle('open');
  btn.innerHTML = (open ? '&#9650;' : '&#9660;') + ' Advanced metadata';
}

function copyCode(id) {
  const el = document.getElementById(id);
  const text = el.innerText.replace(/copy$/, '').trim();
  navigator.clipboard.writeText(text).then(() => {
    const btn = el.querySelector('.code-copy');
    btn.textContent = 'copied!';
    setTimeout(() => { btn.textContent = 'copy'; }, 1500);
  });
}

function openDeleteConfirm() {
  const id = document.getElementById('deleteDocId').value.trim();
  if (!id) { const log = document.getElementById('deleteLog'); log.style.display='block'; log.innerHTML='<span class="error">Enter a document ID</span>'; return; }
  document.getElementById('deleteConfirmId').textContent = id;
  document.getElementById('deleteConfirmOverlay').classList.add('open');
}
function closeDeleteConfirm() {
  document.getElementById('deleteConfirmOverlay').classList.remove('open');
}

async function compressImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.85) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width, height = img.height;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) { height = (height/width)*maxWidth; width = maxWidth; }
          else { width = (width/height)*maxHeight; height = maxHeight; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function testAuth(){
  const el = document.getElementById('authStatus');
  el.style.display = 'block'; el.innerHTML = 'Testing...';
  try {
    const r = await fetch(API_BASE + '/test', {headers: getHeaders()});
    const d = await r.json();
    const apiKey = document.getElementById('apiKey').value;
    const authStatus = apiKey ? '<span class="success">&#10003; Authenticated</span>' : '<span style="color:#fbbf24">&#9889; Server Online</span> (enter API key to access protected endpoints)';
    el.innerHTML = authStatus + ' | Mode: ' + d.mode + ' | Database: ' + (d.bindings.hasD1?'&#10003;':'&#10007;');
    const badge = document.getElementById('tenantBadge');
    const tenantName = document.getElementById('tenantName');
    const adminBadge = document.getElementById('adminBadge');
    if (d.multiTenancy && d.multiTenancy.enabled) {
      badge.style.display = 'block';
      if (d.multiTenancy.isAdmin) { tenantName.textContent = 'All tenants'; adminBadge.style.display = 'inline'; }
      else {
        tenantName.textContent = d.multiTenancy.tenant || '(unknown)'; adminBadge.style.display = 'none';
        const tf = document.getElementById('f_tenant_id');
        if (tf) { tf.value = d.multiTenancy.tenant || ''; tf.setAttribute('readonly','true'); tf.title = 'Locked to your tenant'; }
      }
    } else { badge.style.display = 'none'; }
  } catch(e) { el.innerHTML = '<span class="error">&#10007; ' + e.message + '</span>'; }
}

async function loadStats(){
  try {
    const r = await fetch(API_BASE + '/stats', {headers: getHeaders()});
    const d = await r.json();
    document.getElementById('vectorCount').textContent = d.index?.vectorsCount ?? d.index?.vectorCount ?? 0;
    document.getElementById('docCount').textContent = d.documents?.total_documents || 0;
    document.getElementById('dimensions').textContent = d.dimensions || 384;
    const banner = document.getElementById('activeModelBanner');
    if (banner && d.models) {
      const key = d.models.embeddingKey || 'bge-small';
      const modelId = d.models.embedding || '@cf/baai/bge-small-en-v1.5';
      const dims = d.models.embeddingDimensions || d.dimensions || 384;
      const isBest = key === 'qwen3-0.6b';
      banner.innerHTML = '<strong>Active embedding model:</strong> <code style="background:#1a1a2e;color:#a5b4fc;padding:1px 4px;border-radius:3px">' + key + '</code> &nbsp;&rarr;&nbsp; <span style="font-family:monospace;font-size:0.75rem;color:#a5b4fc">' + modelId + '</span> &nbsp;<span style="color:#666">(' + dims + 'd)</span>' + (isBest ? ' &nbsp;<span style="color:#e05a4a;font-weight:700">&#9733; Best 2026</span>' : '');
    }
    const a = d.analytics;
    if (a) {
      const totalQ = a.totalQueries || 0;
      document.getElementById('analyticsQueryCount').textContent = totalQ + ' queries';
      document.getElementById('analyticsAvgLatency').textContent = a.avgLatencyMs || '0';
      document.getElementById('analyticsCacheRate').textContent = a.cacheHitRate || '0%';
      document.getElementById('analyticsTotalQueries').textContent = totalQ;
      if (a.topFilters && a.topFilters.length > 0) {
        document.getElementById('analyticsTopFilters').style.display = 'block';
        document.getElementById('analyticsTopFiltersList').innerHTML = a.topFilters.map(f =>
          '<span style="background:#1a1a2e;color:#a5b4fc;padding:2px 8px;border-radius:12px;font-size:0.72rem">' + f.field + ' <strong>(' + f.count + ')</strong></span>'
        ).join('');
      }
      const rqEl = document.getElementById('analyticsRecentQueries');
      if (a.recentQueries && a.recentQueries.length > 0) {
        rqEl.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:0.75rem"><thead><tr style="border-bottom:1px solid #262626;color:#555"><th style="text-align:left;padding:4px 6px;font-weight:600">Query</th><th style="text-align:right;padding:4px 6px;font-weight:600">Total</th><th style="text-align:right;padding:4px 6px;font-weight:600">Embed</th><th style="text-align:right;padding:4px 6px;font-weight:600">Vector</th><th style="text-align:right;padding:4px 6px;font-weight:600">BM25</th><th style="text-align:center;padding:4px 6px;font-weight:600">Cache</th></tr></thead><tbody>' +
          a.recentQueries.map((q, i) => {
            const bg = i % 2 === 0 ? '#1a1a1a' : '#111';
            const cachedBadge = q.cached ? '<span style="background:#052e16;color:#4ade80;padding:1px 5px;border-radius:8px">hit</span>' : '<span style="background:#222;color:#555;padding:1px 5px;border-radius:8px">miss</span>';
            return '<tr style="background:' + bg + '"><td style="padding:4px 6px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#ccc">' + q.query + '</td><td style="text-align:right;padding:4px 6px;color:#fff;font-weight:600">' + q.totalMs + 'ms</td><td style="text-align:right;padding:4px 6px;color:#666">' + (q.embeddingMs || '&mdash;') + (q.embeddingMs ? 'ms' : '') + '</td><td style="text-align:right;padding:4px 6px;color:#666">' + (q.vectorMs || '&mdash;') + (q.vectorMs ? 'ms' : '') + '</td><td style="text-align:right;padding:4px 6px;color:#666">' + (q.keywordMs || '&mdash;') + (q.keywordMs ? 'ms' : '') + '</td><td style="text-align:center;padding:4px 6px">' + cachedBadge + '</td></tr>';
          }).join('') + '</tbody></table>';
      } else { document.getElementById('analyticsRecentQueries').textContent = 'No queries yet \u2014 run a search to see analytics.'; }
    }
  } catch(e) { console.error(e); }
}

function toggleModelsPanel() {
  const body = document.getElementById('modelsPanelBody');
  const btn = document.getElementById('modelsPanelToggle');
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  btn.innerHTML = isOpen ? '&#9660; Details' : '&#9650; Hide';
  if (!isOpen) { loadStats(); }
}

async function ingestDoc(){
  const log = document.getElementById('ingestLog');
  log.style.display = 'block'; log.innerHTML = 'Ingesting...';
  const id = document.getElementById('docId').value.trim();
  const content = document.getElementById('docContent').value.trim();
  const category = document.getElementById('docCategory').value.trim();
  const title = document.getElementById('docTitle').value.trim();
  const sourceType = document.getElementById('docSourceType').value;
  const tagsRaw = document.getElementById('docTags').value.trim();
  const tags = tagsRaw ? tagsRaw.split(',').map(t=>t.trim()).filter(Boolean) : [];
  const mimeType = document.getElementById('docMimeType').value.trim();
  const metaFileName = document.getElementById('docMetaFileName').value.trim();
  const tenantId = document.getElementById('docTenantId').value.trim();
  if(!id || !content) { log.innerHTML = '<span class="error">ID and content required</span>'; return; }
  try {
    const body = { id, content };
    if (category) body.category = category;
    if (title) body.title = title;
    if (sourceType) body.source_type = sourceType;
    if (tags.length) body.tags = tags;
    if (mimeType) body.mime_type = mimeType;
    if (metaFileName) body.file_name = metaFileName;
    if (tenantId) body.tenant_id = tenantId;
    const r = await fetch(API_BASE + '/ingest', { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) });
    const d = await r.json();
    if(d.success) {
      log.innerHTML = '<span class="success">&#10003; Ingested!</span> Chunks: ' + (d.chunks ?? d.chunksCreated ?? '?') + ' | Time: ' + d.performance.totalTime;
      ['docId','docContent','docTitle','docTags','docMimeType','docMetaFileName','docTenantId'].forEach(id => { document.getElementById(id).value = ''; });
      document.getElementById('docSourceType').value = '';
      loadStats();
    } else { log.innerHTML = '<span class="error">&#10007; ' + (d.error || 'Unknown error') + '</span>'; }
  } catch(e) { log.innerHTML = '<span class="error">&#10007; ' + e.message + '</span>'; }
}

async function ingestImage(){
  const log = document.getElementById('imageLog');
  log.style.display = 'block'; log.innerHTML = 'Processing image...';
  const id = document.getElementById('imageId').value;
  const originalFile = document.getElementById('imageFile').files[0];
  const category = document.getElementById('imageCategory').value;
  const imageType = document.getElementById('imageType').value;
  if(!id || !originalFile) { log.innerHTML = '<span class="error">ID and image file required</span>'; return; }
  try {
    const originalSizeMB = (originalFile.size / (1024*1024)).toFixed(2);
    log.innerHTML = 'Compressing image (' + originalSizeMB + 'MB)...';
    const compressedBlob = await compressImage(originalFile);
    const compressedSizeMB = (compressedBlob.size / (1024*1024)).toFixed(2);
    log.innerHTML = 'Uploading (' + originalSizeMB + 'MB \u2192 ' + compressedSizeMB + 'MB)...';
    const formData = new FormData();
    formData.append('id', id);
    formData.append('image', compressedBlob, 'image.jpg');
    if(category) formData.append('category', category);
    if(imageType !== 'auto') formData.append('imageType', imageType);
    const headers = {};
    const apiKey = document.getElementById('apiKey').value;
    if(apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    const r = await fetch(API_BASE + '/ingest-image', { method:'POST', headers, body: formData });
    const d = await r.json();
    if(d.success) {
      log.innerHTML = '<span class="success">&#10003; Image Ingested!</span><br>Compressed: ' + originalSizeMB + 'MB \u2192 ' + compressedSizeMB + 'MB<br>Description: ' + (d.description||'').substring(0,150) + '...<br>' + (d.extractedText ? 'OCR Text: ' + d.extractedText.substring(0,100) + '...<br>' : '') + 'Time: ' + d.performance.totalTime;
      document.getElementById('imageId').value = '';
      document.getElementById('imageFile').value = '';
      loadStats();
    } else { log.innerHTML = '<span class="error">&#10007; ' + (d.error || 'Unknown error') + '</span>'; }
  } catch(e) { log.innerHTML = '<span class="error">&#10007; ' + e.message + '</span>'; }
}

async function findSimilarImages(){
  const log = document.getElementById('similarLog');
  const results = document.getElementById('similarResults');
  const file = document.getElementById('similarImageFile').files[0];
  if(!file) { log.style.display='block'; log.innerHTML='<span class="error">Select an image first</span>'; return; }
  log.style.display='block'; log.innerHTML='Compressing and searching...';
  results.innerHTML = '';
  try {
    const compressed = await compressImage(file);
    const formData = new FormData();
    formData.append('image', compressed, 'query.jpg');
    formData.append('topK', document.getElementById('similarTopK').value);
    const headers = {};
    const apiKey = document.getElementById('apiKey').value;
    if(apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    const r = await fetch(API_BASE + '/find-similar-images', { method:'POST', headers, body: formData });
    const d = await r.json();
    if(d.error) { log.innerHTML = '<span class="error">&#10007; ' + d.error + '</span>'; return; }
    log.innerHTML = '<span class="success">&#10003; Found ' + (d.results||[]).length + ' similar images</span>';
    results.innerHTML = (d.results||[]).map((r,i) =>
      \`<div class="result">
        <div class="result-header">
          <span class="image-badge">\uD83D\uDCF8 IMAGE</span>
          <span class="result-id">#\${i+1}: \${r.id}</span>
          <span class="result-score">Score: \${r.score.toFixed(4)}</span>
        </div>
        <div class="result-content">\${r.content ? r.content.substring(0,200) + '...' : '(no description)'}</div>
        \${r.category ? '<span class="result-category">' + r.category + '</span>' : ''}
      </div>\`
    ).join('') || '<span style="color:#555;font-size:0.875rem">No similar images found</span>';
  } catch(e) { log.innerHTML = '<span class="error">&#10007; ' + e.message + '</span>'; }
}

async function deleteDoc(){
  closeDeleteConfirm();
  const log = document.getElementById('deleteLog');
  const id = document.getElementById('deleteDocId').value.trim();
  log.style.display='block'; log.innerHTML='Deleting...';
  try {
    const headers = {};
    const apiKey = document.getElementById('apiKey').value;
    if(apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
    const r = await fetch(API_BASE + '/documents/' + encodeURIComponent(id), { method:'DELETE', headers });
    const d = await r.json();
    if(d.success || r.ok) {
      log.innerHTML = '<span class="success">&#10003; Deleted: ' + id + '</span>';
      document.getElementById('deleteDocId').value = '';
      loadStats();
    } else { log.innerHTML = '<span class="error">&#10007; ' + (d.error || 'Delete failed') + '</span>'; }
  } catch(e) { log.innerHTML = '<span class="error">&#10007; ' + e.message + '</span>'; }
}

async function classifyIntent(){
  const query = document.getElementById('intentQuery').value.trim();
  const result = document.getElementById('intentResult');
  if(!query) return;
  result.style.display='block'; result.innerHTML='<span style="color:#555">Classifying...</span>';
  try {
    const r = await fetch(API_BASE + '/classify-intent', { method:'POST', headers: getHeaders(), body: JSON.stringify({query}) });
    const d = await r.json();
    const routeColors = {SQL:'#059669',BM25:'#2563eb',VECTOR:'#7c3aed',GRAPH:'#d97706',VISION:'#db2777',OCR:'#dc2626'};
    const route = d.route || d.intent || 'VECTOR';
    const color = routeColors[route] || '#e05a4a';
    result.innerHTML = \`<div style="margin-bottom:8px"><span style="background:\${color};color:#fff;padding:3px 10px;border-radius:6px;font-weight:700;font-size:0.8rem">\${route}</span></div>
<div style="font-size:0.8rem;color:#888;line-height:1.6">\${d.reasoning || d.reason || 'No reasoning provided'}</div>
\${d.confidence ? '<div style="margin-top:6px;font-size:0.75rem;color:#555">Confidence: <span style="color:#22c55e;font-weight:600">' + (d.confidence*100).toFixed(0) + '%</span></div>' : ''}\`;
  } catch(e) { result.innerHTML = '<span class="error">&#10007; ' + e.message + '</span>'; }
}

async function validateLicense(){
  const log = document.getElementById('licenseValidateLog');
  const key = document.getElementById('licenseKeyValidate').value.trim();
  if(!key) return;
  log.style.display='block'; log.innerHTML='Validating...';
  try {
    const r = await fetch(API_BASE + '/license/validate', { method:'POST', headers: getHeaders(), body: JSON.stringify({license_key: key}) });
    const d = await r.json();
    if(d.valid) log.innerHTML = '<span class="success">&#10003; Valid license</span> | Plan: ' + (d.plan||'unknown') + ' | Docs: ' + (d.max_documents||'unlimited') + ' | Queries/day: ' + (d.max_queries_per_day||'unlimited');
    else log.innerHTML = '<span class="error">&#10007; Invalid or expired license</span>';
  } catch(e) { log.innerHTML = '<span class="error">&#10007; ' + e.message + '</span>'; }
}

async function createLicense(){
  const log = document.getElementById('licenseCreateLog');
  const email = document.getElementById('licenseEmail').value.trim();
  if(!email) { log.style.display='block'; log.innerHTML='<span class="error">Email required</span>'; return; }
  log.style.display='block'; log.innerHTML='Creating...';
  try {
    const r = await fetch(API_BASE + '/license/create', { method:'POST', headers: getHeaders(), body: JSON.stringify({
      email,
      plan: document.getElementById('licensePlan').value,
      max_documents: parseInt(document.getElementById('licenseMaxDocs').value),
      max_queries_per_day: parseInt(document.getElementById('licenseMaxQueries').value)
    })});
    const d = await r.json();
    if(d.license_key) log.innerHTML = '<span class="success">&#10003; Created!</span> Key: <strong style="color:#a5b4fc;font-family:monospace">' + d.license_key + '</strong>';
    else log.innerHTML = '<span class="error">&#10007; ' + (d.error||'Failed') + '</span>';
  } catch(e) { log.innerHTML = '<span class="error">&#10007; ' + e.message + '</span>'; }
}

async function listLicenses(){
  const log = document.getElementById('licenseListLog');
  const results = document.getElementById('licenseListResults');
  log.style.display='block'; log.innerHTML='Loading...';
  try {
    const r = await fetch(API_BASE + '/license/list', {headers: getHeaders()});
    const d = await r.json();
    const list = d.licenses || d || [];
    log.innerHTML = '<span class="success">&#10003; ' + list.length + ' licenses</span>';
    results.innerHTML = list.length ? '<table style="width:100%;border-collapse:collapse;font-size:0.75rem"><thead><tr style="border-bottom:1px solid #262626;color:#555"><th style="padding:4px 8px;text-align:left">Email</th><th style="padding:4px 8px;text-align:left">Plan</th><th style="padding:4px 8px;text-align:left">Key</th><th style="padding:4px 8px;text-align:left">Status</th></tr></thead><tbody>' +
      list.map((l,i) => '<tr style="background:' + (i%2===0?'#1a1a1a':'#111') + '"><td style="padding:4px 8px;color:#ccc">' + (l.email||'—') + '</td><td style="padding:4px 8px;color:#888">' + (l.plan||'—') + '</td><td style="padding:4px 8px;font-family:monospace;font-size:0.7rem;color:#a5b4fc">' + (l.license_key||'—') + '</td><td style="padding:4px 8px;color:' + (l.active!==false?'#4ade80':'#f87171') + '">' + (l.active!==false?'active':'revoked') + '</td></tr>').join('') + '</tbody></table>'
      : '<span style="color:#555;font-size:0.875rem">No licenses found</span>';
  } catch(e) { log.innerHTML = '<span class="error">&#10007; ' + e.message + '</span>'; }
}

async function revokeLicense(){
  const log = document.getElementById('licenseRevokeLog');
  const key = document.getElementById('licenseKeyRevoke').value.trim();
  if(!key) return;
  log.style.display='block'; log.innerHTML='Revoking...';
  try {
    const r = await fetch(API_BASE + '/license/revoke', { method:'POST', headers: getHeaders(), body: JSON.stringify({license_key: key}) });
    const d = await r.json();
    if(d.success||r.ok) { log.innerHTML = '<span class="success">&#10003; License revoked</span>'; document.getElementById('licenseKeyRevoke').value=''; }
    else log.innerHTML = '<span class="error">&#10007; ' + (d.error||'Failed') + '</span>';
  } catch(e) { log.innerHTML = '<span class="error">&#10007; ' + e.message + '</span>'; }
}

async function checkSetupStatus(){
  const setCheck = (id, ok, desc) => {
    const icon = document.getElementById('chk-' + id + '-icon');
    const descEl = document.getElementById('chk-' + id + '-desc');
    icon.className = 'check-icon ' + (ok ? 'check-ok' : 'check-fail');
    icon.textContent = ok ? '&#10003;' : '&#10007;';
    if(descEl) descEl.textContent = desc;
  };
  ['api','vectorize','d1','ai'].forEach(id => {
    const icon = document.getElementById('chk-' + id + '-icon');
    icon.className = 'check-icon check-pending';
    icon.textContent = '...';
  });
  try {
    const apiKey = document.getElementById('apiKey').value;
    const headers = apiKey ? {'Authorization':'Bearer ' + apiKey} : {};
    const [testRes, statsRes] = await Promise.all([
      fetch(API_BASE + '/test', {headers}).then(r=>r.json()).catch(()=>null),
      fetch(API_BASE + '/stats', {headers}).then(r=>r.json()).catch(()=>null)
    ]);
    setCheck('api', !!(testRes && apiKey), testRes ? (apiKey ? 'Authenticated successfully' : 'Server reachable (no API key set)') : 'Could not reach server');
    setCheck('vectorize', !!(statsRes && (statsRes.index?.vectorsCount !== undefined || statsRes.index?.vectorCount !== undefined)), statsRes?.index ? 'Bound \u2014 ' + (statsRes.index.vectorsCount ?? statsRes.index.vectorCount ?? 0) + ' vectors' : 'Not found or not bound');
    setCheck('d1', !!(testRes?.bindings?.hasD1 || statsRes?.documents), testRes?.bindings?.hasD1 ? 'D1 bound and reachable' : 'D1 not detected');
    setCheck('ai', !!(testRes?.bindings?.hasAI !== false), testRes ? 'Workers AI binding active' : 'Could not verify');
  } catch(e) {
    ['api','vectorize','d1','ai'].forEach(id => setCheck(id, false, 'Check failed: ' + e.message));
  }
}

document.getElementById('useV4Mode').addEventListener('change', (e) => {
  document.getElementById('v4Info').style.display = e.target.checked ? 'block' : 'none';
});

function toggleFilters() {
  const panel = document.getElementById('filterPanel');
  const btn = document.getElementById('filterToggleBtn');
  const open = panel.classList.toggle('open');
  const n = countActiveFilters();
  btn.innerHTML = (open ? '&#9650;' : '&#9660;') + ' Filters' + (!open && n > 0 ? ' <span class="filter-active-badge">' + n + '</span>' : '');
}
function countActiveFilters() {
  return ['f_source_type','f_category','f_tags','f_tenant_id','f_mime_type','f_file_name','f_date_from','f_date_to'].filter(id => document.getElementById(id).value.trim() !== '').length;
}
function clearFilters() {
  ['f_source_type','f_mime_type'].forEach(id => { document.getElementById(id).value = ''; });
  ['f_category','f_tags','f_tenant_id','f_file_name','f_date_from','f_date_to'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('filterToggleBtn').innerHTML = '&#9650; Filters';
}
function buildFilters() {
  const filters = {};
  const sourceType = document.getElementById('f_source_type').value.trim(); if(sourceType) filters.source_type = {$eq:sourceType};
  const category = document.getElementById('f_category').value.trim(); if(category) filters.category = {$eq:category};
  const tagsRaw = document.getElementById('f_tags').value.trim();
  if(tagsRaw) { const tags = tagsRaw.split(',').map(t=>t.trim()).filter(Boolean); if(tags.length) filters.tags = {$in:tags}; }
  const tenantId = document.getElementById('f_tenant_id').value.trim(); if(tenantId) filters.tenant_id = {$eq:tenantId};
  const mimeType = document.getElementById('f_mime_type').value.trim(); if(mimeType) filters.mime_type = {$eq:mimeType};
  const fileName = document.getElementById('f_file_name').value.trim(); if(fileName) filters.file_name = {$eq:fileName};
  const dateFrom = document.getElementById('f_date_from').value;
  const dateTo = document.getElementById('f_date_to').value;
  if(dateFrom||dateTo) { filters.date_created = {}; if(dateFrom) filters.date_created.$gte=dateFrom+'T00:00:00.000Z'; if(dateTo) filters.date_created.$lte=dateTo+'T23:59:59.999Z'; }
  return Object.keys(filters).length > 0 ? filters : undefined;
}

async function search(){
  const res = document.getElementById('searchResults');
  const perf = document.getElementById('searchPerf');
  const btn = document.getElementById('searchBtn');
  const query = document.getElementById('searchQuery').value;
  if(!query) { res.innerHTML = '<span class="error">Enter a query</span>'; return; }
  res.innerHTML = '<span style="color:#555">Searching...</span>';
  if(btn) { btn.disabled=true; btn.textContent='\u23F3 Searching...'; }
  const useV4 = document.getElementById('useV4Mode').checked;
  const useHighlighting = document.getElementById('useHighlighting').checked;
  const highlightParam = useHighlighting ? 'highlight=true' : 'highlight=false';
  const searchUrl = useV4 ? API_BASE+'/search?mode=v4&'+highlightParam : API_BASE+'/search?'+highlightParam;
  const activeFilters = buildFilters();
  try {
    const r = await fetch(searchUrl, { method:'POST', headers:getHeaders(), body: JSON.stringify({
      query, topK: parseInt(document.getElementById('topK').value),
      rerank: document.getElementById('useRerank').checked,
      highlight: useHighlighting,
      ...(activeFilters !== undefined ? {filters:activeFilters} : {})
    })});
    const xCache = r.headers.get('X-Cache');
    const rlRemaining = r.headers.get('X-RateLimit-Remaining');
    const rlLimit = r.headers.get('X-RateLimit-Limit');
    const rlWindow = r.headers.get('X-RateLimit-Window');
    const d = await r.json();
    if(r.status===429) { res.innerHTML='<span class="error">&#8987; Rate limit exceeded \u2014 try again in '+(d.retryAfter||'?')+'s</span>'; if(btn){btn.disabled=false;btn.textContent='\uD83D\uDD0D Search';} return; }
    if(d.error) { res.innerHTML='<span class="error">&#10007; '+d.error+'</span>'; if(btn){btn.disabled=false;btn.textContent='\uD83D\uDD0D Search';} return; }
    function escapeHtml(text) { const div=document.createElement('div'); div.textContent=text; return div.innerHTML; }
    res.innerHTML = d.results.map((r,index) => {
      let routeBadge='', costDisplay='';
      if(d.metadata?.route) { const rc='route-'+d.metadata.route.toLowerCase(); routeBadge=\`<span class="\${rc} route-badge">\${d.metadata.route}</span>\`; }
      const highlightBadge = r.highlights&&r.highlights.length>0 ? (()=>{ const avg=r.highlights.reduce((s,h)=>s+h.score,0)/r.highlights.length; const bc=avg>=0.8?'high-score':avg>=0.6?'medium-score':'low-score'; return \`<span class="highlight-badge \${bc}">\u2728 \${r.highlights.length} highlights (avg: \${avg.toFixed(2)})</span>\`; })() : '';
      const contentHTML = r.highlightedContent&&r.highlights&&r.highlights.length>0 ? r.highlightedContent : escapeHtml(r.content.substring(0,300)+(r.content.length>300?'...':''));
      const snippetsHTML = r.snippets&&r.snippets.length>0 ? \`<div class="result-snippet"><div class="snippet-label">Best Match</div>\${r.snippets[0]}</div>\` : '';
      if(d.cost) costDisplay=\`<div class="cost-display">Cost: \${d.cost.totalCost<0.000001?'<$0.000001':'$'+d.cost.totalCost.toFixed(6)} per query</div>\`;
      return \`<div class="result"><div class="result-header">\${r.isImage?'<span class="image-badge">\uD83D\uDCF8 IMAGE</span>':''}<span class="result-id">#\${index+1}: \${r.id}\${routeBadge}\${highlightBadge}</span><span class="result-score">Score: \${r.score.toFixed(4)}</span></div><div class="result-content">\${contentHTML}</div>\${snippetsHTML}\${r.category?'<span class="result-category">'+r.category+'</span>':''}\${costDisplay}</div>\`;
    }).join('') || '<span class="error">No results</span>';
    perf.style.display='block';
    const perfEntries=Object.entries(d.performance);
    const hasHighlighting=perfEntries.some(([k])=>k.toLowerCase().includes('highlight'));
    const isCached=d.performance.totalTime==='0ms (cached)';
    const isCfCache=xCache==='HIT';
    const rlBadge=(rlRemaining!==null&&rlLimit)?'<span style="margin-left:auto;font-size:0.68rem;color:#555;font-weight:400">'+rlRemaining+'/'+rlLimit+' req remaining ('+(rlWindow||'')+')</span>':'';
    const cacheBadge=isCfCache?' <span style="background:#0c1a2e;color:#60a5fa;font-size:0.7rem;padding:1px 6px;border-radius:8px;margin-left:6px">\u2601\uFE0F CF cache hit</span>':isCached?' <span style="background:#052e16;color:#4ade80;font-size:0.7rem;padding:1px 6px;border-radius:8px;margin-left:6px">\u26A1 memory cache hit</span>':'';
    let perfHTML=\`<div class="perf-title">&#9889; Performance\${hasHighlighting?' <span style="color:#3b82f6;font-size:11px;margin-left:6px">(with highlighting)</span>':''}\${cacheBadge}\${rlBadge}</div>\`;
    if(!isCached){
      const parseMs=v=>v?parseInt(v)||0:0;
      const segments=[{label:'Embedding',ms:parseMs(d.performance.embeddingTime),color:'#818cf8'},{label:'Vector',ms:parseMs(d.performance.vectorSearchTime),color:'#34d399'},{label:'BM25',ms:parseMs(d.performance.keywordSearchTime),color:'#fbbf24'},{label:'Reranker',ms:parseMs(d.performance.rerankerTime),color:'#f87171'},{label:'Highlight',ms:parseMs(d.performance.highlightingTime),color:'#60a5fa'}].filter(s=>s.ms>0);
      const totalMs=parseMs(d.performance.totalTime)||segments.reduce((s,x)=>s+x.ms,0)||1;
      if(segments.length>0){
        const bar=segments.map(s=>'<div title="'+s.label+': '+s.ms+'ms" style="flex:'+Math.max(2,Math.round((s.ms/totalMs)*100))+';background:'+s.color+';height:10px;border-radius:2px;min-width:3px"></div>').join('');
        const legend=segments.map(s=>'<span style="font-size:0.68rem;color:#555"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:'+s.color+';margin-right:3px;vertical-align:middle"></span>'+s.label+' '+s.ms+'ms</span>').join('');
        perfHTML+='<div style="margin-bottom:8px"><div style="display:flex;gap:2px;border-radius:4px;overflow:hidden;margin-bottom:5px">'+bar+'</div><div style="display:flex;flex-wrap:wrap;gap:8px">'+legend+'</div></div>';
      }
    }
    perfHTML+='<div class="perf-grid">'+perfEntries.map(([k,v])=>'<div class="perf-item"'+(k.toLowerCase().includes('highlight')?' style="color:#3b82f6;font-weight:600;"':'')+'>'+k+': <span>'+v+'</span></div>').join('')+'</div>';
    if(d.metadata) perfHTML+=\`<div class="perf-item" style="grid-column:span 2;margin-top:8px;padding-top:8px;border-top:1px solid #262626"><strong style="color:#ccc">Route:</strong> \${d.metadata.route} | <strong style="color:#ccc">Intent:</strong> \${d.metadata.intent}\${d.metadata.reasoning?'<br><em style="color:#555">'+d.metadata.reasoning+'</em>':''}</div>\`;
    const appliedFilters=d.filtersApplied||d.metadata?.filtersApplied;
    if(appliedFilters&&Object.keys(appliedFilters).length>0){
      const filterSummary=Object.entries(appliedFilters).map(([k,v])=>{const op=Object.keys(v)[0];const val=v[op];return \`<strong style="color:#ccc">\${k}</strong> \${op} \${Array.isArray(val)?'['+val.join(', ')+']':val}\`;}).join(' &amp; ');
      perfHTML+=\`<div class="perf-item" style="grid-column:span 2;margin-top:6px;padding:6px 8px;background:#0c1a2e;border-radius:4px;font-size:0.75rem;color:#a5b4fc"><strong>Filters applied:</strong> \${filterSummary}</div>\`;
      document.getElementById('filterToggleBtn').innerHTML='&#9650; Filters <span class="filter-active-badge">'+Object.keys(appliedFilters).length+'</span>';
    }
    perf.innerHTML=perfHTML;
  } catch(e) { res.innerHTML='<span class="error">&#10007; '+e.message+'</span>'; }
  finally { if(btn){btn.disabled=false;btn.textContent='\uD83D\uDD0D Search';} }
}

async function loadCostAnalytics(){
  const queriesPerDay=document.getElementById('queriesPerDay').value;
  const costProjection=document.getElementById('costProjection');
  const costBreakdown=document.getElementById('costBreakdown');
  costProjection.innerHTML='Calculating...';
  try {
    const r=await fetch(API_BASE+'/analytics/cost?queriesPerDay='+queriesPerDay,{headers:getHeaders()});
    const d=await r.json();
    costProjection.innerHTML=\`<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px"><div><div style="font-size:0.7rem;color:#555">V3 Cost (Hybrid Only)</div><div style="font-size:1.3rem;font-weight:700;color:#ef4444">\${d.monthlyProjection.v3Cost}</div></div><div><div style="font-size:0.7rem;color:#555">V4 Cost (Smart Routing)</div><div style="font-size:1.3rem;font-weight:700;color:#22c55e">\${d.monthlyProjection.v4Cost}</div></div></div><div style="margin-top:10px;padding-top:10px;border-top:1px solid #262626"><div style="font-size:0.7rem;color:#555">Monthly Savings</div><div style="font-size:1.5rem;font-weight:700;color:#22c55e">\${d.monthlyProjection.savings} <span style="font-size:0.9rem;color:#888">(\${d.monthlyProjection.savingsPercent})</span></div></div>\`;
    costBreakdown.style.display='block';
    costBreakdown.innerHTML=\`<div style="font-size:0.8rem;font-weight:600;color:#888;margin-bottom:10px">Cost by Route (\${queriesPerDay} queries/day)</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">\${Object.entries(d.monthlyProjection.breakdownByRoute).map(([route,cost])=>\`<div style="background:#111;border:1px solid #262626;padding:10px;border-radius:8px"><div style="font-size:0.7rem;color:#555">\${route}</div><div style="font-size:0.9rem;font-weight:600;color:#ccc;margin-top:4px">\${cost}</div></div>\`).join('')}</div>\`;
  } catch(e) { costProjection.innerHTML='<span class="error">Failed to load analytics</span>'; }
}

async function searchImages(){ document.getElementById('searchQuery').value='dashboard navigation'; await search(); }
async function searchFiltered(){ document.getElementById('searchQuery').value='document'; document.getElementById('f_source_type').value='image'; const p=document.getElementById('filterPanel'); if(!p.classList.contains('open')) toggleFilters(); await search(); }
async function searchFinancial(){ document.getElementById('searchQuery').value='Access Bank N30000'; await search(); }

document.getElementById('searchQuery').addEventListener('keypress', e => { if(e.key==='Enter') search(); });
document.getElementById('intentQuery').addEventListener('keypress', e => { if(e.key==='Enter') classifyIntent(); });

const highlightingCheckbox=document.getElementById('useHighlighting');
highlightingCheckbox.addEventListener('change',(e)=>{ document.getElementById('highlightControls').style.display=e.target.checked?'block':'none'; });
document.getElementById('highlightThreshold').addEventListener('input',(e)=>{ document.getElementById('thresholdValue').textContent=e.target.value; });
document.getElementById('searchQuery').addEventListener('input',(e)=>{
  const wc=e.target.value.trim().split(/\s+/).filter(w=>w.length>0).length;
  const lbl=document.getElementById('useHighlighting').parentElement;
  if(wc>0&&wc<=3){lbl.style.background='#1c1a07';lbl.style.padding='4px 8px';lbl.style.borderRadius='4px';lbl.title='\uD83D\uDCA1 Highlighting works best with short queries';}
  else{lbl.style.background='';lbl.style.padding='';lbl.title='';}
});

function readDocFile(file) {
  if(!file) return;
  const ext=file.name.split('.').pop().toLowerCase();
  if(!['txt','md','csv','json'].includes(ext)){const log=document.getElementById('ingestLog');log.style.display='block';log.innerHTML='<span class="error">Unsupported file type. Use .txt, .md, .csv, or .json</span>';return;}
  const docIdEl=document.getElementById('docId');
  if(!docIdEl.value) docIdEl.value=file.name.replace(/\.[^/.]+$/,'').replace(/[\s_]+/g,'-').toLowerCase();
  document.getElementById('docFileNameText').textContent=file.name+' ('+(file.size>1024?(file.size/1024).toFixed(1)+'KB':file.size+'B')+')';
  document.getElementById('docFileName').style.display='inline-flex';
  const reader=new FileReader();
  reader.onload=(ev)=>{ document.getElementById('docContent').value=ev.target.result; };
  reader.readAsText(file);
}
function handleDocFile(e){ readDocFile(e.target.files[0]); }
function handleDocDragOver(e){ e.preventDefault(); document.getElementById('docFileDrop').classList.add('drag-over'); }
function handleDocDragLeave(e){ document.getElementById('docFileDrop').classList.remove('drag-over'); }
function handleDocDrop(e){ e.preventDefault(); document.getElementById('docFileDrop').classList.remove('drag-over'); const f=e.dataTransfer.files[0]; if(f) readDocFile(f); }
function clearDocFile(e){ e.stopPropagation(); document.getElementById('docFile').value=''; document.getElementById('docFileName').style.display='none'; document.getElementById('docContent').value=''; }

loadStats();
testAuth();
</script>
</body>
</html>`;
}
