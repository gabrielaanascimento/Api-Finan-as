const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config(); // Carrega as variáveis de ambiente do arquivo .env

const app = express();

const PORT = process.env.API_PORT || 4000; // Alterado para 4000, como está no frontend
const API_SECRET_KEY = process.env.API_SECRET_KEY; // A chave secreta do seu .env

// Verifica se a chave secreta foi configurada
if (!API_SECRET_KEY) {
    console.error('ERRO: A variável de ambiente API_SECRET_KEY não está definida. A autenticação não funcionará.');
    process.exit(1); // Encerra o processo se a chave não estiver configurada
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

app.use(cors()); // Habilita CORS para todas as rotas
app.use(express.json()); // Habilita o parsing de JSON no corpo das requisições

// Middleware de autenticação
const authenticateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key']; // Pega a chave do cabeçalho 'X-API-Key'

    if (!apiKey) {
        return res.status(401).json({ error: 'Acesso negado. Chave de API não fornecida.' });
    }

    if (apiKey !== API_SECRET_KEY) {
        return res.status(403).json({ error: 'Acesso negado. Chave de API inválida.' });
    }

    next(); // Se a chave for válida, continua para a próxima função middleware/rota
};

// Rota de status (não requer autenticação)
app.get('/', (req, res) => {
    res.status(200).json({ message: 'API de Finanças está online!' });
});

// Aplica o middleware de autenticação a todas as rotas abaixo
// Você pode aplicar individualmente ou a grupos de rotas se preferir
app.use(authenticateApiKey);

app.get('/transacoes', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM transacoes ORDER BY data_transacao DESC');
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar transações:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar transações.' });
    }
});

app.get('/transacoes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM transacoes WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Transação não encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(`Erro ao buscar transação com ID ${id}:`, err);
        res.status(500).json({ error: 'Erro interno do servidor ao buscar transação.' });
    }
});

app.post('/transacoes', async (req, res) => {
    const { descricao, valor, tipo } = req.body;

    if (!descricao || !valor || !tipo) {
        return res.status(400).json({ error: 'Descrição, valor e tipo são campos obrigatórios.' });
    }
    if (typeof valor !== 'number' || valor <= 0) {
        return res.status(400).json({ error: 'Valor deve ser um número positivo.' });
    }
    if (!['entrada', 'saida'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo deve ser "entrada" ou "saida".' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO transacoes (descricao, valor, tipo) VALUES ($1, $2, $3) RETURNING *',
            [descricao, valor, tipo]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Erro ao adicionar transação:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao adicionar transação.' });
    }
});

app.put('/transacoes/:id', async (req, res) => {
    const { id } = req.params;
    const { descricao, valor, tipo } = req.body;

    if (!descricao || !valor || !tipo) {
        return res.status(400).json({ error: 'Descrição, valor e tipo são campos obrigatórios para atualização.' });
    }
    if (typeof valor !== 'number' || valor <= 0) {
        return res.status(400).json({ error: 'Valor deve ser um número positivo.' });
    }
    if (!['entrada', 'saida'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo deve ser "entrada" ou "saida".' });
    }

    try {
        const result = await pool.query(
            'UPDATE transacoes SET descricao = $1, valor = $2, tipo = $3 WHERE id = $4 RETURNING *',
            [descricao, valor, tipo, id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Transação não encontrada para atualização.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(`Erro ao atualizar transação com ID ${id}:`, err);
        res.status(500).json({ error: 'Erro interno do servidor ao atualizar transação.' });
    }
});

app.delete('/transacoes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM transacoes WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Transação não encontrada para exclusão.' });
        }
        res.status(204).send(); // 204 No Content para exclusão bem-sucedida
    } catch (err) {
        console.error(`Erro ao excluir transação com ID ${id}:`, err);
        res.status(500).json({ error: 'Erro interno do servidor ao excluir transação.' });
    }
});

app.get('/saldo', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END), 0) AS saldo_atual
            FROM transacoes;
        `);
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Erro ao calcular saldo:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao calcular saldo.' });
    }
});

app.get('/totalSaida', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END), 0) AS saldo_atual
            FROM transacoes;
        `);
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Erro ao calcular total de saída:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao calcular total de saída.' });
    }
});

app.get('/totalEntrada', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0) AS saldo_atual
            FROM transacoes;
        `);
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Erro ao calcular total de entrada:', err);
        res.status(500).json({ error: 'Erro interno do servidor ao calcular total de entrada.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse: http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
    await pool.end();
    console.log('Conexão com o PostgreSQL encerrada.');
    process.exit(0);
});
