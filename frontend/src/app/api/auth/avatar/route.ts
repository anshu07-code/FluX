import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ image: null });
  }

  try {
    const res = await fetch(`${apiUrl}/auth/me`, {
      headers: session?.user?.apiToken ? { authorization: `Bearer ${session.user.apiToken}` } : {},
    });
    const data = await res.json();
    return NextResponse.json({ image: data.user?.image ?? null });
  } catch {
    return NextResponse.json({ image: null });
  }
}
