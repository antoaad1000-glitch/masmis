"use client";

import { useCallback, useEffect, useState } from "react";

type Question = {
  id: string;
  questionText: string;
  answer1: string;
  answer2: string;
  answer3: string;
  answer4: string;
  correctAnswer: number;
  category: string;
  difficulty: string;
  explanation?: string | null;
  approved: boolean;
  createdByAi: boolean;
};

export default function AdminPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [adminSecret, setAdminSecret] = useState("");
  const [approved, setApproved] = useState("false");
  const [category, setCategory] = useState("");

  useEffect(() => {
    setAdminSecret(localStorage.getItem("masmis_admin_secret") ?? "");
  }, []);

  const adminHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {};
    const secret = adminSecret.trim();

    if (secret.length > 0) {
      headers["x-admin-secret"] = secret;
    }

    return headers;
  }, [adminSecret]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();

    if (approved !== "all") {
      params.set("approved", approved);
    }

    if (category) {
      params.set("category", category);
    }

    const res = await fetch(`/api/admin/questions?${params.toString()}`, {
      headers: adminHeaders()
    });

    if (res.status === 401 || !res.ok) {
      setQuestions([]);
      return;
    }

    const data = (await res.json()) as Question[];
    setQuestions(data);
  }, [adminHeaders, approved, category]);

  useEffect(() => {
    void load();
  }, [load]);

  function saveSecret() {
    localStorage.setItem("masmis_admin_secret", adminSecret);
    void load();
  }

  async function patch(id: string, body: Partial<Question>) {
    await fetch(`/api/admin/questions/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...adminHeaders()
      },
      body: JSON.stringify(body)
    });

    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/questions/${id}`, {
      method: "DELETE",
      headers: adminHeaders()
    });

    await load();
  }

  async function generate() {
    await fetch("/api/admin/ai/generate", {
      method: "POST",
      headers: adminHeaders()
    });

    await load();
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-700">Admin</p>
          <h1 className="text-4xl font-black">Questions Masmis</h1>
        </div>
        <button onClick={generate} className="rounded-2xl bg-slate-950 px-5 py-3 font-bold text-white">
          Générer 1 question IA
        </button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <input
          value={adminSecret}
          onChange={(e) => setAdminSecret(e.target.value)}
          placeholder="ADMIN_PASSWORD"
          className="rounded-xl border px-4 py-2"
        />
        <button onClick={saveSecret} className="rounded-xl bg-blue-700 px-4 py-2 font-bold text-white">
          Save secret
        </button>
        <select value={approved} onChange={(e) => setApproved(e.target.value)} className="rounded-xl border px-4 py-2">
          <option value="false">En attente</option>
          <option value="true">Approuvées</option>
          <option value="all">Toutes</option>
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border px-4 py-2">
          <option value="">Toutes les catégories</option>
          <option value="FRENCH_REPUBLIC_VALUES">French Republic values</option>
          <option value="INSTITUTIONS_AND_POLITICS">Institutions and politics</option>
          <option value="RIGHTS_AND_DUTIES">Rights and duties</option>
          <option value="HISTORY">History</option>
          <option value="GEOGRAPHY">Geography</option>
          <option value="CULTURE">Culture</option>
          <option value="DAILY_LIFE_IN_FRANCE">Daily life in France</option>
          <option value="EUROPEAN_UNION">European Union</option>
        </select>
      </div>

      <div className="mt-8 space-y-4">
        {questions.map((q) => (
          <article key={q.id} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span>{q.category}</span>
                  <span>{q.difficulty}</span>
                  <span>{q.createdByAi ? "AI" : "Manual"}</span>
                  <span>{q.approved ? "Approved" : "Pending"}</span>
                </div>
                <h2 className="mt-2 text-xl font-black">{q.questionText}</h2>
              </div>
              <div className="flex gap-2">
                {!q.approved && (
                  <button onClick={() => patch(q.id, { approved: true })} className="rounded-xl bg-green-600 px-4 py-2 font-bold text-white">
                    Approve
                  </button>
                )}
                {q.approved && (
                  <button onClick={() => patch(q.id, { approved: false })} className="rounded-xl bg-amber-500 px-4 py-2 font-bold text-white">
                    Unapprove
                  </button>
                )}
                <button onClick={() => remove(q.id)} className="rounded-xl bg-red-600 px-4 py-2 font-bold text-white">
                  Delete
                </button>
              </div>
            </div>
            <ol className="mt-4 grid gap-2 md:grid-cols-2">
              {[q.answer1, q.answer2, q.answer3, q.answer4].map((a, index) => (
                <li
                  key={`${q.id}-${index}`}
                  className={`rounded-xl border px-3 py-2 ${q.correctAnswer === index + 1 ? "border-green-500 bg-green-50" : "border-slate-200"}`}
                >
                  {index + 1}. {a}
                </li>
              ))}
            </ol>
            {q.explanation && <p className="mt-4 text-slate-600">{q.explanation}</p>}
          </article>
        ))}
      </div>
    </main>
  );
}
