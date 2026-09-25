import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"

const providers = [
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: credentials?.email, password: credentials?.password }),
      });
      const data = await res.json();
      if (data.user) return { ...data.user, apiToken: data.token };
      return null;
    },
  }),
  // Only add Google provider if credentials are configured
  ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ? [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
      ]
    : []),
];

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  secret: process.env.AUTH_SECRET,
  // Trust the request Host header. Required for OAuth callbacks (Google etc.)
  // on any deployed domain; without it Auth.js throws "Host must be trusted"
  // and the login fails. Safe: the callback verifies the provider's own
  // signed state/nonce, so trusting the host does not authenticate anyone.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // On initial sign-in, populate token from user object
      if (user) {
        token.id = user.id ?? "";
        const u = user as { role?: string; name?: string; email?: string; image?: string; rememberMe?: string; apiToken?: string };
        token.role = u.role ?? "user";
        token.name = u.name ?? token.name;
        token.email = u.email ?? token.email;
        token.apiToken = u.apiToken ?? null;
        // Do NOT store image in JWT — base64 is too large for cookies
        token.rememberMe = u.rememberMe === "true";
      } else if (token.apiToken === undefined) {
        token.apiToken = null;
      }
      // On session update (e.g. from settings page), merge the updated values
      if (trigger === "update" && session) {
        const s = session as { user?: { name?: string; email?: string; image?: string } };
        if (s.user?.name !== undefined) token.name = s.user.name;
        if (s.user?.email !== undefined) token.email = s.user.email;
        // Image not stored in token — fetched separately
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.name = (token.name as string) ?? session.user.name;
        session.user.email = (token.email as string) ?? session.user.email;
        session.user.apiToken = (token.apiToken as string) ?? null;
        // Image is fetched from DB on demand, not from JWT
        session.user.image = null;
      }
      return session;
    },
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        if (!account.id_token) {
          console.error("[auth] Google sign-in aborted: no ID token received from provider.");
          return false;
        }
        // The API verifies this ID token with Google itself — it never trusts
        // an email/name sent from the browser.
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/auth/oauth`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "google",
            idToken: account.id_token,
            name: user.name,
            image: user.image,
          }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          console.error(`[auth] FluX API rejected Google sign-in (${res.status}): ${detail}`);
          return false;
        }
        // Capture the backend JWT so Google sessions can call the FluX API too.
        const data = await res.json().catch(() => null) as { token?: string } | null;
        if (data?.token) {
          (user as { apiToken?: string }).apiToken = data.token;
        }
      }
      return true;
    },
  },
});
