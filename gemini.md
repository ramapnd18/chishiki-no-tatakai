# Dokumentasi Proyek: Aplikasi Kuis Real-time (Konteks untuk Pengembangan)

Dokumen ini berfungsi sebagai panduan utama bagi pengembangan fitur lanjutan. Proyek ini adalah aplikasi kuis interaktif berbasis *real-time* yang berjalan di atas runtime Bun.

## 1. Arsitektur & Teknologi Saat Ini
* **Runtime:** [Bun](https://bun.sh/)
* **Backend Framework:** [Hono](https://hono.dev/) (Ringan, mendukung WebSockets native Bun).
* **Komunikasi:** * **REST API:** Digunakan untuk autentikasi awal dan pembuatan *room*.
    * **WebSockets:** Digunakan untuk jalannya permainan (sinkronisasi soal, jawaban, dan leaderboard).
* **Frontend:** File statis di folder `public/`.

## 2. Status Fitur Eksisting
* **Sistem Room:** Pembuatan room ID (random), mekanisme join, dan pengecekan duplikasi nama.
* **Mekanika Game:** * 30 soal acak per sesi.
    * Hanya Host yang bisa memulai (`start_game`) atau melewati soal (`skip_question`).
    * Poin: +10 (benar), -5 (salah).
    * Auto-advance: Jeda 1.5 detik setelah soal terjawab.
    * Leaderboard instan via broadcast WebSocket.

## 3. Rencana Pengembangan (Fitur Baru)
Pengembangan selanjutnya akan berfokus pada persistensi data dan fitur sosial:

### A. Integrasi Database & ORM
* **Database:** Supabase (PostgreSQL).
* **ORM:** Prisma.
* **Tujuan:** Menggantikan penyimpanan sementara (in-memory) dengan database permanen untuk data user dan history permainan.

### B. Fitur Autentikasi Lanjutan
* Migrasi sistem `/api/auth/*` (Register & Login) agar terhubung ke Supabase melalui Prisma.
* Penyimpanan password yang aman (hashing) dan manajemen session/token.

### C. Chat Real-time
* Menambahkan fitur chat di dalam *room* permainan.
* Pesan dikirim dan ditampilkan secara langsung tanpa perlu *refresh*.

### D. Status Kehadiran (Presence)
* Indikator status **Online/Offline** pengguna secara real-time.

## 4. Struktur File Utama
* `src/index.ts`: Entry point (Hono setup & WS lifecycle).
* `src/gameManager.ts`: Logika permainan & state management.
* `src/auth.ts`: Logika autentikasi (akan dimigrasi ke Prisma).
* `src/types.ts`: Definisi interface TypeScript.
* `prisma/schema.prisma`: (Akan dibuat) Definisi skema database.

---
**Instruksi Pengembangan:**
Gunakan dokumen ini sebagai basis konteks untuk membuat file skema Prisma, mengonfigurasi koneksi Supabase, dan memperluas handler WebSocket untuk mendukung fitur chat serta status online/offline.
