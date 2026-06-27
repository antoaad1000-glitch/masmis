import { NextRequest, NextResponse } from "next/server";

export function requireAdmin(request: NextRequest) {
  const secret = process.env.ADMIN_SECRET;

  // Local starter convenience: if no secret is configured, admin routes stay open.
  if (!secret || secret === "change-me") return null;

  const provided = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
