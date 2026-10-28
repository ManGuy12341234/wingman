const MODEL = "claude-sonnet-5-5"; // change here if you want a different model
const $ = s => document.querySelector(s);
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
};
let tone = "Playful", img = null;

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

["Playful", "Smooth", "Sincere", "Funny", "Chill"].forEach(t => {
  const b = document.createElement("button");
  b.className = "chip"; b.type = "button"; b.textContent = t;
  b.setAttribute("aria-pressed", t === tone);
  b.onclick = () => { tone = t; [...$("#tones").children].forEach(c => c.setAttribute("aria-pressed", c === b)); };
  $("#tones").appendChild(b);
});

// Text shared into the app from another app (Web Share Target)
const q = new URLSearchParams(location.search);
const shared = [q.get("title"), q.get("text"), q.get("url")].filter(Boolean).join("\n").trim();
if (shared) { $("#msg").value = shared; history.replaceState(null, "", location.pathname); }

$("#key").value = ls.get("key") || "";
if (!ls.get("key")) $("#settings").hidden = false;
$("#cog").onclick = () => { $("#settings").hidden = !$("#settings").hidden; };
$("#save").onclick = () => { ls.set("key", $("#key").value.trim()); $("#settings").hidden = true; };

function note(txt, isErr) {
  const r = $("#res"); r.textContent = "";
  const d = document.createElement("div"); d.textContent = txt;
  if (isErr) d.className = "err"; r.appendChild(d);
}

$("#paste").onclick = async () => {
  try { const t = await navigator.clipboard.readText(); if (t) $("#msg").value = t; }
  catch { note("Couldn’t read the clipboard. Long-press the box and paste instead.", true); }
};
$("#clear").onclick = () => { $("#msg").value = ""; img = null; $("#shotName").textContent = ""; $("#res").textContent = ""; };
$("#shot").onclick = () => $("#shotIn").click();
$("#shotIn").onchange = async e => {
  const f = e.target.files[0];
  img = f ? await shrink(f) : null;
  $("#shotName").textContent = f ? f.name : "";
};

function shrink(f) {
  return new Promise(res => {
    const i = new Image();
    i.onload = () => {
      const s = Math.min(1, 1400 / Math.max(i.width, i.height));
      const c = document.createElement("canvas");
      c.width = Math.round(i.width * s); c.height = Math.round(i.height * s);
      c.getContext("2d").drawImage(i, 0, 0, c.width, c.height);
      URL.revokeObjectURL(i.src);
      res(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
    };
    i.src = URL.createObjectURL(f);
  });
}

function copyText(txt, btn) {
  const ok = () => { btn.textContent = "Copied ✓"; setTimeout(() => btn.textContent = "Copy", 1400); };
  navigator.clipboard.writeText(txt).then(ok, () => { btn.textContent = "Long-press text"; });
}
const el = (tag, txt, cls) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; if (cls) e.className = cls; return e; };
function box(title, ...kids) { const d = el("div", null, "box"); d.appendChild(el("h3", title)); kids.forEach(k => d.appendChild(k)); return d; }

function render(o) {
  const res = $("#res"); res.textContent = "";
  const lvl = { low: 1, medium: 2, high: 3 }[String(o.interest).toLowerCase()] || 0;
  const col = ["var(--mute)", "var(--bad)", "var(--warn)", "var(--ok)"][lvl];
  const meter = el("div", null, "meter");
  for (let i = 1; i <= 3; i++) { const d = el("span", null, "dot"); if (i <= lvl) d.style.background = col; meter.appendChild(d); }
  meter.appendChild(el("span", lvl ? ["", "Low interest", "Warming up", "Interested"][lvl] : "Hard to tell"));
  res.appendChild(box("The vibe", meter, el("div", o.read || "")));

  const reps = el("div");
  (o.replies || []).forEach(r => {
    const row = el("div", null, "reply"), left = el("div");
    left.appendChild(el("b", r.label || "Option")); left.appendChild(el("div", r.text || ""));
    const c = el("button", "Copy", "copy"); c.type = "button"; c.onclick = () => copyText(r.text || "", c);
    row.appendChild(left); row.appendChild(c); reps.appendChild(row);
  });
  res.appendChild(box("Reply ideas", reps));
  if (o.tip) res.appendChild(box("Tip", el("div", o.tip)));
  if (o.avoid) res.appendChild(box("Avoid", el("div", o.avoid)));
}

$("#go").onclick = async () => {
  const txt = $("#msg").value.trim(), key = ls.get("key");
  if (!txt && !img) return note("Paste her message first.", true);
  if (!key) { $("#settings").hidden = false; return note("Add your API key first (⚙️).", true); }
  const btn = $("#go"); btn.disabled = true; btn.textContent = "Reading…"; $("#res").textContent = "";

  const prompt = `You are Wingman, a warm, funny, emotionally intelligent texting coach helping a guy connect with a girl he likes in a genuine, respectful way.
${txt ? 'Her message / the chat (may be one message or several lines):\n"""\n' + txt + '\n"""' : "Her message is in the attached screenshot."}
Reply tone he wants: ${tone}.
Rules: be honest about how interested she seems; never suggest manipulation, negging, guilt, pressure or lying; replies must be short, natural, text-length, specific to what she said, and not cheesy pickup lines. If she seems uninterested or says no, say so kindly and advise a gracious reply or no reply.
Respond with ONLY valid JSON, no markdown: {"interest":"low|medium|high|unclear","read":"1-2 sentences on what she likely means or feels","replies":[{"label":"2-3 words","text":"reply"},{"label":"...","text":"..."},{"label":"...","text":"..."}],"tip":"one practical tip for this moment","avoid":"one thing not to do here"}`;
  const content = [];
  if (img) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img } });
  content.push({ type: "text", text: prompt });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 800, messages: [{ role: "user", content }] })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(r.status === 401 ? "That API key was rejected." : (j.error && j.error.message) || "Request failed (" + r.status + ")");
    const t = j.content.map(c => c.text || "").join("");
    render(JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)));
  } catch (e) {
    note(e.message || "Couldn’t read that one. Try again.", true);
  }
  btn.disabled = false; btn.textContent = "Read it";
};
