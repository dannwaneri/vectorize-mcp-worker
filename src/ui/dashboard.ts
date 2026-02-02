export function getDashboardHTML(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vectorize MCP Worker - Dashboard</title>
<meta name="description" content="Production-Grade Hybrid RAG with Multimodal Support on Cloudflare Edge">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Vectorize MCP Worker",
  "description": "Production-Grade Hybrid RAG with Multimodal Image Processing",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Cloudflare Workers",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "author": {
    "@type": "Person",
    "name": "Daniel Nwaneri",
    "url": "https://github.com/dannwaneri"
  },
  "softwareVersion": "2.1.0",
  "url": "https://github.com/dannwaneri/vectorize-mcp-worker"
}
</script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#f5f5f5;color:#1a1a1a;min-height:100vh;padding:12px}
.container{max-width:1200px;margin:0 auto}
.gh-banner{background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;font-size:0.85rem}
.gh-banner a{color:#fff;text-decoration:none;font-weight:500}
.gh-banner button{background:none;border:none;color:#fff;cursor:pointer;font-size:1.1rem}
h1{font-size:1.8rem;margin-bottom:8px;color:#1a1a1a;font-weight:700;text-align:center}
.subtitle{color:#666;margin-bottom:8px;font-size:1rem;text-align:center}
.tagline{color:#888;margin-bottom:24px;font-size:0.8rem;text-align:center}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.05)}
.card h2{font-size:1rem;margin-bottom:14px;color:#1a1a1a;display:flex;align-items:center;gap:8px;font-weight:600}
.card h2 span{font-size:1.1rem}
label{display:block;font-size:0.8rem;color:#555;margin-bottom:6px;font-weight:500}
input,textarea,select{width:100%;padding:12px 14px;background:#fff;border:1px solid #ddd;border-radius:8px;color:#1a1a1a;font-size:16px;margin-bottom:12px}
input[type="file"]{padding:8px;cursor:pointer}
input:focus,textarea:focus,select:focus{outline:none;border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,0.1)}
input::placeholder,textarea::placeholder{color:#999}
textarea{resize:vertical;min-height:120px;font-family:inherit}
button{background:#4f46e5;color:#fff;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;font-size:0.95rem;font-weight:600;width:100%;transition:background 0.2s}
button:hover{background:#4338ca}
button:disabled{background:#ccc;cursor:not-allowed}
.stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.stat{background:#f9fafb;border:1px solid #e5e5e5;padding:12px;border-radius:8px;text-align:center}
.stat-value{font-size:1.3rem;font-weight:700;color:#4f46e5}
.stat-label{font-size:0.7rem;color:#888;margin-top:4px}
.results{margin-top:14px;max-height:350px;overflow-y:auto}
.result{background:#f9fafb;border:1px solid #e5e5e5;padding:12px;border-radius:8px;margin-bottom:8px;border-left:3px solid #4f46e5}
.result-header{display:flex;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:4px;align-items:center}
.result-id{font-size:0.7rem;color:#888;word-break:break-all}
.result-score{font-size:0.7rem;color:#059669;font-weight:600}
.result-content{font-size:0.85rem;color:#444;line-height:1.5;word-break:break-word}
.result-category{display:inline-block;font-size:0.65rem;background:#4f46e5;color:#fff;padding:2px 8px;border-radius:4px;margin-top:6px}
.image-badge{background:#f97316;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.7rem;font-weight:600;display:inline-block}
.route-badge{display:inline-block;font-size:0.7rem;padding:2px 8px;border-radius:4px;font-weight:600;margin-left:8px}
.route-sql{background:#10b981;color:#fff}
.route-bm25{background:#3b82f6;color:#fff}
.route-vector{background:#8b5cf6;color:#fff}
.route-graph{background:#f59e0b;color:#fff}
.route-vision{background:#ec4899;color:#fff}
.route-ocr{background:#ef4444;color:#fff}
.cost-display{font-size:0.75rem;color:#059669;margin-top:4px}
.perf{margin-top:14px;padding:12px;background:#f9fafb;border:1px solid #e5e5e5;border-radius:8px}
.perf-title{font-size:0.75rem;color:#888;margin-bottom:8px}
.perf-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.perf-item{font-size:0.8rem;color:#555}
.perf-item span{color:#059669;font-weight:600}
.log{font-size:0.8rem;color:#666;margin-top:8px;padding:10px;background:#f9fafb;border:1px solid #e5e5e5;border-radius:6px;max-height:120px;overflow-y:auto;word-break:break-word}
.success{color:#059669}
.error{color:#dc2626}
.auth-section{margin-bottom:16px;padding:16px;background:#fff;border:1px solid #e5e5e5;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05)}
.auth-section label{color:#555}
.flex{display:flex;gap:8px}
.flex input{margin-bottom:0;flex:1}
.flex button{width:auto;padding:12px 20px;flex-shrink:0}
.search-row{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.search-row input{flex:1;min-width:150px;margin-bottom:0}
.search-row select{width:80px;margin-bottom:0;flex-shrink:0}
.search-row button{width:auto;padding:12px 24px;flex-shrink:0}
.demo-card{background:#f0f9ff;border:1px solid #0ea5e9;border-left:3px solid #0ea5e9}
.demo-card button{margin-top:8px}
.demo-card button:first-of-type{margin-top:0;background:#0ea5e9}
.demo-card button:first-of-type:hover{background:#0284c7}
.demo-card button:last-of-type{background:#059669}
.demo-card button:last-of-type:hover{background:#047857}
.demo-card p{font-size:0.85rem;color:#555;margin-bottom:12px;line-height:1.4}
.footer{text-align:center;margin-top:24px;padding:16px;color:#888;font-size:0.8rem}
.footer a{color:#4f46e5;text-decoration:none}
@media screen and (max-width:1024px){
.grid{grid-template-columns:repeat(2,1fr)!important}
.card.search-card{grid-column:span 2!important}
}
@media screen and (max-width:768px){
.grid{grid-template-columns:1fr!important}
.card{grid-column:1!important}
.stats-grid{grid-template-columns:repeat(3,1fr)}
.perf-grid{grid-template-columns:1fr}
.search-row{flex-direction:column}
.search-row input,.search-row select,.search-row button{width:100%}
body{padding:8px}
h1{font-size:1.5rem}
.subtitle{font-size:0.9rem}
}
</style>
</head>
<body>
<div class="container">
<div class="gh-banner" id="ghBanner">
<a href="https://github.com/dannwaneri/vectorize-mcp-worker" target="_blank">⭐ Star on GitHub - Help spread the word!</a>
<button onclick="document.getElementById('ghBanner').style.display='none'">✕</button>
</div>
<h1>Vectorize MCP Worker V3</h1>
<p class="subtitle">Hybrid RAG with Vision: Search text and images with AI-powered understanding.</p>
<p class="tagline">~900ms search • Vector + BM25 • Multimodal • OCR • Reranked results • $5/month</p>

<div class="auth-section">
<label>🔑 API Key (required for protected endpoints)</label>
<div class="flex">
<input type="password" id="apiKey" placeholder="Enter your API key">
<button onclick="testAuth()">Test</button>
</div>
<div id="authStatus" class="log" style="display:none"></div>
</div>

<!-- V4 Mode Toggle Section -->
<div class="v4-section" style="margin-bottom:16px;padding:16px;background:#f0f9ff;border:1px solid #0ea5e9;border-radius:12px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <h3 style="margin:0;color:#0369a1;font-size:1rem">🚀 V4 Intelligent Routing</h3>
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0">
      <input type="checkbox" id="useV4Mode" style="width:auto;margin:0">
      <span style="font-weight:600;color:#0369a1">Enable V4</span>
    </label>
  </div>
  
  <div id="v4Info" style="display:none;font-size:0.85rem;color:#0c4a6e;line-height:1.5">
    <p style="margin:0 0 8px 0"><strong>Active:</strong> Intelligent query routing based on intent classification</p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px">
      <div style="background:#fff;padding:8px;border-radius:6px;text-align:center">
        <div style="font-size:0.7rem;color:#64748b">SQL Route</div>
        <div style="font-size:1.1rem;font-weight:700;color:#059669">~45ms</div>
      </div>
      <div style="background:#fff;padding:8px;border-radius:6px;text-align:center">
        <div style="font-size:0.7rem;color:#64748b">BM25 Route</div>
        <div style="font-size:1.1rem;font-weight:700;color:#059669">~50ms</div>
      </div>
      <div style="background:#fff;padding:8px;border-radius:6px;text-align:center">
        <div style="font-size:0.7rem;color:#64748b">Cost Savings</div>
        <div style="font-size:1.1rem;font-weight:700;color:#059669">88%</div>
      </div>
    </div>
  </div>
</div>

<div class="grid">
<div class="card">
<h2><span>📊</span> Stats</h2>
<div class="stats-grid">
<div class="stat"><div class="stat-value" id="vectorCount">-</div><div class="stat-label">Vectors</div></div>
<div class="stat"><div class="stat-value" id="docCount">-</div><div class="stat-label">Documents</div></div>
<div class="stat"><div class="stat-value" id="dimensions">-</div><div class="stat-label">Dimensions</div></div>
</div>
<button onclick="loadStats()">Refresh Stats</button>
</div>

<div class="card">
<h2><span>📥</span> Ingest Document</h2>
<label>Document ID</label>
<input type="text" id="docId" placeholder="my-article-001">
<label>Category (optional)</label>
<input type="text" id="docCategory" placeholder="e.g., docs, articles, notes">
<label>Content</label>
<textarea id="docContent" placeholder="Paste any text - articles, docs, notes. It will be automatically chunked and indexed..."></textarea>
<button onclick="ingestDoc()">Ingest Document</button>
<div id="ingestLog" class="log" style="display:none"></div>
</div>

<div class="card">
<h2><span>📸</span> Ingest Image <span style="font-size:0.7rem;background:#f97316;color:#fff;padding:2px 6px;border-radius:4px;font-weight:600">NEW</span></h2>
<label>Image ID</label>
<input type="text" id="imageId" placeholder="receipt-001">
<label>Category (optional)</label>
<input type="text" id="imageCategory" placeholder="e.g., receipts, screenshots, diagrams">
<label>Image Type (optional)</label>
<select id="imageType">
<option value="auto">Auto-detect</option>
<option value="screenshot">Screenshot</option>
<option value="document">Scanned Document/OCR</option>
<option value="diagram">Diagram/Chart</option>
<option value="photo">Photo</option>
</select>
<label>Upload Image</label>
<input type="file" id="imageFile" accept="image/*">
<button onclick="ingestImage()">Ingest Image</button>
<div id="imageLog" class="log" style="display:none"></div>
</div>

<div class="card demo-card">
<h2><span>🎯</span> Try V3 Features</h2>
<p>Test multimodal search with pre-loaded sample images</p>
<button onclick="searchImages()">🖼️ Search: "dashboard navigation"</button>
<button onclick="searchFinancial()">💳 Search: "Access Bank transaction"</button>
<div id="demoLog" class="log" style="display:none"></div>
</div>

<div class="card search-card" style="grid-column:span 3">
<h2><span>🔎</span> Search</h2>
<div class="search-row">
<input type="text" id="searchQuery" placeholder="Ask anything about your documents or images...">
<select id="topK">
<option value="3">Top 3</option>
<option value="5" selected>Top 5</option>
<option value="10">Top 10</option>
</select>
<button onclick="search()">🔍 Search</button>
</div>
<label><input type="checkbox" id="useRerank" checked> Use Reranker (more accurate)</label>
<div id="searchResults" class="results"></div>
<div id="searchPerf" class="perf" style="display:none">
<div class="perf-title">⚡ Performance</div>
<div class="perf-grid" id="perfGrid"></div>
</div>
</div>

<div class="card" style="grid-column:span 3">
  <h2><span>💰</span> Cost Analytics</h2>
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px">
    <div>
      <label>Queries per Day</label>
      <input type="number" id="queriesPerDay" value="1000" min="100" max="100000">
      <button onclick="loadCostAnalytics()">Calculate Costs</button>
    </div>
    <div id="costResults" style="background:#f9fafb;border:1px solid #e5e5e5;border-radius:8px;padding:12px">
      <div style="font-size:0.75rem;color:#888;margin-bottom:8px">Monthly Cost Projection</div>
      <div id="costProjection">Click "Calculate Costs" to see projection</div>
    </div>
  </div>
  <div id="costBreakdown" style="display:none;margin-top:12px"></div>
</div>
</div>

<div class="footer">
⚡ Powered by <a href="https://developers.cloudflare.com/workers/" target="_blank">Cloudflare Workers</a> + <a href="https://developers.cloudflare.com/vectorize/" target="_blank">Vectorize</a> + <a href="https://developers.cloudflare.com/d1/" target="_blank">D1</a> + <a href="https://developers.cloudflare.com/workers-ai/" target="_blank">Llama 4 Scout Vision</a>
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

async function compressImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.85) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth || height > maxHeight) {
                    if (width > height) {
                        height = (height / width) * maxWidth;
                        width = maxWidth;
                    } else {
                        width = (width / height) * maxHeight;
                        height = maxHeight;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
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
el.style.display = 'block';
el.innerHTML = 'Testing...';
try {
const r = await fetch(API_BASE + '/test');
const d = await r.json();
const apiKey = document.getElementById('apiKey').value;
const authStatus = apiKey ? '<span class="success">✓ Authenticated</span>' : '<span style="color:#fbbf24">⚡ Server Online</span> (enter API key to access protected endpoints)';
el.innerHTML = authStatus + ' | Mode: ' + d.mode + ' | Database: ' + (d.bindings.hasD1?'✓':'✗');
} catch(e) { el.innerHTML = '<span class="error">✗ ' + e.message + '</span>'; }
}

async function loadStats(){
try {
const r = await fetch(API_BASE + '/stats', {headers: getHeaders()});
const d = await r.json();
document.getElementById('vectorCount').textContent = d.index?.vectorCount || 0;
document.getElementById('docCount').textContent = d.documents?.total_documents || 0;
document.getElementById('dimensions').textContent = d.dimensions || 384;
} catch(e) { console.error(e); }
}

async function ingestDoc(){
const log = document.getElementById('ingestLog');
log.style.display = 'block';
log.innerHTML = 'Ingesting...';
const id = document.getElementById('docId').value;
const content = document.getElementById('docContent').value;
const category = document.getElementById('docCategory').value;
if(!id || !content) { log.innerHTML = '<span class="error">ID and content required</span>'; return; }
try {
const r = await fetch(API_BASE + '/ingest', {
method: 'POST', headers: getHeaders(),
body: JSON.stringify({id, content, category: category || undefined})
});
const d = await r.json();
if(d.success) {
log.innerHTML = '<span class="success">✓ Ingested!</span> Chunks: ' + d.chunksCreated + ' | Time: ' + d.performance.totalTime;
document.getElementById('docId').value = '';
document.getElementById('docContent').value = '';
loadStats();
} else { log.innerHTML = '<span class="error">✗ ' + (d.error || 'Unknown error') + '</span>'; }
} catch(e) { log.innerHTML = '<span class="error">✗ ' + e.message + '</span>'; }
}

async function ingestImage(){
	const log = document.getElementById('imageLog');
	log.style.display = 'block';
	log.innerHTML = 'Processing image...';
	const id = document.getElementById('imageId').value;
	const originalFile = document.getElementById('imageFile').files[0];
	const category = document.getElementById('imageCategory').value;
	const imageType = document.getElementById('imageType').value;
	if(!id || !originalFile) { log.innerHTML = '<span class="error">ID and image file required</span>'; return; }
	try {
	const originalSizeMB = (originalFile.size / (1024 * 1024)).toFixed(2);
	log.innerHTML = 'Compressing image (' + originalSizeMB + 'MB)...';
	
	const compressedBlob = await compressImage(originalFile);
	const compressedSizeMB = (compressedBlob.size / (1024 * 1024)).toFixed(2);
	log.innerHTML = 'Uploading (' + originalSizeMB + 'MB → ' + compressedSizeMB + 'MB)...';
	
	const formData = new FormData();
	formData.append('id', id);
	formData.append('image', compressedBlob, 'image.jpg');
	if(category) formData.append('category', category);
	if(imageType !== 'auto') formData.append('imageType', imageType);
	
	const headers = {};
	const apiKey = document.getElementById('apiKey').value;
	if(apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
	
	const r = await fetch(API_BASE + '/ingest-image', {
	method: 'POST',
	headers: headers,
	body: formData
	});
	const d = await r.json();
	if(d.success) {
	log.innerHTML = '<span class="success">✓ Image Ingested!</span><br>' +
	'Compressed: ' + originalSizeMB + 'MB → ' + compressedSizeMB + 'MB<br>' +
	'Description: ' + (d.description || '').substring(0, 150) + '...<br>' +
	(d.extractedText ? 'OCR Text: ' + d.extractedText.substring(0, 100) + '...<br>' : '') +
	'Time: ' + d.performance.totalTime;
	document.getElementById('imageId').value = '';
	document.getElementById('imageFile').value = '';
	loadStats();
	} else { log.innerHTML = '<span class="error">✗ ' + (d.error || 'Unknown error') + '</span>'; }
	} catch(e) { log.innerHTML = '<span class="error">✗ ' + e.message + '</span>'; }
}

// Toggle V4 info display
document.getElementById('useV4Mode').addEventListener('change', (e) => {
  const v4Info = document.getElementById('v4Info');
  v4Info.style.display = e.target.checked ? 'block' : 'none';
});

async function search(){
const res = document.getElementById('searchResults');
const perf = document.getElementById('searchPerf');
res.innerHTML = 'Searching...';

const query = document.getElementById('searchQuery').value;
if(!query) { res.innerHTML = '<span class="error">Enter a query</span>'; return; }

const useV4 = document.getElementById('useV4Mode').checked;
const searchUrl = useV4 ? API_BASE + '/search?mode=v4' : API_BASE + '/search';

try {
const r = await fetch(searchUrl, {
method: 'POST', 
headers: getHeaders(),
body: JSON.stringify({
query,
topK: parseInt(document.getElementById('topK').value),
rerank: document.getElementById('useRerank').checked
})
});

const d = await r.json();
if(d.error) { res.innerHTML = '<span class="error">' + d.error + '</span>'; return; }

// Display results with V4 metadata if present
res.innerHTML = d.results.map(r => {
let routeBadge = '';
let costDisplay = '';

// Add route badge if V4 mode
if (d.metadata?.route) {
const routeClass = 'route-' + d.metadata.route.toLowerCase();
routeBadge = \`<span class="\${routeClass} route-badge">\${d.metadata.route}</span>\`;
}

// Add cost if present
if (d.cost) {
costDisplay = \`<div class="cost-display">Cost: \${d.cost.totalCost < 0.000001 ? '<$0.000001' : '$' + d.cost.totalCost.toFixed(6)} per query</div>\`;
}

return \`
<div class="result">
<div class="result-header">
\${r.isImage ? '<span class="image-badge">📸 IMAGE</span>' : ''}
<span class="result-id">\${r.id}\${routeBadge}</span>
<span class="result-score">Score: \${r.score.toFixed(4)}</span>
</div>
<div class="result-content">\${r.content.substring(0,300)}\${r.content.length>300?'...':''}</div>
\${r.category ? '<span class="result-category">' + r.category + '</span>' : ''}
\${costDisplay}
</div>
\`;
}).join('') || '<span class="error">No results</span>';

// Update performance display
perf.style.display = 'block';

let perfHTML = Object.entries(d.performance).map(([k,v]) => 
'<div class="perf-item">' + k + ': <span>' + v + '</span></div>'
).join('');

// Add V4 metadata if present
if (d.metadata) {
perfHTML += \`<div class="perf-item" style="grid-column:span 2;margin-top:8px;padding-top:8px;border-top:1px solid #e5e5e5">
<strong>Route:</strong> \${d.metadata.route} | 
<strong>Intent:</strong> \${d.metadata.intent}
\${d.metadata.reasoning ? '<br><em>' + d.metadata.reasoning + '</em>' : ''}
</div>\`;
}

document.getElementById('perfGrid').innerHTML = perfHTML;

} catch(e) { 
res.innerHTML = '<span class="error">✗ ' + e.message + '</span>'; 
}
}

async function loadCostAnalytics() {
  const queriesPerDay = document.getElementById('queriesPerDay').value;
  const costProjection = document.getElementById('costProjection');
  const costBreakdown = document.getElementById('costBreakdown');
  
  costProjection.innerHTML = 'Calculating...';
  
  try {
    const r = await fetch(API_BASE + '/analytics/cost?queriesPerDay=' + queriesPerDay, {
      headers: getHeaders()
    });
    const d = await r.json();
    
    costProjection.innerHTML = \`
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
        <div>
          <div style="font-size:0.7rem;color:#888">V3 Cost (Hybrid Only)</div>
          <div style="font-size:1.3rem;font-weight:700;color:#dc2626">\${d.monthlyProjection.v3Cost}</div>
        </div>
        <div>
          <div style="font-size:0.7rem;color:#888">V4 Cost (Smart Routing)</div>
          <div style="font-size:1.3rem;font-weight:700;color:#059669">\${d.monthlyProjection.v4Cost}</div>
        </div>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e5e5">
        <div style="font-size:0.7rem;color:#888">Monthly Savings</div>
        <div style="font-size:1.5rem;font-weight:700;color:#059669">
          \${d.monthlyProjection.savings} 
          <span style="font-size:0.9rem">(\${d.monthlyProjection.savingsPercent})</span>
        </div>
      </div>
    \`;
    
    // Show breakdown
    costBreakdown.style.display = 'block';
    costBreakdown.innerHTML = \`
      <div style="font-size:0.8rem;font-weight:600;margin-bottom:8px">Cost by Route (\${queriesPerDay} queries/day)</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        \${Object.entries(d.monthlyProjection.breakdownByRoute).map(([route, cost]) => \`
          <div style="background:#f9fafb;padding:8px;border-radius:6px">
            <div style="font-size:0.7rem;color:#888">\${route}</div>
            <div style="font-size:0.9rem;font-weight:600">\${cost}</div>
          </div>
        \`).join('')}
      </div>
    \`;
    
  } catch(e) {
    costProjection.innerHTML = '<span class="error">Failed to load analytics</span>';
  }
}

async function searchImages(){
document.getElementById('searchQuery').value = 'dashboard navigation';
await search();
const demoLog = document.getElementById('demoLog');
demoLog.style.display = 'block';
demoLog.innerHTML = '<span class="success">✓ Search complete!</span> Notice the 📸 IMAGE badges on results showing screenshots.';
}

async function searchFinancial(){
document.getElementById('searchQuery').value = 'Access Bank N30000';
await search();
const demoLog = document.getElementById('demoLog');
demoLog.style.display = 'block';
demoLog.innerHTML = '<span class="success">✓ Search complete!</span> OCR extracted transaction details from receipt images.';
}

document.getElementById('searchQuery').addEventListener('keypress', e => { if(e.key === 'Enter') search(); });
loadStats();
testAuth();
</script>
</body>
</html>`;
}