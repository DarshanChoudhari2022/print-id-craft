import { NextResponse } from "next/server"
import { getServerSession } from "next-auth/next"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { supabase } from "@/lib/supabase"

export async function GET(
  req: Request,
  { params }: { params: { id: string; bid: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.role !== "MANUFACTURER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const batch = await prisma.printBatch.findFirst({
      where: { id: params.bid, schoolId: params.id },
    })
    if (!batch || !batch.backPdfPath) {
      return NextResponse.json({ error: "Back PDF not found" }, { status: 404 })
    }

    const { data, error } = await supabase.storage
      .from("student-photos")
      .download(batch.backPdfPath)

    if (error || !data) {
      console.error("Back PDF download error:", error)
      return NextResponse.json({ error: "Failed to download back PDF" }, { status: 500 })
    }

    const buffer = Buffer.from(await data.arrayBuffer())

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="batch-${params.bid.slice(-8)}-back.pdf"`,
      },
    })
  } catch (error) {
    console.error("Download back PDF error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
