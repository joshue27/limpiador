import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const password = process.argv[2] || 'Admin2024!';
const sha256 = crypto.createHash('sha256').update(password).digest('hex');
const hash = await bcrypt.hash(sha256, 12);

const prisma = new PrismaClient();
await prisma.user.update({
  where: { email: 'admin@limpiador.local' },
  data: { passwordHash: hash },
});
console.log(`Admin password reset to: ${password}`);
await prisma.$disconnect();
