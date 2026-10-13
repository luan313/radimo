# Radar Imóveis

Busca imóveis para alugar ou comprar em **ZAP Imóveis, Viva Real, OLX, QuintoAndar, Imovelweb, Chaves na Mão, 62imoveis, MGF Imóveis, Wimoveis, Mercado Livre, Facebook Marketplace** e nas imobiliárias **Marco** e **Federal** (Goiânia) ao mesmo tempo, junta anúncios repetidos e leva direto ao anúncio original.

## Como rodar (Windows)

Pré-requisito: **Python 3.10+** (marque "Add python.exe to PATH" na instalação). O Google Chrome instalado ajuda, mas não é obrigatório.

1. Dê dois cliques em `setup.bat` (só na primeira vez).
2. Dê dois cliques em `start.bat`. A interface abre sozinha em http://127.0.0.1:8765

No Linux/macOS: `./setup.sh` e depois `./start.sh`.

## Como funciona

```
Interface (React)  ──SSE──▶  API local (FastAPI)  ──▶  Chrome real controlado pelo Playwright
                                                        └ uma aba por portal; cada scraper (.js)
                                                          roda dentro da aba do site
```

- Os scrapers rodam **dentro de um navegador de verdade**, com os mesmos cookies de uma visita normal. Isso passa pela maioria das proteções anti-bot (Cloudflare).
- Cada portal responde de forma independente: os resultados aparecem na tela conforme chegam.
- ZAP e Viva Real compartilham o ID dos anúncios. Anúncios com mesmo preço, área, quartos e bairro em portais diferentes viram um card só, com links para todos os portais.
- Os filtros são aplicados de novo no backend, porque nem todo portal respeita todos os filtros na URL.
- Resultados ficam em cache por 10 minutos.

| Portal | Fonte dos dados | Observações |
|---|---|---|
| ZAP / Viva Real | API `glue-api` (usada pelo próprio site) | Filtros completos |
| OLX | Página de busca (dados RSC do Next.js) | Busca por texto "bairro cidade" dentro do estado |
| QuintoAndar | API `house-listing-search` | No aluguel o site filtra pelo custo total; o backend refiltra pelo aluguel |
| Imovelweb | HTML da listagem | A URL não aceita preço, então o app busca mais páginas e filtra localmente |
| Chaves na Mão | HTML da listagem | Filtro de quartos exato no site; o app consulta N, N+1 e N+2 |
| 62imoveis | HTML da listagem | GO, DF, TO e outros estados. Ordena por preço e para quando passa do limite |
| MGF Imóveis | HTML da listagem | Agregador nacional, forte em anúncios de proprietários |
| Wimoveis | HTML da listagem | Mesmo catálogo do Imovelweb (anúncios repetidos viram um card só). Só GO/DF |
| Marco Imobiliária | API da plataforma Arbo | Baixa o catálogo inteiro e filtra localmente. Só GO |
| Federal Imóveis | API REST do WordPress | Idem. Só GO |
| Facebook Marketplace | Página aberta e rolada no navegador | Sem login: ~24 anúncios por busca. Com login: mais. O card só informa a cidade |
| Mercado Livre | Página aberta no navegador | **Experimental**: costuma exigir login; não foi possível validar o layout sem conta |

## Contas (Facebook e Mercado Livre)

Opcional. No menu **Contas**, clique em **Conectar**: abre uma janela do Chrome, anônima e sem perfil salvo, e você faz login normalmente. O app nunca vê a senha. Depois do login a janela é minimizada e as buscas desses sites passam a usar essa sessão. Ao clicar em **Sair** ou fechar o app, a janela e a sessão são descartadas (nada fica gravado em disco).

Automatizar buscas vai contra os termos de uso desses sites e pode causar bloqueio temporário da conta. Use com moderação.

## Configurações (variáveis de ambiente)

| Variável | Padrão | Uso |
|---|---|---|
| `RADAR_BROWSER` | `offscreen` | `offscreen` (janela fora da tela, mais confiável), `headless` (sem janela) ou `visible` (para resolver um captcha manualmente uma vez) |
| `RADAR_PORT` | `8765` | Porta da interface |
| `RADAR_MOCK` | vazio | `1` usa dados de demonstração, sem acessar os portais |
| `RADAR_DEV` | vazio | `1` relê os scrapers `.js` a cada busca (útil ao editá-los) |

Exemplo no Windows: `set RADAR_BROWSER=visible && start.bat`

## Se um portal falhar

- Passe o mouse sobre o chip do portal para ver o motivo.
- **Bloqueio/captcha:** rode uma vez com `RADAR_BROWSER=visible`, resolva o desafio na janela que abrir e volte ao modo normal. Os cookies ficam salvos em `.browser-profile/`.
- **Mudança de layout:** os sites mudam de vez em quando. Cada scraper é um arquivo pequeno em `backend/scrapers/`. Ajuste o arquivo do portal que quebrou.

## Desenvolvimento da interface

```
cd frontend
npm install
npm run dev      # http://localhost:5173 (usa a API em :8765)
npm run build    # gera frontend/dist, servido pelo run.py
```

Stack: React 19, Vite, Tailwind CSS 4, Motion (animações), Lucide (ícones).

## Aviso

Projeto para **uso pessoal**. Os termos de uso da maioria dos portais proíbem coleta automatizada. Use com moderação e não redistribua os dados.
