"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";

type LogItem = { t: number; kind: "heard" | "asked" | "reply" | "info"; text: string };
type Turn = { who: "sen" | "bot"; text: string };

const WINDOW_MS = 75_000; // konuşma açık kalma süresi; sonra bot susar

// STT "BotStevie"yi genelde "bot tv"/"boz tv" duyuyor; net yakalanan "asistan"ı da ekledik.
const DEFAULT_TRIGGERS = "asistan, hey bot, bot tv, boz tv, botstevie, bot stevie";

function norm(s: string): string {
  return s.toLocaleLowerCase("tr").replace(/ç/g, "c").replace(/ş/g, "s").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ü/g, "u").replace(/ğ/g, "g").replace(/[^a-z0-9 ]/g, "").trim();
}
const flat = (s: string) => norm(s).replace(/ /g, "");

// Ayarlanabilir tetikleyicilerden herhangi biri geçiyor mu? Geçiyorsa arkasındaki komutu döndür.
function matchTrigger(raw: string, triggers: string[]): string | null {
  const nhFlat = flat(raw);
  for (const t of triggers) {
    const tf = flat(t);
    if (tf.length < 3) continue;
    if (nhFlat.includes(tf)) {
      // Tetikleyici kelimeleri ham metinden temizle (arada boşluk toleranslı).
      const pattern = t.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "")).join("\\s*");
      const rest = raw.replace(new RegExp(pattern, "i"), " ").replace(/\s+/g, " ").replace(/^[\s,.:;!?-]+/, "").trim();
      return rest;
    }
  }
  return null;
}

