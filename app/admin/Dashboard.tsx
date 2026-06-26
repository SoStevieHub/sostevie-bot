"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Settings = {
  botEnabled: boolean;
  newsIntervalMinutes: number;
  newsCategories: string[];
  newsRecencyHours: number;
  randomReplyPercent: number;
  toxicModeEnabled: boolean;
  persona: string;
  ownerProfile: string;
  defendOwner: boolean;
};

type LogRow = {
  id: number;
  direction: "in" | "out";
  kind: string;
  username: string;
  content: string;
  createdAt: number;
};

type Status = {
  readerConnected: boolean;
  readerUsername: string;
  writerConnected: boolean;
  writerUsername: string;
  broadcasterReady: boolean;
  channelSlug: string;
  groqConfigured: boolean;
  searchConfigured: boolean;
  kickConfigured: boolean;
  publicBaseUrl: string;
  logs: LogRow[];
};

export default function Dashboard({ categories }: { categories: { id: string; label: string }[] }) {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const [s, st] = await Promise.all([
      fetch("/api/admin/settings").then((r) => r.json()),
      fetch("/api/admin/status").then((r) => r.json()),
    ]);
    setSettings(s);
    setStatus(st);
  }, []);

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    if (params.get("kick") === "ok") setToast(`Bot bağlandı ✓ (abonelik: ${params.get("sub")})`);
    if (params.get("kick") === "error") setToast(`Bağlantı hatası: ${params.get("msg")}`);
    const t = setInterval(load, 15000); // logları tazele
    return () => clearInterval(t);
  }, [load]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    if (res.ok) {
      setSettings(await res.json());
      flash("Ayarlar kaydedildi ✓");
    } else flash("Kaydetme hatası");
  }

  async function action(action: "test" | "news") {
    flash(action === "test" ? "Test mesajı gönderiliyor…" : "Haber aranıyor…");
    const res = await fetch("/api/admin/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const j = await res.json();
    if (action === "news") flash(j.posted ? "Haber paylaşıldı ✓" : `Atlandı: ${j.reason ?? j.error}`);
    else flash(j.ok ? "Test mesajı gönderildi ✓" : `Hata: ${j.error}`);
    load();
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  if (!settings || !status) {
    return <div className="min-h-screen bg-neutral-950 text-neutral-400 p-8">Yükleniyor…</div>;
  }

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings({ ...settings, [k]: v });
  const webhookUrl = `${status.publicBaseUrl}/api/kick/webhook`;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">sostevie bot · Admin</h1>
            <p className="text-sm text-neutral-400">kick.com/{status.channelSlug}</p>
          </div>
          <button onClick={logout} className="text-sm text-neutral-400 hover:text-neutral-200">Çıkış</button>
        </header>

        {toast && (
          <div className="rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-200 px-4 py-2 text-sm">{toast}</div>
        )}

        {/* Durum */}
        <Card title="Bağlantı durumu">
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            <Stat label="Yayıncı (sohbeti okur)" ok={status.readerConnected && status.broadcasterReady} text={status.readerConnected ? `@${status.readerUsername}` : "bağlı değil"} />
            <Stat label="Bot (mesaj atar)" ok={status.writerConnected} text={status.writerConnected ? `@${status.writerUsername}` : "bağlı değil"} />
            <Stat label="Groq anahtarı" ok={status.groqConfigured} text={status.groqConfigured ? "tanımlı" : "eksik (.env)"} />
            <Stat label="Bot durumu" ok={settings.botEnabled} text={settings.botEnabled ? "açık" : "duraklatıldı"} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/api/kick/oauth/start?role=reader" className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium">
              {status.readerConnected ? "Yayıncıyı yeniden bağla" : "Yayıncı hesabını bağla (SoStevie)"}
            </a>
            <a href="/api/kick/oauth/start?role=writer" className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium">
              {status.writerConnected ? "Botu yeniden bağla" : "Bot hesabını bağla (BotStevie)"}
            </a>
            <button onClick={() => action("test")} className="rounded-lg bg-neutral-800 hover:bg-neutral-700 px-4 py-2 text-sm">Test mesajı at</button>
            <button onClick={() => action("news")} className="rounded-lg bg-neutral-800 hover:bg-neutral-700 px-4 py-2 text-sm">Şimdi haber paylaş</button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Önce <b>yayıncı</b> hesabını (incognito'da SoStevie) bağla — sohbet okuma açılır. Sonra <b>bot</b> hesabını (incognito'da BotStevie) bağla — mesajları o atar.
          </p>
          <p className="mt-2 text-xs text-neutral-500 break-all">Webhook URL: {webhookUrl}</p>
        </Card>

        {/* Genel */}
        <Card title="Genel">
          <Toggle label="Bot açık" checked={settings.botEnabled} onChange={(v) => set("botEnabled", v)} />
          <Toggle
            label="Hakaret modu (küfredene laf sokar, sonuna 'AI botum' notu ekler)"
            checked={settings.toxicModeEnabled}
            onChange={(v) => set("toxicModeEnabled", v)}
          />
          <Range label={`Rastgele cevap olasılığı: %${settings.randomReplyPercent}`} min={0} max={100} value={settings.randomReplyPercent} onChange={(v) => set("randomReplyPercent", v)} />
        </Card>

        {/* Haber */}
        <Card title="Haber paylaşımı">
          <Range label={`Sıklık: her ${settings.newsIntervalMinutes} dakikada bir`} min={1} max={240} value={settings.newsIntervalMinutes} onChange={(v) => set("newsIntervalMinutes", v)} />
          <Range label={`Tazelik: son ${settings.newsRecencyHours} saatteki haberler`} min={1} max={48} value={settings.newsRecencyHours} onChange={(v) => set("newsRecencyHours", v)} />
          <div className="mt-3">
            <p className="text-sm mb-2 text-neutral-300">Haber kategorileri</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const on = settings.newsCategories.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => set("newsCategories", on ? settings.newsCategories.filter((x) => x !== c.id) : [...settings.newsCategories, c.id])}
                    className={`rounded-full px-3 py-1 text-sm border ${on ? "bg-emerald-600 border-emerald-500" : "bg-neutral-800 border-neutral-700 text-neutral-300"}`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Persona */}
        <Card title="Bot kişiliği (system prompt)">
          <textarea
            value={settings.persona}
            onChange={(e) => set("persona", e.target.value)}
            rows={4}
            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            placeholder="Botun konuşma tarzını anlat…"
          />
        </Card>

        {/* Kanal sahibi */}
        <Card title="Kanal sahibi (sana özel)">
          <Toggle
            label="Sahibini savun (sana saldırana karşılık verir, hep arkanda durur)"
            checked={settings.defendOwner}
            onChange={(v) => set("defendOwner", v)}
          />
          <p className="text-sm mt-2 mb-1 text-neutral-300">Hakkında bilinmesini istediklerin (zevkler, övülecek şeyler)</p>
          <textarea
            value={settings.ownerProfile}
            onChange={(e) => set("ownerProfile", e.target.value)}
            rows={3}
            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            placeholder="Örn: En sevdiğim grup Pink Floyd, tarzım Grunge…"
          />
        </Card>

        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-6 py-2 font-medium">
            {saving ? "Kaydediliyor…" : "Ayarları kaydet"}
          </button>
        </div>

        {/* Loglar */}
        <Card title="Son mesajlar">
          <div className="space-y-1 max-h-96 overflow-auto text-sm">
            {status.logs.length === 0 && <p className="text-neutral-500">Henüz mesaj yok.</p>}
            {status.logs.map((l) => (
              <div key={l.id} className="flex gap-2 py-1 border-b border-neutral-800/60">
                <span className={`shrink-0 w-14 text-xs ${l.direction === "out" ? "text-emerald-400" : "text-neutral-500"}`}>{kindLabel(l.kind)}</span>
                <span className="shrink-0 text-neutral-400">{l.username || "—"}:</span>
                <span className="text-neutral-200">{l.content}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function kindLabel(k: string) {
  return { incoming: "gelen", reply: "cevap", insult: "kapışma", news: "haber" }[k] ?? k;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-neutral-900 border border-neutral-800 p-5 space-y-3">
      <h2 className="font-medium text-neutral-200">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-neutral-800/50 px-3 py-2">
      <span className="text-neutral-400">{label}</span>
      <span className={ok ? "text-emerald-400" : "text-red-400"}>{ok ? "● " : "○ "}{text}</span>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 py-1 cursor-pointer">
      <span className="text-sm text-neutral-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-emerald-600" : "bg-neutral-700"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}

function Range({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="py-1">
      <label className="text-sm text-neutral-300">{label}</label>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-emerald-500" />
    </div>
  );
}
