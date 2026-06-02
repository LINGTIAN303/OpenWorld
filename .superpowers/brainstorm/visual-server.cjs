const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 52341;
const SCREEN_DIR = path.join(__dirname, 'content');
const STATE_DIR = path.join(__dirname, 'state');
const EVENTS_FILE = path.join(STATE_DIR, 'events');

fs.mkdirSync(SCREEN_DIR, { recursive: true });
fs.mkdirSync(STATE_DIR, { recursive: true });

const FRAME_TEMPLATE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Visual Companion</title>
<style>
:root {
  --bg: #0f0f0f; --card-bg: #1a1a2e; --border-color: #333;
  --text-color: #e0e0e0; --text-secondary: #999; --text-tertiary: #666;
  --primary: #6c5ce7; --primary-light: #6c5ce720;
  --hover-bg: #ffffff10; --radius-md: 8px; --radius-lg: 12px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text-color); line-height: 1.6; padding: 24px; max-width: 960px; margin: 0 auto; }
h2 { font-size: 1.5em; margin-bottom: 8px; }
h3 { font-size: 1.1em; margin-bottom: 4px; }
.subtitle { color: var(--text-secondary); margin-bottom: 20px; font-size: 0.95em; }
.section { margin-bottom: 24px; }
.label { font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-tertiary); margin-bottom: 4px; }
.options { display: flex; flex-direction: column; gap: 12px; }
.options[data-multiselect] .option.selected { border-color: var(--primary); background: var(--primary-light); }
.option { display: flex; gap: 16px; padding: 16px; border: 2px solid var(--border-color); border-radius: var(--radius-lg); cursor: pointer; transition: all 0.2s; }
.option:hover { border-color: #555; background: var(--hover-bg); }
.option.selected { border-color: var(--primary); background: var(--primary-light); }
.option .letter { width: 36px; height: 36px; border-radius: 50%; background: var(--primary); color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; flex-shrink: 0; }
.option .content { flex: 1; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.card { border: 2px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden; cursor: pointer; transition: all 0.2s; }
.card:hover { border-color: #555; }
.card.selected { border-color: var(--primary); }
.card-image { min-height: 120px; background: #222; display: flex; align-items: center; justify-content: center; padding: 16px; }
.card-body { padding: 12px; }
.mockup { border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden; margin-bottom: 16px; }
.mockup-header { padding: 8px 16px; background: #222; font-size: 0.85em; color: var(--text-secondary); border-bottom: 1px solid var(--border-color); }
.mockup-body { padding: 16px; background: #161625; min-height: 200px; }
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.pros-cons { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; }
.pros { background: #0a2e0a; border: 1px solid #22c55e40; border-radius: var(--radius-md); padding: 12px; }
.cons { background: #2e0a0a; border: 1px solid #ef444440; border-radius: var(--radius-md); padding: 12px; }
.pros h4 { color: #22c55e; } .cons h4 { color: #ef4444; }
.pros ul, .cons ul { padding-left: 20px; margin-top: 8px; }
.mock-nav { padding: 8px 16px; background: #222; border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 8px; color: var(--text-secondary); font-size: 0.85em; }
.mock-sidebar { width: 180px; background: #1a1a2e; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px; min-height: 200px; color: var(--text-secondary); font-size: 0.85em; }
.mock-content { flex: 1; background: #161625; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; min-height: 200px; }
.mock-button { padding: 6px 16px; background: var(--primary); color: white; border: none; border-radius: var(--radius-md); cursor: pointer; font-size: 0.85em; }
.mock-input { padding: 6px 12px; background: #222; border: 1px solid var(--border-color); border-radius: var(--radius-md); color: var(--text-color); font-size: 0.85em; }
.placeholder { background: #222; border: 2px dashed var(--border-color); border-radius: var(--radius-md); padding: 24px; text-align: center; color: var(--text-tertiary); }
.indicator { position: fixed; top: 0; left: 0; right: 0; height: 3px; background: var(--primary); opacity: 0; transition: opacity 0.3s; z-index: 9999; }
.indicator.active { opacity: 1; }
table { width: 100%; border-collapse: collapse; margin: 12px 0; }
th, td { padding: 8px 12px; border: 1px solid var(--border-color); text-align: left; font-size: 0.9em; }
th { background: #222; color: var(--text-secondary); }
code { background: #222; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
</style>
</head>
<body>
<div class="indicator" id="indicator"></div>
<div id="content"></div>
<script>
function toggleSelect(el) {
  const container = el.closest('.options, .cards');
  if (!container) return;
  const isMulti = container.hasAttribute('data-multiselect');
  if (!isMulti) {
    container.querySelectorAll('.option, .card').forEach(o => o.classList.remove('selected'));
  }
  el.classList.toggle('selected');
  const indicator = document.getElementById('indicator');
  indicator.classList.add('active');
  setTimeout(() => indicator.classList.remove('active'), 500);
  const choice = el.getAttribute('data-choice') || '';
  const text = el.textContent?.trim()?.substring(0, 80) || '';
  fetch('/event', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({type:'click', choice, text, timestamp: Date.now()/1000}) });
}
</script>
</body>
</html>`;

function getLatestFile(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
  if (!files.length) return null;
  let latest = files[0], latestTime = 0;
  for (const f of files) {
    const stat = fs.statSync(path.join(dir, f));
    if (stat.mtimeMs > latestTime) { latestTime = stat.mtimeMs; latest = f; }
  }
  return path.join(dir, latest);
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/event') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      fs.appendFileSync(EVENTS_FILE, body + '\n');
      res.writeHead(200);
      res.end('ok');
    });
    return;
  }
  const filePath = getLatestFile(SCREEN_DIR);
  if (!filePath) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>等待内容...</h2><p class="subtitle">视觉伴侣已就绪，等待设计内容</p>');
    return;
  }
  let content = fs.readFileSync(filePath, 'utf-8');
  let html;
  if (content.trimStart().startsWith('<!DOCTYPE') || content.trimStart().startsWith('<html')) {
    html = content;
  } else {
    html = FRAME_TEMPLATE.replace('<div id="content"></div>', `<div id="content">${content}</div>`);
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

server.listen(PORT, () => {
  const info = { type: 'server-started', port: PORT, url: `http://localhost:${PORT}`, screen_dir: SCREEN_DIR, state_dir: STATE_DIR };
  fs.writeFileSync(path.join(STATE_DIR, 'server-info'), JSON.stringify(info, null, 2));
  console.log(JSON.stringify(info));
});
