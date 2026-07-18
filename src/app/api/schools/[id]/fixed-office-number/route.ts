import { NextResponse } from "next/server"

/**
 * Retained only so older deployed clients receive a clear response instead of
 * silently updating every company template. Fixed values now belong to an
 * individual template field mapping.
 */
export async function PUT() {
  return NextResponse.json(
    {
      success: false,
      error: "Company-wide office numbers are no longer supported. Set an optional fixed value on the intended template field.",
    },
    { status: 410 },
  )
}
