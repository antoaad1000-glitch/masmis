import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@masmis/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const body = await request.json();
  const question = await prisma.question.update({ where: { id }, data: body });
  return NextResponse.json(question);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  await prisma.question.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
