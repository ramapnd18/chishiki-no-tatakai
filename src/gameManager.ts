import type { Room, Player, PlayerPublic, GameState } from "./types";
import { pickRandomQuestions } from "./questions";

const TOTAL_QUESTIONS = 30;
const POINTS_CORRECT = 10;
const POINTS_WRONG = -5;
const AUTO_ADVANCE_DELAY_MS = 1500; // time before auto-advancing after correct answer

// ─── Singleton Rooms Store ────────────────────────────────────────────────────

const rooms = new Map<string, Room>();
const deletionTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ─── ID Helpers ───────────────────────────────────────────────────────────────

function generateId(len = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: len },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

// ─── Public Helpers ───────────────────────────────────────────────────────────

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function playerPublic(p: Player): PlayerPublic {
  return {
    id: p.id,
    name: p.name,
    score: p.score,
    isHost: p.isHost,
    correctAnswers: p.correctAnswers,
    wrongAnswers: p.wrongAnswers,
    status: p.status,
  };
}

export function getLeaderboard(room: Room): PlayerPublic[] {
  return [...room.players.values()]
    .map(playerPublic)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

// ─── Broadcast Helpers ────────────────────────────────────────────────────────

export function broadcast(room: Room, message: object, excludeId?: string) {
  const payload = JSON.stringify(message);
  for (const [id, p] of room.players) {
    if (id !== excludeId) {
      try {
        p.ws.send(payload);
      } catch {
        /* stale connection */
      }
    }
  }
}

export function sendTo(player: Player, message: object) {
  try {
    player.ws.send(JSON.stringify(message));
  } catch {
    /* stale connection */
  }
}

// ─── Room Lifecycle ───────────────────────────────────────────────────────────

export function createRoom(): { roomId: string; hostId: string } {
  const roomId = generateId();
  const hostId = generateId(8);

  const game: GameState = {
    status: "waiting",
    questions: [],
    currentIndex: 0,
    answeredPlayerIds: new Set(),
    questionDone: false,
  };

  rooms.set(roomId, {
    id: roomId,
    hostId,
    players: new Map(),
    game,
  });

  return { roomId, hostId };
}

export function joinRoom(
  roomId: string,
  playerName: string,
  isHost: boolean,
  ws: Player["ws"],
): { player: Player; error?: never } | { player?: never; error: string } {
  const room = rooms.get(roomId);
  if (!room) return { error: "Room tidak ditemukan." };
  if (room.game.status !== "waiting")
    return { error: "Permainan sudah dimulai." };

  const trimmedName = playerName.trim().slice(0, 24);
  if (!trimmedName) return { error: "Nama tidak boleh kosong." };

  // Prevent duplicate names
  for (const p of room.players.values()) {
    if (p.name.toLowerCase() === trimmedName.toLowerCase()) {
      return { error: "Nama sudah digunakan dalam room ini." };
    }
  }

  const player: Player = {
    id: generateId(8),
    name: trimmedName,
    score: 0,
    isHost,
    ws,
    answeredCurrentQuestion: false,
    correctAnswers: 0,
    wrongAnswers: 0,
    status: "online",
  };

  room.players.set(player.id, player);
  return { player };
}

export function removePlayer(roomId: string, playerId: string): boolean {
  const room = rooms.get(roomId);
  if (!room) return false;
  
  const player = room.players.get(playerId);
  if (player) {
    player.status = 'offline';
    broadcast(room, {
      type: 'presence',
      playerId: player.id,
      playerName: player.name,
      status: 'offline',
    });
  }
  return true;
}

export function cleanupEmptyRoom(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  const allOffline = [...room.players.values()].every(p => p.status === 'offline');
  if (room.players.size === 0 || allOffline) {
    if (!deletionTimers.has(roomId)) {
      const timer = setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (currentRoom) {
          const stillAllOffline = [...currentRoom.players.values()].every(p => p.status === 'offline');
          if (currentRoom.players.size === 0 || stillAllOffline) {
            rooms.delete(roomId);
          }
        }
        deletionTimers.delete(roomId);
      }, 15000); // 15 seconds grace period
      deletionTimers.set(roomId, timer);
    }
  } else {
    const timer = deletionTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      deletionTimers.delete(roomId);
    }
  }
}

export function reconnectPlayer(roomId: string, playerId: string, ws: Player["ws"]): { player?: Player, error?: string } {
  const room = rooms.get(roomId);
  if (!room) return { error: "Room tidak ditemukan atau sudah kadaluarsa." };
  
  const player = room.players.get(playerId);
  if (!player) return { error: "Pemain tidak ditemukan." };

  player.ws = ws;
  player.status = 'online';

  broadcast(room, {
    type: 'presence',
    playerId: player.id,
    playerName: player.name,
    status: 'online',
  }, player.id);

  // Clear deletion timer if this player reconnects and makes room active
  cleanupEmptyRoom(roomId);

  return { player };
}

// ─── Game Control ─────────────────────────────────────────────────────────────

