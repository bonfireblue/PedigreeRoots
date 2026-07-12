import { type NextRequest, NextResponse } from "next/server";
import { requireMe } from "@/lib/authz";
import fs from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const me = await requireMe();
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "jpg";
    const filename = `profile-photos/${me.id}/${Date.now()}.${ext}`;
    
    // Save locally
    const uploadDir = path.join(process.cwd(), "public", "uploads", "profile-photos", me.id);
    await fs.mkdir(uploadDir, { recursive: true });
    
    const arrayBuffer = await file.arrayBuffer();
    await fs.writeFile(path.join(process.cwd(), "public", "uploads", filename), Buffer.from(arrayBuffer));

    return NextResponse.json({ pathname: filename });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
