// ═══════════════════════════════════════════════════════════════
// PromptX CRM — Webhook & Automação (n8n / Make / Zapier)
// ═══════════════════════════════════════════════════════════════
//
// SETUP RÁPIDO:
// 1. No Apps Script, vá em Executar → setupApiKey()
//    → copie a API Key do Logger
// 2. Faça um redeploy da Web App (mesmo URL)
// 3. Use a URL do Apps Script + os parâmetros abaixo no n8n
//
// AUTENTICAÇÃO:
//   Header:    X-Api-Key: SUA_CHAVE
//   OU param:  ?apiKey=SUA_CHAVE
//
// ─── ENDPOINTS GET ──────────────────────────────────────────────
//   ?action=automation_leads[&pipeline=sdr][&stage=new][&priority=high][&since=2024-01-01]
//   ?action=automation_lead&id=ID_DO_LEAD
//   ?action=automation_stats
//
// ─── ENDPOINTS POST (body JSON) ─────────────────────────────────
//   { action: "webhook_create_lead",     data: { name, phone, ... } }
//   { action: "webhook_move_stage",      id, stage, note }
//   { action: "webhook_add_note",        id, note }
//   { action: "webhook_set_outbound_url", url }
//   { action: "webhook_test" }
// ═══════════════════════════════════════════════════════════════════

// ── Chave que valida todas as requisições de automação ──────────
// Gerada pela função setupApiKey() e salva em Script Properties
const API_KEY_PROPERTY = 'AUTOMATION_API_KEY';

// ── Tipo de evento que dispara o webhook de saída ───────────────
const OUTBOUND_URL_PROPERTY = 'N8N_OUTBOUND_WEBHOOK_URL';

// ═══════════════════════════════════════════════════════════════════
// AUTENTICAÇÃO
// ═══════════════════════════════════════════════════════════════════

/**
 * Valida a API Key presente no header ou parâmetro da requisição.
 * Retorna true se válida, false caso contrário.
 */
function validateApiKey(e) {
  const storedKey = PropertiesService.getScriptProperties().getProperty(API_KEY_PROPERTY);
  if (!storedKey) return false;

  // Aceita header X-Api-Key (quando chamado com fetch avançado) ou param na URL
  const headerKey = (e.parameter && e.parameter['X-Api-Key']) || '';
  const paramKey  = (e.parameter && e.parameter.apiKey) || '';

  // Para POST, também aceita no body JSON
  let bodyKey = '';
  try {
    if (e.postData) {
      const body = JSON.parse(e.postData.contents || '{}');
      bodyKey = body.apiKey || '';
    }
  } catch (_) {}

  return storedKey === headerKey || storedKey === paramKey || storedKey === bodyKey;
}

function authError() {
  return jsonResponse({ error: 'Não autorizado. Informe apiKey válido.', code: 401 });
}

// ═══════════════════════════════════════════════════════════════════
// ROTEADOR — chamado pelo doGet/doPost do Code.gs
// ═══════════════════════════════════════════════════════════════════

/**
 * Roteador GET para actions de automação.
 * Retorna null se a action não é de automação (deixa Code.gs tratar).
 */
function handleAutomationGet(e) {
  const action = e.parameter.action || '';
  if (!action.startsWith('automation_')) return null;

  if (!validateApiKey(e)) return authError();

  if (action === 'automation_leads')     return jsonResponse(automationListLeads(e.parameter));
  if (action === 'automation_lead')       return jsonResponse(automationGetLead(e.parameter.id));
  if (action === 'automation_stats')      return jsonResponse(automationStats());
  if (action === 'automation_ai_status') return jsonResponse(automationGetAiStatus(e.parameter.phone));
  if (action === 'automation_messages')  return jsonResponse(automationGetMessages(e.parameter.phone));

  return jsonResponse({ error: 'Ação de automação desconhecida: ' + action });
}

/**
 * Roteador POST para actions de webhook.
 * Retorna null se a action não é de webhook (deixa Code.gs tratar).
 */
