
// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  ws: null,
  roomId: null,
  playerId: null,
  isHost: false,
  playerName: '',
  questionDone: false,
  myAnswerIndex: null,   // null = haven't answered
  currentCorrectIndex: null,
  // Auth
  isAuthenticated: false,
  currentUser: null,
  currentUserId: null,
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
function connectWS() {
  if (state.ws) {
    state.ws.onclose = null;
    state.ws.close();
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${location.host}/ws`)
  state.ws = ws

  ws.onopen = () => {
    setWsStatus(true)
    
    // Auto-reconnect if session data exists
    const storedRoomId = sessionStorage.getItem('roomId')
    const storedPlayerId = sessionStorage.getItem('playerId')
    if (storedRoomId && storedPlayerId) {
      sendWS({ type: 'reconnect', roomId: storedRoomId, playerId: storedPlayerId })
    }
  }

  ws.onclose = () => {
    setWsStatus(false)
    // Try to reconnect after 3s if on a non-home screen
    if (currentScreen() !== 'screen-home') {
      setTimeout(connectWS, 3000)
    }
  }

  ws.onerror = () => setWsStatus(false)

  ws.onmessage = (e) => {
    let msg
    try { msg = JSON.parse(e.data) } catch { return }
    handleServerMessage(msg)
  }
}

function sendWS(obj) {
  if (state.ws?.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(obj))
  } else {
    showToast('⚠️ Koneksi terputus. Mencoba ulang…')
    connectWS()
  }
}

function setWsStatus(connected) {
  const el = document.getElementById('ws-status')
  const txt = document.getElementById('ws-status-text')
  el.className = connected ? 'connected' : 'disconnected'
  txt.textContent = connected ? 'Terhubung' : 'Terputus'
}

// ─── Screen Manager ───────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.getElementById(id).classList.add('active')
  window.scrollTo(0, 0)
}

function currentScreen() {
  return document.querySelector('.screen.active')?.id ?? ''
}

// ─── Authentication ───────────────────────────────────────────────────────────
async function handleRegister() {
  const username = document.getElementById('register-username').value.trim()
  const email = document.getElementById('register-email').value.trim()
  const password = document.getElementById('register-password').value.trim()
  const errorEl = document.getElementById('register-error')

  if (!username || !email || !password) {
    errorEl.textContent = '⚠️ Isi semua kolom'
    return
  }

  const btn = document.getElementById('btn-register')
  btn.disabled = true
  btn.innerHTML = '<span class="spinner"></span> Mendaftar…'

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    })
    const data = await res.json()

    if (!data.success) {
      errorEl.textContent = '❌ ' + data.message
      btn.disabled = false
      btn.innerHTML = '📝 Daftar'
      return
    }

    showToast('✅ Registrasi berhasil! Silakan login.')
    document.getElementById('register-username').value = ''
    document.getElementById('register-email').value = ''
    document.getElementById('register-password').value = ''
    errorEl.textContent = ''
    btn.disabled = false
    btn.innerHTML = '📝 Daftar'
    showScreen('screen-login')
  } catch (err) {
    errorEl.textContent = '❌ Kesalahan: ' + err.message
    btn.disabled = false
    btn.innerHTML = '📝 Daftar'
  }
}

async function handleLogin() {
  const username = document.getElementById('login-username').value.trim()
  const password = document.getElementById('login-password').value.trim()
  const errorEl = document.getElementById('login-error')

  if (!username || !password) {
    errorEl.textContent = '⚠️ Isi username dan password'
    return
  }

  const btn = document.getElementById('btn-login')
  btn.disabled = true
  btn.innerHTML = '<span class="spinner"></span> Login…'

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    const data = await res.json()

    if (!data.success) {
      errorEl.textContent = '❌ ' + data.message
      btn.disabled = false
      btn.innerHTML = '🔓 Login'
      return
    }

    // Save token and user info to localStorage
    localStorage.setItem('token', data.token)
    localStorage.setItem('username', data.username)
    localStorage.setItem('userId', data.userId)
    state.isAuthenticated = true
    state.currentUser = data.username
    state.currentUserId = data.userId

    showToast('✅ Login berhasil! Selamat datang, ' + data.username)
    document.getElementById('login-username').value = ''
    document.getElementById('login-password').value = ''
    errorEl.textContent = ''
    btn.disabled = false
    btn.innerHTML = '🔓 Login'

    updateAuthUI()
    showScreen('screen-home')
  } catch (err) {
    errorEl.textContent = '❌ Kesalahan: ' + err.message
    btn.disabled = false
    btn.innerHTML = '🔓 Login'
  }
}

function handleLogout() {
  localStorage.removeItem('token')
  localStorage.removeItem('username')
  localStorage.removeItem('userId')
  state.isAuthenticated = false
  state.currentUser = null
  state.currentUserId = null
  showToast('👋 Logout berhasil')
  updateAuthUI()
  if (state.ws) state.ws.close()
  showScreen('screen-home')
}

function updateAuthUI() {
  const authSection = document.getElementById('home-auth-section')
  const gameSection = document.getElementById('home-game-section')
  const userInfo = document.getElementById('home-user-info')
  
  if (state.isAuthenticated) {
    if (authSection) authSection.style.display = 'none'
    if (gameSection) gameSection.style.display = 'grid'
    if (userInfo) userInfo.style.display = 'block'
    const userDisplay = document.getElementById('home-username')
    if (userDisplay) userDisplay.textContent = state.currentUser || 'User'
  } else {
    if (authSection) authSection.style.display = 'grid'
    if (gameSection) gameSection.style.display = 'none'
    if (userInfo) userInfo.style.display = 'none'
  }
}

// ─── Home ─────────────────────────────────────────────────────────────────────
async function goToHostSetup() {
  showToast('Membuat room…')
  try {
    const res = await fetch('/api/create-room', { method: 'POST' })
    const data = await res.json()
    if (!data.roomId) throw new Error('Gagal membuat room')

    state.roomId = data.roomId
    state.isHost = true
    state.playerName = 'Host'

    document.getElementById('host-room-code').textContent = data.roomId
    document.getElementById('host-player-list').innerHTML = ''
    document.getElementById('host-player-count').textContent = '0 Peserta'
    document.getElementById('btn-start-game').disabled = true
    showScreen('screen-host-setup')

    // Join the room as host via WS
    sendWS({ type: 'join', roomId: data.roomId, playerName: 'Host', isHost: true })
  } catch (err) {
    showToast('❌ Gagal membuat room: ' + err.message)
  }
}

function copyRoomCode() {
  navigator.clipboard.writeText(state.roomId ?? '')
  showToast('📋 Kode room disalin!')
}

// ─── Player Join ──────────────────────────────────────────────────────────────
function joinRoom() {
  const name = document.getElementById('player-name-input').value.trim()
  const code = document.getElementById('player-room-code-input').value.trim().toUpperCase()

  if (!name)  { showToast('⚠️ Masukkan namamu!'); return }
  if (!code)  { showToast('⚠️ Masukkan kode room!'); return }
  if (code.length < 4) { showToast('⚠️ Kode room tidak valid'); return }

  state.playerName = name
  state.roomId = code
  state.isHost = false

  const btn = document.getElementById('btn-join')
  btn.disabled = true
  btn.innerHTML = '<span class="spinner"></span> Bergabung…'

  sendWS({ type: 'join', roomId: code, playerName: name, isHost: false })
}

// ─── Host: Start Game ─────────────────────────────────────────────────────────
function sendStartGame() {
  sendWS({ type: 'start_game', roomId: state.roomId })
}

// ─── Game: Answer ─────────────────────────────────────────────────────────────
function submitAnswer(index) {
  if (state.questionDone || state.myAnswerIndex !== null) return
  state.myAnswerIndex = index

  // Highlight selected
  document.querySelectorAll('.answer-btn').forEach((btn, i) => {
    if (i === index) btn.classList.add('selected')
    btn.disabled = true
  })

  sendWS({ type: 'answer', roomId: state.roomId, answerIndex: index })
}

function sendSkipQuestion() {
  sendWS({ type: 'skip_question', roomId: state.roomId })
}

// ─── Game: Chat ───────────────────────────────────────────────────────────────
function sendChatMessage(formEl) {
  const input = formEl ? formEl.querySelector('.chat-input') : document.getElementById('chat-input')
  const text = input?.value.trim()
  if (!text) return
  sendWS({ type: 'chat', text })
  if (input) input.value = ''
  document.querySelectorAll('.chat-input').forEach(el => el.value = '')
}

// ─── Server Message Handler ────────────────────────────────────────────────────
function handleServerMessage(msg) {
  switch (msg.type) {

    case 'room_joined': {
      state.playerId = msg.playerId
      state.isHost   = msg.isHost

      // Persist to session
      sessionStorage.setItem('roomId', state.roomId)
      sessionStorage.setItem('playerId', state.playerId)
      sessionStorage.setItem('isHost', state.isHost)
      sessionStorage.setItem('playerName', state.playerName)

      if (msg.isHost) {
        // Already on host-setup screen
      } else {
        // Transition to player lobby
        document.getElementById('player-lobby-room').textContent = 'Room: ' + state.roomId
        const btn = document.getElementById('btn-join')
        if (btn) {
          btn.disabled = false
          btn.innerHTML = '⚔️ Bergabung'
        }
        showScreen('screen-player-lobby')
      }
      break
    }

    case 'reconnect_success': {
      state.roomId = msg.roomId
      state.playerId = msg.player.id
      state.isHost = msg.player.isHost
      state.playerName = msg.player.name
      
      // Sync UI based on gameState
      const gameState = msg.gameState
      renderLeaderboard(msg.leaderboard)
      
      if (gameState.status === 'waiting') {
        if (state.isHost) {
          document.getElementById('host-room-code').textContent = state.roomId
          showScreen('screen-host-setup')
        } else {
          document.getElementById('player-lobby-room').textContent = 'Room: ' + state.roomId
          showScreen('screen-player-lobby')
        }
      } else if (gameState.status === 'playing') {
        initGameScreen()
        showScreen('screen-game')
        
        // Restore current question if not done
        if (!gameState.questionDone && gameState.currentIndex < gameState.questions.length) {
          const q = gameState.questions[gameState.currentIndex]
          renderQuestion(q, gameState.currentIndex + 1, gameState.questions.length)
          
          // Disable answers if we already answered
          if (msg.player.answeredCurrentQuestion) {
            state.myAnswerIndex = 0 // arbitrary just to block
            document.querySelectorAll('.answer-btn').forEach(btn => btn.disabled = true)
            document.getElementById('answer-status').innerHTML = '<span class="text-muted">Menunggu pemain lain…</span>'
          }
        } else {
          // Question is done, just show waiting
          document.querySelectorAll('.answer-btn').forEach(btn => btn.disabled = true)
          document.getElementById('question-text').textContent = "Bersiap untuk soal selanjutnya..."
        }
      } else if (gameState.status === 'finished') {
        renderGameOver(msg.leaderboard)
        showScreen('screen-gameover')
      }
      
      showToast('✅ Berhasil menyambung ulang!')
      break
    }

    case 'players_update': {
      const participants = msg.players.filter(p => !p.isHost)
      updateHostPlayerList(participants)
      updateLobbyPlayerList(msg.players)
      // Enable start button when there's at least 1 participant
      const btn = document.getElementById('btn-start-game')
      if (btn) btn.disabled = participants.length === 0
      document.getElementById('host-player-count').textContent = `${participants.length} Peserta`
      break
    }

    case 'game_started': {
      initGameScreen()
      showScreen('screen-game')
      showToast('⚔️ Permainan Dimulai!')
      break
    }

    case 'question': {
      renderQuestion(msg.data, msg.index, msg.total)
      break
    }

    case 'answer_result': {
      const isMine = msg.playerId === state.playerId
      if (isMine) {
        const statusEl = document.getElementById('answer-status')
        if (msg.correct) {
          statusEl.innerHTML = `<span class="text-correct fw-700">✅ Benar! +${msg.scoreChange} poin</span>`
          showScoreFloat('+10', 'var(--correct)')
        } else {
          statusEl.innerHTML = `<span class="text-wrong fw-700">❌ Salah! ${msg.scoreChange} poin</span>`
          showScoreFloat('-5', 'var(--wrong)')
        }
      } else if (!msg.correct) {
        showToast(`❌ ${msg.playerName} menjawab salah`)
      }
      break
    }

    case 'question_done': {
      state.questionDone = true
      revealAnswers(msg.correctIndex, msg.winnerId, msg.winnerName)
      if (msg.winnerId && msg.winnerId !== state.playerId) {
        showToast(`✅ ${msg.winnerName} menjawab benar!`)
      } else if (!msg.winnerId) {
        showToast('⏭ Tidak ada yang menjawab benar. Lanjut soal berikutnya.')
        document.getElementById('answer-status').innerHTML =
          '<span class="text-muted">Tidak ada yang menjawab benar</span>'
      }
      break
    }

    case 'leaderboard': {
      renderLeaderboard(msg.players)
      break
    }

    case 'game_over': {
      renderGameOver(msg.players)
      showScreen('screen-gameover')
      break
    }

    case 'host_disconnected': {
      showToast('⚠️ Host terputus. Room ditutup.')
      setTimeout(leaveAndGoHome, 2000)
      break
    }

    case 'player_left': {
      showToast(`👋 ${msg.playerName} meninggalkan room`)
      break
    }

    case 'chat': {
      const containers = document.querySelectorAll('.chat-messages-container')
      containers.forEach(container => {
        const isMine = msg.playerId === state.playerId
        const bubble = document.createElement('div')
        bubble.style.cssText = `
          align-self: ${isMine ? 'flex-end' : 'flex-start'};
          max-width: 85%;
          padding: .5rem .75rem;
          border-radius: 8px;
          background: ${isMine ? 'rgba(200,21,42,.2)' : 'var(--card)'};
          border: 1px solid ${isMine ? 'rgba(200,21,42,.4)' : 'var(--border)'};
          font-size: .8rem;
          line-height: 1.4;
          word-break: break-word;
        `
        const nameEl = isMine ? '' : `<div style="font-size:.65rem; color:var(--gold); margin-bottom:.2rem; font-weight:700;">${escHtml(msg.playerName)}</div>`
        bubble.innerHTML = `${nameEl}<div>${escHtml(msg.text)}</div>`
        container.appendChild(bubble)
        container.scrollTop = container.scrollHeight
      })
      break
    }

    case 'presence': {
      if (msg.status === 'offline') {
        showToast(`📴 ${msg.playerName} offline`)
      } else {
        showToast(`📶 ${msg.playerName} online`)
      }
      break
    }

    case 'error': {
      showToast('❌ ' + msg.message)
      // Re-enable join button if it was disabled
      const btn = document.getElementById('btn-join')
      if (btn) { btn.disabled = false; btn.innerHTML = '⚔️ Bergabung' }
      break
    }
  }
}

// ─── UI: Player Lists ─────────────────────────────────────────────────────────
function updateHostPlayerList(players) {
  const ul = document.getElementById('host-player-list')
  if (players.length === 0) {
    ul.innerHTML = '<li style="justify-content:center; color:var(--muted); font-size:.85rem; border:none; background:none">Menunggu peserta bergabung…</li>'
    return
  }
  ul.innerHTML = players.map(p => `
    <li>
      <div class="avatar">${p.name[0].toUpperCase()}</div>
      <span>${escHtml(p.name)}</span>
    </li>
  `).join('')
}

function updateLobbyPlayerList(players) {
  const ul = document.getElementById('lobby-player-list')
  if (!ul) return
  ul.innerHTML = players.map(p => `
    <li class="${p.isHost ? 'host-tag' : ''}">
      <div class="avatar" style="${p.status === 'offline' ? 'opacity:0.4' : ''}">${p.name[0].toUpperCase()}</div>
      <span style="${p.status === 'offline' ? 'opacity:0.5; text-decoration:line-through' : ''}">${escHtml(p.name)} ${p.isHost ? '<span class="badge badge-gold" style="font-size:.65rem;padding:.1rem .4rem">Host</span>' : ''} ${p.status === 'offline' ? '<span style="font-size:0.65rem;color:var(--wrong)">(Offline)</span>' : ''}</span>
    </li>
  `).join('')
}

// ─── UI: Game Screen Init ─────────────────────────────────────────────────────
function initGameScreen() {
  state.questionDone  = false
  state.myAnswerIndex = null
  document.getElementById('answer-status').innerHTML = ''
  if (state.isHost) {
    document.getElementById('host-game-controls').style.display = 'flex'
  }
}

// ─── UI: Render Question ──────────────────────────────────────────────────────
function renderQuestion(q, index, total) {
  state.questionDone  = false
  state.myAnswerIndex = null
  state.currentCorrectIndex = null

  // Progress
  const pct = Math.round((index / total) * 100)
  document.getElementById('q-progress-fill').style.width = pct + '%'
  document.getElementById('q-progress-label').textContent = `${index} / ${total}`
  document.getElementById('q-index-label').textContent = `Soal ke-${index}`
  document.getElementById('q-category').textContent = q.category
  document.getElementById('question-text').textContent = q.question

  // Answers
  const labels = ['A', 'B', 'C', 'D']
  const grid = document.getElementById('answers-grid')
  grid.innerHTML = q.options.map((opt, i) => `
    <button class="answer-btn anim-fade" style="animation-delay:${i * 0.06}s"
            onclick="submitAnswer(${i})" ${state.isHost ? 'disabled' : ''}>
      <span class="opt-label">${labels[i]}</span>
      <span>${escHtml(opt)}</span>
    </button>
  `).join('')

  // Clear status
  document.getElementById('answer-status').innerHTML = ''

  // Animate question card
  const card = document.getElementById('question-card')
  card.style.animation = 'none'
  void card.offsetWidth
  card.style.animation = 'fadeIn .4s ease'
}

// ─── UI: Reveal Answers ───────────────────────────────────────────────────────
function revealAnswers(correctIndex, winnerId, winnerName) {
  state.currentCorrectIndex = correctIndex
  const btns = document.querySelectorAll('.answer-btn')
  btns.forEach((btn, i) => {
    btn.classList.add('revealed')
    btn.disabled = true
    if (i === correctIndex) {
      btn.classList.remove('selected')
      btn.classList.add('correct')
    } else if (i === state.myAnswerIndex && state.myAnswerIndex !== correctIndex) {
      btn.classList.add('wrong')
    }
  })
}

// ─── UI: Leaderboard ──────────────────────────────────────────────────────────
function renderLeaderboard(players) {
  const nonHost = players.filter(p => !p.isHost)
  const html = nonHost.map((p, i) => {
    const rank = i + 1
    const rankClass = rank <= 3 ? `top-${rank}` : ''
    const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank
    return `
      <div class="lb-item ${rankClass}">
        <span class="lb-rank">${rankEmoji}</span>
        <span class="lb-name">${escHtml(p.name)}</span>
        <span class="lb-score">${p.score}</span>
      </div>
    `
  }).join('')

  const sidebarEl = document.getElementById('sidebar-lb-list')
  const mobileEl  = document.getElementById('mobile-lb-list')
  if (sidebarEl) sidebarEl.innerHTML = html || '<p class="text-muted" style="font-size:.8rem">—</p>'
  if (mobileEl)  mobileEl.innerHTML  = html || '<p class="text-muted" style="font-size:.8rem">—</p>'
}

// ─── UI: Game Over ────────────────────────────────────────────────────────────
function renderGameOver(players) {
  const nonHost = players.filter(p => !p.isHost)

  // Podium (top 3)
  const podiumEl = document.getElementById('podium')
  const top3 = [nonHost[1], nonHost[0], nonHost[2]].filter(Boolean) // 2nd, 1st, 3rd
  const podiumOrder = [{ cls: 'p2', h: '85px' }, { cls: 'p1', h: '120px' }, { cls: 'p3', h: '60px' }]
  const medals = ['🥈', '🥇', '🥉']

  podiumEl.innerHTML = top3.map((p, idx) => `
    <div class="podium-slot ${podiumOrder[idx].cls}">
      <div class="podium-name">${escHtml(p.name)}</div>
      <div class="podium-score">${p.score} pts</div>
      <div class="podium-block" style="height:${podiumOrder[idx].h}">
        <span class="pos">${medals[idx]}</span>
      </div>
    </div>
  `).join('')

  // Full table
  const tbody = document.getElementById('final-tbody')
  const rankMedals = ['🥇', '🥈', '🥉']
  tbody.innerHTML = nonHost.map((p, i) => `
    <tr>
      <td class="rank-cell">${rankMedals[i] ?? (i + 1)}</td>
      <td>${escHtml(p.name)}</td>
      <td class="score-cell">${p.score}</td>
      <td class="text-correct fw-700">${p.correctAnswers}</td>
      <td class="text-wrong fw-700">${p.wrongAnswers}</td>
    </tr>
  `).join('')

  // Show "Play Again" only for host
  document.getElementById('btn-play-again').style.display = state.isHost ? 'inline-flex' : 'none'
}

// ─── Play Again ───────────────────────────────────────────────────────────────
function playAgain() {
  // Re-use the same room – just reload
  leaveAndGoHome()
}

// ─── Leave / Home ─────────────────────────────────────────────────────────────
function leaveAndGoHome() {
  if (state.ws) { state.ws.close(); state.ws = null }
  sessionStorage.removeItem('roomId')
  sessionStorage.removeItem('playerId')
  sessionStorage.removeItem('isHost')
  sessionStorage.removeItem('playerName')
  state.roomId = null
  state.playerId = null
  state.isHost = false
  state.playerName = ''
  
  const nameInput = document.getElementById('player-name-input')
  const codeInput = document.getElementById('player-room-code-input')
  if (nameInput) nameInput.value = ''
  if (codeInput) codeInput.value = ''
  
  showScreen('screen-home')
  connectWS()
}

// ─── Score Float ──────────────────────────────────────────────────────────────
function showScoreFloat(text, color) {
  const el = document.createElement('div')
  el.className = 'score-float'
  el.textContent = text
  el.style.color  = color
  el.style.left   = (window.innerWidth / 2 - 20) + 'px'
  el.style.top    = (window.innerHeight / 2) + 'px'
  document.body.appendChild(el)
  el.addEventListener('animationend', () => el.remove())
}

// ─── Mobile Leaderboard ───────────────────────────────────────────────────────
function openMobileLb()  { document.getElementById('mobile-lb-overlay').classList.add('open') }
function closeMobileLb() { document.getElementById('mobile-lb-overlay').classList.remove('open') }

// ─── Toast ────────────────────────────────────────────────────────────────────
let toastTimer
function showToast(msg, duration = 2800) {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), duration)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Init ─────────────────────────────────────────────────────────────────────
// Check if user is already logged in
const token = localStorage.getItem('token')
const username = localStorage.getItem('username')
const userId = localStorage.getItem('userId')

if (token && username && userId) {
  state.isAuthenticated = true
  state.currentUser = username
  state.currentUserId = userId
}

updateAuthUI()
connectWS()
