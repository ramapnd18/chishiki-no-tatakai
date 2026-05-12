import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { createBunWebSocket } from 'hono/bun'
import type { ServerWebSocket } from 'bun'
import type { ClientMessage } from './types'
import {
  createRoom,
  joinRoom,
  removePlayer,
  cleanupEmptyRoom,
  handleAnswer,
  startGame,
  skipQuestion,
  getRoom,
  getLeaderboard,
  broadcast,
  sendTo,
  playerPublic,
} from './gameManager'
import {
  register,
  login,
  verifySession,
  logout,
  getUser,
  updateUserStats,
} from './auth'

// ─── WebSocket Setup ──────────────────────────────────────────────────────────

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>()

// ─── Hono App ─────────────────────────────────────────────────────────────────

const app = new Hono()

// Static files from /public
app.use('/*', serveStatic({ root: './public' }))

// ─── REST: Authentication ────────────────────────────────────────────────────

app.post('/api/auth/register', async (c) => {
  try {
    const body = await c.req.json()
    const { username, email, password } = body

    const result = await register(username, email, password)
    if (!result.success) {
      return c.json({ success: false, message: result.message }, 400)
    }

    return c.json({
      success: true,
      message: result.message,
      userId: result.userId,
    })
  } catch (error) {
    return c.json({ success: false, message: 'Error registrasi' }, 500)
  }
})

app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json()
    const { username, password } = body

    const result = await login(username, password)
    if (!result.success) {
      return c.json({ success: false, message: result.message }, 401)
    }

    return c.json({
      success: true,
      message: result.message,
      token: result.token,
      username: result.username,
      userId: result.userId,
    })
  } catch (error) {
    return c.json({ success: false, message: 'Error login' }, 500)
  }
})

app.get('/api/auth/verify', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) {
    return c.json({ valid: false }, 401)
  }

  const result = await verifySession(token)
  if (!result.valid || !result.session) {
    return c.json({ valid: false }, 401)
  }

  const user = await getUser(result.session.userId)
  return c.json({
    valid: true,
    user: {
      id: user?.id,
      username: user?.username,
      email: user?.email,
      totalGames: user?.totalGamesPlayed ?? 0,
      totalScore: user?.totalScore ?? 0,
    },
  })
})

app.post('/api/auth/logout', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) {
    return c.json({ success: false }, 401)
  }

  await logout(token)
  return c.json({ success: true, message: 'Logout berhasil' })
})

// ─── REST: Create Room ────────────────────────────────────────────────────────

app.post('/api/create-room', (c) => {
  const { roomId } = createRoom()
  console.log(`[Room] Created: ${roomId}`)
  return c.json({ success: true, roomId })
})

// ─── REST: Check Room Exists ──────────────────────────────────────────────────

app.get('/api/room/:roomId', (c) => {
  const roomId = c.req.param('roomId').toUpperCase()
  const room = getRoom(roomId)
  if (!room) return c.json({ exists: false }, 404)
  return c.json({
    exists: true,
    status: room.game.status,
    playerCount: room.players.size,
  })
})

// ─── WebSocket Endpoint ───────────────────────────────────────────────────────

