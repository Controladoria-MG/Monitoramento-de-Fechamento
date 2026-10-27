"""Copia as marcações do piloto para o banco do servidor novo.

No piloto, as marcações ficaram no servidor do Quadro
(https://wj-quadro.onrender.com/api/radar-contabil/progresso). Este script lê
esse endereço e grava tudo na tabela fechamento_etapas, mantendo a data de
cada marcação. Pode rodar mais de uma vez: o que já existe não é duplicado.

Uso (a partir da raiz do projeto, com DATABASE_URL definido):
    python servidor/importar_piloto.py
    python servidor/importar_piloto.py --origem <outro endereço do progresso>

Os códigos de etapa 0 a 5 são da primeira versão do piloto e são ignorados.
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

import psycopg2

ORIGEM_PADRAO = "https://wj-quadro.onrender.com/api/radar-contabil/progresso"
CODIGOS_VALIDOS = range(10, 19)


def main():
    origem = sys.argv[sys.argv.index("--origem") + 1] if "--origem" in sys.argv else ORIGEM_PADRAO
    url = os.environ.get("DATABASE_URL", "").replace("postgres://", "postgresql://", 1)
    if not url:
        raise SystemExit("Defina a variável de ambiente DATABASE_URL.")

    print(f"Lendo {origem} (o primeiro acesso pode levar até um minuto)...")
    with urllib.request.urlopen(origem, timeout=120) as resp:
        grupos = json.load(resp)["grupos"]

    linhas = [(grupo, int(etapa), quando)
              for grupo, dados in grupos.items()
              for etapa, quando in dados["etapas"].items()
              if int(etapa) in CODIGOS_VALIDOS]

    with psycopg2.connect(url) as conn, conn.cursor() as cur:
        cur.execute((Path(__file__).parent / "schema.sql").read_text(encoding="utf-8"))
        novas = 0
        for linha in linhas:
            cur.execute("""
                INSERT INTO fechamento_etapas (grupo, etapa, feito_em) VALUES (%s, %s, %s)
                ON CONFLICT (grupo, etapa) DO NOTHING
            """, linha)
            novas += cur.rowcount
        conn.commit()
    print(f"{len(linhas)} marcações lidas de {len(grupos)} grupos; {novas} gravadas agora.")


if __name__ == "__main__":
    main()
