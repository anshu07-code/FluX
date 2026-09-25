import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  try {
    const isLoggedIn = !!req.auth
    const pathname = req.nextUrl.pathname

    // Auth pages - redirect to dashboard if already logged in
    const isAuthPage = pathname === "/login" || pathname === "/register"
    if (isAuthPage && isLoggedIn) {
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }

    // App pages - require auth
    const isAppPage = pathname.startsWith("/dashboard") ||
      pathname.startsWith("/workflows") ||
      pathname.startsWith("/executions")

    if (isAppPage && !isLoggedIn) {
      return NextResponse.redirect(new URL("/login", req.url))
    }

    return NextResponse.next()
  } catch {
    // If auth fails (e.g. oversized cookie), clear it and redirect to login
    const response = NextResponse.redirect(new URL("/login", req.url))
    response.cookies.delete("next-auth.session-token")
    response.cookies.delete("__Secure-next-auth.session-token")
    return response
  }
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public).*)"],
}