function handleAutomationPost(body) {
  const action = body.action || '';
  if (!action.startsWith('webhook_')) return null;

  // A validação da API Key já foi feita pelo doPost com o body completo
  // (validateApiKey recebe o `e` original — mas aqui recebemos só o body)
  // Então verificamos novamente via Script Properties
  const storedKey = PropertiesService.getScriptProperties().getProperty(API_KEY_PROPERTY);
  if (!storedKey || storedKey !== String(body.apiKey || '')) {
    return { error: 'Não autorizado. Informe apiKey válido.', code: 401 };
  }

  if (action === 'webhook_create_lead')       return webhookCreateLead(body.data || {});
  if (action === 'webhook_move_stage')        return webhookMoveStage(body);
  if (action === 'webhook_add_note')          return webhookAddNote(body);
  if (action === 'webhook_set_outbound_url')  return webhookSetOutboundUrl(body.url);
  if (action === 'webhook_toggle_ai')         return webhookToggleAi(body);
  if (action === 'webhook_save_message')      return webhookSaveMessage(body);
  if (action === 'webhook_test')              return { success: true, message: 'Webhook funcionando!', timestamp: new Date().toISOString() };

  return { error: 'Ação de webhook desconhecida: ' + action };
}

// ═══════════════════════════════════════════════════════════════════
// ENDPOINTS GET — consultas para o n8n
// ═══════════════════════════════════════════════════════════════════

/**
 * Lista leads com filtros opcionais.
 * Params: pipeline, stage, priority, since (data ISO ou dd/mm/yyyy)
 */
