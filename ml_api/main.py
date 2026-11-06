from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
import httpx
from bs4 import BeautifulSoup
import asyncio
import random
from contextlib import asynccontextmanager

# Configuração de ciclo de vida para gerenciar o cliente HTTP de forma eficiente
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Criamos um único cliente para todas as requisições, evitando abrir/fechar sockets
    app.state.client = httpx.AsyncClient(
        timeout=httpx.Timeout(20.0),
        limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        follow_redirects=True
    )
    yield
    await app.state.client.aclose()

app = FastAPI(lifespan=lifespan, title="SetupSniper ML-API")

# Modelo de dados para o produto
class ProductDetail(BaseModel):
    name: str
    price: str
    location: Optional[str]
    fees: Optional[str]
    seller_name: Optional[str]
    seller_rating: Optional[str]
    sales_count: Optional[str]
    in_stock: bool
    url: str

# Lista de User-Agents para rotacionar e evitar detecção de bot
USER_AGENTS = [
    "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit the 605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
]

async def scrape_product_details(url: str) -> Optional[ProductDetail]:
    client = app.state.client
    try:
        # Delay aleatório para simular comportamento humano
        await asyncio.sleep(random.uniform(1.5, 3.5)) 
        
        headers = {
            "User-Agent": random.choice(USER_AGENTS),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://lista.mercadolivre.com.br/"
        }
        
        response = await client.get(url, headers=headers)
        if response.status_code != 200: 
            return None
        
        soup = BeautifulSoup(response.text, "html.parser")
        
        # Função auxiliar para tentar múltiplos seletores caso o ML mude as classes
        def safe_get(selectors, class_names, attr=None):
            for s, c in zip(selectors, class_names):
                elem = soup.find(s, {"class": c})
                if elem: 
                    return elem.get(attr).strip() if attr else elem.text.strip()
            return "N/A"
            
        return ProductDetail(
            name=safe_get(["h1", "span"], ["ui-pdp-title", "pp-component-product-title"]),
            price=f"R$ {safe_get(['span'], ['andes-money-amount__fraction'])}",
            location=safe_get(["span", "div"], ["ui-pdp-location-address", "andes-breadcrumb-item"]),
            fees=safe_get(["span", "div"], ["ui-pdp-free-shipping", "andes-shipment-fee"]),
            seller_name=safe_get(["a", "span"], ["ui-pdp-seller-info__name", "seller-name"]),
            seller_rating=safe_get(["span", "div"], ["ui-pdp-seller-info__rating", "seller-rating"]),
            sales_count=safe_get(["span", "div"], ["ui-pdp-product-description__sales", "sales-count"]),
            in_stock=not bool(soup.find("span", {"class": "ui-pdp-stock-status__out"})),
            url=url
        )
    except Exception as e:
        print(f"Erro ao extrair detalhes de {url}: {e}")
        return None

@app.get("/search", response_model=List[ProductDetail])
async def search_products(q: str = Query(..., description="Termo de busca")):
    # URL limpa, simulando busca orgânica
    search_url = f"https://lista.mercadolivre.com.br/{q.replace(' ', '-')}"
    client = app.state.client
    
    # Headers ultra-realistas (Chrome 120+)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "Referer": "https://www.google.com.br/",
        "DNT": "1",
    }
    
    try:
        response = await client.get(search_url, headers=headers)
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Erro na resposta do ML")

        soup = BeautifulSoup(response.text, "html.parser")
        
        # BUSCA AGRESSIVA POR LINKS DE PRODUTO
        # Procura qualquer <a> que contenha '/p/MLB' no link
        links = []
        for a in soup.find_all("a", href=True):
            href = a['href']
            if "/p/MLB" in href:
                # Limpa a URL para remover parâmetros de rastreio
                clean_url = href.split("?")[0].split("#")[0]
                if clean_url not in links:
                    links.append(clean_url)
        
        print(f"Debug: Encontrados {len(links)} links de produtos")
        
        if not links:
            return []

        # Pegamos apenas o PRIMEIRO para evitar detecção por volume
        # Se funcionar com 1, depois tentamos aumentar
        tasks = [scrape_product_details(links[0])]
        results = await asyncio.gather(*tasks)
        
        return [res for res in results if res is not None]
        
    except Exception as e:
        print(f"Erro: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    # Roda em 0.0.0.0 para ser acessível externamente no servidor portátil
    uvicorn.run(app, host="0.0.0.0", port=8000)
