import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    // CSRF defense: state-changing requests must come from same-origin.
    const method = req.method
    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      const origin = req.headers.get("origin")
      const host = req.headers.get("host")
      if (origin && host) {
        try {
          const originHost = new URL(origin).host
          if (originHost !== host) {
            return new NextResponse("Cross-origin request blocked", { status: 403 })
          }
        } catch {
          return new NextResponse("Bad origin", { status: 400 })
        }
      }
    }
    return undefined
  },
  {
    pages: {
      signIn: "/login",
    },
  }
)

export const config = {
  matcher: ["/((?!api/auth|api/health|login|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
}
