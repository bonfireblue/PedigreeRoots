import { type NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.searchParams.get("pathname");

    if (!pathname) {
      return NextResponse.json({ error: "Missing pathname" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "public", "uploads", pathname);
    
    let fileBuffer;
    try {
      fileBuffer = await fs.readFile(filePath);
    } catch {
      return new NextResponse("Not found", { status: 404 });
    }

    const ext = path.extname(pathname).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".png") contentType = "image/png";
    else if (ext === ".gif") contentType = "image/gif";
    else if (ext === ".webp") contentType = "image/webp";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    console.error("Error serving file:", error);
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 });
  }
}
