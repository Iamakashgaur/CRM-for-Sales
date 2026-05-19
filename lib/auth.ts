import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { getServerSession as nextAuthGetServerSession } from "next-auth"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"

// Constant-time dummy hash used when the user doesn't exist, so the response
// time is comparable to the real-user path (prevents email enumeration).
const DUMMY_HASH = "$2a$12$abcdefghijklmnopqrstuv1234567890abcdefghijklmno"

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const email = credentials.email.toLowerCase()
        if (!rateLimit(`login:${email}`, 10, 60_000)) return null
        const user = await prisma.user.findUnique({ where: { email } })
        const hash = user?.passwordHash ?? DUMMY_HASH
        const ok = await bcrypt.compare(credentials.password, hash)
        if (!user || !ok) return null
        return { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar ?? null }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.avatar = user.avatar ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
        session.user.avatar = token.avatar ?? null
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}

export function getServerSession() {
  return nextAuthGetServerSession(authOptions)
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
