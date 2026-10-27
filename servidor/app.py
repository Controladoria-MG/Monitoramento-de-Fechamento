"""
Monitoramento de Fechamento — servidor (FastAPI + PostgreSQL).

Serve o portal (index.html, static/ e data/ da pasta acima) e guarda as
etapas marcadas, para que todos vejam o mesmo progresso.

No piloto, o portal ficou no GitHub Pages e as marcações no servidor do
Quadro (rotas /api/radar-contabil). Este arquivo reúne as duas partes num
serviço só, para o TI hospedar. Portal e API ficam no mesmo endereço, então
não é preciso CORS.

Variáveis de ambiente:
    DATABASE_URL   conexão PostgreSQL (obrigatória)
    CORS_ORIGENS   origens extras liberadas, separadas por vírgula (opcional;
                   só se o portal for servido de outro endereço)

Rodar:
    pip install -r servidor/requirements.txt
    uvicorn servidor.app:app --port 8000      (a partir da raiz do projeto)
"""

import hashlib
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from psycopg2.extras import RealDictCursor
from pydantic import BaseModel

RAIZ = Path(__file__).resolve().parent.parent

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Códigos de etapa aceitos (o portal usa 10 a 18; ver ETAPAS no static/script.js).
ETAPA_MAX = 50


def conectar():
    if not DATABASE_URL:
        raise RuntimeError("Defina a variável de ambiente DATABASE_URL.")
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


def criar_tabela():
    # Uma linha por etapa feita. Idempotente: roda a cada subida.
    with conectar() as conn, conn.cursor() as cur:
        cur.execute((Path(__file__).parent / "schema.sql").read_text(encoding="utf-8"))
        conn.commit()


@asynccontextmanager
async def ciclo_de_vida(app: FastAPI):
    criar_tabela()
    yield


app = FastAPI(title="Monitoramento de Fechamento", lifespan=ciclo_de_vida)

origens = [o.strip() for o in os.environ.get("CORS_ORIGENS", "").split(",") if o.strip()]
if origens:
    app.add_middleware(CORSMiddleware, allow_origins=origens, allow_methods=["GET", "PUT"], allow_headers=["Content-Type"])


def resposta_json(request: Request, dados) -> Response:
    """JSON com ETag. O portal pede o progresso a cada 20 s; quando nada
    mudou, a resposta é 304 sem corpo."""
    corpo = json.dumps(dados, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    etag = '"' + hashlib.md5(corpo).hexdigest() + '"'
    cabecalhos = {"ETag": etag, "Cache-Control": "private, no-cache"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=cabecalhos)
    return Response(corpo, media_type="application/json", headers=cabecalhos)


# ── API ──
# A chave do grupo é montada pelo portal: "g:<nome do grupo>" ou, para cliente
# sem grupo, "c:<código do cliente>". A etapa é o código fixo dela no portal.

class Marcacao(BaseModel):
    grupo: str
    etapa: int
    feito: bool


@app.get("/api/fechamento/progresso")
def progresso(request: Request):
    with conectar() as conn, conn.cursor() as cur:
        cur.execute("SELECT grupo, etapa, feito_em FROM fechamento_etapas ORDER BY grupo, etapa")
        grupos = {}
        for row in cur.fetchall():
            grupos.setdefault(row["grupo"], {"etapas": {}})["etapas"][str(row["etapa"])] = row["feito_em"].isoformat()
    return resposta_json(request, {"grupos": grupos})


@app.put("/api/fechamento/marcacao")
def marcar(m: Marcacao):
    grupo = m.grupo.strip()
    if not grupo or len(grupo) > 200:
        raise HTTPException(status_code=400, detail="Grupo inválido")
    if not 0 <= m.etapa < ETAPA_MAX:
        raise HTTPException(status_code=400, detail="Etapa inválida")
    feito_em = None
    with conectar() as conn, conn.cursor() as cur:
        if m.feito:
            # Se já estava marcada, mantém a data original.
            cur.execute("""
                INSERT INTO fechamento_etapas (grupo, etapa, feito_em) VALUES (%s, %s, %s)
                ON CONFLICT (grupo, etapa) DO UPDATE SET feito_em = fechamento_etapas.feito_em
                RETURNING feito_em
            """, (grupo, m.etapa, datetime.now(timezone.utc)))
            feito_em = cur.fetchone()["feito_em"].isoformat()
        else:
            cur.execute("DELETE FROM fechamento_etapas WHERE grupo = %s AND etapa = %s", (grupo, m.etapa))
        conn.commit()
    return {"grupo": grupo, "etapa": m.etapa, "feitoEm": feito_em}


# ── Portal ──
app.mount("/static", StaticFiles(directory=RAIZ / "static"), name="static")
app.mount("/data", StaticFiles(directory=RAIZ / "data"), name="data")


@app.get("/")
def portal():
    return FileResponse(RAIZ / "index.html", headers={"Cache-Control": "no-cache"})
