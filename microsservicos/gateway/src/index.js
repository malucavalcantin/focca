// Ponto de entrada do API Gateway Focca.
import { criarGateway } from './app.js';

// PORT é a variável usada por plataformas de hospedagem (Render, Railway etc.).
const porta = Number(process.env.PORTA ?? process.env.PORT ?? 8080);
const descobertaUrl = process.env.DESCOBERTA_URL ?? 'http://localhost:3000';
const servidor = criarGateway({ descobertaUrl });

servidor.listen(porta, () => console.log(`[gateway] ouvindo em http://localhost:${porta} (descoberta: ${descobertaUrl})`));
const encerrar = () => servidor.close(() => process.exit(0));
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
