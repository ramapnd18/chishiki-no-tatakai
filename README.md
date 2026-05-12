# 知識の戦い — Chishiki no Tatakai

**Kuis Pengetahuan Real-time Berbasis WebSocket**

Aplikasi web kuis multiplayer real-time yang memungkinkan pengguna untuk saling adu cepat dan pengetahuan dalam sebuah room permainan. Dibangun dengan Bun, Hono, Prisma, dan Supabase.

---

## 🗂️ Arsitektur

```
chishiki-no-tatakai/
├── src/
│   ├── index.ts          # Entry point: Hono server, REST API, WebSocket handler
│   ├── gameManager.ts    # Logika permainan, manajemen room & state
│   ├── auth.ts           # Registrasi, login, verifikasi sesi
│   ├── db.ts             # Prisma client singleton
│   ├── types.ts          # Definisi TypeScript interface & types
│   └── questions.ts      # Bank soal & fungsi pengambilan acak
├── public/
│   ├── index.html        # Shell SPA utama + Dynamic Component Loader
│   ├── css/
│   │   └── style.css     # Stylesheet utama (Dark theme, responsif)
│   ├── js/
│   │   └── app.js        # Client-side logic, SPA Router, WebSocket client
│   └── components/       # Komponen HTML yang dimuat secara dinamis
│       ├── home.html
│       ├── login.html
│       ├── register.html
│       ├── profile.html
│       ├── host-setup.html
│       ├── player-join.html
│       ├── player-lobby.html
│       ├── game.html
│       └── gameover.html
├── prisma/
│   └── schema.prisma     # Skema database (User, Session, Game, GameHistory)
├── .env                  # Environment variables (tidak di-commit)
└── package.json
```

---

## ⚙️ Teknologi

