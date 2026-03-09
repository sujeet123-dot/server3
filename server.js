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

const CAMPAIGN_PARAMS = {
    'cs': 'google',     // utm_source
    'cm': 'medium',     // utm_medium
    'cn': 'ALPHA'      // utm_campaign
};

const MEASUREMENT_ID = "G-SNCY0K36MC";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


async function runServerSideTracking(ids) {
    //const initialBuffer = 5000;

    console.log(`pv started ...`)
    await sendPing(ids, 'page_view', { 
        '_et': 0
    })
    console.log("pv ended ...")

    const scrollDelay1 = Math.floor(Math.random() * (25000 - 20000 + 1) + 20000);

    await new Promise(resolve => setTimeout(resolve, scrollDelay1));
    console.log(`Scroll started in ${scrollDelay1} sec`)
    await sendPing(ids, 'scroll', { 
        'epn.percent_scrolled': 90,
        '_et': scrollDelay1.toString()
    })
    console.log(`Scroll endeded ...`)

    const scrollDelay2 = Math.floor(Math.random() * (100000 - 90000 + 1) + 90000);

    await new Promise(resolve => setTimeout(resolve, scrollDelay2));
    console.log(`Final session started in ${scrollDelay2} sec`)
    await sendPing(ids, 'final_session', {
        '_et': scrollDelay2.toString(),
        seg: '1'
    })
    console.log(`Final session ended`)

}

// --- SERVER SIDE: JUST RECEIVES AND USES IDS ---
app.get('/', async (req, res) => {
    // 1. GET THE EXACT IDS FROM THE BROWSER
    const ids = {
        clientId: req.query.cid,
        sessionId: req.query.sid,
        userIp: (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().replace('::ffff:', ''),
        userAgent: req.headers['user-agent']
    };

    // Release browser immediately
    res.status(204).send();

    if (!ids.clientId && !ids.sessionId) return;

    runServerSideTracking(ids);

    // 2. WAIT AND SEND PINGS USING THE BROWSER'S IDENTITY
    // await delay(25000); // 25s Scroll
    // await sendPing(ids, 'scroll', { 'epn.percent_scrolled': 90, '_et': '25000' });

    // await delay(70000); // +70s (Total 95s)
    // await sendPing(ids, 'final_session', { '_et': '70000' });
});

async function sendPing(ids, eventName, extraParam) {
    const params = new URLSearchParams({
        v: '2',
        tid: MEASUREMENT_ID,
        cid: ids.clientId,
        sid: ids.sessionId,
        dl: TARGET_URL,
        uip: ids.userIp,
        _uip: ids.userIp,
        en: eventName,
        'ep.origin': 'server', // Mark it so you know it came from Render
        ...extraParam
    });

    try {
        await gaClient.get(`https://www.google-analytics.com/g/collect?${params.toString()}`, {
            headers: { 'User-Agent': ids.userAgent }
        });
        console.log(`[SERVER] Sent ${eventName} for CID: ${ids.clientId}`);
    } catch (err) { console.error("Ping Error"); }
}

// --- HTML BRIDGE: THE "ID MASTER" ---
app.all('/', (req, res) => {
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

                // 1. BROWSER GENERATES THE IDS
                const client_id = '100.' + Math.round(Math.random() * 1000000000);
                const session_id = Math.round(Date.now() / 1000).toString();

                // 2. CONFIG WITH EXPLICIT SOURCE TO PREVENT "UNASSIGNED"
                gtag('config', '${MEASUREMENT_ID}', { 
                    'client_id': client_id,
                    'session_id': session_id,
                    'campaign_source': 'google',
                    'campaign_medium': 'medium',
                    'campaign_name': 'ALPHA'
                });
                // 3. THE CHAIN: Send PV -> Success -> Send IDs to Server -> Redirect
                gtag('event', 'page_view', {
                    'event_callback': function() {
                        // SEND THE MASTER IDS TO THE SERVER
                        fetch('/?cid=' + client_id + '&sid=' + session_id)
                            .finally(function() {
                                // Redirect at 800ms mark
                                setTimeout(function() {
                                    window.location.replace("${TARGET_URL}");
                                }, 300);
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

app.listen(process.env.PORT || 3000);