import { NextRequest, NextResponse } from "next/server";
import { prisma, QuestionCategory } from "@masmis/db";
import { requireAdmin } from "@/lib/adminAuth";

export async function GET(request: NextRequest) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const { searchParams } = new URL(request.url);
  const approved = searchParams.get("approved");
  const category = searchParams.get("category");

  const questions = await prisma.question.findMany({
    where: {
      ...(approved === "true" ? { approved: true } : approved === "false" ? { approved: false } : {}),
      ...(category ? { category: category as QuestionCategory } : {})
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return NextResponse.json(questions);
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdmin(request);
  if (unauthorized) return unauthorized;
  const body = await request.json();
  const question = await prisma.question.create({ data: body });
  return NextResponse.json(question, { status: 201 });
}
