// Copia el cliente Prisma generado a dist/ (multiplataforma; sin `cp`).
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'src', 'generated');
const dest = path.join(__dirname, '..', 'dist', 'generated');
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
