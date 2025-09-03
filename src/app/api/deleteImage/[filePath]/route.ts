import fs from "fs"
import path from "path"
export async function DELETE(request: Request, { params }: { params: Promise<{ filePath: string }> }) {
    const filePath = (await params).filePath;
    console.log("file path: ", filePath);
    try {
        // await deleteImage(filePath);
        const uploadsDir = path.join(process.cwd(), 'public/uploads');
        fs.unlinkSync(`${uploadsDir}/${filePath}`);
        return new Response('Image deleted successfully', { status: 200 });
    } catch (error) {
        console.error('Error deleting image:', error);
        return new Response('Failed to delete image', { status: 500 });
    }
}