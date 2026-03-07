// ═══════════════════════════════════════════════════════════
// PromptX CRM — Google Calendar (OAuth 2.0 + REST API direta)
// Não usa gapi.client — usa fetch diretamente com o access token
// ═══════════════════════════════════════════════════════════

const CalendarAPI = (() => {
    let tokenClient = null;
    let accessToken = null;
    let gisLoaded = false;
    let _gisResolve;
    const gisReady = new Promise(r => _gisResolve = r);

    const SCOPES = 'https://www.googleapis.com/auth/calendar.events';
    const CAL_API = 'https://www.googleapis.com/calendar/v3/calendars';

    // ── Verifica se está configurado ──────────────────────────
    function isConfigured() {
        return typeof CONFIG !== 'undefined' &&
            CONFIG.GOOGLE_CLIENT_ID && CONFIG.GOOGLE_CLIENT_ID !== '';
    }

    // ── Pré-carrega GIS na carga da página ───────────────────
    function preload() {
        if (!isConfigured()) return;
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.onload = () => {
            try {
                tokenClient = google.accounts.oauth2.initTokenClient({
                    client_id: CONFIG.GOOGLE_CLIENT_ID,
                    scope: SCOPES,
                    callback: () => { }, // sobrescrito em authorize()
                });
                gisLoaded = true;
            } catch (e) {
                console.warn('[CalendarAPI] Erro ao inicializar GIS:', e);
            }
            _gisResolve();
        };
        script.onerror = () => { console.warn('[CalendarAPI] GIS não carregou'); _gisResolve(); };
        document.head.appendChild(script);
    }

    // ── Obtém access token via popup OAuth ───────────────────
    async function authorize() {
        await gisReady; // já pronto se libs carregaram na abertura da página
        if (!tokenClient) throw new Error('Google Identity Services não inicializado. Verifique o Client ID.');
        if (accessToken) return accessToken;

        return new Promise((resolve, reject) => {
            tokenClient.callback = (resp) => {
                if (resp.error) { reject(new Error(resp.error + ': ' + (resp.error_description || ''))); return; }
                accessToken = resp.access_token;
                resolve(accessToken);
            };
            tokenClient.requestAccessToken({ prompt: 'consent' });
        });
    }

    // ── Cria evento via REST API (sem gapi.client) ───────────
    async function createEvent(eventData) {
        if (!isConfigured()) return { fallback: true };

        const token = await authorize();
        const calId = encodeURIComponent(CONFIG.CALENDAR_ID || 'primary');

        const body = {
            summary: eventData.title,
            location: eventData.location || '',
            description: eventData.description || '',
            start: { dateTime: eventData.startDateTime, timeZone: 'America/Sao_Paulo' },
            end: { dateTime: eventData.endDateTime, timeZone: 'America/Sao_Paulo' },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 30 },
                    { method: 'email', minutes: 60 },
                ],
            },
        };

        if (eventData.guestEmail) {
            body.attendees = [{ email: eventData.guestEmail }];
        }

        // conference params (Meet automático se link contiver meet.google)
        const confVersion = (eventData.location || '').includes('meet.google') ? 1 : 0;
        if (confVersion) {
            body.conferenceData = {
                createRequest: {
                    requestId: Math.random().toString(36).slice(2),
                    conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
            };
        }

        const url = `${CAL_API}/${calId}/events${confVersion ? '?conferenceDataVersion=1' : ''}${eventData.guestEmail ? (confVersion ? '&' : '?') + 'sendUpdates=all' : ''}`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const err = await res.json();
            // token expirado → limpa e tenta de novo
            if (res.status === 401) {
                accessToken = null;
                return createEvent(eventData);
            }
            throw new Error(err.error?.message || 'Erro ao criar evento');
        }

        const data = await res.json();
        return {
            success: true,
            eventId: data.id,
            eventLink: data.htmlLink,
            meetLink: data.conferenceData?.entryPoints?.[0]?.uri || '',
        };
    }

    // ── Fallback: abre Google Calendar pré-preenchido ────────
    function openCalendarFallback(eventData) {
        const fmt = dt => new Date(dt).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: eventData.title,
            dates: `${fmt(eventData.startDateTime)}/${fmt(eventData.endDateTime)}`,
            details: eventData.description || '',
            location: eventData.location || '',
        });
        window.open(`https://calendar.google.com/calendar/render?${params}`, '_blank');
        return { fallback: true };
    }

    // ── Logout do Calendar ───────────────────────────────────
    function signOut() {
        if (accessToken && typeof google !== 'undefined') {
            google.accounts.oauth2.revoke(accessToken);
        }
        accessToken = null;
    }

    // Pré-carrega ao abrir a página
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', preload);
    } else {
        preload();
    }

    return { isConfigured, createEvent, openCalendarFallback, signOut };
})();