app.get(
  '/ws',
  upgradeWebSocket(() => {
    // Unique per-connection state via closure
    let connectedRoomId: string | null = null
    let connectedPlayerId: string | null = null

    return {
      onOpen(_event, ws) {
        console.log('[WS] Connection opened')
        ws.send(JSON.stringify({ type: 'connected', message: '知識の戦い へようこそ!' }))
      },

      onMessage(event, ws) {
        let msg: ClientMessage
        try {
          msg = JSON.parse(event.data as string) as ClientMessage
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Format pesan tidak valid.' }))
          return
        }

        // ── join ────────────────────────────────────────────────────────────
        if (msg.type === 'join') {
          const roomId = msg.roomId.trim().toUpperCase()
          const room = getRoom(roomId)

          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room tidak ditemukan.' }))
            return
          }

          const result = joinRoom(roomId, msg.playerName, msg.isHost, ws)
          if (result.error) {
            ws.send(JSON.stringify({ type: 'error', message: result.error }))
            return
          }

          const player = result.player!
          connectedRoomId = roomId
          connectedPlayerId = player.id

          console.log(`[WS] ${player.name} joined room ${roomId} (host=${player.isHost})`)

          // Confirm to the new player
          sendTo(player, {
            type: 'room_joined',
            roomId,
            playerId: player.id,
            isHost: player.isHost,
          })

          // Broadcast updated player list to everyone
          const players = [...room.players.values()].map(playerPublic)
          broadcast(room, { type: 'players_update', players })
          return
        }

        // ── reconnect ───────────────────────────────────────────────────────
        if (msg.type === 'reconnect') {
          const roomId = msg.roomId.trim().toUpperCase()
          const playerId = msg.playerId.trim()
          const room = getRoom(roomId)

          if (!room) {
            ws.send(JSON.stringify({ type: 'error', message: 'Sesi permainan sudah berakhir.' }))
            return
          }

          const { player, error } = require('./gameManager').reconnectPlayer(roomId, playerId, ws)
          if (error || !player) {
            ws.send(JSON.stringify({ type: 'error', message: error || 'Gagal menyambung ulang.' }))
            return
          }

          connectedRoomId = roomId
          connectedPlayerId = player.id
          console.log(`[WS] ${player.name} reconnected to room ${roomId}`)

          // Send current state to reconnected player
          sendTo(player, {
            type: 'reconnect_success',
            roomId,
            player: playerPublic(player),
            gameState: room.game,
            leaderboard: getLeaderboard(room)
          })

          const players = [...room.players.values()].map(playerPublic)
          broadcast(room, { type: 'players_update', players })
          return
        }

        // All subsequent messages require an established connection
        if (!connectedRoomId || !connectedPlayerId) {
          ws.send(JSON.stringify({ type: 'error', message: 'Kamu belum bergabung ke room.' }))
          return
        }

        // ── start_game ──────────────────────────────────────────────────────
        if (msg.type === 'start_game') {
          const result = startGame(connectedRoomId)
          if (result.error) {
            ws.send(JSON.stringify({ type: 'error', message: result.error }))
          }
          return
        }

        // ── answer ──────────────────────────────────────────────────────────
        if (msg.type === 'answer') {
          const result = handleAnswer(connectedRoomId, connectedPlayerId, msg.answerIndex)
          if (result.error) {
            ws.send(JSON.stringify({ type: 'error', message: result.error }))
          }
          return
        }

        // ── skip_question ───────────────────────────────────────────────────
        if (msg.type === 'skip_question') {
          const result = skipQuestion(connectedRoomId, connectedPlayerId)
          if (result.error) {
            ws.send(JSON.stringify({ type: 'error', message: result.error }))
          }
          return
        }

        // ── chat ────────────────────────────────────────────────────────────
        if (msg.type === 'chat') {
          const room = getRoom(connectedRoomId)
          const player = room?.players.get(connectedPlayerId)
          if (room && player) {
            const chatMsg = {
              type: 'chat',
              playerId: player.id,
              playerName: player.name,
              text: msg.text,
              timestamp: new Date().toISOString(),
            }
            broadcast(room, chatMsg) // Send to everyone including sender?
            // Actually broadcast excludes sender by default if we pass ID, but here we want everyone. 
            // Wait, broadcast in gameManager: export function broadcast(room: Room, message: object, excludeId?: string)
            broadcast(room, chatMsg)
            // Need to also send to self because broadcast might exclude?
            // wait, broadcast definition: for (const [id, p] of room.players) { if (id !== excludeId) ... }
            // So if excludeId is undefined, it sends to everyone including self.
          }
          return
        }
      },

      onClose(_event, _ws) {
        if (!connectedRoomId || !connectedPlayerId) return

        const room = getRoom(connectedRoomId)
        if (!room) return

        const player = room.players.get(connectedPlayerId)
        const wasHost = player?.isHost ?? false
        const playerName = player?.name ?? 'Pemain'

        require('./gameManager').removePlayer(connectedRoomId, connectedPlayerId)
        console.log(`[WS] ${playerName} disconnected from room ${connectedRoomId}`)

        // Notify others
        if (room.players.size > 0) {
          if (wasHost) {
            broadcast(room, { type: 'host_disconnected' })
          } else {
            broadcast(room, { type: 'player_left', playerName })
          }
          const players = [...room.players.values()].map(playerPublic)
          broadcast(room, { type: 'players_update', players })
          broadcast(room, { type: 'leaderboard', players: getLeaderboard(room) })
        }

        require('./gameManager').cleanupEmptyRoom(connectedRoomId)
        connectedRoomId = null
        connectedPlayerId = null
      },

      onError(error) {
        console.error('[WS] Error:', error)
      },
    }
  }),
)

// Fallback for Client-Side Routing (SPA)
app.get('*', async (c) => {
  return c.html(await Bun.file('./public/index.html').text())
})

// ─── Bun Server Entry ─────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000')
console.log(`
╔═══════════════════════════════════════════════╗
║     知識の戦い  –  Chishiki no Tatakai        ║
║     Server running on http://localhost:${PORT}   ║
╚═══════════════════════════════════════════════╝
`)

export default {
  fetch: app.fetch,
  websocket,
  port: PORT,
}
