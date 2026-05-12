import { prisma } from './db'

// ─── Simple Password Hashing ───────────────────────
// In Bun we can use Bun.password
async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password)
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash)
}

// ─── Token Generation ─────────────────────────────────────────────────────────

function generateToken(): string {
  return Buffer.from(Math.random().toString()).toString('base64').slice(0, 32)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function register(
  username: string,
  email: string,
  password: string,
) {
  // Validation
  if (!username || username.length < 3) {
    return { success: false, message: 'Username minimal 3 karakter' }
  }
  if (!email || !email.includes('@')) {
    return { success: false, message: 'Email tidak valid' }
  }
  if (!password || password.length < 6) {
    return { success: false, message: 'Password minimal 6 karakter' }
  }

  // Check if username/email already exists
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: username, mode: 'insensitive' } },
        { email: { equals: email, mode: 'insensitive' } },
      ],
    },
  })

  if (existingUser) {
    if (existingUser.username.toLowerCase() === username.toLowerCase()) {
      return { success: false, message: 'Username sudah terdaftar' }
    }
    return { success: false, message: 'Email sudah terdaftar' }
  }

  // Create user
  const hashedPassword = await hashPassword(password)
  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash: hashedPassword,
    },
  })

  console.log(`[Auth] User registered: ${username}`)

  return { success: true, message: 'Registrasi berhasil', userId: user.id }
}

export async function login(
  username: string,
  password: string,
) {
  // Find user
  const user = await prisma.user.findFirst({
    where: {
      username: { equals: username, mode: 'insensitive' },
    },
  })

  if (!user) {
    return { success: false, message: 'Username atau password salah' }
  }

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash)
  if (!isValid) {
    return { success: false, message: 'Username atau password salah' }
  }

  // Create session
  const token = generateToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  await prisma.session.create({
    data: {
      token,
      userId: user.id,
      expiresAt,
    },
  })

  console.log(`[Auth] User logged in: ${username}`)

  return { success: true, message: 'Login berhasil', token, username: user.username, userId: user.id }
}

export async function verifySession(token: string) {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!session) {
    return { valid: false }
  }

  if (new Date() > session.expiresAt) {
    await prisma.session.delete({ where: { token } })
    return { valid: false }
  }

  return { valid: true, session }
}

export async function logout(token: string) {
  try {
    await prisma.session.delete({ where: { token } })
    return true
  } catch (e) {
    return false
  }
}

export async function getUser(userId: string) {
  return await prisma.user.findUnique({ where: { id: userId } })
}

export async function getUserByUsername(username: string) {
  return await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  })
}

export async function updateUserStats(userId: string, score: number, increment: boolean = true) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        totalGamesPlayed: increment ? { increment: 1 } : undefined,
        totalScore: { increment: score },
      },
    })
  } catch (e) {
    console.error(`Failed to update stats for user ${userId}`, e)
  }
}
