"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Idea = {
  id: string;
  user_id: string;
  author: string;
  content: string;
  created_at: string;
  likes: { user_id: string }[];
};

function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const { data, error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) setMsg(error.message);
    else if (mode === "signup" && !data.session)
      setMsg("Cuenta creada. Revisa tu correo para confirmarla y luego entra.");
    setBusy(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-lg dark:bg-zinc-900"
      >
        <h1 className="text-2xl font-bold">💡 Muro de Ideas</h1>
        <p className="text-sm text-zinc-500">
          {mode === "login" ? "Entra con tu cuenta" : "Crea tu cuenta"}
        </p>
        <input
          type="email"
          required
          placeholder="Correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-transparent p-3 dark:border-zinc-700"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Contraseña (mín. 6)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-transparent p-3 dark:border-zinc-700"
        />
        <button
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 p-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {mode === "login" ? "Entrar" : "Crear cuenta"}
        </button>
        {msg && <p className="text-sm text-red-500">{msg}</p>}
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="w-full text-sm text-indigo-600 underline"
        >
          {mode === "login"
            ? "¿No tienes cuenta? Regístrate"
            : "¿Ya tienes cuenta? Entra"}
        </button>
      </form>
    </main>
  );
}

function Wall({ session }: { session: Session }) {
  const user = session.user;
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [online, setOnline] = useState(1);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("ideas")
      .select("*, likes(user_id)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) setError(error.message);
    else setIdeas((data as Idea[]) ?? []);
  }, []);

  useEffect(() => {
    load();
    const db = supabase
      .channel("muro-db")
      .on("postgres_changes", { event: "*", schema: "public", table: "ideas" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, load)
      .subscribe();

    const presence = supabase.channel("muro-presence", {
      config: { presence: { key: user.id } },
    });
    presence
      .on("presence", { event: "sync" }, () => {
        setOnline(Object.keys(presence.presenceState()).length);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await presence.track({ at: Date.now() });
      });

    return () => {
      supabase.removeChannel(db);
      supabase.removeChannel(presence);
    };
  }, [load, user.id]);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content) return;
    setError("");
    const { error } = await supabase
      .from("ideas")
      .insert({ content, author: user.email!.split("@")[0] });
    if (error) setError(error.message);
    else {
      setText("");
      load();
    }
  }

  async function toggleLike(idea: Idea) {
    const liked = idea.likes.some((l) => l.user_id === user.id);
    if (liked)
      await supabase.from("likes").delete().match({ idea_id: idea.id, user_id: user.id });
    else await supabase.from("likes").insert({ idea_id: idea.id });
    load();
  }

  async function remove(id: string) {
    await supabase.from("ideas").delete().eq("id", id);
    load();
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">💡 Muro de Ideas</h1>
        <div className="flex items-center gap-3 text-sm">
          <span
            data-testid="online-count"
            className="flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 font-medium text-green-800"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            {online} {online === 1 ? "persona conectada" : "personas conectadas"}
          </span>
          <button onClick={() => supabase.auth.signOut()} className="text-zinc-500 underline">
            Salir
          </button>
        </div>
      </header>

      <form onSubmit={publish} className="mb-6 space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="Escribe una idea corta…"
          className="w-full rounded-xl border border-zinc-300 bg-transparent p-3 dark:border-zinc-700"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500">{text.length}/280</span>
          <button className="rounded-lg bg-indigo-600 px-5 py-2 font-semibold text-white hover:bg-indigo-500">
            Publicar
          </button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </form>

      <ul className="space-y-3">
        {ideas.map((idea) => {
          const liked = idea.likes.some((l) => l.user_id === user.id);
          return (
            <li key={idea.id} className="rounded-xl bg-white p-4 shadow dark:bg-zinc-900">
              <p className="whitespace-pre-wrap break-words">{idea.content}</p>
              <div className="mt-3 flex items-center justify-between text-sm text-zinc-500">
                <span>
                  {idea.author} · {new Date(idea.created_at).toLocaleString()}
                </span>
                <span className="flex items-center gap-3">
                  <button
                    onClick={() => toggleLike(idea)}
                    className={liked ? "font-semibold text-pink-600" : "hover:text-pink-600"}
                  >
                    {liked ? "❤️" : "🤍"} {idea.likes.length}
                  </button>
                  {idea.user_id === user.id && (
                    <button onClick={() => remove(idea.id)} className="hover:text-red-600">
                      Borrar
                    </button>
                  )}
                </span>
              </div>
            </li>
          );
        })}
        {ideas.length === 0 && (
          <li className="py-10 text-center text-zinc-500">Aún no hay ideas. ¡Publica la primera!</li>
        )}
      </ul>
    </main>
  );
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  return session ? <Wall session={session} /> : <AuthForm />;
}
