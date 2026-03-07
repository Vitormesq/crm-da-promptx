// ═══════════════════════════════════════════════════════════════
// PromptX CRM — Integração Telegram
// ═══════════════════════════════════════════════════════════════
//
// SETUP (quando tiver o bot criado):
// 1. Crie o bot no @BotFather → /newbot → copie o TOKEN
// 2. Cada pessoa deve mandar /start pro bot e pegar o Chat ID
//    no @userinfobot ou via https://api.telegram.org/bot<TOKEN>/getUpdates
// 3. Preencha as constantes abaixo com os dados reais
// 4. No Apps Script: Extensões → Gatilhos → Adicionar gatilho
//    → setupDailyTrigger() → Diário → Horário: 09:00
// ═══════════════════════════════════════════════════════════════

// ── CONFIGURAÇÃO ────────────────────────────────────────────────
const TELEGRAM_TOKEN = 'SEU_BOT_TOKEN_AQUI'; // Ex: 7123456789:AAFxxxxx

// Chat IDs individuais de cada pessoa
// Para descobrir: peça pra cada um mandar /start pro bot e veja em
// https://api.telegram.org/bot<TOKEN>/getUpdates o campo "chat.id"
const CHAT_IDS = {
  vitor:   'SEU_CHAT_ID_VITOR',    // Ex: 123456789
  gabriel: 'SEU_CHAT_ID_GABRIEL',  // Ex: 987654321
  andre:   'SEU_CHAT_ID_ANDRE',    // Ex: 112233445
};
// ────────────────────────────────────────────────────────────────

/**
 * Envia mensagem via Telegram
 */
function sendTelegram(chatId, text) {
  if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN === 'SEU_BOT_TOKEN_AQUI') {
    Logger.log('⚠️ Token do Telegram não configurado.');
    return false;
  }
  if (!chatId || chatId.toString().startsWith('SEU_')) {
    Logger.log('⚠️ Chat ID não configurado para: ' + chatId);
    return false;
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
    };
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    return true;
  } catch (e) {
    Logger.log('Erro ao enviar Telegram: ' + e.message);
    return false;
  }
}

/**
 * Busca tarefas da planilha Google Sheets
 */
function getTarefas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return [];
  const sheet = ss.getSheetByName('leads') || ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const tasks = [];
  for (let i = 1; i < data.length; i++) {
    const row = {};
    headers.forEach((h, j) => row[h] = data[i][j]);
    if (row.pipeline === 'tasks') tasks.push(row);
  }
  return tasks;
}

/**
 * Formata data dd/mm/yyyy para objeto Date
 */
function parseDate(str) {
  if (!str) return null;
  // Suporta YYYY-MM-DD e dd/mm/yyyy
  if (str.includes('-')) return new Date(str);
  const [d, m, y] = str.split('/');
  return new Date(`${y}-${m}-${d}`);
}

/**
 * Digest diário — envia resumo das tarefas para cada pessoa
 * Configurar gatilho diário para esta função (09:00 todo dia)
 */
