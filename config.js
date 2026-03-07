// ═══════════════════════════════════════════════════════════
// PromptX CRM — Configurações
// ═══════════════════════════════════════════════════════════

const CONFIG = {

  // ── Google Sheets (banco de dados) ─────────────────────
  // 1. Cole a URL do Apps Script após fazer o deploy:
  //    script.google.com → Deploy → New deployment → Web App → Copy URL
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyGhXVhF6PSIoh36aggLrDgbImLblFVBF7tT_eGDwxmyUfQtApOpAzzk9TgVmKwyHwGZA/exec',

  // 2. 'api' usa Google Sheets como banco. 'local' usa localStorage.
  DATA_MODE: 'api',

  // ── Google Calendar API (OAuth 2.0) ────────────────────
  // 3. Acesse: console.cloud.google.com
  //    Crie um projeto → Habilite "Google Calendar API"
  //    Credenciais → OAuth 2.0 → ID do cliente → App da Web
  //    Origem JS autorizada: https://SEU_USUARIO.github.io (ou localhost)
  //    Cole o Client ID aqui:
  GOOGLE_CLIENT_ID: '473297035207-ib4nbur5esuhsm8559jk0bsde3t3ejfj.apps.googleusercontent.com',

  // 4. ID do calendário (deixe 'primary' para o calendário principal)
  //    Ou cole o ID de um calendário específico: xxx@group.calendar.google.com
  CALENDAR_ID: 'primary',

  // 5. API Key do Google Cloud (para inicializar o GAPI)
  //    console.cloud.google.com → Credenciais → Criar → Chave de API
  GOOGLE_API_KEY: 'AQ.Ab8RN6JbLxWe86EXKjmD3Wh2ael0kYQQ63lOZ8zs4QeHYCt6uA',

};