export default function Ear() {
  const [listening, setListening] = useState(false);
  const [tts, setTts] = useState(true);
  const [active, setActive] = useState(false); // konuşma açık mı
  const [status, setStatus] = useState("Hazır");
  const [log, setLog] = useState<LogItem[]>([]);
  const [triggers, setTriggers] = useState(DEFAULT_TRIGGERS);
  const triggersRef = useRef<string[]>([]);

  const recRef = useRef<any>(null);
  const listeningRef = useRef(false);
  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const ttsRef = useRef(true);
  const speakingRef = useRef(false);
  const lastSpokeEndRef = useRef(0);
  const lastReplyNormRef = useRef("");
  const historyRef = useRef<Turn[]>([]);
  const timerRef = useRef<any>(null);

  useEffect(() => { ttsRef.current = tts; }, [tts]);
  useEffect(() => {
    triggersRef.current = triggers.split(",").map((s) => s.trim()).filter(Boolean);
    try { localStorage.setItem("ear_triggers", triggers); } catch { /* noop */ }
  }, [triggers]);

  const addLog = useCallback((kind: LogItem["kind"], text: string) => {
    setLog((l) => [{ t: Date.now() + Math.random(), kind, text }, ...l].slice(0, 50));
  }, []);

  const deactivate = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setStatus("Konuşma kapandı 😴 — tekrar 'BotStevie' de");
  }, []);

  const refreshWindow = useCallback(() => {
    activeRef.current = true;
    setActive(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(deactivate, WINDOW_MS);
  }, [deactivate]);

  const speak = useCallback((text: string) => {
    if (!ttsRef.current || typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "tr-TR";
    const tr = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("tr"));
    if (tr) u.voice = tr;
    u.onstart = () => { speakingRef.current = true; };
    u.onend = () => { speakingRef.current = false; lastSpokeEndRef.current = Date.now(); };
    window.speechSynthesis.speak(u);
  }, []);

  const ask = useCallback(async (query: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    refreshWindow();
    addLog("asked", query || "(selam)");
    historyRef.current = [...historyRef.current, { who: "sen" as const, text: query || "sana seslendim" }].slice(-8);
    try {
      const res = await fetch("/api/ear/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: query || "sana seslendim, kısaca bir şey söyle", history: historyRef.current }),
      });
      const j = await res.json();
      if (j.ok && j.reply) {
        addLog("reply", j.reply);
        historyRef.current = [...historyRef.current, { who: "bot" as const, text: j.reply }].slice(-8);
        lastReplyNormRef.current = norm(j.reply);
        speak(j.reply);
        refreshWindow();
      } else {
        addLog("info", `Cevap yok: ${j.reason ?? j.error ?? "?"}`);
      }
    } catch (e) {
      addLog("info", `Hata: ${String(e)}`);
    } finally {
      busyRef.current = false;
    }
  }, [addLog, refreshWindow, speak]);

  const handleFinal = useCallback((heard: string) => {
    // Feedback engeli: bot konuşurken / az önce konuştuysa / kendi cevabını duyduysa yok say.
    if (speakingRef.current || Date.now() - lastSpokeEndRef.current < 800) return;
    const nh = norm(heard);
    if (!nh) return;
    if (lastReplyNormRef.current && (nh.includes(lastReplyNormRef.current.slice(0, 20)) || lastReplyNormRef.current.includes(nh.slice(0, 20)))) return;

    addLog("heard", heard);
    const cmd = matchTrigger(heard, triggersRef.current);
    if (cmd !== null) {
      ask(cmd); // "BotStevie ..." dedi → konuşmayı aç + sor
    } else if (activeRef.current) {
      ask(heard); // konuşma açık → wake-word'süz her söz bota gider
    }
  }, [addLog, ask]);

  const start = useCallback(() => {
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { setStatus("Bu tarayıcı konuşma tanımayı desteklemiyor. Chrome kullan."); return; }
    const rec = new SR();
    rec.lang = "tr-TR";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) handleFinal(e.results[i][0].transcript.trim());
      }
    };
    rec.onerror = (e: any) => {
      if (e.error !== "no-speech" && e.error !== "aborted") addLog("info", `Tanıma: ${e.error}`);
    };
    rec.onend = () => { if (listeningRef.current) { try { rec.start(); } catch { /* noop */ } } };
    recRef.current = rec;
    listeningRef.current = true;
    setListening(true);
    setStatus("Dinliyor… 'BotStevie ...' de, sonra wake-word'süz sorabilirsin");
    try { rec.start(); } catch { /* noop */ }
  }, [addLog, handleFinal]);

  const stop = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    deactivate();
    setStatus("Durduruldu");
    try { recRef.current?.stop(); } catch { /* noop */ }
  }, [deactivate]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.getVoices();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { const s = localStorage.getItem("ear_triggers"); if (s) setTriggers(s); } catch { /* noop */ }
    return () => { listeningRef.current = false; try { recRef.current?.stop(); } catch { /* noop */ } };
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">sostevie bot · Kulak 🎧</h1>
          <p className="text-sm text-neutral-400">
            Yayında açık bırak. <b>&quot;BotStevie ...&quot;</b> de → konuşma açılır; sonra <b>adını tekrar demeden</b> her sorunu sesli cevaplar. Susunca (~75 sn) bot da susar.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {!listening ? (
            <button onClick={start} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-5 py-2 font-medium">Dinlemeyi başlat</button>
          ) : (
            <button onClick={stop} className="rounded-lg bg-red-600 hover:bg-red-500 px-5 py-2 font-medium">Durdur</button>
          )}
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" checked={tts} onChange={(e) => setTts(e.target.checked)} /> Sesli cevap (TTS)
          </label>
          <span className={`text-sm px-3 py-1 rounded-full ${active ? "bg-emerald-900 text-emerald-300" : "bg-neutral-800 text-neutral-400"}`}>
            {active ? "🟢 Konuşma açık" : "⚪ Bekliyor"}
          </span>
        </div>

        <div>
          <label className="text-sm text-neutral-300">Tetikleyici kelimeler (virgülle ayır) — bunlardan biri geçince konuşma açılır</label>
          <input
            value={triggers}
            onChange={(e) => setTriggers(e.target.value)}
            className="w-full mt-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            placeholder="asistan, hey bot, bot tv…"
          />
          <p className="text-xs text-neutral-500 mt-1">
            İpucu: Aşağıdaki <b>&quot;duydu&quot;</b> satırlarına bak — sen bir kelime söyleyince STT onu nasıl yazıyorsa, o yazımı buraya ekle. (STT &quot;BotStevie&quot;yi genelde &quot;bot tv&quot; duyuyor; en garanti tetikleyici <b>&quot;asistan&quot;</b>.)
          </p>
        </div>

        <div className="rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-2 text-sm text-neutral-300">{status}</div>

        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-4">
          <h2 className="font-medium mb-2 text-neutral-200">Akış</h2>
          <div className="space-y-1 max-h-[55vh] overflow-auto text-sm">
            {log.length === 0 && <p className="text-neutral-500">Henüz bir şey duyulmadı.</p>}
            {log.map((l) => (
              <div key={l.t} className="flex gap-2 py-1 border-b border-neutral-800/50">
                <span className={`shrink-0 w-16 text-xs ${
                  l.kind === "reply" ? "text-emerald-400" : l.kind === "asked" ? "text-indigo-400" : l.kind === "heard" ? "text-neutral-500" : "text-amber-400"
                }`}>
                  {l.kind === "heard" ? "duydu" : l.kind === "asked" ? "sordu" : l.kind === "reply" ? "cevap" : "bilgi"}
                </span>
                <span className="text-neutral-200">{l.text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-neutral-500">
          Chrome + mikrofon izni gerekir. Botun kendi sesini duyup kendine cevap vermemesi için TTS sırasında dinleme yok sayılır. Sekmeyi mümkünse görünür tut.
        </p>
      </div>
    </div>
  );
}
