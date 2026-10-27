// ── Dados ──
// A base de clientes vem de data/monitoramento_fechamento/resumo.xlsx (aba "Clientes"),
// lida no navegador com SheetJS, igual aos outros portais.
const ARQUIVO_DADOS = 'data/monitoramento_fechamento/resumo.xlsx';
const ARQUIVO_STATUS = 'data/monitoramento_fechamento/status.json';
let CLIENTES = [];

// Etapas do checklist, na ordem da tela. O código é o que vai para o servidor:
// nunca reaproveite nem mude o código de uma etapa (as marcações dependem dele).
// Os códigos 0 a 5 foram da primeira versão e não devem ser usados.
//  - semMovimento: conclui o cliente e trava as demais etapas.
//  - parcial: marcar esta etapa marca junto a parcial dela;
//    desmarcar a parcial desmarca esta.
const ETAPAS = [
  { codigo: 10, nome: 'Empresa sem movimento', semMovimento: true },
  { codigo: 11, nome: 'Recebimento da documentação contábil 100%', parcial: 12 },
  { codigo: 12, nome: 'Recebimento da documentação contábil 80%', detalhe: 'Já é possível realizar o fechamento' },
  { codigo: 13, nome: 'Conciliação da folha' },
  { codigo: 14, nome: 'Conciliação do resumo fiscal 100%', parcial: 15 },
  { codigo: 15, nome: 'Conciliação do fiscal 60% (ICMS)', detalhe: 'Falta PIS/Cofins' },
  { codigo: 16, nome: 'Conciliação financeira 100%', parcial: 17 },
  { codigo: 17, nome: 'Conciliação financeira 85/90%', detalhe: 'Já é possível enviar uma prévia' },
  { codigo: 18, nome: 'Fechamento liberado' },
];
const ETAPA_SEM_MOVIMENTO = ETAPAS.find((e) => e.semMovimento);
// As que contam no progresso (todas menos "sem movimento").
const ETAPAS_TRABALHO = ETAPAS.filter((e) => !e.semMovimento);
const TOTAL_ETAPAS = ETAPAS_TRABALHO.length;
const porCodigo = (codigo) => ETAPAS.find((e) => e.codigo === codigo);

// Coluna da planilha -> campo usado no portal
const CAMPOS = {
  ID: 'id', CodMatriz: 'matriz', RazaoSocial: 'nome', Grupo: 'grupo', Gerente: 'gerente',
  Master: 'master', Regime: 'regime', Segmento: 'segmento', 'Responsável': 'responsavel',
  'Coordenação': 'coordenacao', Departamento: 'departamento',
};

async function carregarDados() {
  const resp = await fetch(ARQUIVO_DADOS, { cache: 'no-store' });
  if (!resp.ok) throw new Error('Planilha não encontrada');
  const wb = XLSX.read(await resp.arrayBuffer(), { type: 'array' });

  const linhas = XLSX.utils.sheet_to_json(wb.Sheets.Clientes, { defval: '' });
  CLIENTES = linhas
    .map((l) => {
      const c = {};
      for (const [col, valor] of Object.entries(l)) {
        const campo = CAMPOS[col.trim()];
        if (campo) c[campo] = typeof valor === 'string' ? valor.trim() : valor;
      }
      c.matriz = Number(c.matriz) || 0;
      return c;
    })
    .filter((c) => c.id !== '' && c.id !== undefined);
}