function enviarDigestDiario() {
  const tasks = getTarefas();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  const assignees = ['vitor', 'gabriel', 'andre'];

  assignees.forEach(person => {
    const chatId = CHAT_IDS[person];
    const minhasTarefas = tasks.filter(t => t.assignee === person && t.stage !== 'done');

    if (minhasTarefas.length === 0) return;

    const vencidas = [];
    const hoje_ = [];
    const proximas = [];
    const semPrazo = [];

    minhasTarefas.forEach(t => {
      const dt = parseDate(t.dueDate);
      if (!dt) {
        semPrazo.push(t);
      } else {
        dt.setHours(0, 0, 0, 0);
        if (dt < hoje) vencidas.push({ ...t, dt });
        else if (dt.getTime() === hoje.getTime()) hoje_.push({ ...t, dt });
        else proximas.push({ ...t, dt });
      }
    });

    const nome = person.charAt(0).toUpperCase() + person.slice(1);
    let msg = `☀️ <b>Bom dia, ${nome}!</b> Aqui está o resumo das suas tarefas:\n\n`;

    if (vencidas.length > 0) {
      msg += `🔴 <b>VENCIDAS (${vencidas.length})</b>\n`;
      vencidas.forEach(t => {
        const dias = Math.floor((hoje - t.dt) / 86400000);
        msg += `  • ${t.name} — <i>há ${dias} dia(s)</i>\n`;
      });
      msg += '\n';
    }

    if (hoje_.length > 0) {
      msg += `🟡 <b>VENCEM HOJE (${hoje_.length})</b>\n`;
      hoje_.forEach(t => msg += `  • ${t.name}\n`);
      msg += '\n';
    }

    if (proximas.length > 0) {
      const prox = proximas.sort((a, b) => a.dt - b.dt).slice(0, 5);
      msg += `📋 <b>PRÓXIMAS (${proximas.length})</b>\n`;
      prox.forEach(t => {
        const dias = Math.floor((t.dt - hoje) / 86400000);
        msg += `  • ${t.name} — em ${dias} dia(s)\n`;
      });
      msg += '\n';
    }

    if (semPrazo.length > 0) {
      msg += `⚪ <b>SEM PRAZO (${semPrazo.length})</b>\n`;
      semPrazo.forEach(t => msg += `  • ${t.name}\n`);
    }

    msg += `\n💪 Bom trabalho!`;
    sendTelegram(chatId, msg);
  });
}

/**
 * Alerta de tarefas vencidas — pode ser chamado a qualquer hora
 */
function alertarVencidas() {
  const tasks = getTarefas();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const assignees = ['vitor', 'gabriel', 'andre'];

  assignees.forEach(person => {
    const chatId = CHAT_IDS[person];
    const vencidas = tasks.filter(t => {
      if (t.assignee !== person || t.stage === 'done') return false;
      const dt = parseDate(t.dueDate);
      if (!dt) return false;
      dt.setHours(0, 0, 0, 0);
      return dt < hoje;
    });

    if (vencidas.length === 0) return;
    const nome = person.charAt(0).toUpperCase() + person.slice(1);
    let msg = `🚨 <b>${nome}, você tem ${vencidas.length} tarefa(s) ATRASADA(S):</b>\n\n`;
    vencidas.forEach(t => {
      const dt = parseDate(t.dueDate);
      const dias = Math.floor((hoje - dt) / 86400000);
      msg += `  ❌ <b>${t.name}</b> — atrasada há ${dias} dia(s)\n`;
    });
    msg += `\nAcesse o CRM para atualizar o status! 💻`;
    sendTelegram(chatId, msg);
  });
}

/**
 * Notifica quando uma tarefa nova é criada
 * Chamado pelo Code.gs quando uma tarefa é inserida no Sheet
 */
function notificarNovaTarefa(tarefa) {
  const chatId = CHAT_IDS[tarefa.assignee];
  if (!chatId) return;

  const nome = tarefa.assignee.charAt(0).toUpperCase() + tarefa.assignee.slice(1);
  const prazo = tarefa.dueDate ? `📅 Prazo: ${tarefa.dueDate}` : '📅 Sem prazo definido';
  const prio = tarefa.priority === 'high' ? '🔴 Alta' : tarefa.priority === 'mid' ? '🟡 Média' : '⚪ Baixa';

  const msg = `✅ <b>Nova tarefa atribuída a você, ${nome}!</b>\n\n` +
    `📌 <b>${tarefa.name}</b>\n` +
    `${prazo}\n` +
    `⚡ Prioridade: ${prio}\n` +
    (tarefa.notes ? `📝 ${tarefa.notes}\n` : '') +
    `\nAcesse o CRM para mais detalhes! 💻`;

  sendTelegram(chatId, msg);
}

/**
 * Configura os gatilhos automáticos no Apps Script
 * Execute esta função UMA VEZ pelo Apps Script para ativar os alertas
 */
function setupTriggers() {
  // Remove gatilhos antigos
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['enviarDigestDiario', 'alertarVencidas'].includes(t.getHandlerFunction())) {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Digest diário às 09:00
  ScriptApp.newTrigger('enviarDigestDiario')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();

  // Alerta de vencidas às 08:00 (antes do digest)
  ScriptApp.newTrigger('alertarVencidas')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();

  Logger.log('✅ Gatilhos configurados com sucesso!');
}
