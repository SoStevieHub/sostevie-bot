"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from "react";

type LogItem = { t: number; kind: "heard" | "asked" | "reply" | "info"; text: string };
type Turn = { who: "sen" | "bot"; text: string };

// Konuşmayı kapatan kelimeler (sen söyleyene kadar açık kalır).
const DEFAULT_STOP = "sus, cevap verme, yeter, kapan, dur artık, kes, tamam bu kadar";
// Susarken söyleyeceği kısa sözler (LLM'siz, anında).
const STOP_ACKS = ["Tamam, sustum.", "Anlaşıldı, kenara çekildim.", "Peki, sesimi kesiyorum.", "Sustum; chat'te yine buradayım.", "Tamamdır, susuyorum."];

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
  const [stopWords, setStopWords] = useState(DEFAULT_STOP);
  const stopWordsRef = useRef<string[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const voiceNameRef = useRef("");
  const [saved, setSaved] = useState(false);
  const [neural, setNeural] = useState(true); // StreamElements TTS (Filiz), her tarayıcıda
  const neuralRef = useRef(true);
  const [neuralVoice, setNeuralVoice] = useState("google");
  const neuralVoiceRef = useRef("google");
  const hydratedRef = useRef(false); // localStorage yüklenene kadar yazma (varsayılan ezmesin)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const genRef = useRef(0); // konuşma nesli — durdurunca artırılır, uçuşan istekleri iptal eder

  const recRef = useRef<any>(null);
  const listeningRef = useRef(false);
  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const ttsRef = useRef(true);
  const speakingRef = useRef(false);
  const lastSpokeEndRef = useRef(0);
  const lastReplyNormRef = useRef("");
  const historyRef = useRef<Turn[]>([]);

  useEffect(() => { ttsRef.current = tts; }, [tts]);
  const save = (k: string, v: string) => { if (hydratedRef.current) { try { localStorage.setItem(k, v); } catch { /* noop */ } } };
  useEffect(() => {
    triggersRef.current = triggers.split(",").map((s) => s.trim()).filter(Boolean);
    save("ear_triggers", triggers);
  }, [triggers]);
  useEffect(() => {
    stopWordsRef.current = stopWords.split(",").map((s) => s.trim()).filter(Boolean);
    save("ear_stop", stopWords);
  }, [stopWords]);
  useEffect(() => { voiceNameRef.current = voiceName; if (voiceName) save("ear_voice", voiceName); }, [voiceName]);
  useEffect(() => { neuralRef.current = neural; save("ear_neural", neural ? "1" : "0"); }, [neural]);
  useEffect(() => { neuralVoiceRef.current = neuralVoice; save("ear_nvoice", neuralVoice); }, [neuralVoice]);

  // Ses listesini yükle (async gelir) ve seçili yoksa Emel'i / Türkçe'yi otomatik seç.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => {
      const vs = window.speechSynthesis.getVoices();
      if (vs.length) setVoices(vs);
      const saved = (() => { try { return localStorage.getItem("ear_voice"); } catch { return null; } })();
      const pick =
        (saved && vs.find((v) => v.name === saved)?.name) ||
        vs.find((v) => /emel/i.test(v.name))?.name ||
        vs.find((v) => v.lang?.toLowerCase().startsWith("tr"))?.name ||
        "";
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (pick) setVoiceName((cur) => cur || pick);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  const addLog = useCallback((kind: LogItem["kind"], text: string) => {
    setLog((l) => [{ t: Date.now() + Math.random(), kind, text }, ...l].slice(0, 50));
  }, []);

  const deactivate = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setStatus("Konuşma kapandı 😴 — tekrar tetikleyici kelimeyi söyle");
  }, []);

  const activate = useCallback(() => {
    activeRef.current = true;
    setActive(true);
  }, []);

  const speakBrowser = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "tr-TR";
    const list = window.speechSynthesis.getVoices();
    const v =
      list.find((x) => x.name === voiceNameRef.current) ||
      list.find((x) => /emel/i.test(x.name)) ||
      list.find((x) => x.lang?.toLowerCase().startsWith("tr"));
    if (v) u.voice = v;
    u.onstart = () => { speakingRef.current = true; };
    u.onend = () => { speakingRef.current = false; lastSpokeEndRef.current = Date.now(); };
    window.speechSynthesis.speak(u);
  }, []);

  // Konuşmayı ANINDA kes (barge-in): çalan sesi durdur + uçuşan istekleri iptal et.
  const stopSpeaking = useCallback(() => {
    genRef.current += 1;
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    if (currentAudioRef.current) {
      try { currentAudioRef.current.pause(); currentAudioRef.current.src = ""; } catch { /* noop */ }
      currentAudioRef.current = null;
    }
    speakingRef.current = false;
    lastSpokeEndRef.current = Date.now();
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!ttsRef.current) return;
    const myGen = ++genRef.current;
    if (neuralRef.current) {
      try {
        speakingRef.current = true; // ses gelene kadar da dinlemeyi kes (feedback engeli)
        // Sunucu üstünden ücretsiz Türkçe TTS (Google Translate), MP3 döner.
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: neuralVoiceRef.current }),
        });
        if (!res.ok) throw new Error(`tts ${res.status}`);
        if (myGen !== genRef.current) { speakingRef.current = false; return; }
        const url = URL.createObjectURL(await res.blob());
        if (myGen !== genRef.current) { URL.revokeObjectURL(url); speakingRef.current = false; return; }
        const audio = new Audio(url);
        currentAudioRef.current = audio;
        audio.onended = () => {
          if (currentAudioRef.current === audio) currentAudioRef.current = null;
          speakingRef.current = false; lastSpokeEndRef.current = Date.now(); URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          if (currentAudioRef.current === audio) currentAudioRef.current = null;
          speakingRef.current = false; lastSpokeEndRef.current = Date.now();
          if (myGen === genRef.current) speakBrowser(text);
        };
        await audio.play();
        return;
      } catch {
        speakingRef.current = false;
        if (myGen === genRef.current) speakBrowser(text);
        return;
      }
    }
    speakBrowser(text);
  }, [speakBrowser]);

  const ask = useCallback(async (query: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    activate();
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
        activate();
      } else {
        addLog("info", `Cevap yok: ${j.reason ?? j.error ?? "?"}`);
      }
    } catch (e) {
      addLog("info", `Hata: ${String(e)}`);
    } finally {
      busyRef.current = false;
    }
  }, [addLog, activate, speak]);

  const handleFinal = useCallback((heard: string) => {
    const nh = norm(heard);
    if (!nh) return;
    // Echo filtresi: botun kendi sesini duyup işleme.
    if (lastReplyNormRef.current && (nh.includes(lastReplyNormRef.current.slice(0, 20)) || lastReplyNormRef.current.includes(nh.slice(0, 20)))) return;

    // Durdurma kelimesi bot KONUŞURKEN bile işlenir (barge-in) → cümleyi ANINDA keser.
    if ((activeRef.current || speakingRef.current || !!currentAudioRef.current) && matchTrigger(heard, stopWordsRef.current) !== null) {
      const wasSpeaking = speakingRef.current || !!currentAudioRef.current;
      stopSpeaking(); // sözü yarıda kes
      deactivate();
      addLog("heard", heard);
      setStatus("🔇 Durduruldu — sesli mod kapandı, chat normal çalışmaya devam ediyor. Tekrar tetikleyici de.");
      if (wasSpeaking) {
        addLog("info", "Sözü yarıda kesildi");
      } else {
        const bye = STOP_ACKS[Math.floor(Math.random() * STOP_ACKS.length)];
        lastReplyNormRef.current = norm(bye);
        addLog("reply", bye);
        speak(bye);
      }
      return;
    }

    // Feedback engeli: bot konuşurken (durdurma dışındaki) her şey yok sayılır.
    if (speakingRef.current || Date.now() - lastSpokeEndRef.current < 800) return;

    addLog("heard", heard);
    const cmd = matchTrigger(heard, triggersRef.current);
    if (cmd !== null) {
      ask(cmd); // tetikleyici dedi → konuşmayı aç + sor
    } else if (activeRef.current) {
      ask(heard); // konuşma açık → tetikleyicisiz her söz bota gider (sen 'sus' diyene kadar)
    }
  }, [addLog, ask, deactivate, speak, stopSpeaking]);

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
    stopSpeaking();
    setStatus("Durduruldu");
    try { recRef.current?.stop(); } catch { /* noop */ }
  }, [deactivate, stopSpeaking]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.getVoices();
    try {
      const s = localStorage.getItem("ear_triggers");
      const st = localStorage.getItem("ear_stop");
      const nv = localStorage.getItem("ear_nvoice");
      const nn = localStorage.getItem("ear_neural");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (s) setTriggers(s);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (st) setStopWords(st);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (nv && ["google", "Emel", "Ahmet"].includes(nv)) setNeuralVoice(nv); // eski değerleri yok say
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (nn) setNeural(nn === "1");
    } catch { /* noop */ }
    hydratedRef.current = true; // artık değişiklikler kaydedilebilir
    return () => { listeningRef.current = false; try { recRef.current?.stop(); } catch { /* noop */ } };
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">sostevie bot · Kulak 🎧</h1>
          <p className="text-sm text-neutral-400">
            Yayında açık bırak. <b>Tetikleyici kelimeyi</b> (örn. &quot;asistan&quot;) de → konuşma açılır; sonra <b>tekrar demeden</b> her sorunu sesli cevaplar. <b>Sen &quot;sus&quot; diyene kadar</b> açık kalır; durdurunca sesli mod kapanır, chat normal çalışmaya devam eder.
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

        <div>
          <label className="text-sm text-neutral-300">Durdurma kelimeleri (virgülle ayır) — sesli söyleyince bot susar, chat devam eder</label>
          <input
            value={stopWords}
            onChange={(e) => setStopWords(e.target.value)}
            className="w-full mt-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-red-500"
            placeholder="sus, cevap verme, yeter…"
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" checked={neural} onChange={(e) => setNeural(e.target.checked)} />
            Bulut ses (Google Türkçe) — <b>Chrome dahil her tarayıcıda</b> çalışır, ücretsiz (önerilir)
          </label>
          {neural ? (
            <select
              value={neuralVoice}
              onChange={(e) => setNeuralVoice(e.target.value)}
              className="w-full mt-2 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              <option value="google">Google Türkçe (bedava, key yok)</option>
              <option value="Emel">Emel (Azure nöral — AZURE_SPEECH_KEY gerekli)</option>
              <option value="Ahmet">Ahmet (Azure nöral — AZURE_SPEECH_KEY gerekli)</option>
            </select>
          ) : (
            <select
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              className="w-full mt-2 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            >
              {voices.length === 0 && <option value="">(tarayıcı sesleri yükleniyor…)</option>}
              {voices.map((v) => (
                <option key={v.name} value={v.name}>{v.name} — {v.lang}</option>
              ))}
            </select>
          )}
          <p className="text-xs text-neutral-500 mt-1">
            <b>Google Türkçe</b> bedava ve key gerektirmez (biraz robotik). <b>Emel/Ahmet</b> gerçek nöral seslerdir ama Vercel'de <code>AZURE_SPEECH_KEY</code> + <code>AZURE_SPEECH_REGION</code> env&apos;i gerektirir (Azure ücretsiz kademe ~500k karakter/ay). Key yoksa Emel seçilse bile otomatik Google&apos;a düşer.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              try {
                localStorage.setItem("ear_triggers", triggers);
                localStorage.setItem("ear_stop", stopWords);
                if (voiceName) localStorage.setItem("ear_voice", voiceName);
                localStorage.setItem("ear_neural", neural ? "1" : "0");
                localStorage.setItem("ear_nvoice", neuralVoice);
              } catch { /* noop */ }
              setSaved(true);
              setTimeout(() => setSaved(false), 2500);
            }}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-sm font-medium"
          >
            Kaydet
          </button>
          <span className="text-xs text-neutral-500">Ayarlar yazdıkça bu tarayıcıda zaten otomatik kaydedilir.</span>
          {saved && <span className="text-sm text-emerald-400">✓ Kaydedildi</span>}
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