function automationListLeads(params) {
  const sheet = getSheet(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { leads: [], total: 0 };

  const headers = rows[0];
  let leads = rows.slice(1).map(row => rowToObj(headers, row));

  // Filtros
  if (params.pipeline) leads = leads.filter(l => l.pipeline === params.pipeline);
  if (params.stage)    leads = leads.filter(l => l.stage === params.stage);
  if (params.priority) leads = leads.filter(l => l.priority === params.priority);

  // Filtro por data de criação (since)
  if (params.since) {
    const sinceDate = new Date(params.since);
    if (!isNaN(sinceDate)) {
      leads = leads.filter(l => {
        const created = parseDateFlexible(l.createdAt);
        return created && created >= sinceDate;
      });
    }
  }

  // Parse do log JSON
  leads = leads.map(l => {
    try { l.log = JSON.parse(l.log || '[]'); } catch { l.log = []; }
    return l;
  });

  return { leads, total: leads.length };
}

/**
 * Retorna um lead pelo ID.
 */
function automationGetLead(id) {
  if (!id) return { error: 'Parâmetro id obrigatório' };
  const result = getLead(id);
  return result;
}

/**
 * Retorna estatísticas de leads agrupadas por pipeline e stage.
 */
function automationStats() {
  const sheet = getSheet(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { stats: {}, totalLeads: 0 };

  const headers = rows[0];
  const leads = rows.slice(1).map(row => rowToObj(headers, row));

  const stats = {};
  leads.forEach(l => {
    const pip = l.pipeline || 'sem_pipeline';
    const stg = l.stage    || 'sem_stage';
    if (!stats[pip]) stats[pip] = {};
    stats[pip][stg] = (stats[pip][stg] || 0) + 1;
  });

  return { stats, totalLeads: leads.length, generatedAt: new Date().toISOString() };
}

// ═══════════════════════════════════════════════════════════════════
// ENDPOINTS POST — ações do n8n no CRM
// ═══════════════════════════════════════════════════════════════════

/**
 * Cria um novo lead vindo de uma automação (ex: formulário captado pelo n8n).
 * data: { name*, phone, clinic, city, ig, pipeline, stage, notes, campaign, service, priority }
 * * obrigatório
 */
function webhookCreateLead(data) {
  if (!data.name) return { error: 'Campo name é obrigatório' };

  // Defaults para leads vindos de automação
  data.pipeline  = data.pipeline  || 'sdr';
  data.stage     = data.stage     || 'new';
  data.priority  = data.priority  || 'mid';
  data.source    = data.source    || 'webhook';

  // Log inicial indicando origem
  data.log = [{ text: `Lead criado via webhook/n8n${data.source ? ' (' + data.source + ')' : ''}`, time: formatDateTime(new Date()) }];

  const result = createLead(data);

  // Dispara webhook de saída para o n8n
  if (result.success) {
    triggerOutbound('lead_created', { ...data, id: result.id });
  }

  return result;
}

/**
 * Move um lead para outro stage.
 * body: { id, stage, note (opcional), apiKey }
 */
function webhookMoveStage(body) {
  if (!body.id)    return { error: 'Campo id é obrigatório' };
  if (!body.stage) return { error: 'Campo stage é obrigatório' };

  // Busca lead atual para comparar
  const current = getLead(body.id);
  if (current.error) return current;

  const oldStage = current.lead.stage;

  // Monta atualização
  const update = {
    id:          body.id,
    stage:       body.stage,
    lastContact: formatDate(new Date()),
  };

  // Adiciona nota no log se fornecida
  if (body.note) {
    const existingLog = current.lead.log || [];
    existingLog.push({
      text: `[n8n] Stage: ${oldStage} → ${body.stage}. ${body.note}`,
      time: formatDateTime(new Date()),
    });
    update.log = existingLog;
  }

  const result = updateLead(update);

  // Dispara webhook de saída
  if (result.success) {
    triggerOutbound('stage_changed', {
      id: body.id,
      name: current.lead.name,
      oldStage,
      newStage: body.stage,
      note: body.note || '',
    });
  }

  return result;
}

/**
 * Adiciona uma nota no log de um lead.
 * body: { id, note, apiKey }
 */
function webhookAddNote(body) {
  if (!body.id)   return { error: 'Campo id é obrigatório' };
  if (!body.note) return { error: 'Campo note é obrigatório' };

  const current = getLead(body.id);
  if (current.error) return current;

  const log = current.lead.log || [];
  log.push({
    text: `[n8n] ${body.note}`,
    time: formatDateTime(new Date()),
  });

  return updateLead({
    id:          body.id,
    log,
    lastContact: formatDate(new Date()),
  });
}

/**
 * Define (ou atualiza) a URL de webhook de saída para o n8n.
 * Quando eventos acontecem no CRM, essa URL recebe um POST automático.
 * body.url: URL do webhook do n8n (ex: https://seu-n8n.com/webhook/xxx)
 */
function webhookSetOutboundUrl(url) {
  if (!url) return { error: 'Campo url é obrigatório' };
  PropertiesService.getScriptProperties().setProperty(OUTBOUND_URL_PROPERTY, url);
  Logger.log('✅ URL de outbound webhook salva: ' + url);
  return { success: true, message: 'URL do webhook n8n salva com sucesso.', url };
}

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK DE SAÍDA (Outbound) — notifica o n8n sobre eventos do CRM
// ═══════════════════════════════════════════════════════════════════

/**
 * Dispara um POST para o webhook do n8n quando eventos acontecem no CRM.
 * eventType: 'lead_created' | 'stage_changed' | 'lead_updated'
 * data: objeto com dados do evento
 */
function triggerOutbound(eventType, data) {
  const url = PropertiesService.getScriptProperties().getProperty(OUTBOUND_URL_PROPERTY);
  if (!url) return; // URL não configurada, ignora silenciosamente

  try {
    const payload = {
      event:     eventType,
      timestamp: new Date().toISOString(),
      source:    'promptx-crm',
      data,
    };

    UrlFetchApp.fetch(url, {
      method:          'post',
      contentType:     'application/json',
      payload:         JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    Logger.log(`📤 Outbound webhook disparado: ${eventType} → ${url}`);
  } catch (err) {
    Logger.log('⚠️ Erro ao disparar outbound webhook: ' + err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPER — parse de data flexível (ISO e dd/mm/yyyy)
// ═══════════════════════════════════════════════════════════════════

function parseDateFlexible(str) {
  if (!str) return null;
  str = String(str).trim();
  if (str.includes('-')) return new Date(str); // ISO
  const parts = str.split('/');
  if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`); // dd/mm/yyyy
  return null;
}

// ═══════════════════════════════════════════════════════════════
// AI TOGGLE — controle por lead
// ═══════════════════════════════════════════════════════════════

/**
 * GET ?action=automation_ai_status&phone=5511999
 * Retorna { aiEnabled: true/false, leadId, phone }
 */
function automationGetAiStatus(phone) {
  if (!phone) return { error: 'Parâmetro phone obrigatório' };
  const clean = String(phone).replace(/\D/g, '');
  const sheet = getSheet(SHEET_NAME);
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { aiEnabled: true, found: false };

  const headers = rows[0];
  const phoneCol   = headers.indexOf('phone');
  const aiEnabledCol = headers.indexOf('aiEnabled');
  const idCol      = headers.indexOf('id');

  const row = rows.slice(1).find(r => String(r[phoneCol]).replace(/\D/g, '') === clean);
  if (!row) return { aiEnabled: true, found: false }; // padrão: IA ativa para desconhecidos

  const val = row[aiEnabledCol];
  // Se campo vazio/não definido = IA ativa por padrão
  const enabled = (val === '' || val === null || val === undefined || val === true || val === 'true') ? true : false;
  return { aiEnabled: enabled, leadId: row[idCol], phone: clean, found: true };
}

/**
 * POST { action: 'webhook_toggle_ai', phone, aiEnabled: true/false }
 * Atualiza campo aiEnabled do lead pelo telefone
 */
function webhookToggleAi(body) {
  if (!body.phone) return { error: 'Campo phone obrigatório' };
  const clean = String(body.phone).replace(/\D/g, '');
  const enabled = body.aiEnabled !== false; // padrão true

  const sheet = getSheet(SHEET_NAME);
  const rows  = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { error: 'Nenhum lead encontrado' };

  const headers      = rows[0];
  const phoneCol     = headers.indexOf('phone');
  const aiEnabledCol = headers.indexOf('aiEnabled');
  const idCol        = headers.indexOf('id');

  if (aiEnabledCol === -1) return { error: 'Coluna aiEnabled não encontrada na planilha. Atualize os headers.' };

  const rowIndex = rows.findIndex((r, i) => i > 0 && String(r[phoneCol]).replace(/\D/g, '') === clean);
  if (rowIndex === -1) return { error: 'Lead não encontrado para o telefone: ' + clean };

  sheet.getRange(rowIndex + 1, aiEnabledCol + 1).setValue(enabled);
  Logger.log(`🤖 IA ${enabled ? 'ativada' : 'desativada'} para ${clean} (lead: ${rows[rowIndex][idCol]})`);
  return { success: true, phone: clean, aiEnabled: enabled, leadId: rows[rowIndex][idCol] };
}

// ═══════════════════════════════════════════════════════════════
// MENSAGENS WPP — salvar e buscar histórico do chat
// ═══════════════════════════════════════════════════════════════

const MSG_SHEET = 'Mensagens';
const MSG_HEADERS = ['id','phone','role','content','timestamp'];

/**
 * POST { action: 'webhook_save_message', phone, role: 'user'|'assistant', content }
 * Salva uma mensagem na aba Mensagens
 */
function webhookSaveMessage(body) {
  if (!body.phone || !body.content) return { error: 'Campos phone e content obrigatórios' };
  const sheet = getSheet(MSG_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(MSG_HEADERS);
    sheet.getRange(1, 1, 1, MSG_HEADERS.length).setFontWeight('bold');
  }
  const id = generateId();
  const ts = new Date().toISOString();
  sheet.appendRow([id, String(body.phone).replace(/\D/g,''), body.role || 'user', body.content, ts]);
  return { success: true, id };
}

/**
 * GET ?action=automation_messages&phone=5511999
 * Retorna as últimas 50 mensagens do lead
 */
function automationGetMessages(phone) {
  if (!phone) return { error: 'Parâmetro phone obrigatório' };
  const clean = String(phone).replace(/\D/g, '');
  const sheet = getSheet(MSG_SHEET);
  if (sheet.getLastRow() <= 1) return { messages: [] };

  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];
  const msgs = rows.slice(1)
    .map(r => ({
      id:        r[headers.indexOf('id')],
      phone:     r[headers.indexOf('phone')],
      role:      r[headers.indexOf('role')],
      content:   r[headers.indexOf('content')],
      timestamp: r[headers.indexOf('timestamp')],
    }))
    .filter(m => String(m.phone).replace(/\D/g,'') === clean)
    .slice(-50); // últimas 50

  return { messages: msgs };
}
