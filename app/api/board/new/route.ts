import { NextResponse } from "next/server";
import { createNewBoard } from "@/lib/board";

export async function GET() {
  const board = createNewBoard(5);
  return NextResponse.json(board);
}