| Layer | Teknologi |
|-------|-----------|
| Runtime | [Bun](https://bun.sh/) v1.3+ |
| Backend Framework | [Hono](https://hono.dev/) |
| Komunikasi Real-time | WebSocket (native Bun) |
| ORM | [Prisma](https://www.prisma.io/) v6 |
| Database | [Supabase](https://supabase.com/) (PostgreSQL) |
| Frontend | Vanilla HTML, CSS, JavaScript (SPA) |

---

## 🚀 Setup Lokal

### 1. Prasyarat

- [Bun](https://bun.sh/) v1.3 atau lebih baru
- Akun [Supabase](https://supabase.com/) (gratis)

### 2. Clone & Install

```bash
git clone https://github.com/ramapnd18/chishiki-no-tatakai.git
cd chishiki-no-tatakai
bun install
```

### 3. Konfigurasi Environment

Buat file `.env` di root project:

```env
# URL koneksi Supabase (gunakan Pooler - port 6543 untuk production)
DATABASE_URL="postgresql://postgres.xxxx:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# URL koneksi langsung (port 5432, untuk migrasi Prisma)
DIRECT_URL="postgresql://postgres.xxxx:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

> Ambil URL ini dari: **Supabase Dashboard → Project → Connect → Connection String**

### 4. Migrasi Database

```bash
bunx prisma migrate dev --name init
```

Atau jika skema sudah ada dan hanya perlu sync:

```bash
bunx prisma db push
```

### 5. Generate Prisma Client

```bash
bunx prisma generate
```

### 6. Jalankan Server

```bash
# Mode development (hot-reload)
bun run dev

# Mode production
bun run start
```

Server berjalan di: `http://localhost:3000`

---

## 🌐 Deployment (Railway)

### Environment Variables di Railway

Set variabel berikut di Railway dashboard → **Service → Variables**:

| Variabel | Keterangan |
|----------|-----------|
| `DATABASE_URL` | Supabase Pooler URL (port 6543) |
| `DIRECT_URL` | Supabase Direct URL (port 5432) |
| `PORT` | (opsional) default `3000` |

### Build Command

```bash
bunx prisma generate && bun install
```

### Start Command

```bash
bun run start
```

---

## 🎮 Cara Bermain

1. **Daftar / Login** — Buat akun atau masuk dengan akun yang ada
2. **Buat Room** — Klik "Buat Room" untuk menjadi Host, bagikan kode room ke teman
3. **Bergabung** — Teman memasukkan kode room dan nama mereka
4. **Mulai Permainan** — Host menekan tombol "Mulai" setelah semua peserta bergabung
5. **Jawab Soal** — Setiap soal ditampilkan secara bersamaan; pemain pertama yang menjawab benar mendapat +10 poin; jawaban salah -5 poin
6. **Lihat Hasil** — Setelah semua soal selesai, papan skor akhir ditampilkan

### Mekanika Permainan

- **30 soal acak** per sesi (dipilih dari bank soal)
- **+10 poin** untuk jawaban benar
- **-5 poin** untuk jawaban salah
- Auto-advance ke soal berikutnya **1.5 detik** setelah ada yang menjawab benar
- Host dapat menekan **"Skip Soal"** kapan saja

---

## 🗄️ Skema Database

```prisma
model User {
  id               String        @id @default(uuid())
  username         String        @unique
  email            String        @unique
  passwordHash     String
  totalGamesPlayed Int           @default(0)
  totalScore       Int           @default(0)
  createdAt        DateTime      @default(now())
  sessions         Session[]
  gameHistories    GameHistory[]
}

model Session {
  id        String   @id @default(uuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  user      User     @relation(fields: [userId], references: [id])
}

model Game {
  id         String        @id @default(uuid())
  roomId     String
  status     String
  finishedAt DateTime?
  createdAt  DateTime      @default(now())
  histories  GameHistory[]
}

model GameHistory {
  id             String @id @default(uuid())
  gameId         String
  userId         String
  score          Int
  correctAnswers Int
  wrongAnswers   Int
  game           Game   @relation(fields: [gameId], references: [id])
  user           User   @relation(fields: [userId], references: [id])
}
```

---

## 🔌 WebSocket API

### Client → Server

| Tipe | Payload | Keterangan |
|------|---------|------------|
| `join` | `{ roomId, playerName, isHost, token? }` | Bergabung ke room |
| `reconnect` | `{ roomId, playerId }` | Menyambung ulang setelah terputus |
| `start_game` | `{ roomId }` | Host memulai permainan |
| `answer` | `{ roomId, answerIndex }` | Pemain mengirim jawaban |
| `skip_question` | `{ roomId }` | Host melewati soal |
| `chat` | `{ text }` | Mengirim pesan chat |

### Server → Client

| Tipe | Keterangan |
|------|-----------|
| `room_joined` | Konfirmasi berhasil bergabung |
| `reconnect_success` | Berhasil reconnect, berisi state permainan saat ini |
| `players_update` | Daftar pemain terbaru |
| `game_started` | Permainan dimulai |
| `question` | Data soal berikutnya |
| `answer_result` | Hasil jawaban seorang pemain |
| `question_done` | Soal selesai, siapa yang menang |
| `leaderboard` | Papan skor terkini |
| `game_over` | Permainan selesai, hasil akhir |
| `chat` | Pesan chat dari pemain |
| `presence` | Status online/offline pemain |

---

## 📋 REST API

| Method | Endpoint | Keterangan |
|--------|----------|-----------|
| `POST` | `/api/auth/register` | Mendaftarkan akun baru |
| `POST` | `/api/auth/login` | Login dan mendapatkan token sesi |
| `GET` | `/api/auth/verify` | Verifikasi token & ambil data user |
| `POST` | `/api/auth/logout` | Logout (hapus sesi) |
| `POST` | `/api/create-room` | Membuat room baru |
| `GET` | `/api/room/:roomId` | Mengecek status room |

---

## ✨ Fitur

- ✅ Autentikasi lengkap (Register, Login, Logout) dengan sesi JWT
- ✅ Real-time gameplay via WebSocket
- ✅ Chat dalam room permainan
- ✅ Status online/offline pemain (Presence)
- ✅ Leaderboard instan yang terupdate setiap jawaban
- ✅ Auto-reconnect — pemain yang terputus bisa langsung kembali ke game
- ✅ Client-side routing (URL berubah sesuai halaman: `/login`, `/game`, dll.)
- ✅ Statistik pemain tersimpan ke database setelah setiap sesi
- ✅ Responsif untuk desktop dan mobile
- ✅ Mode host: buat & kelola room, skip soal

---

## 🛠️ Scripts

```bash
bun run dev      # Development server dengan hot-reload
bun run start    # Production server
bunx prisma studio          # Buka Prisma Studio (GUI database)
bunx prisma migrate dev     # Jalankan migrasi baru
bunx prisma db push         # Push skema tanpa migrasi
bunx prisma generate        # Generate Prisma Client
```
