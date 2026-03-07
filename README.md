# PromptX CRM

Pipeline de prospecção SDR + Leads de Tráfego com Google Sheets e Google Calendar.

## 🚀 Setup em 3 Passos

### 1. Google Sheets + Apps Script (Backend)

1. Acesse [script.google.com](https://script.google.com) e crie um **Novo Projeto**
2. Delete o código padrão e crie dois arquivos:
   - `Code.gs` → cole o conteúdo de `apps-script/Code.gs`
   - `setup.gs` → cole o conteúdo de `apps-script/setup.gs`
3. Clique em **Selecionar função** → escolha `setup` → clique em ▶️ **Executar**
4. Autorize as permissões quando solicitado (Google Sheets + Calendar)
5. Clique em **Deploy** → **New deployment** → tipo: **Web App**
   - Execute as: `Me`
   - Who has access: `Anyone`
6. Copie a **URL** gerada

### 2. Configurar o CRM

Abra `config.js` e cole a URL:

```js
const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/SUA_URL/exec',
  DATA_MODE: 'api', // mude de 'local' para 'api'
};
```

### 3. Deploy no GitHub Pages

```bash
# Na pasta crm-promptx:
git init
git add .
git commit -m "feat: PromptX CRM v1"
git remote add origin https://github.com/SEU_USUARIO/promptx-crm.git
git push -u origin main
```

No GitHub: **Settings → Pages → Source: GitHub Actions**

O GitHub Actions (`.github/workflows/deploy.yml`) faz o deploy automaticamente.

---

## 📋 Estrutura do Projeto

```
crm-promptx/
├── index.html          # CRM frontend
├── config.js           # URL do Apps Script
├── apps-script/
│   ├── Code.gs         # API REST + Google Calendar
│   └── setup.gs        # Setup inicial da planilha
└── .github/workflows/
    └── deploy.yml      # GitHub Pages auto-deploy
```

## 🗄️ Banco de Dados (Google Sheets)

| Aba | Conteúdo |
|---|---|
| `Leads` | Todos os leads (SDR + Tráfego) |
| `Log` | Histórico de ações |
| `Dashboard` | Resumo com fórmulas automáticas |

## ⚡ Como Usar

| Ação | Como |
|---|---|
| Novo lead | Botão **+ Lead** ou tecla `N` |
| Mover entre etapas | **Arrastar o card** para outra coluna |
| Agendar call | Abrir lead → botão **📅** |
| Filtrar | **📞 Ligar** / **💬 Mensagem** / **🔴 Urgente** |
| Registrar ação | Campo de histórico dentro do card |

## 🔌 Sem API configurada

O CRM funciona em modo **offline** com `localStorage`. Ao configurar a URL do Apps Script e mudar `DATA_MODE` para `'api'`, os dados passam a ser salvos no Google Sheets automaticamente.
