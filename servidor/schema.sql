-- Monitoramento de Fechamento: etapas marcadas por grupo de clientes.
-- Uma linha por etapa feita; desmarcar apaga a linha.
--   grupo     chave montada pelo portal: 'g:<nome do grupo>' ou 'c:<código do cliente>'
--   etapa     código fixo da etapa (10 a 18; ver ETAPAS em static/script.js)
--   feito_em  quando foi marcada (mantida se marcarem de novo)
CREATE TABLE IF NOT EXISTS fechamento_etapas (
    grupo     TEXT        NOT NULL,
    etapa     INTEGER     NOT NULL,
    feito_em  TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (grupo, etapa)
);
