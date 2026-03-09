const express = require('express');
const axios = require('axios');
const https = require('https');
const app = express();

app.set('trust proxy', true);

const gaClient = axios.create({
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 150 }),
    timeout: 10000
});

const TARGET_URL = `https://www.zenithummedia.com/case-studies/`;
const MEASUREMENT_ID = "G-SNCY0K36MC";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- SERVER SIDE PING LOGIC ---
async function sendPing(ids, eventName, extraParam = {}) {
    const params = new URLSearchParams({
        v: '2',
        tid: MEASUREMENT_ID,
        cid: ids.clientId,
        sid: ids.sessionId,
        dl: TARGET_URL,
        uip: ids.userIp,
        _uip: ids.userIp,
        en: eventName,
        'ep.origin': 'server',
        'cs': 'google',
        'cm': 'medium',
        'cn': 'ALPHA',
        ...extraParam
    });

    try {
        await gaClient.get(`https://www.google-analytics.com/g/collect?${params.toString()}`, {
            headers: { 'User-Agent': ids.userAgent }
        });
        console.log(`[SERVER] Sent ${eventName} for CID: ${ids.clientId}`);
    } catch (err) { console.error("Ping Error:", err.message); }
}

async function runServerSideTracking(ids) {
    console.log("Server tracking started...");
    
    // 1. Initial server-side page_view to anchor the session
    await sendPing(ids, 'page_view_server', { '_et': '0' });

    // 2. Scroll Event (20-25s)
    const scrollDelay1 = Math.floor(Math.random() * (25000 - 20000 + 1) + 20000);
    await delay(scrollDelay1);
    await sendPing(ids, 'scroll', { 
        'epn.percent_scrolled': 90,
        '_et': scrollDelay1.toString()
    });

    // 3. Final Session Event (90-100s total)
    const scrollDelay2 = Math.floor(Math.random() * (75000 - 65000 + 1) + 65000);
    await delay(scrollDelay2);
    await sendPing(ids, 'final_session', {
        '_et': scrollDelay2.toString(),
        'seg': '1'
    });
    console.log(`Full session completed for ${ids.clientId}`);
}

// --- ROUTE 1: THE ACTIVATOR (SERVER ONLY) ---
app.get('/activate-session', async (req, res) => {
    const ids = {
        clientId: req.query.cid,
        sessionId: req.query.sid,
        userIp: (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().replace('::ffff:', ''),
        userAgent: req.headers['user-agent']
    };

    res.status(204).send(); // Release browser instantly

    if (!ids.clientId || !ids.sessionId) return;
    runServerSideTracking(ids);
});

// --- ROUTE 2: THE HTML BRIDGE (USER LANDING) ---
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="referrer" content="no-referrer">
            <script async src="https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}"></script>
            <script>
                window.dataLayer = window.dataLayer  [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());

                const client_id = '100.' + Math.round(Math.random() * 1000000000);
                const session_id = Math.round(Date.now() / 1000).toString();

                gtag('config', '${MEASUREMENT_ID}', { 
                    'client_id': client_id,
                    'session_id': session_id,
                    'campaign_source': 'google',
                    'campaign_medium': 'medium',
                    'campaign_name': 'ALPHA',
                    'send_page_view': false // We send it manually below
                });
                gtag('event', 'page_view', {
                    'event_callback': function() {
                        // Signal the specific activation route
                        fetch('/activate-session?cid=' + client_id + '&sid=' + session_id)
                            .finally(function() {
                                setTimeout(function() {
                                    window.location.replace("${TARGET_URL}");
                                }, 400);
                            });
                    }
                });
            </script>
        </head>
        <body style="background:#fff; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; margin:0;">
            <div style="text-align:center; color:#888; font-size:14px;">Redirecting...</div>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Scaler active on port ${PORT}`));