from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional
import httpx
from bs4 import BeautifulSoup
import asyncio
import random
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # FIX: Indentação corrigida e cliente instanciado corretamente
    app.state.client = httpx.AsyncClient(
        timeout=httpx.Timeout(20.0),
        limits=httpx.Limits(max_connections=200, max_keepalive_connections=50)
    )
    yield
    await app.state.client.aclose()

app = FastAPI(lifespan=lifespan, title="SetupSniper ML-API")

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

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
]

async def scrape_product_details(url: str) -> Optional[ProductDetail]:
    client = app.state.client
    try:
        await asyncio.sleep(random.uniform(0.5, 2.0))
        headers = {"User-Agent": random.choice(USER_AGENTS)}
        response = await client.get(url, headers=headers)
        if response.status_code != 200: return None
        soup = BeautifulSoup(response.text, "html.parser")
        
        def safe_get(selector, class_name, attr=None):
            elem = soup.find(selector, {"class": class_name})
            if not elem: return "N/A"
            return elem.get(attr).strip() if attr else elem.text.strip()
            
        return ProductDetail(
            name=safe_get("h1", "ui-pdp-title"),
            price=f"R$ {safe_get('span', 'andes-money-amount__fraction')}",
            location=safe_get("span", "ui-pdp-location-address"),
            fees=safe_get("span", "ui-pdp-free-shipping"),
            seller_name=safe_get("a", "ui-pdp-seller-info__name"),
            seller_rating=safe_get("span", "ui-pdp-seller-info__rating"),
            sales_count=safe_get("span", "ui-pdp-product-description__sales"),
            in_stock=not bool(soup.find("span", {"class": "ui-pdp-stock-status__out"})),
            url=url
        )
    except Exception: return None

@app.get("/search", response_model=List[ProductDetail])
async def search_products(q: str = Query(..., description="Termo de busca")):
    search_url = f"https://lista.mercadolivre.com.br/{q.replace(' ', '-')}"
    client = app.state.client
    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://www.google.com/",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
    }
    try:
        response = await client.get(search_url, headers=headers)
        if response.status_code != 200: return []
        if "captcha" in response.text.lower() or "robot" in response.text.lower():
            raise HTTPException(status_code=403, detail="Bloqueio por Captcha")
        
        soup = BeautifulSoup(response.text, "html.parser")
        links = []
        for a in soup.find_all("a", href=True):
            href = a['href']
            if "produto.mercadolivre.com.br" in href and "MLB" in href:
                clean_url = href.split("#")[0].split("?")[0]
                if clean_url not in links: links.append(clean_url)
        
        if not links: return []
        tasks = [scrape_product_details(url) for url in links[:5]]
        results = await asyncio.gather(*tasks)
        return [res for res in results if res is not None]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
