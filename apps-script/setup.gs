// ═══════════════════════════════════════════════════════════
// SETUP — Rodar uma vez para inicializar a planilha
// ═══════════════════════════════════════════════════════════

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Aba Leads ──────────────────────────────────────────
  let leadsSheet = ss.getSheetByName('Leads');
  if (!leadsSheet) leadsSheet = ss.insertSheet('Leads');
  leadsSheet.clearContents();

  const headers = [
    'id','pipeline','name','clinic','city','phone','ig',
    'stage','nextAction','priority','notes',
    'campaign','service','nextDate','lastContact',
    'createdAt','log','calendarEventId'
  ];
  leadsSheet.appendRow(headers);

  // Estilo cabeçalho
  const headRange = leadsSheet.getRange(1, 1, 1, headers.length);
  headRange.setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold');
  leadsSheet.setFrozenRows(1);

  // Larguras de coluna
  leadsSheet.setColumnWidth(1, 150);   // id
  leadsSheet.setColumnWidth(2, 80);    // pipeline
  leadsSheet.setColumnWidth(3, 160);   // name
  leadsSheet.setColumnWidth(4, 180);   // clinic
  leadsSheet.setColumnWidth(5, 120);   // city
  leadsSheet.setColumnWidth(6, 140);   // phone
  leadsSheet.setColumnWidth(11, 300);  // notes
  leadsSheet.setColumnWidth(17, 300);  // log

  // ── Aba Log ────────────────────────────────────────────
  let logSheet = ss.getSheetByName('Log');
  if (!logSheet) logSheet = ss.insertSheet('Log');
  logSheet.clearContents();
  logSheet.appendRow(['timestamp', 'action', 'leadId', 'name']);
  const logHead = logSheet.getRange(1, 1, 1, 4);
  logHead.setBackground('#0d1b2a').setFontColor('#ffffff').setFontWeight('bold');
  logSheet.setFrozenRows(1);

  // ── Aba Dashboard (resumo) ─────────────────────────────
  let dashSheet = ss.getSheetByName('Dashboard');
  if (!dashSheet) dashSheet = ss.insertSheet('Dashboard');
  dashSheet.clearContents();
  dashSheet.getRange('A1').setValue('PromptX CRM — Dashboard').setFontSize(14).setFontWeight('bold');
  dashSheet.getRange('A3').setValue('Total SDR:').setFontWeight('bold');
  dashSheet.getRange('B3').setFormula("=COUNTIF(Leads!B:B,\"sdr\")");
  dashSheet.getRange('A4').setValue('Total Tráfego:').setFontWeight('bold');
  dashSheet.getRange('B4').setFormula("=COUNTIF(Leads!B:B,\"traffic\")");
  dashSheet.getRange('A5').setValue('Calls Agendadas:').setFontWeight('bold');
  dashSheet.getRange('B5').setFormula("=COUNTIF(Leads!H:H,\"call\")");
  dashSheet.getRange('A6').setValue('Fechados (SDR):').setFontWeight('bold');
  dashSheet.getRange('B6').setFormula("=COUNTIFS(Leads!B:B,\"sdr\",Leads!H:H,\"closed\")");
  dashSheet.getRange('A7').setValue('Fechados (Tráfego):').setFontWeight('bold');
  dashSheet.getRange('B7').setFormula("=COUNTIFS(Leads!B:B,\"traffic\",Leads!H:H,\"closed\")");

  // ── Aba Users ──────────────────────────────────────────
  let usersSheet = ss.getSheetByName('Users');
  if (!usersSheet) usersSheet = ss.insertSheet('Users');
  usersSheet.clearContents();
  usersSheet.appendRow(['username', 'passwordHash', 'role', 'name']);
  const userHead = usersSheet.getRange(1, 1, 1, 4);
  userHead.setBackground('#1a0a2e').setFontColor('#ffffff').setFontWeight('bold');
  usersSheet.setFrozenRows(1);

  // Admin inicial: vitor / Vitor1000@
  const adminHash = hashPassword('Vitor1000@');
  usersSheet.appendRow(['vitor', adminHash, 'admin', 'Vitor']);

  SpreadsheetApp.getUi().alert('✅ Setup concluído! Abas Leads, Log, Dashboard e Users criadas.\nAdmin: vitor | Senha: Vitor1000@');
  Logger.log('Setup concluído com sucesso.');
}

function hashPassword(password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

// ──────────────────────────────────────────────────────────
// Testa a API localmente (rodar pelo editor)
function testAPI() {
  const result = getLeads({});
  Logger.log(JSON.stringify(result));
}

// ──────────────────────────────────────────────────────────
// SETUP DA API KEY — rodar uma vez para habilitar automações
// ──────────────────────────────────────────────────────────
/**
 * Gera uma API Key segura e salva em Script Properties.
 * Execute esta função UMA VEZ pelo menu Executar no Apps Script.
 * Depois copie a chave do Logger (Ctrl+Enter) e cole no n8n.
 *
 * Para REVOGAR/REGENERAR: execute novamente e atualize a chave no n8n.
 */
function setupApiKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'px_';
  for (let i = 0; i < 40; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  PropertiesService.getScriptProperties().setProperty('AUTOMATION_API_KEY', key);

  Logger.log('════════════════════════════════════════════════════');
  Logger.log('✅ API Key gerada e salva com sucesso!');
  Logger.log('');
  Logger.log('🔑 Sua API Key:');
  Logger.log(key);
  Logger.log('');
  Logger.log('Use esta chave em TODAS as chamadas do n8n:');
  Logger.log('  Header:  X-Api-Key: ' + key);
  Logger.log('  OU param: ?apiKey=' + key);
  Logger.log('════════════════════════════════════════════════════');

  try {
    SpreadsheetApp.getUi().alert(
      '✅ API Key gerada!\n\n' +
      '🔑 Sua chave:\n' + key + '\n\n' +
      'Copie esta chave e cole no n8n.\n' +
      'Ela também está no Logger (Visualizar → Registros).'
    );
  } catch (_) { /* sem UI quando rodado via trigger */ }

  return key;
}

/**
 * Exibe a API Key atual (sem gerar nova).
 * Útil caso esqueça a chave.
 */
function showApiKey() {
  const key = PropertiesService.getScriptProperties().getProperty('AUTOMATION_API_KEY');
  if (!key) {
    Logger.log('⚠️ API Key não configurada. Execute setupApiKey() primeiro.');
    return;
  }
  Logger.log('🔑 API Key atual: ' + key);
}

/**
 * Remove a API Key, desabilitando todos os endpoints de automação.
 */
function revokeApiKey() {
  PropertiesService.getScriptProperties().deleteProperty('AUTOMATION_API_KEY');
  Logger.log('🔒 API Key revogada. Automações desabilitadas.');
}
