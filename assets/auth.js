/* ============================================================
   Password Gate — Marketing Planner
   ------------------------------------------------------------
   ⚠  THREAT MODEL  ⚠
   This is a frontend gate. It keeps casual snoopers / wrong-URL
   visitors out and looks professional to clients. It is NOT real
   security — anyone with DevTools can bypass it and read data/plan.js
   directly. If the plan is truly confidential, host it behind real
   server-side auth (Netlify password protection, a small Express app,
   .htaccess, etc.) instead of relying on this file.

   ------------------------------------------------------------
   HOW TO CHANGE THE PASSWORD
   1. Open your browser's DevTools console on this page.
   2. Paste this, replacing the string with your new password:
        await (async p => {
          const b = new TextEncoder().encode(p);
          const h = await crypto.subtle.digest('SHA-256', b);
          return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,'0')).join('');
        })("YOUR NEW PASSWORD HERE")
   3. Copy the hash it prints. Paste it as PASSWORD_HASH below.
   4. Share the new password with whoever needs access. Don't commit
      the password itself anywhere — only the hash lives in this file.

   Default password (CHANGE THIS): gf-marketing-2026
   ============================================================ */

(function () {
  const PASSWORD_HASH = "965b7dfc27a19a36f6f93807bc0b1ba4006f63abc24b6113d6323ac47dd65eb2";
  const SESSION_KEY   = "gf_planner_auth_v1";

  // If already authed this session, do nothing.
  if (sessionStorage.getItem(SESSION_KEY) === "ok") return;

  // Hide page until decision is made (prevents content flash).
  const styleEl = document.createElement("style");
  styleEl.id = "gf-gate-hide";
  styleEl.textContent = "body > *:not(#gf-gate) { visibility: hidden !important; }";
  (document.head || document.documentElement).appendChild(styleEl);

  async function sha256(text) {
    const buf = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function buildGate() {
    const wrap = document.createElement("div");
    wrap.id = "gf-gate";
    wrap.innerHTML = `
      <style>
        #gf-gate {
          position: fixed; inset: 0; z-index: 99999;
          background: linear-gradient(135deg, #211D58 0%, #2d2675 100%);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Montserrat', 'Open Sans', sans-serif;
        }
        #gf-gate::before {
          content: ""; position: absolute; right: -120px; top: -120px;
          width: 360px; height: 360px; border-radius: 50%;
          background: #8BC07C; opacity: 0.12;
        }
        #gf-gate::after {
          content: ""; position: absolute; left: -100px; bottom: -100px;
          width: 280px; height: 280px; border-radius: 50%;
          background: #8BC07C; opacity: 0.08;
        }
        .gf-gate-card {
          position: relative; z-index: 1;
          background: #fff; border-radius: 16px;
          padding: 40px;
          width: 100%; max-width: 400px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .gf-gate-logo {
          width: 56px; height: 56px; border-radius: 50%;
          background: #8BC07C; color: #211D58;
          display: grid; place-items: center;
          font-weight: 700; font-size: 18px;
          margin: 0 auto 20px;
        }
        .gf-gate-eyebrow {
          text-align: center;
          font-size: 11px; letter-spacing: 2px;
          text-transform: uppercase; color: #8BC07C;
          font-weight: 600; margin-bottom: 8px;
        }
        .gf-gate-title {
          text-align: center;
          color: #211D58; font-size: 22px; font-weight: 700;
          margin: 0 0 8px;
        }
        .gf-gate-sub {
          text-align: center; color: #4A4A4A;
          font-size: 13px; margin: 0 0 24px;
        }
        .gf-gate-card label {
          display: block;
          font-size: 12px; font-weight: 600;
          color: #211D58;
          margin-bottom: 6px;
          text-transform: uppercase; letter-spacing: 1px;
        }
        .gf-gate-card input[type="password"] {
          width: 100%; padding: 12px 14px;
          border: 1px solid #E0E0E0; border-radius: 8px;
          font-family: inherit; font-size: 15px;
          color: #211D58; background: #F5F5F5;
          outline: none; transition: all 0.2s;
          box-sizing: border-box;
        }
        .gf-gate-card input[type="password"]:focus {
          border-color: #8BC07C; background: #fff;
          box-shadow: 0 0 0 3px rgba(139,192,124,0.15);
        }
        .gf-gate-card button {
          width: 100%; margin-top: 16px;
          padding: 13px 20px;
          background: #211D58; color: #fff;
          border: none; border-radius: 8px;
          font-family: inherit; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: background 0.2s;
        }
        .gf-gate-card button:hover { background: #16124a; }
        .gf-gate-card button:disabled { opacity: 0.6; cursor: not-allowed; }
        .gf-gate-error {
          color: #b32d2d; font-size: 13px; font-weight: 500;
          margin-top: 12px; text-align: center;
          display: none;
        }
        .gf-gate-error.show { display: block; }
        .gf-gate-foot {
          text-align: center; font-size: 11px;
          color: #4A4A4A; margin-top: 20px;
          letter-spacing: 1px; text-transform: uppercase;
        }
        .gf-gate-foot strong { color: #211D58; }
      </style>
      <div class="gf-gate-card">
        <div class="gf-gate-logo">GF</div>
        <div class="gf-gate-eyebrow">Restricted Access</div>
        <h1 class="gf-gate-title">Marketing Planner</h1>
        <p class="gf-gate-sub">Enter the access password to view this plan.</p>
        <form id="gf-gate-form" autocomplete="off">
          <label for="gf-gate-input">Password</label>
          <input type="password" id="gf-gate-input" autofocus autocomplete="current-password" />
          <button type="submit" id="gf-gate-btn">Unlock</button>
          <div class="gf-gate-error" id="gf-gate-err">Wrong password. Try again.</div>
        </form>
        <div class="gf-gate-foot">GF <strong>Innovative</strong> Solutions</div>
      </div>
    `;
    return wrap;
  }

  function init() {
    const gate = buildGate();
    document.body.appendChild(gate);

    const form  = document.getElementById("gf-gate-form");
    const input = document.getElementById("gf-gate-input");
    const btn   = document.getElementById("gf-gate-btn");
    const err   = document.getElementById("gf-gate-err");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      btn.disabled = true;
      const hash = await sha256(input.value);
      if (hash === PASSWORD_HASH) {
        sessionStorage.setItem(SESSION_KEY, "ok");
        const s = document.getElementById("gf-gate-hide");
        if (s) s.remove();
        gate.remove();
      } else {
        err.classList.add("show");
        input.value = "";
        input.focus();
        btn.disabled = false;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
