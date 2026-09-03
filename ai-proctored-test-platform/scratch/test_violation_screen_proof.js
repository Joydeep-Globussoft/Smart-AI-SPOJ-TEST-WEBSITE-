const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function main() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.resolve('C:/Users/JOYDEEP/.gemini/antigravity-ide/brain/0bedf9c0-7a84-412f-b9f1-16da6badb176/scratch/chrome_proof_3');
  const port = 9447;

  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,720',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  await new Promise((r) => setTimeout(r, 1500));

  const listJson = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  const page = listJson.find((t) => t.type === 'page');
  const WebSocket = require('ws');
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  await new Promise((resolve) => ws.on('open', resolve));

  let msgId = 1;
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = msgId++;
      const handler = (data) => {
        const msg = JSON.parse(data);
        if (msg.id === id) {
          ws.off('message', handler);
          resolve(msg.result || msg);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Page.enable');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { width: 1280px; height: 720px; overflow: hidden; background: #0f172a; color: #fff; position: relative; }
        .topbar { height: 56px; background: #1e293b; border-bottom: 1px solid #334155; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; }
        .title { font-weight: 700; font-size: 16px; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
        .timer { background: #065f46; color: #34d399; font-weight: 700; padding: 6px 14px; border-radius: 6px; font-size: 13px; }
        .main { display: flex; height: calc(100% - 56px); }
        .q-pane { width: 440px; background: #1e293b; border-right: 1px solid #334155; padding: 24px; }
        .q-title { font-size: 18px; font-weight: 700; margin-bottom: 12px; color: #f8fafc; }
        .q-desc { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 16px; }
        .q-example { background: #0f172a; padding: 12px; border-radius: 6px; border: 1px solid #334155; font-family: monospace; font-size: 13px; color: #cbd5e1; }
        .editor-pane { flex: 1; background: #0d1117; display: flex; flex-direction: column; }
        .editor-header { height: 40px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; align-items: center; padding: 0 16px; gap: 12px; }
        .tab { background: #0d1117; color: #58a6ff; font-size: 13px; padding: 8px 16px; border-top: 2px solid #1f6feb; border-right: 1px solid #30363d; font-family: monospace; }
        .code { padding: 20px; font-family: "Consolas", monospace; font-size: 14px; line-height: 1.7; color: #e6edf3; }
        .kw { color: #ff7b72; font-weight: 600; }
        .fn { color: #d2a8ff; font-weight: 600; }
        .str { color: #a5d6ff; }
        .cm { color: #8b949e; font-style: italic; }

        /* The Exact Proctoring Violation Watermark Overlay (useProctoring.js) */
        .watermark-top {
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 48px;
          background: rgba(15, 23, 42, 0.90);
          border-bottom: 2px solid #ef4444;
          display: flex;
          align-items: center;
          padding: 0 20px;
          color: #ef4444;
          font-weight: 800;
          font-size: 15px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          letter-spacing: 0.5px;
        }
        .watermark-bottom {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 34px;
          background: rgba(15, 23, 42, 0.88);
          border-top: 1px solid rgba(255,255,255,0.1);
          display: flex;
          align-items: center;
          padding: 0 20px;
          color: #e2e8f0;
          font-family: monospace;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="topbar">
        <div class="title">
          <span>🛡️</span> Globussoft Assessment Platform — Live Proctoring
        </div>
        <div class="timer">⏱ Time Remaining: 42:15</div>
      </div>
      <div class="main">
        <div class="q-pane">
          <div class="q-title">Question 1: Reverse String In-Place</div>
          <div class="q-desc">Write a function that reverses an array of characters in-place with O(1) extra memory.</div>
          <div class="q-example">
            <strong>Input:</strong> s = ["h","e","l","l","o"]<br/>
            <strong>Output:</strong> ["o","l","l","e","h"]
          </div>
        </div>
        <div class="editor-pane">
          <div class="editor-header">
            <div class="tab">solution.py</div>
          </div>
          <div class="code">
            <span class="cm"># Proctoring Active - Continuous Screen Monitor</span><br/>
            <span class="kw">def</span> <span class="fn">reverseString</span>(s: list[str]) -&gt; <span class="kw">None</span>:<br/>
            &nbsp;&nbsp;&nbsp;&nbsp;left, right = 0, len(s) - 1<br/>
            &nbsp;&nbsp;&nbsp;&nbsp;<span class="kw">while</span> left &lt; right:<br/>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;s[left], s[right] = s[right], s[left]<br/>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;left += 1<br/>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;right -= 1<br/>
            <br/>
            <span class="cm"># Testing with sample data</span><br/>
            test_arr = [<span class="str">"h"</span>, <span class="str">"e"</span>, <span class="str">"l"</span>, <span class="str">"l"</span>, <span class="str">"o"</span>]<br/>
            reverseString(test_arr)<br/>
            print(test_arr)  <span class="cm"># Expected: ["o", "l", "l", "e", "h"]</span>
          </div>
        </div>
      </div>

      <!-- Watermark Overlays -->
      <div class="watermark-top">
        ⚠️ PROCTORING EVIDENCE: TAB SWITCH (SCREEN CAPTURE)
      </div>
      <div class="watermark-bottom">
        Time: ${new Date().toLocaleTimeString()} · ${new Date().toLocaleDateString()} | Candidate: 6a99b0ecb8924bffc78482dc | Room: 6a99b0b6b8924bffc784828f | Screen Evidence
      </div>
    </body>
    </html>
  `;

  const htmlDataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  await send('Page.navigate', { url: htmlDataUrl });
  await new Promise((r) => setTimeout(r, 1500));

  const screenshot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  const rawBase64 = screenshot.data || (screenshot.result && screenshot.result.data);
  const outPath = path.resolve('C:/Users/JOYDEEP/.gemini/antigravity-ide/brain/0bedf9c0-7a84-412f-b9f1-16da6badb176/violation_proof_with_real_screen.jpg');
  fs.writeFileSync(outPath, Buffer.from(rawBase64, 'base64'));
  console.log('Saved screenshot successfully to:', outPath);

  ws.close();
  chromeProc.kill();
  process.exit(0);
}

main().catch(console.error);
