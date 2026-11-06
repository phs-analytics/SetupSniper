from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional
import httpx
from bs4 import BeautifulSoup
import asyncio
import random

app = FastAPI(
    title="Mercado Livre Scraper API",
    description="API para extração de dados detalhados de produtos do Mercado Livre",
    version="1.0.0"
)

class ProductDetail(BaseModel):
    name: str = Field(..., example="iPhone 15 Pro Max 256GB")
    price: str = Field(..., example="R$ 8.499,00")
    location: Optional[str] = Field(None, example="São Paulo, SP")
    fees: Optional[str] = Field(None, example="Frete Grátis")
    seller_name: Optional[str] = Field(None, example="Loja Oficial Apple")
    seller_rating: Optional[str] = Field(None, example="5 estrelas")
    sales_count: Optional[str] = Field(None, example="500+ vendidos")
    in_stock: bool = Field(..., example=True)
    url: str = Field(..., example="https://produto.mercadolivre.com.br/MLB123")

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
]

async def fetch_page(client: httpx.AsyncClient, url: str):
    headers = {"User-Agent": random.choice(USER_AGENTS)}
    try:
        response = await client.get(url, headers=headers, timeout=10.0)
        if response.status_code == 200:
            return response.text
    except Exception:
        return None
    return None

async def scrape_product_details(client: httpx.AsyncClient, url: str) -> Optional[ProductDetail]:
    html = await fetch_page(client, url)
    if not html: return None
    soup = BeautifulSoup(html, "html.parser")
    try:
        name = soup.find("h1", {"class": "ui-pdp-title"}).text.strip() if soup.find("h1", {"class": "ui-pdp-title"}) else "N/A"
        price_elem = soup.find("span", {"class": "andes-money-amount__fraction"})
        price = f"R$ {price_elem.text.strip()}" if price_elem else "N/A"
        location = soup.find("span", {"class": "ui-pdp-location-address"}).text.strip() if soup.find("span", {"class": "ui-pdp-location-address"}) else "Não informado"
        fees = soup.find("span", {"class": "ui-pdp-free-shipping"}).text.strip() if soup.find("span", {"class": "ui-pdp-free-shipping"}) else "Frete a consultar"
        seller_name = soup.find("a", {"class": "ui-pdp-seller-info__name"}).text.strip() if soup.find("a", {"class": "ui-pdp-seller-info__name"}) else "Vendedor anônimo"
        seller_rating = soup.find("span", {"class": "ui-pdp-seller-info__rating"}).text.strip() if soup.find("span", {"class": "ui-pdp-seller-info__rating"}) else "Sem avaliação"
        sales_count = soup.find("span", {"class": "ui-pdp-product-description__sales"}).text.strip() if soup.find("span", {"class": "ui-pdp-product-description__sales"}) else "0"
        out_of_stock = soup.find("span", {"class": "ui-pdp-stock-status__out"})
        in_stock = False if out_of_stock else True
        return ProductDetail(name=name, price=price, location=location, fees=fees, seller_name=seller_name, seller_rating=seller_rating, sales_count=sales_count, in_stock=in_stock, url=url)
    except Exception:
        return None

@app.get("/search", response_model=List[ProductDetail])
async def search_products(q: str = Query(..., description="Termo de busca do produto")):
    search_url = f"https://lista.mercadolivre.com.br/{q.replace(' ', '-')}"
    async with httpx.AsyncClient() as client:
        html = await fetch_page(client, search_url)
        if not html: raise HTTPException(status_code=404, detail="Não foi possível acessar o Mercado Livre")
        soup = BeautifulSoup(html, "html.parser")
        links = [a.get("href").split("#")[0] for a in soup.find_all("a", {"class": "ui-search-item__title"}) if a.get("href")]
        if not links: return []
        top_links = links[:10]
        tasks = [scrape_product_details(client, url) for url in top_links]
        results = await asyncio.gather(*tasks)
        return [res for res in results if res is not None]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
