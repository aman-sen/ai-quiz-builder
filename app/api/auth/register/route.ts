import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { queryOne, execute } from '@/lib/db';
import { generateId } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name } = body;

    if (!email || !password || !name)
      return NextResponse.json({ success: false, error: 'All fields required' }, { status: 400 });
    if (typeof email !== 'string' || !email.includes('@'))
      return NextResponse.json({ success: false, error: 'Invalid email' }, { status: 400 });
    if (typeof password !== 'string' || password.length < 8)
      return NextResponse.json({ success: false, error: 'Password must be at least 8 characters' }, { status: 400 });
    if (typeof name !== 'string' || name.trim().length < 2)
      return NextResponse.json({ success: false, error: 'Name must be at least 2 characters' }, { status: 400 });

    const existing = await queryOne('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing)
      return NextResponse.json({ success: false, error: 'Email already registered' }, { status: 409 });

    const hashed = await bcrypt.hash(password, 12);
    const id = generateId();
    await execute(
      'INSERT INTO users (id, email, name, password) VALUES (?, ?, ?, ?)',
      [id, email.toLowerCase().trim(), name.trim(), hashed]
    );

    return NextResponse.json({ success: true, data: { id, email, name: name.trim() } }, { status: 201 });
  } catch (err) {
    console.error('[register]', err);
    return NextResponse.json({ success: false, error: 'Registration failed' }, { status: 500 });
  }
}
