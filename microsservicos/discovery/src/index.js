// Ponto de entrada do Discovery.
import { criarDiscovery } from './app.js';

const porta = Number(process.env.PORTA ?? 3000);
const servidor = criarDiscovery();

servidor.listen(porta, () => console.log(`[discovery] ouvindo em http://localhost:${porta}`));
const encerrar = () => servidor.close(() => process.exit(0));
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
