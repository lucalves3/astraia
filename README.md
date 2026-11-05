# Astraia Joias · Catálogo online

Site de catálogo com carrinho e pedido pelo WhatsApp. Os dados vêm do site do fornecedor e são atualizados sozinhos todo domingo às 03:00 (horário de Fortaleza).

## Onde mudar cada coisa
- `config/site.json`: número do WhatsApp, percentual do sinal e texto do restante.
- `config/pricing.json`: parâmetros da precificação (margem, embalagem, frete, brinde, taxa do cartão e o final do preço, 9,90).
- `config/categories.js`: categorias e subcategorias que entram no site.
- Depois de mudar preço ou categorias, rode a atualização (abaixo) para recalcular.

## Variáveis no Railway
- `DATA_DIR=/data` (pasta do volume, onde ficam os dados atualizados).
- `ADMIN_TOKEN=<uma senha sua>` (para atualizar na hora, sem esperar domingo).
- Opcional: `UPDATE_CRON` (padrão `0 3 * * 0`).

## Atualizar na hora
`https://SEU-SITE.up.railway.app/admin/update?token=SUA_SENHA` inicia a atualização (leva de 30 a 60 minutos).
`https://SEU-SITE.up.railway.app/admin/status?token=SUA_SENHA` mostra o andamento.

## Rodar no computador
`npm install` e depois `npm start` (abre em http://localhost:3000).
`npm run update` atualiza os dados da pasta `seed`.
