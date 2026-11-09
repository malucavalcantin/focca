// Ponto de entrada do Serviço de Descoberta.
import { criarServicoDescoberta } from './app.js';

const porta = Number(process.env.PORTA ?? 3000);
const servidor = criarServicoDescoberta();

servidor.listen(porta, () => console.log(`[descoberta] ouvindo em http://localhost:${porta}`));
const encerrar = () => servidor.close(() => process.exit(0));
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