async function carregarStatus() {
  try {
    const resp = await fetch(ARQUIVO_STATUS, { cache: 'no-store' });
    const st = await resp.json();
    const d = new Date(st.ultima_execucao);
    $('#status-execucao').textContent = `Base atualizada em ${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch (e) {
    $('#status-execucao').textContent = 'Etapas de fechamento por cliente';
  }
}

// ── Utilitários ──
const $ = (s) => document.querySelector(s);
// O github.io é o mesmo endereço para todos os portais: a chave precisa ser única.
const CHAVE = 'monitoramento-de-fechamento:preferencias';

function escapeHTML(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function semAcento(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function plural(n, um, varios) { return `${n} ${n === 1 ? um : varios}`; }
function pct(feitas, total) { return total ? Math.round((feitas / total) * 100) : 0; }
function rotuloRegime(r) {
  const s = semAcento(r);
  if (s.includes('presumido')) return 'Lucro Presumido';
  if (s.includes('real') && s.includes('trimestral')) return 'Lucro Real Trimestral';
  if (s.includes('real') && s.includes('anual')) return 'Lucro Real Anual';
  if (s.includes('simples')) return 'Simples Nacional';
  return r || 'Não informado';
}
function formatarQuando(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' +
         d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function avisar(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.classList.add('visivel');
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => el.classList.remove('visivel'), 2200);
}
function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Marcações (compartilhadas, no servidor) ──
// O progresso é do grupo: uma etapa marcada vale para todos os clientes dele.
// Cliente sem grupo tem o próprio registro. Todos veem as mesmas marcações;
// no navegador fica só a preferência de tema.
// Servido pelo servidor/app.py (hospedagem definitiva), a API fica no mesmo
// endereço do portal. No piloto (GitHub Pages), as marcações ficam no Quadro.
const API_PILOTO = 'https://wj-quadro.onrender.com/api/radar-contabil';
const API_PADRAO = location.hostname.endsWith('github.io') ? API_PILOTO : 'api/fechamento';
const local = ['localhost', '127.0.0.1'].includes(location.hostname);
// Para testar com outro servidor: http://localhost:8000/?api=http://127.0.0.1:8001/api/fechamento
const API = (local && new URLSearchParams(location.search).get('api')) || API_PADRAO;
const INTERVALO_ATUALIZACAO = 20000;

let banco = { grupos: {}, prefs: {} };
let gravacoesPendentes = 0;

function chaveGrupo(c) { return c.grupo ? 'g:' + c.grupo : 'c:' + c.id; }

try {
  const salvo = JSON.parse(localStorage.getItem(CHAVE) || 'null');
  if (salvo && typeof salvo === 'object') banco.prefs = salvo.prefs || {};
} catch (e) { /* sem armazenamento: segue só em memória */ }

function salvarPreferencias() {
  try { localStorage.setItem(CHAVE, JSON.stringify({ prefs: banco.prefs })); }
  catch (e) { /* tema só não fica lembrado */ }
}

async function carregarProgresso() {
  const resp = await fetch(API + '/progresso', { cache: 'no-cache' });
  if (!resp.ok) throw new Error('Servidor indisponível');
  return (await resp.json()).grupos || {};
}

// Busca o que os outros marcaram. Não redesenha enquanto há gravação em
// andamento ou a lista de sugestões da busca está aberta.
async function atualizarEmSegundoPlano() {
  if (gravacoesPendentes || document.hidden) return;
  try {
    const grupos = await carregarProgresso();
    if (gravacoesPendentes || JSON.stringify(grupos) === JSON.stringify(banco.grupos)) return;
    banco.grupos = grupos;
    if (!$('#sugestoes').classList.contains('aberta')) atualizarTudo();
  } catch (e) { /* tenta de novo no próximo ciclo */ }
}

function registro(id, criar) {
  const c = porId(id);
  if (!c) return null;
  const k = chaveGrupo(c);
  if (!banco.grupos[k] && criar) banco.grupos[k] = { etapas: {} };
  return banco.grupos[k] || null;
}
function marcada(id, etapa) { return !!registro(id, false)?.etapas[etapa.codigo]; }
function semMovimento(id) { return marcada(id, ETAPA_SEM_MOVIMENTO); }
// Empresa sem movimento conta como todas as etapas feitas.
function feitasDe(id) {
  if (semMovimento(id)) return TOTAL_ETAPAS;
  return ETAPAS_TRABALHO.filter((e) => marcada(id, e)).length;
}
function statusDe(id) {
  const f = feitasDe(id);
  return f === 0 ? 'pendente' : f === TOTAL_ETAPAS ? 'concluido' : 'andamento';
}
function proximaEtapa(id) {
  if (semMovimento(id)) return null;
  return ETAPAS_TRABALHO.find((e) => !marcada(id, e)) || null;
}

// Etapas que mudam junto com um clique: a de 100% leva a parcial ao ser
// marcada; a parcial leva a de 100% ao ser desmarcada.
function etapasAfetadas(id, etapa, marcar) {
  const lista = [etapa];
  if (marcar && etapa.parcial && !marcada(id, porCodigo(etapa.parcial))) lista.push(porCodigo(etapa.parcial));
  if (!marcar) {
    const completa = ETAPAS.find((e) => e.parcial === etapa.codigo);
    if (completa && marcada(id, completa)) lista.push(completa);
  }
  return lista;
}

// A tela muda na hora; se o servidor recusar, as marcações voltam ao que eram.
async function alternarEtapa(id, codigo) {
  const etapa = porCodigo(codigo);
  if (!etapa || (!etapa.semMovimento && semMovimento(id))) return;
  const c = porId(id);
  const r = registro(id, true);
  const marcar = !r.etapas[codigo];
  const afetadas = etapasAfetadas(id, etapa, marcar);
  const antes = Object.fromEntries(afetadas.map((e) => [e.codigo, r.etapas[e.codigo]]));
  for (const e of afetadas) {
    if (marcar) r.etapas[e.codigo] = new Date().toISOString();
    else delete r.etapas[e.codigo];
  }

  gravacoesPendentes++;
  try {
    const respostas = await Promise.all(afetadas.map((e) => fetch(API + '/marcacao', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grupo: chaveGrupo(c), etapa: e.codigo, feito: marcar }),
    })));
    if (respostas.some((resp) => !resp.ok)) throw new Error();
    for (const resp of respostas) {
      const dados = await resp.json();
      if (marcar && dados.feitoEm) r.etapas[dados.etapa] = dados.feitoEm;
    }
  } catch (e) {
    for (const [k, v] of Object.entries(antes)) {
      if (v) r.etapas[k] = v; else delete r.etapas[k];
    }
    avisar('Não foi possível salvar a marcação. Tente de novo.');
  } finally {
    gravacoesPendentes--;
    atualizarTudo();
  }
}

// ── Rosca ──
// Um segmento por etapa; cada clique acende o segmento correspondente.
function desenharRosca(el, feitas, total, mostrarTexto = true) {
  const r = 70, c = 2 * Math.PI * r, folga = total > 1 ? 5 : 0;
  const tam = c / total - folga;
  if (!el.dataset.montada || Number(el.dataset.total) !== total) {
    let segs = '';
    for (let i = 0; i < total; i++) {
      segs += `<circle class="seg" cx="90" cy="90" r="${r}" stroke-dasharray="${tam} ${c - tam}" stroke-dashoffset="${-(i * c / total)}"/>`;
    }
    el.innerHTML = `<svg viewBox="0 0 180 180">${segs}</svg>` +
      (mostrarTexto ? '<div class="rosca-centro"><div class="rosca-pct">0%</div><div class="rosca-sub"></div></div>' : '');
    el.dataset.montada = '1';
    el.dataset.total = total;
  }
  el.querySelectorAll('.seg').forEach((s, i) => s.classList.toggle('feito', i < feitas));
  el.classList.toggle('completa', total > 0 && feitas === total);
  if (mostrarTexto) {
    animarNumero(el.querySelector('.rosca-pct'), pct(feitas, total), '%');
    el.querySelector('.rosca-sub').textContent = `${feitas} de ${plural(total, 'etapa', 'etapas')}`;
  }
}
// A rosca do placar mostra o percentual geral como arco contínuo.
function desenharRoscaContinua(el, valor) {
  const r = 70, c = 2 * Math.PI * r;
  if (!el.dataset.montada) {
    el.innerHTML = `<svg viewBox="0 0 180 180"><circle class="seg" cx="90" cy="90" r="${r}"/>` +
      `<circle class="seg feito" cx="90" cy="90" r="${r}" stroke-dasharray="0 ${c}" style="transition: stroke-dasharray .6s ease; stroke-linecap: round"/></svg>`;
    el.dataset.montada = '1';
  }
  const arco = el.querySelectorAll('.seg')[1];
  const tam = c * valor / 100;
  arco.setAttribute('stroke-dasharray', `${tam} ${c - tam}`);
  arco.style.opacity = valor > 0 ? 1 : 0;
}
function animarNumero(el, alvo, sufixo) {
  const inicio = parseInt(el.textContent, 10) || 0;
  if (inicio === alvo) { el.textContent = alvo + sufixo; return; }
  const t0 = performance.now(), dur = 350;
  cancelAnimationFrame(el._raf);
  const passo = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    el.textContent = Math.round(inicio + (alvo - inicio) * (1 - Math.pow(1 - p, 3))) + sufixo;
    if (p < 1) el._raf = requestAnimationFrame(passo);
  };
  el._raf = requestAnimationFrame(passo);
}

// ── Placares ──
// etapa: código da etapa (texto); mostra os clientes que já a concluíram.
const filtros = { busca: '', coordenacao: '', regime: '', grupo: '', responsavel: '', etapa: '', status: '' };
const CAMPOS_FILTRO = ['coordenacao', 'regime', 'grupo', 'responsavel', 'etapa'];

// Empresa sem movimento conta como feita em todas as etapas.
function etapaConcluida(id, etapa) {
  return marcada(id, etapa) || (!etapa.semMovimento && semMovimento(id));
}
let ordem = { campo: 'nome', dir: 1 };

function agrupar(chave, rotulo = (v) => v || 'Não informado') {
  const mapa = new Map();
  for (const c of CLIENTES) {
    const k = c[chave] || '';
    const g = mapa.get(k) || { valor: k, nome: rotulo(k), clientes: 0, feitas: 0, concluidos: 0 };
    const f = feitasDe(c.id);
    g.clientes++; g.feitas += f;
    if (f === TOTAL_ETAPAS) g.concluidos++;
    mapa.set(k, g);
  }
  return [...mapa.values()]
    .map((g) => ({ ...g, pct: pct(g.feitas, g.clientes * TOTAL_ETAPAS) }))
    .sort((a, b) => b.pct - a.pct || a.nome.localeCompare(b.nome));
}

function htmlBarra(nome, detalhe, valor, filtro, ativo) {
  const tag = filtro ? 'button' : 'div';
  const attrs = filtro ? ` data-filtro="${escapeHTML(filtro[0])}" data-valor="${escapeHTML(filtro[1])}"` : '';
  return `<${tag} class="barra-linha${ativo ? ' ativa' : ''}"${attrs}>
    <span class="barra-nome" title="${escapeHTML(nome)}">${escapeHTML(nome)}<small>${escapeHTML(detalhe)}</small></span>
    <span class="barra-pct">${valor}%</span>
    <span class="barra-trilha"><span class="barra-cheia" style="width:${valor}%"></span></span>
  </${tag}>`;
}

function renderInicio() {
  const total = CLIENTES.length * TOTAL_ETAPAS;
  let feitas = 0, concl = 0, andam = 0, pend = 0;
  for (const c of CLIENTES) {
    const f = feitasDe(c.id);
    feitas += f;
    if (f === 0) pend++; else if (f === TOTAL_ETAPAS) concl++; else andam++;
  }
  const geral = pct(feitas, total);
  const grupos = new Set(CLIENTES.map(chaveGrupo)).size;
  $('#sub-inicio').textContent = `${plural(CLIENTES.length, 'cliente', 'clientes')} · ${plural(grupos, 'grupo', 'grupos')}`;
  animarNumero($('#kpi-total'), geral, '%');
  $('#kpi-total-sub').textContent = `${feitas} de ${plural(total, 'etapa', 'etapas')} concluídas`;
  desenharRoscaContinua($('#rosca-total'), geral);
  $('#kpi-concluidos').textContent = concl;
  $('#kpi-concluidos-sub').textContent = `${pct(concl, CLIENTES.length)}% da carteira`;
  $('#kpi-andamento').textContent = andam;
  $('#kpi-pendentes').textContent = pend;
  document.querySelectorAll('.kpi[data-status]').forEach((k) => k.classList.toggle('ativo', filtros.status === k.dataset.status));

  const detalheGrupo = (g) => `${g.concluidos} de ${g.clientes}`;
  $('#barras-coordenacao').innerHTML = agrupar('coordenacao')
    .map((g) => htmlBarra(g.nome, detalheGrupo(g), g.pct, ['coordenacao', g.valor], filtros.coordenacao === g.valor)).join('');
  $('#barras-regime').innerHTML = agrupar('regime', rotuloRegime)
    .map((g) => htmlBarra(g.nome, detalheGrupo(g), g.pct, ['regime', g.valor], filtros.regime === g.valor)).join('');
  $('#barras-etapa').innerHTML = ETAPAS.map((e) => {
    const n = CLIENTES.filter((c) => etapaConcluida(c.id, e)).length;
    return htmlBarra(e.nome, `${n} de ${CLIENTES.length}`, pct(n, CLIENTES.length), ['etapa', String(e.codigo)], filtros.etapa === String(e.codigo));
  }).join('');

  renderTabela();
}

function preencherFiltros() {
  const opcoes = (chave, vazio, rotulo = (v) => v) => {
    const vals = [...new Set(CLIENTES.map((c) => c[chave]).filter(Boolean))].sort((a, b) => rotulo(a).localeCompare(rotulo(b)));
    return `<option value="">${vazio}</option>` + vals.map((v) => `<option value="${escapeHTML(v)}">${escapeHTML(rotulo(v))}</option>`).join('');
  };
  $('#f-coordenacao').innerHTML = opcoes('coordenacao', 'Todas as coordenações');
  $('#f-regime').innerHTML = opcoes('regime', 'Todas as tributações', rotuloRegime);
  $('#f-grupo').innerHTML = opcoes('grupo', 'Todos os grupos');
  $('#f-responsavel').innerHTML = opcoes('responsavel', 'Todos os responsáveis');
  $('#f-etapa').innerHTML = '<option value="">Todas as etapas</option>' +
    ETAPAS.map((e) => `<option value="${e.codigo}">Concluiu: ${escapeHTML(e.nome)}</option>`).join('');
}
function sincronizarFiltros() {
  for (const k of CAMPOS_FILTRO) $('#f-' + k).value = filtros[k];
  $('#f-busca').value = filtros.busca;
}

// Filtros da tabela, sem a aba de status (as abas contam sobre este conjunto).
function clientesFiltrados() {
  const termo = semAcento(filtros.busca.trim());
  return CLIENTES.filter((c) =>
    (!termo || semAcento(`${c.id} ${c.nome} ${c.grupo} ${c.responsavel}`).includes(termo)) &&
    (!filtros.coordenacao || c.coordenacao === filtros.coordenacao) &&
    (!filtros.regime || c.regime === filtros.regime) &&
    (!filtros.grupo || c.grupo === filtros.grupo) &&
    (!filtros.responsavel || c.responsavel === filtros.responsavel) &&
    (!filtros.etapa || etapaConcluida(c.id, porCodigo(Number(filtros.etapa)))));
}

const ROTULO_STATUS = { concluido: 'Concluído', andamento: 'Em andamento', pendente: 'Não iniciado' };

// O que a tabela mostra agora: filtros + aba de status, na ordem escolhida.
// A exportação usa a mesma lista.
function clientesDaTabela() {
  const valorOrdem = (c) => {
    switch (ordem.campo) {
      case 'id': return Number(c.id);
      case 'pct': return feitasDe(c.id);
      case 'regime': return rotuloRegime(c.regime);
      case 'proxima': { const p = proximaEtapa(c.id); return p ? ETAPAS.indexOf(p) : ETAPAS.length; }
      default: return semAcento(c[ordem.campo]);
    }
  };
  return clientesFiltrados().filter((c) => !filtros.status || statusDe(c.id) === filtros.status).sort((a, b) => {
    const va = valorOrdem(a), vb = valorOrdem(b);
    return (va < vb ? -1 : va > vb ? 1 : semAcento(a.nome).localeCompare(semAcento(b.nome))) * ordem.dir;
  });
}

function rotuloEtapaAtual(c) {
  if (semMovimento(c.id)) return 'Sem movimento';
  const prox = proximaEtapa(c.id);
  return prox ? prox.nome : ROTULO_STATUS.concluido;
}

function renderTabela() {
  const base = clientesFiltrados();
  document.querySelectorAll('.tabela-aba').forEach((aba) => {
    const st = aba.dataset.status;
    aba.classList.toggle('ativa', st === filtros.status);
    aba.querySelector('b').textContent = st ? base.filter((c) => statusDe(c.id) === st).length : base.length;
  });
  const lista = clientesDaTabela();
  document.querySelectorAll('th[data-ordem]').forEach((th) => {
    th.querySelector('.seta')?.remove();
    if (th.dataset.ordem === ordem.campo) th.insertAdjacentHTML('beforeend', `<span class="seta">${ordem.dir > 0 ? '▲' : '▼'}</span>`);
  });
  $('#f-contagem').textContent = `${plural(lista.length, 'cliente', 'clientes')} de ${CLIENTES.length}`;
  if (!lista.length) {
    $('#tabela-corpo').innerHTML = '<tr><td colspan="8" class="vazio">Nenhum cliente com esses filtros.</td></tr>';
    return;
  }
  $('#tabela-corpo').innerHTML = lista.map((c) => {
    const f = feitasDe(c.id), p = pct(f, TOTAL_ETAPAS), st = statusDe(c.id), prox = proximaEtapa(c.id);
    const etapaAtual = prox
      ? escapeHTML(prox.nome)
      : `<span class="etiqueta etq-concluido">${escapeHTML(rotuloEtapaAtual(c))}</span>`;
    return `<tr data-id="${escapeHTML(c.id)}">
      <td class="num">${escapeHTML(c.id)}</td>
      <td class="cel-cliente">${escapeHTML(c.nome)}${c.matriz ? `<small>Filial da matriz ${escapeHTML(c.matriz)}</small>` : ''}</td>
      <td>${escapeHTML(c.grupo)}</td>
      <td>${escapeHTML(c.coordenacao)}</td>
      <td>${escapeHTML(c.responsavel)}</td>
      <td>${escapeHTML(rotuloRegime(c.regime))}</td>
      <td><div class="mini-progresso"><span class="barra-trilha"><span class="barra-cheia" style="width:${p}%"></span></span><b>${p}%</b></div></td>
      <td>${etapaAtual}${st === 'pendente' ? ` <span class="etiqueta etq-pendente">${ROTULO_STATUS.pendente}</span>` : ''}</td>
    </tr>`;
  }).join('');
}

// ── Checklist ──
let clienteAtual = null;
let sugestaoMarcada = -1;

function porId(id) { return CLIENTES.find((c) => String(c.id) === String(id)) || null; }
function rotuloCliente(c) { return `${c.id} - ${c.nome}`; }
function clientesDoGrupo(c) {
  if (!c) return [];
  const lista = c.grupo
    ? CLIENTES.filter((x) => x.grupo === c.grupo)
    : CLIENTES.filter((x) => x.id === c.id || String(x.matriz) === String(c.id) || (c.matriz && (String(x.id) === String(c.matriz) || String(x.matriz) === String(c.matriz))));
  // Matriz primeiro, depois as filiais logo abaixo dela.
  const raiz = (x) => Number(x.matriz) || Number(x.id);
  return lista.sort((a, b) => raiz(a) - raiz(b) || (Number(a.matriz) ? 1 : 0) - (Number(b.matriz) ? 1 : 0) || semAcento(a.nome).localeCompare(semAcento(b.nome)));
}

function buscarSugestoes(texto) {
  const termo = semAcento(texto.trim());
  if (!termo) return CLIENTES.slice(0, 0);
  const exato = CLIENTES.filter((c) => String(c.id) === termo);
  const resto = CLIENTES.filter((c) => String(c.id) !== termo && semAcento(`${c.id} ${c.nome} ${c.grupo}`).includes(termo));
  return [...exato, ...resto].slice(0, 30);
}
function renderSugestoes() {
  const caixa = $('#sugestoes');
  const lista = buscarSugestoes($('#busca-cliente').value);
  if (!lista.length) {
    caixa.innerHTML = $('#busca-cliente').value.trim() ? '<div class="vazio">Nenhum cliente encontrado.</div>' : '';
    caixa.classList.toggle('aberta', !!$('#busca-cliente').value.trim());
    return;
  }
  sugestaoMarcada = Math.min(Math.max(sugestaoMarcada, 0), lista.length - 1);
  caixa.innerHTML = lista.map((c, i) =>
    `<button class="sugestao${i === sugestaoMarcada ? ' marcada' : ''}" data-id="${escapeHTML(c.id)}">
      <span>${escapeHTML(rotuloCliente(c))}</span><small>${escapeHTML(c.grupo)} · ${pct(feitasDe(c.id), TOTAL_ETAPAS)}%</small>
    </button>`).join('');
  caixa.classList.add('aberta');
}
function fecharSugestoes() { $('#sugestoes').classList.remove('aberta'); sugestaoMarcada = -1; }

function abrirCliente(id, mudarEndereco = true) {
  const c = porId(id);
  if (!c) return;
  clienteAtual = c;
  $('#busca-cliente').value = rotuloCliente(c);
  fecharSugestoes();
  if (mudarEndereco) history.replaceState(null, '', '#tratamento/' + encodeURIComponent(c.id));
  renderTratamento();
}

function renderTratamento() {
  const c = clienteAtual;
  $('#trat-vazio').hidden = !!c;
  $('#trat-conteudo').hidden = !c;
  $('#nav-cliente').hidden = !c;
  if (!c) return;
  const r = registro(c.id, false);
  const feitas = feitasDe(c.id);
  const parado = semMovimento(c.id);
  desenharRosca($('#rosca-cliente'), feitas, TOTAL_ETAPAS);
  if (parado) $('#rosca-cliente .rosca-sub').textContent = 'Empresa sem movimento';

  $('#cli-nome').textContent = c.nome;
  $('#cli-linha').textContent = `Código ${c.id}${c.matriz ? ` · filial da matriz ${c.matriz}` : ' · matriz'}`;
  const info = [
    ['Grupo', c.grupo], ['Tributação', rotuloRegime(c.regime)], ['Coordenação', c.coordenacao],
    ['Responsável', c.responsavel], ['Gerente', c.gerente], ['Master', c.master],
    ['Segmento', c.segmento],
  ];
  $('#cli-info').innerHTML = info.filter(([, v]) => v)
    .map(([k, v]) => `<div><dt>${escapeHTML(k)}</dt><dd title="${escapeHTML(v)}">${escapeHTML(v)}</dd></div>`).join('');

  $('#etapas-resumo').textContent = parado ? 'Empresa sem movimento'
    : feitas === TOTAL_ETAPAS ? 'Todas concluídas' : plural(TOTAL_ETAPAS - feitas, 'etapa pendente', 'etapas pendentes');
  $('#checklist').innerHTML = ETAPAS.map((e, i) => {
    const quando = r?.etapas[e.codigo];
    const fechada = parado && !e.semMovimento;
    const classes = ['etapa', quando ? 'feita' : '', fechada ? 'fechada' : '', e.semMovimento ? 'sem-movimento' : ''].filter(Boolean).join(' ');
    return `<button class="${classes}" data-etapa="${e.codigo}" aria-pressed="${!!quando}"${fechada ? ' disabled' : ''}>
      <span class="etapa-num">${i + 1}</span>
      <span class="etapa-caixa"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></span>
      <span class="etapa-nome">${escapeHTML(e.nome)}${e.detalhe ? `<small>${escapeHTML(e.detalhe)}</small>` : ''}</span>
      <span class="etapa-quando">${quando ? 'Concluída em ' + formatarQuando(quando) : ''}</span>
    </button>`;
  }).join('');
  const qtdGrupo = clientesDoGrupo(c).length;
  $('#dica-grupo').textContent = (qtdGrupo > 1 ? `As etapas valem para os ${qtdGrupo} clientes do grupo ${c.grupo}. ` : '') +
    `Atalho: teclas 1 a ${ETAPAS.length} marcam e desmarcam as etapas.`;

  renderGrupo();
}

function renderGrupo() {
  const c = clienteAtual;
  const lista = clientesDoGrupo(c);
  $('#grupo-titulo').textContent = c.grupo ? `Grupo ${c.grupo}` : 'Clientes do grupo';
  $('#grupo-resumo').textContent = `${plural(lista.length, 'cliente', 'clientes')} · ${pct(feitasDe(c.id), TOTAL_ETAPAS)}%`;
  $('#grupo-lista').innerHTML = lista.map((x) =>
    `<button class="grupo-item${x.id === c.id ? ' atual' : ''}" data-abrir="${escapeHTML(x.id)}">
      <span class="nome" title="${escapeHTML(rotuloCliente(x))}">${escapeHTML(rotuloCliente(x))}<small>${x.matriz ? 'filial' : 'matriz'}</small></span>
    </button>`).join('');
  const idx = lista.findIndex((x) => x.id === c.id);
  $('#btn-anterior').disabled = idx <= 0;
  $('#btn-proximo').disabled = idx === -1 || idx >= lista.length - 1;
}

// ── Navegação ──
function mostrar(tela) {
  $('#tela-inicio').classList.toggle('visivel', tela === 'inicio');
  $('#tela-tratamento').classList.toggle('visivel', tela === 'tratamento');
  $('#btn-ir-tratamento').hidden = tela === 'tratamento';
  $('#btn-ir-inicio').hidden = tela === 'inicio';
  window.scrollTo(0, 0);
  if (tela === 'inicio') renderInicio();
  else renderTratamento();
}
function lerEndereco() {
  const [tela, id] = location.hash.replace('#', '').split('/');
  if (tela === 'tratamento') {
    if (id && porId(decodeURIComponent(id))) abrirCliente(decodeURIComponent(id), false);
    mostrar('tratamento');
    if (!clienteAtual) setTimeout(() => $('#busca-cliente').focus(), 0);
  } else {
    mostrar('inicio');
  }
}
function irPara(hash) {
  if (location.hash === hash) lerEndereco(); else location.hash = hash;
}

// ── Exportar ──
function exportarCSV() {
  const cab = ['Código', 'Cliente', 'Grupo', 'Coordenação', 'Responsável', 'Tributação', ...ETAPAS.map((e) => e.nome), '% concluído', 'Situação'];
  const cel = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = CLIENTES.map((c) => {
    const r = registro(c.id, false);
    return [c.id, c.nome, c.grupo, c.coordenacao, c.responsavel, rotuloRegime(c.regime),
      ...ETAPAS.map((e) => (r?.etapas[e.codigo] ? formatarQuando(r.etapas[e.codigo]).replace(' às ', ' ') : '')),
      pct(feitasDe(c.id), TOTAL_ETAPAS) + '%', semMovimento(c.id) ? 'Sem movimento' : ROTULO_STATUS[statusDe(c.id)]].map(cel).join(';');
  });
  const hoje = new Date().toLocaleDateString('sv-SE');
  baixar(`monitoramento-de-fechamento-${hoje}.csv`, '﻿' + [cab.map(cel).join(';'), ...linhas].join('\r\n'), 'text/csv;charset=utf-8');
}
// Exporta para Excel exatamente o que a tabela mostra (filtros, aba e ordem).
// As mesmas colunas da tabela da tela, com largura e alinhamento no Excel.
// Formatação definida pela coordenação a partir de um arquivo exportado e
// ajustado no Excel (2026-10-22): estilo "Azul, Estilo de Tabela Médio 2",
// código e progresso à direita, texto à esquerda.
const COLUNAS_EXPORTACAO = [
  { nome: 'Código', largura: 10, alinhamento: 'right', valor: (c) => Number(c.id) || c.id },
  { nome: 'Cliente', largura: 58.71, alinhamento: 'left', valor: (c) => c.nome },
  { nome: 'Grupo', largura: 20, alinhamento: 'left', valor: (c) => c.grupo },
  { nome: 'Coordenação', largura: 22, alinhamento: 'left', valor: (c) => c.coordenacao },
  { nome: 'Responsável', largura: 22, alinhamento: 'left', valor: (c) => c.responsavel },
  { nome: 'Tributação', largura: 22, alinhamento: 'left', valor: (c) => rotuloRegime(c.regime) },
  { nome: 'Progresso', largura: 12, alinhamento: 'right', valor: (c) => feitasDe(c.id) / TOTAL_ETAPAS, formato: '0%' },
  { nome: 'Etapa atual', largura: 45, alinhamento: 'left', valor: (c) => rotuloEtapaAtual(c) },
];

// Exporta para Excel exatamente o que a tabela mostra (filtros, aba, ordem e
// colunas), como tabela do Excel com filtro em cada coluna.
async function exportarTabela() {
  const lista = clientesDaTabela();
  if (!lista.length) { avisar('A tabela está vazia.'); return; }
  if (typeof ExcelJS === 'undefined') { avisar('Não foi possível gerar o Excel. Atualize a página.'); return; }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Monitoramento de Fechamento', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addTable({
    name: 'MonitoramentoDeFechamento',
    ref: 'A1',
    headerRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: COLUNAS_EXPORTACAO.map((col) => ({ name: col.nome, filterButton: true })),
    rows: lista.map((c) => COLUNAS_EXPORTACAO.map((col) => col.valor(c))),
  });

  // As cores vêm do estilo da tabela; aqui só largura, alinhamento e formato.
  COLUNAS_EXPORTACAO.forEach((col, i) => {
    const coluna = ws.getColumn(i + 1);
    coluna.width = col.largura;
    coluna.eachCell((cel, linha) => {
      if (linha === 1) {
        cel.alignment = { vertical: 'middle', horizontal: 'center' };
        return;
      }
      cel.alignment = { vertical: 'middle', horizontal: col.alinhamento };
      if (col.formato) cel.numFmt = col.formato;
    });
  });
  ws.getRow(1).height = 22;

  const buffer = await wb.xlsx.writeBuffer();
  baixar(`monitoramento-de-fechamento-tabela-${new Date().toLocaleDateString('sv-SE')}.xlsx`, buffer,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function atualizarTudo() {
  if ($('#tela-inicio').classList.contains('visivel')) renderInicio();
  else renderTratamento();
}

// ── Eventos ──
$('#btn-ir-tratamento').addEventListener('click', () => irPara(clienteAtual ? '#tratamento/' + encodeURIComponent(clienteAtual.id) : '#tratamento'));
$('#btn-ir-inicio').addEventListener('click', () => irPara('#inicio'));
$('#btn-voltar').addEventListener('click', () => irPara('#inicio'));
window.addEventListener('hashchange', () => { if (CLIENTES.length) lerEndereco(); });

$('#btn-menu').addEventListener('click', (e) => { e.stopPropagation(); $('#menu-dados').classList.toggle('aberto'); });
document.addEventListener('click', (e) => {
  if (!e.target.closest('#menu-dados')) $('#menu-dados').classList.remove('aberto');
  if (!e.target.closest('.busca-cliente')) fecharSugestoes();
});
$('#menu-dados .menu-lista').addEventListener('click', (e) => {
  const acao = e.target.closest('button')?.dataset.acao;
  if (!acao) return;
  $('#menu-dados').classList.remove('aberto');
  if (acao === 'csv') exportarCSV();
  else if (acao === 'imprimir') window.print();
});
function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  $('#btn-tema').textContent = tema === 'escuro' ? 'Alterar tema para Claro' : 'Alterar tema para Escuro';
}
$('#btn-tema').addEventListener('click', () => {
  banco.prefs.tema = document.documentElement.dataset.tema === 'escuro' ? 'claro' : 'escuro';
  aplicarTema(banco.prefs.tema);
  salvarPreferencias();
});

// Placares: filtros, abas, ordenação e clique na linha
$('#tabela-abas').addEventListener('click', (e) => {
  const aba = e.target.closest('.tabela-aba');
  if (!aba) return;
  filtros.status = aba.dataset.status;
  renderInicio();
});
for (const k of CAMPOS_FILTRO) {
  $('#f-' + k).addEventListener('change', (e) => { filtros[k] = e.target.value; renderInicio(); });
}
$('#f-busca').addEventListener('input', (e) => { filtros.busca = e.target.value; renderTabela(); });
$('#f-limpar').addEventListener('click', () => {
  Object.keys(filtros).forEach((k) => (filtros[k] = ''));
  sincronizarFiltros(); renderInicio();
});
$('#f-exportar').addEventListener('click', exportarTabela);
// Clique numa linha dos cards: filtra a tabela por ela e desce até a tabela.
// Clicar de novo na mesma linha tira o filtro.
document.querySelector('.grade').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-filtro]');
  if (!b) return;
  const k = b.dataset.filtro;
  filtros[k] = filtros[k] === b.dataset.valor ? '' : b.dataset.valor;
  sincronizarFiltros(); renderInicio();
  if (filtros[k]) $('.tabela-cartao').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.querySelectorAll('.kpi[data-status]').forEach((k) => k.addEventListener('click', () => {
  filtros.status = filtros.status === k.dataset.status ? '' : k.dataset.status;
  renderInicio();
  $('.tabela-cartao').scrollIntoView({ behavior: 'smooth', block: 'start' });
}));
document.querySelectorAll('th[data-ordem]').forEach((th) => th.addEventListener('click', () => {
  ordem = { campo: th.dataset.ordem, dir: ordem.campo === th.dataset.ordem ? -ordem.dir : (th.dataset.ordem === 'pct' ? -1 : 1) };
  renderTabela();
}));
$('#tabela-corpo').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr) irPara('#tratamento/' + encodeURIComponent(tr.dataset.id));
});

// Tratamento: busca de cliente
$('#busca-cliente').addEventListener('input', () => { sugestaoMarcada = 0; renderSugestoes(); });
$('#busca-cliente').addEventListener('focus', (e) => { e.target.select(); if (e.target.value.trim()) renderSugestoes(); });
$('#busca-cliente').addEventListener('keydown', (e) => {
  const itens = [...document.querySelectorAll('.sugestao')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!itens.length) return;
    sugestaoMarcada = (sugestaoMarcada + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length;
    itens.forEach((el, i) => el.classList.toggle('marcada', i === sugestaoMarcada));
    itens[sugestaoMarcada].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const alvo = itens[sugestaoMarcada] || itens[0];
    if (alvo) { abrirCliente(alvo.dataset.id); e.target.blur(); }
  } else if (e.key === 'Escape') {
    fecharSugestoes();
    if (clienteAtual) e.target.value = rotuloCliente(clienteAtual);
    e.target.blur();
  }
});
$('#sugestoes').addEventListener('click', (e) => {
  const b = e.target.closest('.sugestao');
  if (b) abrirCliente(b.dataset.id);
});
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-abrir]');
  if (b) abrirCliente(b.dataset.abrir);
});

// Tratamento: checklist e grupo
$('#checklist').addEventListener('click', (e) => {
  const b = e.target.closest('.etapa');
  if (!b || !clienteAtual) return;
  alternarEtapa(clienteAtual.id, Number(b.dataset.etapa));
  renderTratamento();
  if (statusDe(clienteAtual.id) === 'concluido') avisar(clienteAtual.grupo ? `Grupo ${clienteAtual.grupo} concluído` : 'Cliente concluído');
});
document.addEventListener('keydown', (e) => {
  if (!clienteAtual || !$('#tela-tratamento').classList.contains('visivel')) return;
  if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= ETAPAS.length) {
    alternarEtapa(clienteAtual.id, ETAPAS[n - 1].codigo);
    renderTratamento();
  }
});
$('#btn-anterior').addEventListener('click', () => {
  const lista = clientesDoGrupo(clienteAtual), i = lista.findIndex((x) => x.id === clienteAtual.id);
  if (i > 0) abrirCliente(lista[i - 1].id);
});
$('#btn-proximo').addEventListener('click', () => {
  const lista = clientesDoGrupo(clienteAtual), i = lista.findIndex((x) => x.id === clienteAtual.id);
  if (i < lista.length - 1) abrirCliente(lista[i + 1].id);
});

// ── Início ──
aplicarTema(banco.prefs.tema === 'escuro' ? 'escuro' : 'claro');
carregarStatus();
// O servidor gratuito dorme sem uso; o primeiro acesso do dia demora a acordar.
const avisoDemora = setTimeout(() => {
  $('#carregando').textContent = 'Conectando ao servidor. O primeiro acesso do dia pode levar até um minuto.';
}, 4000);
Promise.all([carregarDados(), carregarProgresso()])
  .then(([, grupos]) => {
    clearTimeout(avisoDemora);
    banco.grupos = grupos;
    $('#carregando').hidden = true;
    preencherFiltros();
    lerEndereco();
    setInterval(atualizarEmSegundoPlano, INTERVALO_ATUALIZACAO);
    document.addEventListener('visibilitychange', atualizarEmSegundoPlano);
  })
  .catch(() => {
    clearTimeout(avisoDemora);
    $('#carregando').textContent = 'Não foi possível carregar os dados. Atualize a página para tentar de novo.';
    $('#carregando').classList.add('erro');
  });
