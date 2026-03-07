// ═══════════════════════════════════════════════════════════
// PromptX CRM — Google Apps Script Backend
// Banco de dados: Google Sheets | Calendário: Google Calendar
// Deploy: Executar como Web App (Anyone, even anonymous)
// ═══════════════════════════════════════════════════════════

const SHEET_NAME = 'Leads';
const LOG_SHEET  = 'Log';
const CALENDAR_ID = 'primary'; // troque pelo ID do calendário PromptX se quiser

// ── HEADERS da planilha ──────────────────────────────────
const HEADERS = [
  'id','pipeline','name','clinic','city','phone','ig',
  'stage','nextAction','priority','notes',
  'campaign','service','nextDate','lastContact',
  'createdAt','log','calendarEventId','aiEnabled'
];

// ═══════════════════════════════════════════════════════════
// ENTRY POINTS (GET / POST)
// ═══════════════════════════════════════════════════════════

function doGet(e) {
  try {
    const action = e.parameter.action || 'list';

    // ── Roteamento para endpoints de automação (webhook.gs) ──
    const automationResponse = handleAutomationGet(e);
    if (automationResponse !== null) return automationResponse;

    // ── Endpoints nativos do CRM ─────────────────────────────
    let result;
    if (action === 'list') {
      result = getLeads(e.parameter);
    } else if (action === 'get') {
      result = getLead(e.parameter.id);
    } else {
      result = { error: 'Ação inválida: ' + action };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;

    // ── Roteamento para endpoints de webhook/automação (webhook.gs) ──
    const webhookResult = handleAutomationPost(body);
    if (webhookResult !== null) return jsonResponse(webhookResult);

    // ── Endpoints nativos do CRM ─────────────────────────────────────
    if (action === 'create')       result = createLead(body.data);
    else if (action === 'update')  result = updateLead(body.data);
    else if (action === 'delete')  result = deleteLead(body.id);
    else if (action === 'schedule') result = scheduleCall(body.data);
    else if (action === 'login')   result = loginUser(body.username, body.passwordHash);
    else if (action === 'addUser') result = addUser(body.data);
    else result = { error: 'Ação inválida: ' + action };

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════
// LEADS — CRUD
// ═══════════════════════════════════════════════════════════

function getLeads(params) {
  const sheet = getSheet(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { leads: [] };

  const headers = rows[0];
  let leads = rows.slice(1).map(row => rowToObj(headers, row));

  // Filtros opcionais
  if (params.pipeline) leads = leads.filter(l => l.pipeline === params.pipeline);
  if (params.stage)    leads = leads.filter(l => l.stage === params.stage);

  // Parse do log (JSON string → array)
  leads = leads.map(l => {
    try { l.log = JSON.parse(l.log || '[]'); } catch { l.log = []; }
    return l;
  });

  return { leads, total: leads.length };
}

function getLead(id) {
  const sheet = getSheet(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const row = rows.slice(1).find(r => r[0] === id);
  if (!row) return { error: 'Lead não encontrado' };
  const lead = rowToObj(headers, row);
  try { lead.log = JSON.parse(lead.log || '[]'); } catch { lead.log = []; }
  return { lead };
}

function createLead(data) {
  const sheet = getSheet(SHEET_NAME);
  data.id = data.id || generateId();
  data.createdAt = data.createdAt || formatDate(new Date());
  data.lastContact = data.lastContact || formatDate(new Date());
  data.log = JSON.stringify(data.log || [{ text: 'Lead criado', time: formatDateTime(new Date()) }]);

  const row = HEADERS.map(h => data[h] || '');
  sheet.appendRow(row);
  logAction('CREATE', data.id, data.name);
  return { success: true, id: data.id };
}

function updateLead(data) {
  const sheet = getSheet(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === data.id);

  if (rowIndex === -1) return { error: 'Lead não encontrado: ' + data.id };

  // Captura stage anterior para detectar mudança (outbound webhook)
  const oldStage = rows[rowIndex][headers.indexOf('stage')] || '';

  // Serializa o log se for array
  if (Array.isArray(data.log)) data.log = JSON.stringify(data.log);

  // Atualiza só as colunas que vieram no payload
  HEADERS.forEach((h, col) => {
    if (data[h] !== undefined) {
      sheet.getRange(rowIndex + 1, col + 1).setValue(data[h]);
    }
  });

  logAction('UPDATE', data.id, data.name || '');

  // Dispara outbound webhook se o stage mudou
  if (data.stage && data.stage !== oldStage) {
    triggerOutbound('stage_changed', {
      id: data.id,
      name: data.name || '',
      oldStage,
      newStage: data.stage,
    });
  }

  return { success: true };
}

function deleteLead(id) {
  const sheet = getSheet(SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === id);
  if (rowIndex === -1) return { error: 'Lead não encontrado' };
  sheet.deleteRow(rowIndex + 1);
  logAction('DELETE', id, '');
  return { success: true };
}

// ═══════════════════════════════════════════════════════════
// GOOGLE CALENDAR — Agendar Call
// ═══════════════════════════════════════════════════════════

function scheduleCall(data) {
  // data: { leadId, leadName, clinic, dateTime, duration, meetLink, description }
  try {
    const cal = CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();

    const start = new Date(data.dateTime);
    const end = new Date(start.getTime() + (data.duration || 45) * 60000);

    const title = `📞 Call PromptX — ${data.leadName}${data.clinic ? ' | ' + data.clinic : ''}`;
    const desc = [
      `Lead: ${data.leadName}`,
      data.clinic ? `Clínica: ${data.clinic}` : '',
      data.meetLink ? `\nLink da reunião:\n${data.meetLink}` : '',
      data.description ? `\nNotas:\n${data.description}` : '',
      '\n---\nCriado pelo PromptX CRM'
    ].filter(Boolean).join('\n');

    const options = {
      description: desc,
      guests: data.guestEmail || '',
    };
    if (data.meetLink) options.location = data.meetLink;

    const event = cal.createEvent(title, start, end, options);
    const eventId = event.getId();

    // Salva o eventId no lead
    if (data.leadId) {
      updateLead({ id: data.leadId, calendarEventId: eventId, stage: 'call', nextAction: 'call' });
    }

    const eventLink = `https://calendar.google.com/calendar/event?eid=${Utilities.base64Encode(eventId)}`;
    return { success: true, eventId, eventLink };

  } catch (err) {
    return { error: 'Erro ao criar evento: ' + err.message };
  }
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === SHEET_NAME) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function rowToObj(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i] || ''; });
  return obj;
}

function generateId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

function formatDate(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

function formatDateTime(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM HH:mm');
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function logAction(action, leadId, name) {
  try {
    const logSheet = getSheet(LOG_SHEET);
    if (logSheet.getLastRow() === 0) {
      logSheet.appendRow(['timestamp', 'action', 'leadId', 'name']);
    }
    logSheet.appendRow([new Date(), action, leadId, name]);
  } catch (e) { /* silencioso */ }
}

// ═══════════════════════════════════════════════════════════
// AUTH — Login e Gestão de Usuários
// ═══════════════════════════════════════════════════════════

function loginUser(username, passwordHash) {
  const sheet = getSheet('Users');
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return { error: 'Nenhum usuário cadastrado' };
  const userRow = rows.slice(1).find(r =>
    String(r[0]).toLowerCase() === String(username).toLowerCase()
  );
  if (!userRow) return { error: 'Usuário não encontrado' };
  if (String(userRow[1]) !== String(passwordHash)) return { error: 'Senha incorreta' };
  logAction('LOGIN', username, String(userRow[3] || username));
  return {
    success: true,
    username: userRow[0],
    role: userRow[2] || 'viewer',
    name: userRow[3] || userRow[0]
  };
}

function addUser(data) {
  // data: { username, passwordHash, role, name }
  const sheet = getSheet('Users');
  const rows = sheet.getDataRange().getValues();
  const exists = rows.slice(1).some(r =>
    String(r[0]).toLowerCase() === String(data.username).toLowerCase()
  );
  if (exists) return { error: 'Usuário já existe: ' + data.username };
  sheet.appendRow([data.username, data.passwordHash, data.role || 'viewer', data.name || data.username]);
  return { success: true, username: data.username };
}

function hashPw(password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}
