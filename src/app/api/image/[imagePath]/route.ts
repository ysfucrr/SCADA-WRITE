import { authOptions } from "@/lib/auth-options";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ imagePath: string }> }
) {
    try {
        const { imagePath } = await params;

        const session = await getServerSession(authOptions);

        if (!session) {
            return NextResponse.json({ error: "Unauthorized access" }, { status: 403 });
        }

        // 🔐 Güvenlik: Path traversal (../../) engelle
        if (imagePath.includes("..")) {
            return NextResponse.json({ error: "Invalid path" }, { status: 400 });
        }

        // 🛣️ public/uploads klasöründen dosya oku
        const absolutePath = path.join(process.cwd(), "public/uploads", imagePath);

        // 🔍 Dosya var mı kontrol et
        const imageBuffer:any = await fs.readFile(absolutePath);

        // 🎯 response header: image content type (tahminen PNG)
        return new Response(imageBuffer, {
            headers: {
                "Content-Type": "image/png", // veya jpg / webp dosyasına göre dinamik belirleyebilirsin
            },
        });
    } catch (error) {
        console.error("Image GET failed:", error);
        return NextResponse.json({ error: "Image GET failed" }, { status: 500 });
    }
}