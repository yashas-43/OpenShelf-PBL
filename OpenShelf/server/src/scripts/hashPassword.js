import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password || password.length < 8 || password.length > 72) {
  console.error('Usage: node src/scripts/hashPassword.js "YourStrongPassword" (8–72 characters)');
  process.exit(1);
}
console.log(await bcrypt.hash(password, 12));
