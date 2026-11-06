# Mercado Livre Scraper API

## 🚀 Como Executar
1. Instale as dependências: `pip install -r requirements.txt`
2. Inicie o servidor: `uvicorn api.mercadolivre.main:app --host 0.0.0.0 --port 8000 --reload`

## 🛠️ Endpoint
**GET** `/search?q={termo}`
Exemplo: `http://localhost:8000/search?q=iphone+15+pro`
