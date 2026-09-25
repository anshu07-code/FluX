import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json()
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

    const res = await fetch(`${apiUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.error }, { status: res.status })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Registration failed" }, { status: 500 })
  }
}
