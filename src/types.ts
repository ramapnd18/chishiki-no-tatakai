import type { WSContext } from 'hono/ws'
import type { ServerWebSocket } from 'bun'

// ─── Question ────────────────────────────────────────────────────────────────

export interface Question {
  id: number
  question: string
  options: string[]
  correctIndex: number
  category: string
}

export interface QuestionPayload {
  id: number
  question: string
  options: string[]
  category: string
}

// ─── Authentication ──────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  username: string
  email: string
}

// ─── Player ──────────────────────────────────────────────────────────────────

export interface Player {
  id: string
  name: string
  userId?: string // Optional: user ID if authenticated
  score: number
  isHost: boolean
  ws: WSContext<ServerWebSocket>
  answeredCurrentQuestion: boolean
  correctAnswers: number
  wrongAnswers: number
  status: 'online' | 'offline'
}

export interface PlayerPublic {
  id: string
  name: string
  score: number
  isHost: boolean
  correctAnswers: number
  wrongAnswers: number
  status: 'online' | 'offline'
}

// ─── Room & Game State ────────────────────────────────────────────────────────

export type GameStatus = 'waiting' | 'playing' | 'finished'

export interface GameState {
  status: GameStatus
  questions: Question[]
  currentIndex: number
  answeredPlayerIds: Set<string>
  questionDone: boolean
}

export interface Room {
  id: string
  hostId: string
  players: Map<string, Player>
  game: GameState
}

// ─── WebSocket Message Shapes ─────────────────────────────────────────────────

// Client → Server
export type ClientMessage =
  | { type: 'join'; roomId: string; playerName: string; isHost: boolean; token?: string }
  | { type: 'reconnect'; roomId: string; playerId: string }
  | { type: 'start_game'; roomId: string }
  | { type: 'answer'; roomId: string; answerIndex: number }
  | { type: 'skip_question'; roomId: string }
  | { type: 'chat'; text: string }

// Server → Client
export type ServerMessage =
  | { type: 'room_joined'; roomId: string; playerId: string; isHost: boolean }
  | { type: 'reconnect_success'; roomId: string; player: PlayerPublic; gameState: GameState; leaderboard: PlayerPublic[] }
  | { type: 'players_update'; players: PlayerPublic[] }
  | { type: 'game_started' }
  | { type: 'question'; data: QuestionPayload; index: number; total: number }
  | { type: 'answer_result'; correct: boolean; playerId: string; playerName: string; scoreChange: number }
  | { type: 'leaderboard'; players: PlayerPublic[] }
  | { type: 'question_done'; winnerId: string | null; winnerName: string | null; correctIndex: number }
  | { type: 'game_over'; players: PlayerPublic[] }
  | { type: 'error'; message: string }
  | { type: 'host_disconnected' }
  | { type: 'player_left'; playerName: string }
  | { type: 'chat'; playerId: string; playerName: string; text: string; timestamp: string }
  | { type: 'presence'; playerId: string; playerName: string; status: 'online' | 'offline' }
