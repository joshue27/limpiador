import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const user = await prisma.user.findUnique({ where: { email: 'soporte@american-edu.com' } });
const testPlain = await bcrypt.compare('AmericanAmerican', user.passwordHash);
const sha256 = crypto.createHash('sha256').update('AmericanAmerican').digest('hex');
const testSha = await bcrypt.compare(sha256, user.passwordHash);
console.log('Plain match:', testPlain);
console.log('SHA256 match:', testSha);
if (testPlain && !testSha) {
  const newHash = await bcrypt.hash(sha256, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });
  console.log('Upgraded operator to SHA-256 format');
}
await prisma.$disconnect();
