// Wrapper de Jest para `pnpm -r test -- --coverage`: pnpm reenvia el "--" literal y Jest lo
// interpretaria como "el resto son patrones de ruta". Se descarta antes de delegar en Jest.
const args = process.argv.slice(2).filter((a) => a !== '--');
require('jest').run(args);