export function startGame(roomId: string): { error?: string } {
  const room = rooms.get(roomId);
  if (!room) return { error: "Room tidak ditemukan." };
  if (room.game.status !== "waiting") return { error: "Game sudah berjalan." };

  const participants = [...room.players.values()].filter((p) => !p.isHost);
  if (participants.length === 0)
    return { error: "Belum ada peserta yang bergabung." };

  room.game.status = "playing";
  room.game.questions = pickRandomQuestions(TOTAL_QUESTIONS);
  room.game.currentIndex = 0;
  room.game.answeredPlayerIds = new Set();
  room.game.questionDone = false;

  // Reset scores
  for (const p of room.players.values()) {
    p.score = 0;
    p.correctAnswers = 0;
    p.wrongAnswers = 0;
    p.answeredCurrentQuestion = false;
  }

  broadcast(room, { type: "game_started" });
  broadcastCurrentQuestion(room);

  return {};
}

function broadcastCurrentQuestion(room: Room) {
  const { game } = room;
  if (game.currentIndex >= game.questions.length) {
    endGame(room);
    return;
  }

  const q = game.questions[game.currentIndex];
  if (!q) {
    endGame(room);
    return;
  }

  game.answeredPlayerIds = new Set();
  game.questionDone = false;

  // Reset per-question answer flag for all players
  for (const p of room.players.values()) {
    p.answeredCurrentQuestion = false;
  }

  broadcast(room, {
    type: "question",
    data: {
      id: q.id,
      question: q.question,
      options: q.options,
      category: q.category,
    },
    index: game.currentIndex + 1,
    total: game.questions.length,
  });
}

export function handleAnswer(
  roomId: string,
  playerId: string,
  answerIndex: number,
): { error?: string } {
  const room = rooms.get(roomId);
  if (!room) return { error: "Room tidak ditemukan." };

  const { game } = room;
  if (game.status !== "playing") return { error: "Game belum dimulai." };
  if (game.questionDone) return { error: "Soal sudah selesai." };

  const player = room.players.get(playerId);
  if (!player) return { error: "Pemain tidak ditemukan." };
  if (player.isHost) return { error: "Host tidak bisa menjawab." };
  if (player.answeredCurrentQuestion)
    return { error: "Kamu sudah menjawab soal ini." };
  if (game.answeredPlayerIds.has(playerId))
    return { error: "Kamu sudah menjawab." };

  // Lock this player out of current question
  player.answeredCurrentQuestion = true;
  game.answeredPlayerIds.add(playerId);

  const currentQ = game.questions[game.currentIndex];
  if (!currentQ) return { error: "Soal tidak ditemukan." };

  const correct = answerIndex === currentQ.correctIndex;

  if (correct) {
    player.score += POINTS_CORRECT;
    player.correctAnswers++;

    // Mark question done so no more answers are accepted
    game.questionDone = true;

    // Broadcast result + leaderboard
    broadcast(room, {
      type: "answer_result",
      correct: true,
      playerId: player.id,
      playerName: player.name,
      scoreChange: POINTS_CORRECT,
    });

    broadcast(room, {
      type: "question_done",
      winnerId: player.id,
      winnerName: player.name,
      correctIndex: currentQ.correctIndex,
    });

    broadcast(room, { type: "leaderboard", players: getLeaderboard(room) });

    // Auto-advance to next question after a short delay
    setTimeout(() => {
      game.currentIndex++;
      broadcastCurrentQuestion(room);
    }, AUTO_ADVANCE_DELAY_MS);
  } else {
    player.score += POINTS_WRONG;
    player.wrongAnswers++;

    // Broadcast individual result
    broadcast(room, {
      type: "answer_result",
      correct: false,
      playerId: player.id,
      playerName: player.name,
      scoreChange: POINTS_WRONG,
    });

    broadcast(room, { type: "leaderboard", players: getLeaderboard(room) });

    // Check if all non-host players have answered (all wrong)
    const nonHostPlayers = [...room.players.values()].filter((p) => !p.isHost);
    const allAnswered = nonHostPlayers.every((p) => p.answeredCurrentQuestion);

    if (allAnswered) {
      game.questionDone = true;
      broadcast(room, {
        type: "question_done",
        winnerId: null,
        winnerName: null,
        correctIndex: currentQ.correctIndex,
      });
      setTimeout(() => {
        game.currentIndex++;
        broadcastCurrentQuestion(room);
      }, AUTO_ADVANCE_DELAY_MS);
    }
  }

  return {};
}

export function skipQuestion(
  roomId: string,
  playerId: string,
): { error?: string } {
  const room = rooms.get(roomId);
  if (!room) return { error: "Room tidak ditemukan." };

  const player = room.players.get(playerId);
  if (!player?.isHost) return { error: "Hanya host yang bisa skip soal." };

  const { game } = room;
  if (game.status !== "playing") return { error: "Game belum dimulai." };
  if (game.questionDone) return { error: "Soal sudah selesai." };

  const currentQ = game.questions[game.currentIndex];
  if (!currentQ) return { error: "Soal tidak ditemukan." };

  game.questionDone = true;

  broadcast(room, {
    type: "question_done",
    winnerId: null,
    winnerName: null,
    correctIndex: currentQ.correctIndex,
  });

  broadcast(room, { type: "leaderboard", players: getLeaderboard(room) });

  setTimeout(() => {
    game.currentIndex++;
    broadcastCurrentQuestion(room);
  }, AUTO_ADVANCE_DELAY_MS);

  return {};
}

function endGame(room: Room) {
  room.game.status = "finished";
  broadcast(room, { type: "game_over", players: getLeaderboard(room) });
}
