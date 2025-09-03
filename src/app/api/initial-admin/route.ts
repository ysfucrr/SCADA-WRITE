import { connectToDatabase } from '@/lib/mongodb';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';

export async function GET() {
    try {
        //check database
        try {
            const { db } = await connectToDatabase();
            const count = await db.collection('users').countDocuments({ role: 'admin' });
            return NextResponse.json({ hasAdmin: count > 0 });
        } catch (error) {
            return NextResponse.json({ hasAdmin: false });
        }

    } catch (err) {
        return NextResponse.json({ success: false, hasAdmin: false }, { status: 500 });
    }
}

export async function POST(req: NextRequest
) {
    const { username, password } = await req.json();
    if (!username || !password) return NextResponse.json({ success: false, error: 'Username and password are required' });
    const { db } = await connectToDatabase();
    const exists = await db.collection('users').findOne({ role: 'admin' });
    if (exists) return NextResponse.json({ success: false, error: 'Admin already exists' });

    const hashed = bcrypt.hashSync(password, 10);
    const doc = {
        username,
        role: 'admin',
        password: hashed,
        permissions: { dashboard: true, users: true, units: true, trendLog: true },
        createdAt: new Date()
    };
    await db.collection('users').insertOne(doc);
    return NextResponse.json({ success: true });
}