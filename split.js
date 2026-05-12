const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

// 1. Extract CSS
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (styleMatch) {
  fs.writeFileSync('public/css/style.css', styleMatch[1]);
}

// 2. Extract JS
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (scriptMatch) {
  fs.writeFileSync('public/js/app.js', scriptMatch[1]);
}

// 3. Extract Screens manually via simple slicing
const screensToExtract = [
  'screen-home',
  'screen-host-setup',
  'screen-player-join',
  'screen-player-lobby',
  'screen-game',
  'screen-login',
  'screen-register',
  'screen-profile',
  'screen-gameover'
];

let remainingHtml = html;

for (const id of screensToExtract) {
  const startTag = `<div id="${id}"`;
  const startIndex = remainingHtml.indexOf(startTag);
  if (startIndex === -1) continue;
  
  // Find closing </div>
  let depth = 0;
  let endIndex = -1;
  for (let i = startIndex; i < remainingHtml.length; i++) {
    if (remainingHtml.startsWith('<div', i)) {
      depth++;
    } else if (remainingHtml.startsWith('</div', i)) {
      depth--;
      if (depth === 0) {
        endIndex = i + 6; // length of </div>
        break;
      }
    }
  }
  
  if (endIndex !== -1) {
    const componentHtml = remainingHtml.substring(startIndex, endIndex);
    const fileName = id.replace('screen-', '') + '.html';
    fs.writeFileSync(`public/components/${fileName}`, componentHtml);
  }
}

// 4. Create new index.html
const newIndexHtml = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>知識の戦い — Chishiki no Tatakai</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;700;900&family=Cinzel+Decorative:wght@700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/css/style.css" />
</head>
<body>

<!-- WS Status -->
<div id="ws-status">
  <div class="dot"></div>
  <span id="ws-status-text">Menghubungkan…</span>
</div>

<!-- Toast -->
<div id="toast"></div>

<!-- Decorative vertical text -->
<div class="deco-vtext left">知識</div>
<div class="deco-vtext right">戦い</div>

<!-- Mobile Leaderboard Overlay -->
<div class="mobile-lb-overlay" id="mobile-lb-overlay" onclick="closeMobileLb()">
  <div class="mobile-lb-sheet" onclick="event.stopPropagation()">
    <div class="sidebar-title">🏆 Papan Skor</div>
    <div class="lb-list" id="mobile-lb-list"></div>
    <button class="btn btn-ghost btn-full mt-2" onclick="closeMobileLb()">Tutup</button>
  </div>
</div>

<div id="app-container">
  <!-- Components will be injected here dynamically -->
</div>

<script>
  // Component Loader
  async function loadComponents() {
    const components = [
      'home', 'login', 'register', 'profile', 'host-setup', 
      'player-join', 'player-lobby', 'game', 'gameover'
    ];
    
    const container = document.getElementById('app-container');
    
    for (const c of components) {
      try {
        const res = await fetch(\`/components/\${c}.html\`);
        const html = await res.text();
        container.insertAdjacentHTML('beforeend', html);
      } catch (e) {
        console.error('Failed to load component:', c, e);
      }
    }
    
    // Load main app script after all components are injected
    const script = document.createElement('script');
    script.src = '/js/app.js';
    document.body.appendChild(script);
  }
  
  loadComponents();
</script>
</body>
</html>`;

fs.writeFileSync('public/index.html', newIndexHtml);
console.log('Successfully split files!');
