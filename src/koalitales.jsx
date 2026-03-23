import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────────
const C = {
  bg: "#080810", sidebar: "#0c0c16", card: "#111120", card2: "#181828",
  border: "#22223a", accent: "#9d6fe8", accentBg: "#1e1030",
  danger: "#ff4d72", dangerBg: "#2a0f18", warn: "#ffb84d", warnBg: "#2a1e08",
  info: "#4db8ff", text: "#eff0ff", muted: "#7878a0",
  font: "'DM Sans', sans-serif", mono: "'DM Mono', monospace", display: "'Syne', sans-serif",
};

// ── UTILITAIRES ───────────────────────────────────────────────────────────────
const fmt    = (n) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(n) || 0);
const sumArr = (arr, key) => (arr || []).reduce((a, x) => a + (parseFloat(x[key]) || 0), 0);
const uid    = () => Math.random().toString(36).slice(2, 10);
const today  = () => new Date().toISOString().split("T")[0];
const hashPw = (pw) => btoa(unescape(encodeURIComponent(pw + "_k0ali")));

// ── CONSTANTES ────────────────────────────────────────────────────────────────
const CATS     = ["Logistique","Communication","Technique","Restauration","Hébergement","Artistes","Sécurité","Divers"];
const REV_TYPES = ["Billetterie","Subvention","Sponsoring","Bénévolat","Ventes","Autre"];
const PALETTE  = ["#4affa0","#ffb84d","#ff4d72","#4db8ff","#c84dff","#ff4dda","#4dffe8","#ffe84d"];
const PRESTATION_STATUTS = ["Demande","Confirmé","En cours","Terminé","Annulé"];

const ALL_PERMISSIONS = [
  "create_event","edit_event","invoices","settings",
  "catalog","manage_users","manage_inventory","manage_meetings","manage_prestations","manage_depenses","manage_treasury","web_admin",
];
const PERMISSION_LABELS = {
  create_event:       "Créer des événements",
  edit_event:         "Modifier / supprimer des événements",
  invoices:           "Gérer les factures",
  settings:           "Modifier les paramètres",
  catalog:            "Gérer le catalogue",
  manage_users:       "Gérer les utilisateurs",
  manage_inventory:   "Gérer l'inventaire",
  manage_meetings:    "Gérer les réunions",
  manage_prestations: "Gérer les prestations",
  manage_depenses:    "Gérer les dépenses & remboursements",
  manage_treasury:    "Gérer la trésorerie (comptabilité)",
  web_admin:          "Administration web (maintenance)",
};

const INIT = {
  assoc: { name: "", logo: null, address: "", email: "", phone: "", iban: "", siret: "", note: "", bankBalance: 0 },
  events: [], catalog: [], invoices: [], inventory: [], meetings: [], prestations: [],
  depenses: [], roles: [], depensesPool: [], contacts: [], tickets: [], todos: [],
};
const ROLE_COLORS = ["#9d6fe8","#4db8ff","#4affa0","#ffb84d","#ff4d72","#c84dff","#ff4dda","#4dffe8","#f0a500","#00c9a7"];

// Renomme une personne dans toute la structure de données
const renamePersonInData = (d, oldName, newName) => ({
  ...d,
  depensesPool: (d.depensesPool || []).map(p =>
    p.name === oldName ? { ...p, name: newName, linkedUsername: undefined } : p
  ),
  depenses: (d.depenses || []).map(dep => ({
    ...dep,
    paidBy: dep.paidBy === oldName ? newName : dep.paidBy,
    participants: (dep.participants || []).map(p =>
      p.name === oldName ? { ...p, name: newName } : p
    ),
    reimbursements: (dep.reimbursements || []).map(r => ({
      ...r,
      from: r.from === oldName ? newName : r.from,
      to:   r.to   === oldName ? newName : r.to,
    })),
  })),
  events: (d.events || []).map(ev => ({
    ...ev,
    members: (ev.members || []).map(m =>
      m.name === oldName ? { ...m, name: newName } : m
    ),
    expenses: (ev.expenses || []).map(ex => ({
      ...ex,
      paidBy: ex.paidBy === oldName ? newName : ex.paidBy,
    })),
  })),
});

// ── STYLE HELPERS ─────────────────────────────────────────────────────────────
const s = {
  btn: (v = "primary", x = {}) => ({
    padding: "9px 18px", borderRadius: "8px", border: "none", cursor: "pointer",
    fontFamily: C.font, fontSize: "13px", fontWeight: "500", transition: "opacity 0.15s",
    ...(v === "primary" ? { background: C.accent, color: "#000" }
      : v === "danger"  ? { background: C.dangerBg, color: C.danger, border: `1px solid ${C.danger}50` }
      : v === "ghost"   ? { background: "transparent", color: C.muted, border: `1px solid ${C.border}` }
      : { background: C.card2, color: C.text, border: `1px solid ${C.border}` }),
    ...x,
  }),
  inp: (x = {}) => ({
    background: C.card2, border: `1px solid ${C.border}`, borderRadius: "8px",
    color: C.text, padding: "9px 13px", fontFamily: C.font, fontSize: "13px",
    outline: "none", width: "100%", boxSizing: "border-box", ...x,
  }),
  card: (x = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "22px", ...x }),
  label: { fontSize: "11px", color: C.muted, display: "block", marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.5px" },
};

// ── STORE (API JSON via Vite middleware) ──────────────────────────────────────
const store = {
  async load() {
    try { const r = await fetch("/api/data"); return r.ok ? await r.json() : null; } catch { return null; }
  },
  async save(d) {
    try { await fetch("/api/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) }); } catch {}
  },
  async loadUsers() {
    try { const r = await fetch("/api/users"); return r.ok ? await r.json() : []; } catch { return []; }
  },
  async saveUsers(users) {
    try { await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(users) }); } catch {}
  },
  async loadLogs() {
    try { const r = await fetch("/api/logs"); return r.ok ? await r.json() : []; } catch { return []; }
  },
  async saveLogs(logs) {
    try { await fetch("/api/logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(logs) }); } catch {}
  },
  async loadInvites() {
    try { const r = await fetch("/api/invites"); return r.ok ? await r.json() : []; } catch { return []; }
  },
  async saveInvites(invites) {
    try { await fetch("/api/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(invites) }); } catch {}
  },
  async uploadFile(file) {
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "X-Filename": encodeURIComponent(file.name) },
        body: file,
      });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  },
  async deleteUpload(url) {
    try { await fetch("/api/delete-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: url.split("/").pop() }) }); } catch {}
  },
};

// ── AUTH (web, session dans localStorage) ───────────────────────────────────
const auth = {
  async status() {
    const users = await store.loadUsers();
    return { hasUsers: users.length > 0 };
  },
  async setup({ username, password }) {
    const users = await store.loadUsers();
    if (users.length > 0) return { ok: false, error: "Déjà configuré." };
    const user = { id: uid(), username: username.trim(), hash: hashPw(password), role: "root", permissions: [...ALL_PERMISSIONS], created_at: new Date().toISOString() };
    await store.saveUsers([user]);
    return { ok: true };
  },
  async login({ username, password }) {
    const users = await store.loadUsers();
    const user = users.find(u => u.username === username.trim() && u.hash === hashPw(password));
    if (!user) return { ok: false, error: "Identifiants incorrects." };
    const token = uid();
    const updated = users.map(u => u.id === user.id ? { ...u, token } : u);
    await store.saveUsers(updated);
    return { ok: true, token, user: { id: user.id, username: user.username, role: user.role, permissions: user.permissions, roleId: user.roleId || null, avatar: user.avatar || null, linkedPoolName: user.linkedPoolName ?? undefined } };
  },
  async check(token) {
    const users = await store.loadUsers();
    const user = users.find(u => u.token === token);
    if (!user) return { ok: false };
    return { ok: true, user: { id: user.id, username: user.username, role: user.role, permissions: user.permissions, roleId: user.roleId || null, avatar: user.avatar || null, linkedPoolName: user.linkedPoolName ?? undefined } };
  },
  async logout(token) {
    const users = await store.loadUsers();
    await store.saveUsers(users.map(u => u.token === token ? { ...u, token: null } : u));
  },
  async listUsers(token) {
    const users = await store.loadUsers();
    return { ok: true, users: users.map(({ hash: _, token: __, ...u }) => u) };
  },
  async createUser(token, { username, password, role, permissions, roleId }) {
    const users = await store.loadUsers();
    if (users.find(u => u.username === username.trim())) return { ok: false, error: "Identifiant déjà utilisé." };
    const user = { id: uid(), username: username.trim(), hash: hashPw(password), role, permissions, roleId: roleId || null, created_at: new Date().toISOString() };
    await store.saveUsers([...users, user]);
    return { ok: true };
  },
  async updateUser(token, { id, username, password, role, permissions, roleId, linkedPoolName }) {
    const users = await store.loadUsers();
    const updated = users.map(u => {
      if (u.id !== id) return u;
      return {
        ...u, username: username.trim(), role, permissions, roleId: roleId || null,
        ...(password ? { hash: hashPw(password) } : {}),
        ...(linkedPoolName !== undefined ? { linkedPoolName } : {}),
      };
    });
    await store.saveUsers(updated);
    return { ok: true };
  },
  async linkToPool(token, userId, poolName) {
    const users = await store.loadUsers();
    const updated = users.map(u => u.id === userId ? { ...u, linkedPoolName: poolName } : u);
    await store.saveUsers(updated);
    return { ok: true };
  },
  async deleteUser(token, id) {
    const users = await store.loadUsers();
    await store.saveUsers(users.filter(u => u.id !== id));
    return { ok: true };
  },
  async updateAvatar(token, userId, avatarData) {
    const users = await store.loadUsers();
    const updated = users.map(u => u.id === userId ? { ...u, avatar: avatarData } : u);
    await store.saveUsers(updated);
    return { ok: true };
  },
  async generateInvite(token) {
    const invites = await store.loadInvites();
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    await store.saveInvites([...invites, { code, createdAt: new Date().toISOString(), used: false }]);
    return { ok: true, code };
  },
  async registerWithInvite({ code, username, password }) {
    const invites = await store.loadInvites();
    const invite = invites.find(i => i.code === code && !i.used);
    if (!invite) return { ok: false, error: "Code d'invitation invalide ou déjà utilisé." };
    const users = await store.loadUsers();
    if (users.find(u => u.username === username.trim())) return { ok: false, error: "Identifiant déjà utilisé." };
    const user = { id: uid(), username: username.trim(), hash: hashPw(password), role: "user", permissions: [], linkedPoolName: null, created_at: new Date().toISOString() };
    await store.saveUsers([...users, user]);
    await store.saveInvites(invites.map(i => i.code === code ? { ...i, used: true, usedBy: username } : i));
    return { ok: true };
  },
  async listInvites() {
    return await store.loadInvites();
  },
};

// ── HOOK MOBILE ───────────────────────────────────────────────────────────────
function useMobile() {
  const [m, setM] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return m;
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(INIT);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [eventId, setEventId] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState(null);
  const [session, setSession] = useState(null);
  const [users, setUsers] = useState([]);
  const [notifDismissed, setNotifDismissed] = useState(() => localStorage.getItem("kt_notif_dismissed") || "");
  const isMobile = useMobile();

  const can = useCallback((perm) => {
    if (session?.user?.role === "root") return true;
    if ((session?.user?.permissions || []).includes(perm)) return true;
    const customRole = (data.roles || []).find(r => r.id === session?.user?.roleId);
    return !!(customRole?.permissions || []).includes(perm);
  }, [session, data.roles]);

  useEffect(() => {
    const init = async () => {
      const { hasUsers } = await auth.status();
      if (!hasUsers) { setAuthMode("setup"); setAuthReady(true); return; }
      const token = localStorage.getItem("kt_token");
      if (token) {
        const res = await auth.check(token);
        if (res.ok) { setSession({ token, user: res.user }); setAuthMode("app"); }
        else { localStorage.removeItem("kt_token"); setAuthMode("login"); }
      } else {
        setAuthMode("login");
      }
      setAuthReady(true);
    };
    init();
  }, []);

  useEffect(() => {
    if (authMode === "app") {
      store.load().then(d => {
        if (d) {
          const merged = { ...INIT, ...d };
          // Sync : tous les membres de tous les événements → pool global
          const pool = merged.depensesPool || [];
          const allEventMembers = (merged.events || []).flatMap(e => e.members || []);
          const newToPool = allEventMembers.filter(m => m.name && !pool.find(p => p.name === m.name));
          if (newToPool.length > 0) {
            merged.depensesPool = [...pool, ...newToPool.map(m => ({ name: m.name }))];
            store.save(merged); // persister le sync
          }
          setData(merged);
        }
        setReady(true);
      });
      store.loadUsers().then(u => setUsers(u || []));
    }
  }, [authMode]);

  const addLog = async (action, target, details) => {
    const logs = await store.loadLogs();
    await store.saveLogs([{ id: uid(), action, target, details, user: session?.user?.username || "?", date: new Date().toISOString() }, ...logs].slice(0, 500));
  };

  const save = (d) => { setData(d); store.save(d); };
  const update = (patch, log) => {
    save({ ...data, ...patch });
    if (log) addLog(log.action, log.target, log.details);
  };
  const goEvent = (id) => { setEventId(id); setPage("eventDetail"); };

  const handleLogin = (token, user) => {
    localStorage.setItem("kt_token", token);
    setSession({ token, user });
    setAuthMode("app");
  };
  const handleLogout = async () => {
    if (session?.token) await auth.logout(session.token);
    localStorage.removeItem("kt_token");
    setSession(null);
    setPage("dashboard");
    setAuthMode("login");
  };
  const handleAvatarChange = async (avatarData) => {
    await auth.updateAvatar(session.token, session.user.id, avatarData);
    setSession(s => ({ ...s, user: { ...s.user, avatar: avatarData } }));
    store.loadUsers().then(u => setUsers(u || []));
  };

  const handleLinkToPool = async (poolName) => {
    const username = session.user.username;
    await auth.linkToPool(session.token, session.user.id, poolName);
    setSession(s => ({ ...s, user: { ...s.user, linkedPoolName: poolName || "none" } }));
    if (poolName && poolName !== "none" && poolName !== username) {
      // Renommer toutes les occurrences du nom du pool → username dans les données
      save(renamePersonInData(data, poolName, username));
    }
    store.loadUsers().then(u => setUsers(u || []));
  };

  if (!authReady) return <Loader />;
  if (authMode === "setup") return <SetupPage onDone={() => setAuthMode("login")} />;
  if (authMode === "login") return <LoginPage onLogin={handleLogin} />;
  if (!ready) return <Loader />;

  // Mode maintenance : bloquer les non-admins
  const isWebAdmin = can("web_admin");
  if (data.maintenance?.enabled && !isWebAdmin) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: C.font, gap: "16px" }}>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
        <div style={{ fontSize: "48px" }}>🔧</div>
        <div style={{ fontFamily: C.display, fontSize: "24px", fontWeight: "800", color: C.warn }}>Site en maintenance</div>
        <div style={{ color: C.muted, fontSize: "14px", maxWidth: "400px", textAlign: "center" }}>
          {data.maintenance?.message || "Le site est temporairement indisponible. Revenez bientôt."}
        </div>
        <button style={s.btn("ghost", { fontSize: "12px", marginTop: "12px" })} onClick={handleLogout}>Se déconnecter</button>
      </div>
    );
  }

  // Afficher "Qui êtes-vous ?" si l'utilisateur n'a pas encore lié son compte au pool
  const pool = data.depensesPool || [];
  const needsIdentification = session && pool.length > 0 && (session.user.linkedPoolName === null || session.user.linkedPoolName === undefined);

  const notif = data.notification || {};
  const showBanner = notif.active && notif.message && notif.date !== notifDismissed;
  const dismissBanner = () => { localStorage.setItem("kt_notif_dismissed", notif.date); setNotifDismissed(notif.date); };

  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", minHeight: "100vh", background: C.bg, color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      {needsIdentification && <WhoAreYouModal pool={pool} username={session.user.username} onLink={handleLinkToPool} />}
      <Nav page={page} go={(p) => { setPage(p); setEventId(null); }} session={session} onLogout={handleLogout} can={can} isMobile={isMobile} onAvatarChange={handleAvatarChange} users={users} data={data} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", ...(isMobile ? {} : { maxHeight: "100vh" }) }}>
        {showBanner && (
          <div style={{ background: `${C.info}18`, borderBottom: `1px solid ${C.info}40`, padding: "10px 24px", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
            <span style={{ fontSize: "16px" }}>📣</span>
            <span style={{ flex: 1, fontSize: "13px", color: C.info }}>{notif.message}</span>
            <button onClick={dismissBanner} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "16px", lineHeight: 1 }}>✕</button>
          </div>
        )}
      <main style={{ flex: 1, padding: isMobile ? "20px 16px" : "40px 48px", overflowY: "auto" }}>
        {page === "dashboard"    && <Dashboard data={data} goEvent={goEvent} go={p => { setPage(p); setEventId(null); }} session={session} update={update} can={can} />}
        {page === "equipe"       && <EquipePage users={users} data={data} update={update} can={can} session={session} />}
        {page === "events"       && <EventsList data={data} update={update} goEvent={goEvent} can={can} />}
        {page === "eventDetail"  && <EventDetail data={data} update={update} eventId={eventId} back={() => setPage("events")} can={can} users={users} contacts={data.contacts||[]} />}
        {page === "invoices"     && (can("invoices")           ? <InvoicesPage data={data} update={update} /> : <AccessDenied />)}
        {page === "inventory"    && (can("manage_inventory")   ? <InventoryPage data={data} update={update} /> : <AccessDenied />)}
        {page === "meetings"     && (can("manage_meetings")    ? <MeetingsPage data={data} update={update} /> : <AccessDenied />)}
        {page === "prestations"  && (can("manage_prestations") ? <PrestationsPage data={data} update={update} session={session} users={users} contacts={data.contacts||[]} /> : <AccessDenied />)}
        {page === "contacts"     && <ContactsPage data={data} update={update} />}
        {page === "compta"       && <ComptaPage data={data} update={update} can={can} session={session} />}
        {page === "depenses"     && <DepensesPage data={data} update={update} users={users} session={session} can={can} />}
        {page === "todos"        && <TodosPage data={data} update={update} session={session} can={can} />}
        {page === "tickets"      && <TicketsPage data={data} update={update} session={session} can={can} />}
        {page === "settings"     && (can("settings")           ? <SettingsPage data={data} update={update} /> : <AccessDenied />)}
        {page === "users"        && (can("manage_users")       ? <UserManagementPage session={session} data={data} update={update} /> : <AccessDenied />)}
        {page === "maintenance"  && (can("web_admin")           ? <MaintenancePage data={data} update={update} /> : <AccessDenied />)}
      </main>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div style={{ background: C.bg, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontFamily: C.font }}>
      Chargement…
    </div>
  );
}

// ── SETUP PAGE ────────────────────────────────────────────────────────────────
function SetupPage({ onDone }) {
  const [form, setForm] = useState({ username: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    if (!form.username.trim()) return setError("L'identifiant est requis.");
    if (form.password.length < 6) return setError("Le mot de passe doit contenir au moins 6 caractères.");
    if (form.password !== form.confirm) return setError("Les mots de passe ne correspondent pas.");
    setLoading(true);
    const res = await auth.setup({ username: form.username, password: form.password });
    setLoading(false);
    if (res.ok) onDone();
    else setError(res.error || "Erreur lors de la création.");
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.font }}>
      <div style={{ width: "400px", padding: "0 16px" }}>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <div style={{ fontFamily: C.display, fontSize: "28px", fontWeight: "800", color: C.accent, marginBottom: "4px" }}>SASALELE</div>
          <div style={{ fontFamily: C.font, fontSize: "12px", color: C.muted, marginBottom: "8px", letterSpacing: "0.5px" }}>Pour Koalisons</div>
          <div style={{ color: C.muted, fontSize: "14px" }}>Première configuration — Créez le compte administrateur</div>
        </div>
        <div style={s.card()}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px", marginBottom: "20px" }}>Compte administrateur (root)</div>
          {[{ k:"username",l:"Identifiant",ph:"admin",type:"text" },{ k:"password",l:"Mot de passe",ph:"••••••••",type:"password" },{ k:"confirm",l:"Confirmer",ph:"••••••••",type:"password" }].map(({ k,l,ph,type }) => (
            <div key={k} style={{ marginBottom: "14px" }}>
              <label style={s.label}>{l}</label>
              <input type={type} style={s.inp()} value={form[k]} placeholder={ph}
                onChange={e => setForm({ ...form, [k]: e.target.value })}
                onKeyDown={e => e.key === "Enter" && submit()} />
            </div>
          ))}
          {error && <div style={{ color: C.danger, fontSize: "12px", marginBottom: "12px" }}>{error}</div>}
          <button style={s.btn("primary", { width: "100%", padding: "12px" })} onClick={submit} disabled={loading}>
            {loading ? "Création…" : "Créer le compte administrateur"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── LOGIN PAGE ────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [form, setForm] = useState({ username: "", password: "" });
  const [regForm, setRegForm] = useState({ code: "", username: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    if (!form.username || !form.password) return setError("Identifiant et mot de passe requis.");
    setLoading(true);
    const res = await auth.login({ username: form.username, password: form.password });
    setLoading(false);
    if (res.ok) onLogin(res.token, res.user);
    else setError(res.error || "Identifiants incorrects.");
  };

  const submitRegister = async () => {
    setError("");
    if (!regForm.code.trim()) return setError("Le code d'invitation est requis.");
    if (!regForm.username.trim()) return setError("L'identifiant est requis.");
    if (regForm.password.length < 6) return setError("Le mot de passe doit contenir au moins 6 caractères.");
    if (regForm.password !== regForm.confirm) return setError("Les mots de passe ne correspondent pas.");
    setLoading(true);
    const res = await auth.registerWithInvite({ code: regForm.code.trim().toUpperCase(), username: regForm.username, password: regForm.password });
    setLoading(false);
    if (res.ok) { setMode("login"); setError(""); setRegForm({ code: "", username: "", password: "", confirm: "" }); }
    else setError(res.error || "Erreur lors de l'inscription.");
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.font }}>
      <div style={{ width: "380px", padding: "0 16px" }}>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <div style={{ fontFamily: C.display, fontSize: "28px", fontWeight: "800", color: C.accent, marginBottom: "4px" }}>SASALELE</div>
          <div style={{ fontFamily: C.font, fontSize: "12px", color: C.muted, marginBottom: "8px", letterSpacing: "0.5px" }}>Pour Koalisons</div>
          <div style={{ color: C.muted, fontSize: "14px" }}>{mode === "login" ? "Connectez-vous pour continuer" : "Créer un compte avec un code d'invitation"}</div>
        </div>

        {mode === "login" ? (
          <div style={s.card()}>
            <form onSubmit={e => { e.preventDefault(); submit(); }} autoComplete="on">
            <div style={{ marginBottom: "14px" }}>
              <label style={s.label}>Identifiant</label>
              <input type="text" name="username" autoComplete="username" style={s.inp()} value={form.username} placeholder="admin"
                onChange={e => setForm({ ...form, username: e.target.value })} autoFocus />
            </div>
            <div style={{ marginBottom: "18px" }}>
              <label style={s.label}>Mot de passe</label>
              <input type="password" name="password" autoComplete="current-password" style={s.inp()} value={form.password} placeholder="••••••••"
                onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
            {error && <div style={{ color: C.danger, fontSize: "12px", marginBottom: "12px" }}>{error}</div>}
            <button type="submit" style={s.btn("primary", { width: "100%", padding: "12px" })} disabled={loading}>
              {loading ? "Connexion…" : "Se connecter"}
            </button>
            </form>
            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <button onClick={() => { setMode("register"); setError(""); }} style={{ background: "none", border: "none", color: C.muted, fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}>
                J'ai un code d'invitation →
              </button>
            </div>
          </div>
        ) : (
          <div style={s.card()}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "16px" }}>Inscription avec invitation</div>
            <form onSubmit={e => { e.preventDefault(); submitRegister(); }} autoComplete="on">
            {[
              { k:"code", l:"Code d'invitation", ph:"EX: AB1C2D", type:"text", ac:"off" },
              { k:"username", l:"Identifiant souhaité", ph:"mon_pseudo", type:"text", ac:"username" },
              { k:"password", l:"Mot de passe", ph:"••••••••", type:"password", ac:"new-password" },
              { k:"confirm", l:"Confirmer le mot de passe", ph:"••••••••", type:"password", ac:"new-password" },
            ].map(({ k, l, ph, type, ac }) => (
              <div key={k} style={{ marginBottom: "12px" }}>
                <label style={s.label}>{l}</label>
                <input type={type} name={k} autoComplete={ac} style={s.inp()} value={regForm[k]} placeholder={ph}
                  onChange={e => setRegForm({ ...regForm, [k]: e.target.value })} />
              </div>
            ))}
            {error && <div style={{ color: C.danger, fontSize: "12px", marginBottom: "12px" }}>{error}</div>}
            <button type="submit" style={s.btn("primary", { width: "100%", padding: "12px" })} disabled={loading}>
              {loading ? "Création…" : "Créer mon compte"}
            </button>
            </form>
            <div style={{ textAlign: "center", marginTop: "14px" }}>
              <button onClick={() => { setMode("login"); setError(""); }} style={{ background: "none", border: "none", color: C.muted, fontSize: "12px", cursor: "pointer", textDecoration: "underline" }}>
                ← Retour à la connexion
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── NAV ───────────────────────────────────────────────────────────────────────
function UserAvatar({ username, avatar, color, size = 40, style: extra = {} }) {
  const border = `2px solid ${color || C.border}`;
  const base = { width: size, height: size, borderRadius: "50%", flexShrink: 0, ...extra };
  if (avatar) return <img src={avatar} style={{ ...base, objectFit: "cover", border }} alt={username} />;
  return (
    <div style={{ ...base, background: color ? color + "30" : C.card2, border, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.display, fontWeight: "800", fontSize: Math.round(size * 0.42) + "px", color: color || C.muted }}>
      {(username || "?")[0].toUpperCase()}
    </div>
  );
}

function WhoAreYouModal({ pool, username, onLink }) {
  const [selected, setSelected] = useState("");
  const handleConfirm = () => {
    if (selected === "") return;
    onLink(selected === "__none__" ? "none" : selected);
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,8,16,0.92)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "36px 32px", maxWidth: "460px", width: "100%" }}>
        <div style={{ fontFamily: C.display, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.6px", marginBottom: "8px" }}>Qui êtes-vous ?</div>
        <div style={{ color: C.muted, fontSize: "13px", marginBottom: "24px" }}>
          Bienvenue <strong style={{ color: C.text }}>{username}</strong>. Sélectionnez votre nom dans la liste pour lier votre compte à vos dépenses et remboursements existants.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
          {pool.map(p => (
            <div key={p.name} onClick={() => setSelected(p.name)}
              style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderRadius: "10px", cursor: "pointer", border: `2px solid ${selected === p.name ? C.accent : C.border}`, background: selected === p.name ? `${C.accent}12` : C.card2, transition: "all 0.1s" }}>
              <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: `2px solid ${selected === p.name ? C.accent : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {selected === p.name && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: C.accent }} />}
              </div>
              <div>
                <div style={{ fontWeight: "600", fontSize: "14px" }}>{p.name}</div>
                {p.linkedUsername && <div style={{ fontSize: "11px", color: C.muted }}>Déjà lié à @{p.linkedUsername}</div>}
              </div>
            </div>
          ))}
          <div onClick={() => setSelected("__none__")}
            style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderRadius: "10px", cursor: "pointer", border: `2px solid ${selected === "__none__" ? C.muted : C.border}`, background: selected === "__none__" ? `${C.muted}10` : "transparent", transition: "all 0.1s" }}>
            <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: `2px solid ${selected === "__none__" ? C.muted : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {selected === "__none__" && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: C.muted }} />}
            </div>
            <div style={{ fontSize: "13px", color: C.muted }}>Aucune des personnes listées</div>
          </div>
        </div>
        <button style={s.btn("primary", { width: "100%", padding: "12px", fontSize: "14px", opacity: selected ? 1 : 0.4 })} onClick={handleConfirm} disabled={!selected}>
          Confirmer
        </button>
      </div>
    </div>
  );
}

function Nav({ page, go, session, onLogout, can, isMobile, onAvatarChange, users, data = {} }) {
  const [open, setOpen] = useState(false);
  const [ticketsSeenAt, setTicketsSeenAt] = useState(() => localStorage.getItem("kt_tickets_seen") || "");

  const isWebAdmin = can && can("web_admin");
  const unreadTickets = useMemo(() => {
    if (!isWebAdmin) return 0;
    return (data.tickets || []).filter(t => t.status !== "terminé" && (!ticketsSeenAt || t.createdAt > ticketsSeenAt)).length;
  }, [data.tickets, ticketsSeenAt, isWebAdmin]);

  const goWithTicketMark = (id) => {
    if (id === "tickets" && isWebAdmin) {
      const now = new Date().toISOString();
      localStorage.setItem("kt_tickets_seen", now);
      setTicketsSeenAt(now);
    }
    go(id);
    setOpen(false);
  };

  // Calcul du solde personnel de l'utilisateur connecté
  const myName = session?.user?.username;
  const myBalance = useMemo(() => {
    if (!myName) return null;
    const depenses = data.depenses || [];
    const events   = data.events   || [];
    const bankBalance   = data.assoc?.bankBalance ?? 0;
    const assoBankCov   = depenses.filter(d => d.bankCoverage).reduce((a, d) => a + d.amount, 0);
    const eventBankCov  = events.reduce((a, e) => a + (e.expenses||[]).filter(ex => ex.bankCoverage).reduce((b, ex) => b + ex.amount, 0), 0);
    const bankRem       = Math.max(0, bankBalance - eventBankCov);
    const eventUncov    = eventBankCov  > 0 ? Math.max(0, eventBankCov  - bankBalance)  / eventBankCov  : 0;
    const assoUncov     = assoBankCov   > 0 ? Math.max(0, assoBankCov   - bankRem)      / assoBankCov   : 0;
    let netM = 0, netB = 0;
    depenses.flatMap(d => (d.reimbursements||[]).filter(r => !r.settled).map(r => ({ ...r, bc: !!d.bankCoverage }))).forEach(r => {
      const amt = r.bc ? Math.round(r.amount * assoUncov * 100) / 100 : r.amount;
      if (amt < 0.01) return;
      if (r.from === myName) { r.to === "Banque" ? (netB -= amt) : (netM -= amt); }
      if (r.to   === myName) { r.from === "Banque" ? (netB += amt) : (netM += amt); }
    });
    events.filter(e => (e.members||[]).length > 0 && (e.expenses||[]).length > 0).forEach(ev => {
      computeMinimalTransfers(ev.members, ev.expenses).forEach(t => {
        if ((ev.settlements||[]).find(s => s.id === t.id)?.settled) return;
        const amt = t.bankOp ? Math.round(t.amount * eventUncov * 100) / 100 : t.amount;
        if (amt < 0.01) return;
        if (t.from === myName) { t.to === "Banque" ? (netB -= amt) : (netM -= amt); }
        if (t.to   === myName) { t.from === "Banque" ? (netB += amt) : (netM += amt); }
      });
    });
    return { netM: Math.round(netM * 100) / 100, netB: Math.round(netB * 100) / 100 };
  }, [myName, data]);

  const items = [
    { id: "dashboard",   icon: "⬡", label: "Tableau de bord",  always: true },
    { id: "equipe",      icon: "◉", label: "Équipe",            always: true },
    { id: "events",      icon: "◆", label: "Événements",        always: true },
    { id: "invoices",    icon: "◉", label: "Factures",          perm: "invoices" },
    { id: "inventory",   icon: "▣", label: "Inventaire",        perm: "manage_inventory" },
    { id: "meetings",    icon: "◈", label: "Réunions",          perm: "manage_meetings" },
    { id: "prestations", icon: "◎", label: "Prestations",       perm: "manage_prestations" },
    { id: "contacts",    icon: "◉", label: "Contacts",           always: true },
    { id: "depenses",    icon: "€", label: "Dépenses",          always: true },
    { id: "compta",      icon: "⊞", label: "Comptabilité",      always: true },
    { id: "todos",        icon: "☑", label: "Tâches",             always: true },
    { id: "tickets",     icon: "◎", label: "Boîte à idées",     always: true },
    { id: "settings",   icon: "⚙", label: "Association",       perm: "settings" },
    { id: "users",       icon: "◈", label: "Utilisateurs",      perm: "manage_users" },
    { id: "maintenance", icon: "🔧", label: "Maintenance",       perm: "web_admin" },
  ].filter(item => item.always || can(item.perm));

  const isActive = (id) => page === id || (id === "events" && page === "eventDetail");

  const NavContent = () => (
    <>
      <div style={{ padding: "22px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: C.display, fontSize: "17px", fontWeight: "800", color: C.accent, letterSpacing: "-0.3px" }}>SASALELE</div>
          <div style={{ fontFamily: C.font, fontSize: "11px", color: C.muted, marginTop: "2px", letterSpacing: "0.3px" }}>Pour Koalisons</div>
        </div>
        {isMobile && <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "20px" }}>✕</button>}
      </div>
      <div style={{ padding: "12px 0", flex: 1, overflowY: "auto" }}>
        {items.map(({ id, icon, label }) => {
          const badge = id === "tickets" && unreadTickets > 0 ? unreadTickets : 0;
          return (
            <button key={id} onClick={() => goWithTicketMark(id)} style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "11px 24px", background: isActive(id) ? `${C.accent}12` : "transparent",
              border: "none", borderLeft: `2px solid ${isActive(id) ? C.accent : "transparent"}`,
              cursor: "pointer", color: isActive(id) ? C.accent : C.muted,
              fontFamily: C.font, fontSize: "13px", fontWeight: isActive(id) ? "500" : "400",
              width: "100%", textAlign: "left", transition: "all 0.15s",
            }}>
              <span style={{ fontSize: "15px", lineHeight: 1 }}>{icon}</span>
              <span style={{ flex: 1 }}>{label}</span>
              {badge > 0 && <span style={{ background: C.danger, color: "#fff", fontSize: "10px", fontWeight: "700", borderRadius: "20px", padding: "1px 6px", minWidth: "18px", textAlign: "center" }}>{badge}</span>}
            </button>
          );
        })}
      </div>
      {session && (
        <div style={{ padding: "14px 18px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <label style={{ cursor: "pointer", position: "relative", flexShrink: 0 }} title="Changer la photo de profil">
              <UserAvatar username={session.user.username} avatar={session.user.avatar} size={36} />
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
                const file = e.target.files[0]; if (!file) return;
                const result = await store.uploadFile(file);
                if (result) onAvatarChange && onAvatarChange(result.url);
                e.target.value = "";
              }} />
              <div style={{ position: "absolute", bottom: 0, right: 0, width: "14px", height: "14px", borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8px", color: C.bg, pointerEvents: "none" }}>✎</div>
            </label>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "12px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.user.username}</div>
              <div style={{ fontSize: "11px", color: session.user.role === "root" ? C.accent : C.info, marginTop: "1px" }}>
                {session.user.role === "root" ? "Admin root" : "Utilisateur"}
              </div>
              {myBalance && (myBalance.netM !== 0 || myBalance.netB !== 0) && (
                <div style={{ marginTop: "5px", display: "flex", flexDirection: "column", gap: "2px" }}>
                  {myBalance.netM !== 0 && (
                    <div style={{ fontSize: "10px", fontFamily: C.mono, color: myBalance.netM > 0 ? C.accent : C.danger }}>
                      {myBalance.netM > 0 ? `+${fmt(myBalance.netM)}` : fmt(myBalance.netM)} membres
                    </div>
                  )}
                  {myBalance.netB !== 0 && (
                    <div style={{ fontSize: "10px", fontFamily: C.mono, color: myBalance.netB > 0 ? C.info : C.warn }}>
                      {myBalance.netB > 0 ? `+${fmt(myBalance.netB)}` : fmt(myBalance.netB)} banque
                    </div>
                  )}
                </div>
              )}
              {myBalance && myBalance.netM === 0 && myBalance.netB === 0 && (
                <div style={{ fontSize: "10px", color: C.accent, marginTop: "4px" }}>✓ Équilibré</div>
              )}
            </div>
          </div>
          <button onClick={onLogout} style={s.btn("ghost", { width: "100%", fontSize: "12px", padding: "7px" })}>Déconnexion</button>
        </div>
      )}
    </>
  );

  if (isMobile) return (
    <>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: C.sidebar, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "14px 18px", gap: "14px" }}>
        <button onClick={() => setOpen(true)} style={{ background: "none", border: "none", color: C.text, cursor: "pointer", fontSize: "22px", lineHeight: 1 }}>☰</button>
        <div>
          <span style={{ fontFamily: C.display, fontSize: "16px", fontWeight: "800", color: C.accent }}>SASALELE</span>
          <span style={{ fontFamily: C.font, fontSize: "10px", color: C.muted, marginLeft: "8px" }}>Pour Koalisons</span>
        </div>
      </div>
      <div style={{ height: "54px" }} />
      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
          <div style={{ width: "260px", background: C.sidebar, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <NavContent />
          </div>
          <div style={{ flex: 1, background: "#00000070" }} onClick={() => setOpen(false)} />
        </div>
      )}
    </>
  );

  return (
    <nav style={{ width: "210px", minHeight: "100vh", background: C.sidebar, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <NavContent />
    </nav>
  );
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ data, goEvent, go, session, update, can }) {
  const todayStr = today();
  const events      = data.events      || [];
  const meetings    = data.meetings    || [];
  const prestations = data.prestations || [];
  const depenses    = data.depenses    || [];

  // ── Financier ──
  const totRev   = events.reduce((a, e) => a + sumArr(e.revenues, "amount"), 0);
  const totExpEv = events.reduce((a, e) => a + sumArr(e.expenses, "amount"), 0);
  const totDepGl = sumArr(depenses, "amount");
  const bankBal  = data.assoc?.bankBalance ?? 0;
  const bilEv    = totRev - totExpEv;

  const pendingReimb = depenses.reduce((a, d) => {
    return a + (d.reimbursements||[]).filter(r => !r.settled).reduce((b, r) => b + r.amount, 0);
  }, 0);

  // ── Agenda ──
  const agendaItems = [
    ...events.filter(e => e.date >= todayStr).map(e => ({ type: "event", date: e.date, label: e.name, id: e.id, color: C.accent, icon: "◆" })),
    ...meetings.filter(m => m.date >= todayStr).map(m => ({ type: "meeting", date: m.date, label: m.location ? `Réunion · ${m.location}` : "Réunion", id: m.id, color: C.info, icon: "◈" })),
    ...prestations.filter(p => p.date >= todayStr && p.statut !== "Annulé").map(p => ({ type: "presta", date: p.date, label: p.label, id: p.id, statut: p.statut, color: statutColor(p.statut) === "green" ? C.accent : statutColor(p.statut) === "red" ? C.danger : C.warn, icon: "◎" })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);

  const pastItems = [
    ...events.filter(e => e.date < todayStr).map(e => ({ type: "event", date: e.date, label: e.name, id: e.id, color: C.muted, icon: "◆" })),
    ...meetings.filter(m => m.date < todayStr).map(m => ({ type: "meeting", date: m.date, label: m.location ? `Réunion · ${m.location}` : "Réunion", id: m.id, color: C.muted, icon: "◈" })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

  // ── Chart événements ──
  const chartData = [...events].sort((a,b) => a.date.localeCompare(b.date)).slice(-8).map(e => ({
    name: e.name.length > 10 ? e.name.slice(0, 10) + "…" : e.name,
    Dépenses: sumArr(e.expenses, "amount"),
    Recettes: sumArr(e.revenues, "amount"),
  }));

  // ── Pie dépenses par catégorie (events + global) ──
  const catMap = {};
  events.forEach(e => (e.expenses||[]).forEach(ex => { catMap[ex.category] = (catMap[ex.category]||0) + ex.amount; }));
  depenses.forEach(d => { catMap[d.category] = (catMap[d.category]||0) + d.amount; });
  const pieData = Object.entries(catMap).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a,b) => b.value - a.value);
  const PIE_COLORS = [C.accent, C.info, C.warn, C.danger, "#c84dff", "#4affa0", "#ff4dda", "#4dffe8", "#f0a500", "#00c9a7"];

  // ── Prestations par statut ──
  const prestByStatut = PRESTATION_STATUTS.map(st => ({ st, count: prestations.filter(p => p.statut === st).length })).filter(x => x.count > 0);
  const totalPrestaHT = prestations.filter(p => p.statut === "Confirmé").reduce((a, p) => {
    const g = (p.gear||[]).reduce((s, g) => s + g.qty*g.unitPrice*g.days, 0);
    const sv = (p.services||[]).reduce((s, sv) => s + sv.qty*sv.unitPrice, 0);
    return a + g + sv;
  }, 0);

  // ── Jours restants ──
  const daysUntil = (dateStr) => {
    const d = new Date(dateStr) - new Date(todayStr);
    return Math.ceil(d / 86400000);
  };
  const dayLabel = (n) => n === 0 ? "Aujourd'hui" : n === 1 ? "Demain" : `Dans ${n}j`;

  const tooltipStyle = { background: C.card2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 };

  return (
    <div>
      {/* En-tête */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", letterSpacing: "-0.8px", marginBottom: "4px" }}>Tableau de bord</h1>
          <p style={{ color: C.muted, fontSize: "13px" }}>
            {session?.user?.username && <span style={{ color: C.text }}>Bonjour, {session.user.username} · </span>}
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        {data.assoc?.name && <div style={{ fontFamily: C.display, fontSize: "13px", fontWeight: "700", color: C.muted }}>{data.assoc.name}</div>}
      </div>

      {/* KPIs financiers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: "12px", marginBottom: "24px" }}>
        {[
          { label: "Solde bancaire",          value: fmt(bankBal),   color: bankBal >= 0 ? C.accent : C.danger,  sub: "Saisi manuellement" },
          { label: "Recettes événements",      value: fmt(totRev),    color: C.accent,  sub: `${events.length} événement${events.length>1?"s":""}` },
          { label: "Dépenses événements",      value: fmt(totExpEv),  color: C.warn,    sub: null },
          { label: "Bilan net événements",     value: fmt(bilEv),     color: bilEv >= 0 ? C.accent : C.danger, sub: null },
          { label: "Dépenses association",     value: fmt(totDepGl),  color: C.warn,    sub: `${depenses.length} entrée${depenses.length>1?"s":""}` },
          { label: "Remb. en attente",         value: fmt(pendingReimb), color: pendingReimb > 0 ? C.danger : C.muted, sub: pendingReimb > 0 ? "À régler" : "Tout est soldé" },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={s.card()}>
            <div style={s.label}>{label}</div>
            <div style={{ fontFamily: C.mono, fontSize: "18px", color, marginTop: "4px", marginBottom: sub ? "4px" : 0 }}>{value}</div>
            {sub && <div style={{ fontSize: "10px", color: C.muted }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* KPIs activité */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px", marginBottom: "28px" }}>
        {[
          { label: "Événements", value: events.length, sub: `${events.filter(e=>e.date>=todayStr).length} à venir`, color: C.accent, page: "events" },
          { label: "Prestations", value: prestations.length, sub: `${prestations.filter(p=>p.statut==="Confirmé").length} confirmée${prestations.filter(p=>p.statut==="Confirmé").length>1?"s":""}`, color: C.info, page: "prestations" },
          { label: "Réunions", value: meetings.length, sub: `${meetings.filter(m=>m.date>=todayStr).length} à venir`, color: C.warn, page: "meetings" },
          { label: "CA confirmé", value: fmt(totalPrestaHT), sub: "Prestations confirmées", color: C.accent, page: "prestations" },
        ].map(({ label, value, sub, color, page }) => (
          <div key={label} style={{ ...s.card(), cursor: "pointer" }} onClick={() => go(page)}>
            <div style={s.label}>{label}</div>
            <div style={{ fontFamily: C.mono, fontSize: "22px", color, marginTop: "2px" }}>{value}</div>
            <div style={{ fontSize: "10px", color: C.muted, marginTop: "4px" }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Agenda */}
      <div style={s.card({ marginBottom: "24px" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px" }}>Agenda à venir</div>
          <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: C.muted }}>
            <span><span style={{ color: C.accent }}>◆</span> Événements</span>
            <span><span style={{ color: C.info }}>◈</span> Réunions</span>
            <span><span style={{ color: C.warn }}>◎</span> Prestations</span>
          </div>
        </div>
        {agendaItems.length === 0 ? (
          <p style={{ color: C.muted, fontSize: "13px" }}>Aucune échéance à venir.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {agendaItems.map((item, i) => {
              const days = daysUntil(item.date);
              return (
                <div key={i} onClick={() => item.type === "event" ? goEvent(item.id) : go(item.type === "meeting" ? "meetings" : "prestations")}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "9px 12px", background: C.card2, borderRadius: "8px", cursor: "pointer", borderLeft: `3px solid ${item.color}` }}>
                  <div style={{ width: "70px", flexShrink: 0, textAlign: "right" }}>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: days === 0 ? C.warn : days <= 7 ? C.accent : C.text }}>{dayLabel(days)}</div>
                    <div style={{ fontSize: "10px", color: C.muted }}>{new Date(item.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
                  </div>
                  <span style={{ fontSize: "13px", color: item.color }}>{item.icon}</span>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontWeight: "500", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                    {item.type === "presta" && item.statut && <div style={{ fontSize: "11px", color: C.muted }}>{item.statut}</div>}
                  </div>
                  {days === 0 && <span style={{ fontSize: "11px", background: `${C.warn}25`, color: C.warn, padding: "2px 8px", borderRadius: "20px", flexShrink: 0 }}>Aujourd'hui</span>}
                  {days > 0 && days <= 7 && <span style={{ fontSize: "11px", background: `${C.accent}20`, color: C.accent, padding: "2px 8px", borderRadius: "20px", flexShrink: 0 }}>Cette semaine</span>}
                </div>
              );
            })}
          </div>
        )}
        {pastItems.length > 0 && (
          <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: "11px", color: C.muted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Récent</div>
            {pastItems.map((item, i) => (
              <div key={i} onClick={() => item.type === "event" ? goEvent(item.id) : go("meetings")}
                style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 10px", cursor: "pointer", opacity: 0.6 }}>
                <span style={{ fontSize: "12px", color: C.muted }}>{item.icon}</span>
                <span style={{ fontSize: "12px", color: C.muted, flex: 1 }}>{item.label}</span>
                <span style={{ fontSize: "11px", color: C.muted }}>{new Date(item.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mes tâches */}
      {(() => {
        const username = session?.user?.username;
        const myTodos  = (data.todos || []).filter(t => t.status !== "terminé" && t.assignees?.includes(username));
        if (!username || myTodos.length === 0) return null;
        const prioColor = { haute: C.danger, normale: C.info, basse: C.muted };
        const stColor   = { à_faire: C.muted, en_cours: C.warn, terminé: C.accent };
        const isAdmin   = can && can("web_admin");
        const setStatus = (id, status) => update({ todos: (data.todos||[]).map(t => t.id !== id ? t : { ...t, status, statusBy: username, statusAt: today() }) });
        return (
          <div style={s.card({ marginBottom: "24px" })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px" }}>
                Mes tâches
                <span style={{ fontSize: "12px", color: C.warn, fontWeight: "400", marginLeft: "8px" }}>{myTodos.length} en cours</span>
              </div>
              <button style={s.btn("ghost", { padding: "4px 10px", fontSize: "11px" })} onClick={() => go("todos")}>Tout voir →</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {myTodos.map(t => {
                const co = (t.assignees || []).filter(a => a !== username);
                const canChange = isAdmin || t.assignees?.includes(username);
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: C.card2, borderRadius: "8px", borderLeft: `3px solid ${prioColor[t.priority] || C.info}`, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: "600", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                      <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {t.dueDate && <span>📅 {t.dueDate}</span>}
                        {co.length > 0 && <span>👥 avec {co.join(", ")}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
                      <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "20px", background: `${stColor[t.status]}20`, color: stColor[t.status], border: `1px solid ${stColor[t.status]}40` }}>
                        {t.status === "à_faire" ? "À faire" : t.status === "en_cours" ? "En cours" : "Terminé"}
                      </span>
                      {canChange && t.status === "à_faire"  && <button onClick={() => setStatus(t.id, "en_cours")} style={s.btn("secondary", { padding: "3px 9px", fontSize: "11px" })}>→ Démarrer</button>}
                      {canChange && t.status === "en_cours" && <button onClick={() => setStatus(t.id, "terminé")} style={s.btn("primary",    { padding: "3px 9px", fontSize: "11px" })}>✓ Terminer</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Graphiques */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px", marginBottom: "24px" }}>
        {chartData.length > 0 && (
          <div style={s.card()}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "16px" }}>Recettes vs Dépenses par événement</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11 }} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={tooltipStyle} formatter={v => fmt(v)} />
                <Bar dataKey="Dépenses" fill={C.warn} radius={[4,4,0,0]} />
                <Bar dataKey="Recettes" fill={C.accent} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {pieData.length > 0 && (
          <div style={s.card()}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "16px" }}>Dépenses par catégorie</div>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={2} dataKey="value">
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={v => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "5px", minWidth: "120px" }}>
                {pieData.map((d, i) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "12px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                    <span style={{ flex: 1, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                    <span style={{ fontFamily: C.mono, color: C.text, flexShrink: 0 }}>{fmt(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Prestations + Réunions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
        <div style={s.card()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px" }}>Prestations</div>
            <button style={s.btn("ghost", { padding: "4px 10px", fontSize: "11px" })} onClick={() => go("prestations")}>Tout voir →</button>
          </div>
          {prestations.length === 0 ? (
            <p style={{ color: C.muted, fontSize: "13px" }}>Aucune prestation.</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
                {prestByStatut.map(({ st, count }) => (
                  <div key={st} style={{ textAlign: "center", flex: 1, background: C.card2, borderRadius: "8px", padding: "8px", minWidth: "70px" }}>
                    <div style={{ fontFamily: C.mono, fontSize: "18px", color: statutColor(st) === "green" ? C.accent : statutColor(st) === "red" ? C.danger : C.warn }}>{count}</div>
                    <div style={{ fontSize: "10px", color: C.muted, marginTop: "2px" }}>{st}</div>
                  </div>
                ))}
              </div>
              {[...prestations].sort((a,b) => b.date?.localeCompare(a.date||"")||0).slice(0, 4).map(p => {
                const t = (p.gear||[]).reduce((a,g)=>a+g.qty*g.unitPrice*g.days,0) + (p.services||[]).reduce((a,sv)=>a+sv.qty*sv.unitPrice,0);
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}`, fontSize: "13px" }}>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label}</div>
                      {p.client?.name && <div style={{ fontSize: "11px", color: C.muted }}>{p.client.name}</div>}
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0, marginLeft: "8px" }}>
                      {t > 0 && <span style={{ fontFamily: C.mono, fontSize: "12px", color: C.accent }}>{fmt(t)}</span>}
                      <Badge color={statutColor(p.statut)}>{p.statut}</Badge>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div style={s.card()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px" }}>Réunions</div>
            <button style={s.btn("ghost", { padding: "4px 10px", fontSize: "11px" })} onClick={() => go("meetings")}>Tout voir →</button>
          </div>
          {meetings.length === 0 ? (
            <p style={{ color: C.muted, fontSize: "13px" }}>Aucune réunion.</p>
          ) : (
            [...meetings].sort((a,b) => b.date?.localeCompare(a.date||"")||0).slice(0, 6).map(m => {
              const isPast = m.date < todayStr;
              const days = daysUntil(m.date);
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "9px 0", borderBottom: `1px solid ${C.border}`, opacity: isPast ? 0.55 : 1 }}>
                  <div style={{ width: "38px", height: "38px", borderRadius: "8px", background: isPast ? C.card2 : `${C.info}20`, border: `1px solid ${isPast ? C.border : C.info+"40"}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: "700", fontFamily: C.mono, color: isPast ? C.muted : C.info, lineHeight: 1 }}>{new Date(m.date).getDate()}</div>
                    <div style={{ fontSize: "9px", color: C.muted, textTransform: "uppercase" }}>{new Date(m.date).toLocaleString("fr-FR", { month: "short" })}</div>
                  </div>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontSize: "13px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.location || "Sans lieu"}</div>
                    <div style={{ fontSize: "11px", color: C.muted }}>{m.attendees ? m.attendees.split(",").length + " participant(s)" : "—"}{isPast ? " · Passée" : days <= 7 ? " · Bientôt" : ""}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── EVENTS LIST ───────────────────────────────────────────────────────────────
function EventsList({ data, update, goEvent, can }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", date: today(), budget: "" });

  const create = () => {
    if (!form.name.trim()) return;
    update(
      { events: [...data.events, { id: uid(), name: form.name, date: form.date, budget: parseFloat(form.budget) || 0, expenses: [], revenues: [], members: [], team: [], gear: [] }] },
      { action: "AJOUT", target: "Événements", details: form.name }
    );
    setForm({ name: "", date: today(), budget: "" });
    setCreating(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", letterSpacing: "-0.8px", marginBottom: "4px" }}>Événements</h1>
          <p style={{ color: C.muted, fontSize: "13px" }}>Gérez vos événements et leur comptabilité</p>
        </div>
        {can("create_event") && <button style={s.btn("primary")} onClick={() => setCreating(!creating)}>+ Nouvel événement</button>}
      </div>
      {creating && (
        <div style={s.card({ marginBottom: "20px", borderColor: C.accentBg })}>
          <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Nouvel événement</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "14px", marginBottom: "14px" }}>
            {[{ key:"name",label:"Nom *",type:"text",ph:"Ex: Gala 2025" },{ key:"date",label:"Date",type:"date" },{ key:"budget",label:"Budget (€)",type:"number",ph:"0" }].map(({ key,label,type,ph }) => (
              <div key={key}>
                <label style={s.label}>{label}</label>
                <input type={type} style={s.inp()} value={form[key]} placeholder={ph} onChange={e => setForm({ ...form, [key]: e.target.value })} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button style={s.btn("primary")} onClick={create}>Créer</button>
            <button style={s.btn("ghost")} onClick={() => setCreating(false)}>Annuler</button>
          </div>
        </div>
      )}
      <div style={{ display: "grid", gap: "14px" }}>
        {data.events.length === 0 && !creating && (
          <div style={{ color: C.muted, textAlign: "center", padding: "70px", fontSize: "14px" }}>Aucun événement pour l'instant.</div>
        )}
        {[...data.events].reverse().map(e => {
          const exp = sumArr(e.expenses, "amount"), rev = sumArr(e.revenues, "amount"), bal = rev - exp;
          const pct = e.budget ? Math.min((exp / e.budget) * 100, 100) : 0;
          return (
            <div key={e.id} style={s.card({ cursor: "pointer" })} onClick={() => goEvent(e.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: C.display, fontSize: "16px", fontWeight: "700" }}>{e.name}</span>
                    <Badge color={bal >= 0 ? "green" : "red"}>{bal >= 0 ? "Bénéficiaire" : "Déficitaire"}</Badge>
                  </div>
                  <div style={{ color: C.muted, fontSize: "12px", marginBottom: "14px" }}>{e.date}</div>
                  <div style={{ display: "flex", gap: "20px", fontFamily: C.mono, fontSize: "13px", flexWrap: "wrap" }}>
                    <span><span style={{ color: C.muted }}>Dép: </span><span style={{ color: C.warn }}>{fmt(exp)}</span></span>
                    <span><span style={{ color: C.muted }}>Rec: </span><span style={{ color: C.accent }}>{fmt(rev)}</span></span>
                    <span><span style={{ color: C.muted }}>Bilan: </span><span style={{ color: bal >= 0 ? C.accent : C.danger }}>{fmt(bal)}</span></span>
                  </div>
                  {e.budget > 0 && (
                    <div style={{ marginTop: "12px" }}>
                      <div style={{ fontSize: "11px", color: C.muted, marginBottom: "4px" }}>Budget utilisé : {Math.round(pct)}%</div>
                      <ProgressBar pct={pct} />
                    </div>
                  )}
                </div>
                {can("edit_event") && (
                  <button onClick={ev => { ev.stopPropagation(); if (confirm("Supprimer cet événement ?")) update({ events: data.events.filter(x => x.id !== e.id) }, { action: "SUPPR", target: "Événements", details: e.name }); }}
                    style={s.btn("danger", { padding: "6px 10px", fontSize: "11px", marginLeft: "16px" })}>Supprimer</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EVENT DETAIL ──────────────────────────────────────────────────────────────
function EventDetail({ data, update, eventId, back, can, users, contacts = [] }) {
  const [tab, setTab] = useState("overview");
  const event = data.events.find(e => e.id === eventId);
  if (!event) return null;
  const upd = (patch) => {
    const globalPatch = { events: data.events.map(e => e.id === eventId ? { ...e, ...patch } : e) };
    // Auto-sync nouveaux membres → pool global
    if (patch.members) {
      const currentPool = data.depensesPool || [];
      const newToPool = patch.members.filter(m => !currentPool.find(p => p.name === m.name));
      if (newToPool.length > 0) {
        globalPatch.depensesPool = [...currentPool, ...newToPool.map(m => ({ name: m.name }))];
      }
    }
    update(globalPatch);
  };
  const TABS = [
    { id:"overview", label:"Vue d'ensemble" },
    { id:"team",     label:"Équipe" },
    { id:"gear",     label:"Matériel" },
    { id:"expenses", label:"Dépenses" },
    { id:"revenues", label:"Recettes" },
    { id:"split",    label:"Partage" },
    { id:"report",   label:"Compte-rendu" },
  ];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "28px", flexWrap: "wrap" }}>
        <button style={s.btn("ghost", { padding: "7px 12px", fontSize: "12px" })} onClick={back}>← Retour</button>
        <div>
          <h1 style={{ fontFamily: C.display, fontSize: "24px", fontWeight: "800", letterSpacing: "-0.8px" }}>{event.name}</h1>
          <p style={{ color: C.muted, fontSize: "13px" }}>{event.date}</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: "3px", background: C.card, padding: "4px", borderRadius: "10px", width: "fit-content", marginBottom: "22px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "7px 14px", borderRadius: "7px", border: "none", cursor: "pointer", background: tab === t.id ? C.card2 : "transparent", color: tab === t.id ? C.text : C.muted, fontFamily: C.font, fontSize: "13px", fontWeight: tab === t.id ? "500" : "400", transition: "all 0.15s" }}>{t.label}</button>
        ))}
      </div>
      {tab === "overview" && <Overview event={event} upd={upd} can={can} contacts={contacts} />}
      {tab === "team"     && <EventTeam event={event} upd={upd} can={can} users={users} />}
      {tab === "gear"     && <EventGear event={event} upd={upd} can={can} inventory={data.inventory || []} />}
      {tab === "expenses" && <Expenses event={event} upd={upd} can={can} pool={data.depensesPool || []} />}
      {tab === "revenues" && <Revenues event={event} upd={upd} can={can} />}
      {tab === "split"    && <Split event={event} upd={upd} can={can} pool={data.depensesPool || []} />}
      {tab === "report"   && <Report event={event} assoc={data.assoc} />}
    </div>
  );
}

function Overview({ event, upd, can, contacts = [] }) {
  const [editBudget, setEditBudget] = useState(false);
  const [bv, setBv] = useState(event.budget || "");
  const exp = sumArr(event.expenses, "amount"), rev = sumArr(event.revenues, "amount"), bal = rev - exp;
  const pct = event.budget ? Math.min((exp / event.budget) * 100, 100) : 0;
  const catData = CATS.map(c => ({ name: c, value: sumArr((event.expenses||[]).filter(e => e.category === c), "amount") })).filter(d => d.value > 0);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
      <div style={{ gridColumn: "1/-1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px" }}>
        {[{ label:"Dépenses totales",val:fmt(exp),color:C.warn },{ label:"Recettes totales",val:fmt(rev),color:C.accent },{ label:bal>=0?"Bénéfice net":"Déficit net",val:fmt(Math.abs(bal)),color:bal>=0?C.accent:C.danger }].map(({ label,val,color }) => (
          <div key={label} style={s.card()}><div style={s.label}>{label}</div><div style={{ fontFamily: C.mono, fontSize: "22px", color, marginTop: "4px" }}>{val}</div></div>
        ))}
      </div>
      <div style={s.card()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px" }}>Budget prévisionnel</div>
          {can("edit_event") && <button style={s.btn("ghost", { padding: "5px 10px", fontSize: "11px" })} onClick={() => setEditBudget(!editBudget)}>{editBudget ? "Annuler" : "Modifier"}</button>}
        </div>
        {editBudget ? (
          <div style={{ display: "flex", gap: "8px" }}>
            <input type="number" style={s.inp({ flex: 1 })} value={bv} onChange={e => setBv(e.target.value)} placeholder="Montant en €" />
            <button style={s.btn("primary")} onClick={() => { upd({ budget: parseFloat(bv) || 0 }); setEditBudget(false); }}>OK</button>
          </div>
        ) : event.budget > 0 ? (
          <>
            <div style={{ fontFamily: C.mono, fontSize: "20px", marginBottom: "10px" }}>{fmt(event.budget)}</div>
            <div style={{ fontSize: "11px", color: C.muted, marginBottom: "4px", display: "flex", justifyContent: "space-between" }}><span>Utilisé : {fmt(exp)}</span><span>{Math.round(pct)}%</span></div>
            <ProgressBar pct={pct} />
            {exp > event.budget && <div style={{ marginTop: "8px", color: C.danger, fontSize: "12px" }}>⚠ Dépassement de {fmt(exp - event.budget)}</div>}
          </>
        ) : <div style={{ color: C.muted, fontSize: "13px" }}>Aucun budget défini.</div>}
      </div>
      {catData.length > 0 ? (
        <div style={s.card()}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px" }}>Dépenses par catégorie</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart><Pie data={catData} cx="50%" cy="50%" innerRadius={38} outerRadius={65} dataKey="value" paddingAngle={2}>
              {catData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie><Tooltip contentStyle={{ background: C.card2, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} formatter={v => fmt(v)} /></PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {catData.map((d, i) => <span key={d.name} style={{ fontSize: "11px", color: PALETTE[i % PALETTE.length] }}>● {d.name}: {fmt(d.value)}</span>)}
          </div>
        </div>
      ) : (
        <div style={s.card({ display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: "13px" })}>Ajoutez des dépenses pour voir le graphique.</div>
      )}
      {contacts.length > 0 && (
        <div style={{ gridColumn: "1/-1", ...s.card() }}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "12px" }}>Contacts liés</div>
          <LinkedContacts linkedIds={event.linkedContacts||[]} contacts={contacts} onChange={ids => upd({ linkedContacts: ids })} />
        </div>
      )}
    </div>
  );
}

function Expenses({ event, upd, can, pool = [] }) {
  const expenses = event.expenses || [];
  const canEdit = can("edit_event");

  // Couverture bancaire globale (niveau événement)
  const allBankCovered = expenses.length > 0 && expenses.every(ex => ex.bankCoverage);
  const someBankCovered = expenses.some(ex => ex.bankCoverage);
  const toggleAllBankCoverage = () => {
    const next = !allBankCovered;
    upd({ expenses: expenses.map(ex => ({ ...ex, bankCoverage: next })) });
  };

  const [form, setForm] = useState({ label: "", amount: "", category: "Divers", paidBy: "", date: today(), bankCoverage: false });
  const add = () => {
    if (!form.label || !form.amount) return;
    upd({ expenses: [...expenses, { id: uid(), label: form.label, amount: parseFloat(form.amount), category: form.category, paidBy: form.paidBy, date: form.date || today(), bankCoverage: form.bankCoverage }] });
    setForm({ label: "", amount: "", category: "Divers", paidBy: "", date: today(), bankCoverage: false });
  };

  // Inline edit
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const startEdit = (ex) => { setEditingId(ex.id); setEditForm({ label: ex.label, amount: String(ex.amount), category: ex.category, paidBy: ex.paidBy||"", date: ex.date||"", bankCoverage: ex.bankCoverage||false }); };
  const saveEdit = () => {
    upd({ expenses: expenses.map(ex => ex.id === editingId ? { ...ex, label: editForm.label, amount: parseFloat(editForm.amount)||0, category: editForm.category, paidBy: editForm.paidBy, date: editForm.date, bankCoverage: editForm.bankCoverage } : ex) });
    setEditingId(null);
  };

  // Bulk selection
  const [selected, setSelected] = useState(new Set());
  const [bulkForm, setBulkForm] = useState({ category: "", paidBy: "", date: "", bankCoverage: null });
  const toggleSel = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = expenses.length > 0 && selected.size === expenses.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(expenses.map(e => e.id)));
  const applyBulk = () => {
    upd({ expenses: expenses.map(ex => selected.has(ex.id) ? {
      ...ex,
      ...(bulkForm.category ? { category: bulkForm.category } : {}),
      ...(bulkForm.paidBy ? { paidBy: bulkForm.paidBy } : {}),
      ...(bulkForm.date ? { date: bulkForm.date } : {}),
      ...(bulkForm.bankCoverage !== null ? { bankCoverage: bulkForm.bankCoverage } : {}),
    } : ex) });
    setSelected(new Set()); setBulkForm({ category: "", paidBy: "", date: "", bankCoverage: null });
  };
  const bulkDelete = () => {
    if (!confirm(`Supprimer ${selected.size} dépense(s) ?`)) return;
    upd({ expenses: expenses.filter(ex => !selected.has(ex.id)) });
    setSelected(new Set());
  };

  const bankTotal = sumArr(expenses.filter(ex => ex.bankCoverage), "amount");

  return (
    <div>
      {/* Toggle couverture bancaire globale */}
      {expenses.length > 0 && canEdit && (
        <div style={{ ...s.card({ marginBottom: "14px" }), borderColor: someBankCovered ? `${C.info}40` : C.border, background: someBankCovered ? `${C.info}08` : C.card }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", color: C.info }}>Couverture bancaire de l'événement</div>
              <div style={{ fontSize: "12px", color: C.muted, marginTop: "2px" }}>
                {allBankCovered ? `Toutes les dépenses sont couvertes par la banque (${fmt(bankTotal)})` : someBankCovered ? `${expenses.filter(ex => ex.bankCoverage).length} dépense(s) couverte(s) sur ${expenses.length} · ${fmt(bankTotal)}` : "Aucune dépense couverte par la banque"}
              </div>
            </div>
            <button
              style={s.btn(allBankCovered ? "danger" : "ghost", { fontSize: "12px", padding: "7px 14px", borderColor: C.info, color: allBankCovered ? undefined : C.info })}
              onClick={toggleAllBankCoverage}
            >
              {allBankCovered ? "Désactiver la couverture bancaire" : "Tout couvrir par la banque"}
            </button>
          </div>
        </div>
      )}

      {canEdit && (
        <div style={s.card({ marginBottom: "14px", borderColor: C.accentBg })}>
          <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Ajouter une dépense</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px", alignItems: "end", marginBottom: "10px" }}>
            <div><label style={s.label}>Libellé *</label><input style={s.inp()} value={form.label} placeholder="Nom de la dépense" onChange={e => setForm({ ...form, label: e.target.value })} /></div>
            <div><label style={s.label}>Montant (€) *</label><input type="number" style={s.inp()} value={form.amount} placeholder="0.00" onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
            <div><label style={s.label}>Catégorie</label><select style={s.inp()} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><label style={s.label}>Payé par</label>
              <select style={s.inp()} value={form.paidBy} onChange={e => setForm({ ...form, paidBy: e.target.value })}>
                <option value="">— sélectionner —</option>
                {pool.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div><label style={s.label}>Date</label><input type="date" style={s.inp()} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: C.card2, borderRadius: "8px", cursor: "pointer" }} onClick={() => setForm({ ...form, bankCoverage: !form.bankCoverage })}>
              <div style={{ width: "16px", height: "16px", borderRadius: "4px", border: `2px solid ${form.bankCoverage ? C.info : C.border}`, background: form.bankCoverage ? `${C.info}30` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {form.bankCoverage && <span style={{ color: C.info, fontSize: "10px", fontWeight: "700" }}>✓</span>}
              </div>
              <span style={{ fontSize: "12px", color: form.bankCoverage ? C.info : C.muted }}>Couverture bancaire</span>
            </div>
            <button style={s.btn("primary")} onClick={add}>+ Ajouter</button>
          </div>
        </div>
      )}

      <div style={s.card()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {canEdit && expenses.length > 0 && (
              <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: "pointer" }} title="Tout sélectionner" />
            )}
            <span style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px" }}>Dépenses ({expenses.length})</span>
          </div>
          <span style={{ fontFamily: C.mono, fontSize: "13px", color: C.warn }}>Total : {fmt(sumArr(expenses, "amount"))}</span>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && canEdit && (
          <div style={{ background: C.accentBg, border: `1px solid ${C.accent}30`, borderRadius: "8px", padding: "10px 14px", marginBottom: "12px", display: "flex", gap: "10px", alignItems: "flex-end", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", color: C.accent, fontWeight: "600", alignSelf: "center" }}>{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</span>
            <div><label style={s.label}>Catégorie</label>
              <select style={s.inp({ width: "auto" })} value={bulkForm.category} onChange={e => setBulkForm({ ...bulkForm, category: e.target.value })}>
                <option value="">— inchangée —</option>{CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label style={s.label}>Payé par</label>
              <select style={s.inp({ width: "140px" })} value={bulkForm.paidBy} onChange={e => setBulkForm({ ...bulkForm, paidBy: e.target.value })}>
                <option value="">— inchangé —</option>
                {pool.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>
            <div><label style={s.label}>Date</label><input type="date" style={s.inp({ width: "140px" })} value={bulkForm.date} onChange={e => setBulkForm({ ...bulkForm, date: e.target.value })} /></div>
            <div><label style={s.label}>Banque</label>
              <select style={s.inp({ width: "120px" })} value={bulkForm.bankCoverage === null ? "" : String(bulkForm.bankCoverage)} onChange={e => setBulkForm({ ...bulkForm, bankCoverage: e.target.value === "" ? null : e.target.value === "true" })}>
                <option value="">— inchangée —</option>
                <option value="true">Couverte</option>
                <option value="false">Non couverte</option>
              </select>
            </div>
            <button style={s.btn("primary", { padding: "7px 12px", fontSize: "12px" })} onClick={applyBulk}>Appliquer</button>
            <button style={s.btn("danger", { padding: "7px 12px", fontSize: "12px" })} onClick={bulkDelete}>Supprimer</button>
            <button style={s.btn("ghost", { padding: "7px 12px", fontSize: "12px" })} onClick={() => setSelected(new Set())}>Annuler</button>
          </div>
        )}

        {expenses.length === 0 ? (
          <p style={{ color: C.muted, fontSize: "13px" }}>Aucune dépense.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {expenses.map(ex => (
              <div key={ex.id}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", background: selected.has(ex.id) ? `${C.accent}10` : editingId === ex.id ? C.card2 : "transparent", borderRadius: "7px", cursor: "default", border: `1px solid ${selected.has(ex.id) ? C.accent+"30" : "transparent"}` }}>
                  {canEdit && <input type="checkbox" checked={selected.has(ex.id)} onChange={() => toggleSel(ex.id)} style={{ cursor: "pointer", flexShrink: 0 }} />}
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: ex.bankCoverage ? C.info : C.warn, flexShrink: 0 }} title={ex.bankCoverage ? "Couverture bancaire" : "Dépense normale"} />
                  <span style={{ flex: 1, fontSize: "13px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ex.label}</span>
                  {ex.bankCoverage && <span style={{ fontSize: "10px", color: C.info, background: `${C.info}15`, padding: "2px 6px", borderRadius: "4px", flexShrink: 0 }}>Banque</span>}
                  <span style={{ fontSize: "11px", color: C.muted, flexShrink: 0 }}>{ex.category}</span>
                  {ex.paidBy && <span style={{ fontSize: "11px", color: C.muted, flexShrink: 0 }}>· {ex.paidBy}</span>}
                  {ex.date && <span style={{ fontSize: "11px", color: C.muted, flexShrink: 0 }}>{ex.date}</span>}
                  <span style={{ fontFamily: C.mono, fontSize: "13px", color: ex.bankCoverage ? C.info : C.warn, flexShrink: 0, fontWeight: "600" }}>{fmt(ex.amount)}</span>
                  {canEdit && (
                    <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                      <button style={s.btn("ghost", { padding: "3px 8px", fontSize: "11px" })} onClick={() => editingId === ex.id ? setEditingId(null) : startEdit(ex)}>
                        {editingId === ex.id ? "✕" : "Modifier"}
                      </button>
                      <button style={s.btn("danger", { padding: "3px 8px", fontSize: "11px" })} onClick={() => upd({ expenses: expenses.filter(e => e.id !== ex.id) })}>✕</button>
                    </div>
                  )}
                </div>
                {editingId === ex.id && (
                  <div style={{ background: C.card2, borderRadius: "8px", padding: "12px", margin: "4px 0 6px 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px", alignItems: "end" }}>
                    <div><label style={s.label}>Libellé</label><input style={s.inp()} value={editForm.label} onChange={e => setEditForm({ ...editForm, label: e.target.value })} /></div>
                    <div><label style={s.label}>Montant (€)</label><input type="number" style={s.inp()} value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: e.target.value })} /></div>
                    <div><label style={s.label}>Catégorie</label><select style={s.inp()} value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
                    <div><label style={s.label}>Payé par</label>
                      <select style={s.inp()} value={editForm.paidBy} onChange={e => setEditForm({ ...editForm, paidBy: e.target.value })}>
                        <option value="">— sélectionner —</option>
                        {pool.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                        {editForm.paidBy && !pool.find(p => p.name === editForm.paidBy) && (
                          <option value={editForm.paidBy}>{editForm.paidBy} (hors pool)</option>
                        )}
                      </select>
                    </div>
                    <div><label style={s.label}>Date</label><input type="date" style={s.inp()} value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })} /></div>
                    <div>
                      <label style={s.label}>Couverture bancaire</label>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", background: C.card, borderRadius: "7px", cursor: "pointer", marginTop: "2px" }} onClick={() => setEditForm({ ...editForm, bankCoverage: !editForm.bankCoverage })}>
                        <div style={{ width: "16px", height: "16px", borderRadius: "4px", border: `2px solid ${editForm.bankCoverage ? C.info : C.border}`, background: editForm.bankCoverage ? `${C.info}30` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {editForm.bankCoverage && <span style={{ color: C.info, fontSize: "10px", fontWeight: "700" }}>✓</span>}
                        </div>
                        <span style={{ fontSize: "12px", color: editForm.bankCoverage ? C.info : C.muted }}>{editForm.bankCoverage ? "Activée" : "Désactivée"}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                      <button style={s.btn("primary", { padding: "8px 14px" })} onClick={saveEdit}>Enregistrer</button>
                      <button style={s.btn("ghost", { padding: "8px 12px" })} onClick={() => setEditingId(null)}>Annuler</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Revenues({ event, upd, can }) {
  const [form, setForm] = useState({ label: "", amount: "", type: "Billetterie" });
  const add = () => {
    if (!form.label || !form.amount) return;
    upd({ revenues: [...(event.revenues||[]), { id: uid(), label: form.label, amount: parseFloat(form.amount), type: form.type, date: today() }] });
    setForm({ label: "", amount: "", type: "Billetterie" });
  };
  const rev = sumArr(event.revenues, "amount"), exp = sumArr(event.expenses, "amount"), bal = rev - exp;
  return (
    <div>
      {can("edit_event") && (
        <div style={s.card({ marginBottom: "14px", borderColor: C.accentBg })}>
          <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Ajouter une recette</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", alignItems: "end", marginBottom: "10px" }}>
            <div><label style={s.label}>Libellé *</label><input style={s.inp()} value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Source de recette" /></div>
            <div><label style={s.label}>Montant (€) *</label><input type="number" style={s.inp()} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
            <div><label style={s.label}>Type</label><select style={s.inp()} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{REV_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          </div>
          <button style={s.btn("primary")} onClick={add}>+ Ajouter</button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px", marginBottom: "14px" }}>
        {[{ label:"Recettes",v:fmt(rev),color:C.accent },{ label:"Dépenses",v:fmt(exp),color:C.warn },{ label:bal>=0?"À redistribuer":"À financer",v:fmt(Math.abs(bal)),color:bal>=0?C.accent:C.danger }].map(({ label,v,color }) => (
          <div key={label} style={s.card({ borderColor: color + "30" })}><div style={s.label}>{label}</div><div style={{ fontFamily: C.mono, fontSize: "20px", color }}>{v}</div></div>
        ))}
      </div>
      <div style={s.card()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px" }}>
          <span style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px" }}>Recettes ({(event.revenues||[]).length})</span>
          <span style={{ fontFamily: C.mono, fontSize: "13px", color: C.accent }}>Total : {fmt(rev)}</span>
        </div>
        <DataTable
          headers={["Date","Libellé","Type","Montant",""]}
          rows={(event.revenues||[]).map(r => [
            <span style={{ color: C.muted, fontSize: "12px" }}>{r.date}</span>,
            r.label,
            <Badge color="green">{r.type}</Badge>,
            <span style={{ fontFamily: C.mono, color: C.accent }}>{fmt(r.amount)}</span>,
            can("edit_event") ? <button style={s.btn("danger", { padding: "3px 8px", fontSize: "11px" })} onClick={() => upd({ revenues: event.revenues.filter(x => x.id !== r.id) })}>✕</button> : null,
          ])}
          empty="Aucune recette."
        />
      </div>
    </div>
  );
}

function Split({ event, upd, can, pool = [] }) {
  const [nm, setNm] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const members = event.members || [];
  const regularExpenses = (event.expenses||[]).filter(ex => !ex.bankCoverage);
  const bankExpenses    = (event.expenses||[]).filter(ex =>  ex.bankCoverage);

  // Tricount sur les dépenses non-bancaires uniquement
  const regularTotal = sumArr(regularExpenses, "amount");
  const perPerson = members.length > 0 ? regularTotal / members.length : 0;
  const paidMap = {};
  regularExpenses.forEach(ex => { if (ex.paidBy) paidMap[ex.paidBy] = (paidMap[ex.paidBy]||0) + ex.amount; });
  const balances = members.map(m => ({ ...m, paid: paidMap[m.name]||0, share: perPerson, balance: (paidMap[m.name]||0) - perPerson }));

  // Flux bancaires : agrégés par personne (net)
  const bankTotal = sumArr(bankExpenses, "amount");
  const bankToMember = {}, memberToBank = {};
  bankExpenses.forEach(ex => {
    const n = members.length;
    const share = n > 0 ? ex.amount / n : 0;
    if (ex.paidBy) bankToMember[ex.paidBy] = (bankToMember[ex.paidBy]||0) + ex.amount;
    members.forEach(m => { memberToBank[m.name] = (memberToBank[m.name]||0) + share; });
  });
  const bankNetList = members.map(m => ({
    name: m.name,
    owes: memberToBank[m.name] || 0,
    receives: bankToMember[m.name] || 0,
    net: (memberToBank[m.name]||0) - (bankToMember[m.name]||0),
  }));

  const addMember = (name) => {
    if (!name.trim() || members.find(m => m.name === name.trim())) return;
    upd({ members: [...members, { id: uid(), name: name.trim() }] });
    setNm(""); setSelectedUser("");
  };
  const existingNames = members.map(m => m.name);
  const availablePool = pool.filter(p => !existingNames.includes(p.name));
  return (
    <div>
      <div style={s.card({ marginBottom: "14px" })}>
        <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Membres du groupe</div>
        {can("edit_event") && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
            {availablePool.length > 0 && (
              <select style={s.inp({ flex: 1, minWidth: "120px" })} value={selectedUser} onChange={e => { if (e.target.value) { addMember(e.target.value); } setSelectedUser(""); }}>
                <option value="">+ Depuis le pool global…</option>
                {availablePool.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            )}
            <input style={s.inp({ flex: 1, minWidth: "140px" })} value={nm} placeholder="Ou saisir un nom libre…" onChange={e => setNm(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addMember(nm); }} />
            <button style={s.btn("primary")} onClick={() => addMember(nm)}>Ajouter</button>
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          {members.map(m => (
            <span key={m.id} style={{ background: C.card2, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "4px 12px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
              {m.name}
              {can("edit_event") && <button onClick={() => upd({ members: members.filter(x => x.id !== m.id) })} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "12px", padding: 0 }}>✕</button>}
            </span>
          ))}
        </div>
      </div>

      {/* Dépenses couvertes par la banque */}
      {members.length > 0 && bankExpenses.length > 0 && (
        <div style={{ ...s.card({ marginBottom: "14px" }), borderColor: `${C.info}40`, background: `${C.info}06` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", color: C.info }}>Couverture bancaire</div>
            <span style={{ fontFamily: C.mono, fontSize: "13px", color: C.info }}>{fmt(bankTotal)} · {bankExpenses.length} dépense(s)</span>
          </div>
          <div style={{ fontSize: "11px", color: C.muted, marginBottom: "12px" }}>
            Flux : <strong style={{ color: C.info }}>Banque → membre ayant avancé</strong>, puis <strong style={{ color: C.warn }}>chaque membre → Banque</strong> pour sa part
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {bankNetList.map(b => (
              <div key={b.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: C.card2, borderRadius: "8px", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: "500" }}>{b.name}</span>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  {b.receives > 0 && <span style={{ fontSize: "12px", color: C.accent }}>← reçoit {fmt(b.receives)}</span>}
                  {b.owes > 0     && <span style={{ fontSize: "12px", color: C.warn }}>→ doit {fmt(b.owes)}</span>}
                  <span style={{ fontFamily: C.mono, fontSize: "13px", fontWeight: "700", color: Math.abs(b.net) < 0.01 ? C.muted : b.net > 0 ? C.warn : C.accent }}>
                    {Math.abs(b.net) < 0.01 ? "Équilibré" : b.net > 0 ? `→ Banque : ${fmt(b.net)}` : `← Banque : ${fmt(-b.net)}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {members.length > 0 && (
        <div style={s.card()}>
          <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>
            Répartition des dépenses {bankExpenses.length > 0 ? "(hors couverture bancaire)" : ""}
          </div>
          {regularExpenses.length === 0 ? (
            <p style={{ color: C.muted, fontSize: "13px" }}>Toutes les dépenses sont couvertes par la banque.</p>
          ) : (
            <>
              <div style={{ padding: "12px 14px", background: C.card2, borderRadius: "8px", marginBottom: "16px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ color: C.muted, fontSize: "13px" }}>Total : <strong style={{ color: C.warn, fontFamily: C.mono }}>{fmt(regularTotal)}</strong></span>
                <span style={{ color: C.muted, fontSize: "13px" }}>Part / personne ({members.length}) : <strong style={{ color: C.accent, fontFamily: C.mono }}>{fmt(perPerson)}</strong></span>
              </div>
              <DataTable
                headers={["Membre","A payé","Sa part","Solde","Statut"]}
                rows={balances.map(b => [
                  <strong>{b.name}</strong>,
                  <span style={{ fontFamily: C.mono }}>{fmt(b.paid)}</span>,
                  <span style={{ fontFamily: C.mono }}>{fmt(b.share)}</span>,
                  <span style={{ fontFamily: C.mono, color: b.balance >= 0 ? C.accent : C.danger }}>{b.balance >= 0 ? "+" : ""}{fmt(b.balance)}</span>,
                  <Badge color={b.balance > 0.01 ? "green" : b.balance < -0.01 ? "red" : "neutral"}>{b.balance > 0.01 ? `Doit recevoir ${fmt(b.balance)}` : b.balance < -0.01 ? `Doit payer ${fmt(Math.abs(b.balance))}` : "Équilibré"}</Badge>,
                ])}
                empty=""
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Report({ event, assoc }) {
  const exp = sumArr(event.expenses, "amount"), rev = sumArr(event.revenues, "amount"), bal = rev - exp;
  const generate = () => {
    const catTotals = CATS.map(c => ({ c, v: sumArr((event.expenses||[]).filter(e => e.category === c), "amount") })).filter(x => x.v > 0);
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Compte-rendu — ${event.name}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a2e;padding:48px;font-size:13px}
h2{font-size:14px;margin:28px 0 10px;color:#333;border-bottom:1px solid #eee;padding-bottom:6px}
.top{display:flex;justify-content:space-between;margin-bottom:36px}.title{font-size:26px;font-weight:800;letter-spacing:-1px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:24px}
.kpi{border:1px solid #e0e0e0;border-radius:8px;padding:14px}.kpi-l{font-size:10px;text-transform:uppercase;color:#999;letter-spacing:.5px;margin-bottom:4px}.kpi-v{font-size:20px;font-weight:700;font-family:'Courier New',monospace}
table{width:100%;border-collapse:collapse;margin-bottom:8px}th{text-align:left;padding:8px;font-size:10px;text-transform:uppercase;background:#f5f5f5;color:#888}
td{padding:8px;border-bottom:1px solid #f0f0f0}.amt{text-align:right;font-family:'Courier New',monospace}
.tf td{font-weight:700;border-top:2px solid #222;font-size:14px}
footer{margin-top:48px;padding-top:14px;border-top:1px solid #eee;color:#bbb;font-size:11px}
@media print{body{padding:24px}}</style></head><body>
<div class="top">
  <div>${assoc.logo ? `<img src="${assoc.logo}" style="height:50px;margin-bottom:10px;display:block">` : ""}
    <strong style="font-size:16px">${assoc.name||"Association"}</strong><br>
    <span style="color:#888;font-size:12px">${assoc.address||""}</span>
  </div>
  <div style="text-align:right">
    <div class="title">Compte-rendu financier</div>
    <div style="font-size:15px;color:#555;margin:4px 0">${event.name}</div>
    <div style="color:#999;font-size:12px">Date : ${event.date}</div>
  </div>
</div>
<div class="kpis">
  <div class="kpi"><div class="kpi-l">Recettes totales</div><div class="kpi-v" style="color:#2e7d32">${fmt(rev)}</div></div>
  <div class="kpi"><div class="kpi-l">Dépenses totales</div><div class="kpi-v" style="color:#c75000">${fmt(exp)}</div></div>
  <div class="kpi"><div class="kpi-l">${bal>=0?"Bénéfice net":"Déficit net"}</div><div class="kpi-v" style="color:${bal>=0?"#2e7d32":"#c62828"}">${fmt(Math.abs(bal))}</div></div>
</div>
<h2>Dépenses par catégorie</h2>
<table><thead><tr><th>Catégorie</th><th class="amt">Montant</th></tr></thead><tbody>
${catTotals.map(x=>`<tr><td>${x.c}</td><td class="amt">${fmt(x.v)}</td></tr>`).join("")}
<tr class="tf"><td>TOTAL</td><td class="amt">${fmt(exp)}</td></tr></tbody></table>
<h2>Détail des dépenses</h2>
<table><thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Payé par</th><th class="amt">Montant</th></tr></thead><tbody>
${(event.expenses||[]).map(e=>`<tr><td>${e.date}</td><td>${e.label}</td><td>${e.category}</td><td>${e.paidBy||"—"}</td><td class="amt">${fmt(e.amount)}</td></tr>`).join("")}
<tr class="tf"><td colspan="4">TOTAL</td><td class="amt">${fmt(exp)}</td></tr></tbody></table>
<h2>Détail des recettes</h2>
<table><thead><tr><th>Date</th><th>Libellé</th><th>Type</th><th class="amt">Montant</th></tr></thead><tbody>
${(event.revenues||[]).map(r=>`<tr><td>${r.date}</td><td>${r.label}</td><td>${r.type}</td><td class="amt">${fmt(r.amount)}</td></tr>`).join("")}
<tr class="tf"><td colspan="3">TOTAL</td><td class="amt">${fmt(rev)}</td></tr></tbody></table>
<footer>${assoc.name||"Association"} · Document généré le ${new Date().toLocaleDateString("fr-FR")}</footer>
</body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); w.onload = () => w.print();
  };
  return (
    <div>
      <div style={s.card({ marginBottom: "14px" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px" }}>Compte-rendu financier PDF</div>
          <button style={s.btn("primary")} onClick={generate}>📄 Générer le PDF</button>
        </div>
        <p style={{ color: C.muted, fontSize: "13px" }}>Génère un document complet avec résumé financier, dépenses par catégorie, détail et recettes.</p>
      </div>
      <div style={s.card()}>
        <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Aperçu rapide</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
          {[{ l:"Recettes",v:fmt(rev),c:C.accent },{ l:"Dépenses",v:fmt(exp),c:C.warn }].map(({ l,v,c }) => (
            <div key={l} style={{ padding: "12px", background: C.card2, borderRadius: "8px" }}><div style={s.label}>{l}</div><div style={{ fontFamily: C.mono, color: c }}>{v}</div></div>
          ))}
        </div>
        <div style={{ padding: "16px", background: bal >= 0 ? C.accentBg : C.dangerBg, borderRadius: "8px", border: `1px solid ${bal >= 0 ? C.accent : C.danger}30` }}>
          <div style={{ fontSize: "11px", color: C.muted, marginBottom: "4px" }}>{bal >= 0 ? "Bénéfice net" : "Déficit"}</div>
          <div style={{ fontFamily: C.mono, fontSize: "22px", color: bal >= 0 ? C.accent : C.danger }}>{fmt(Math.abs(bal))}</div>
        </div>
      </div>
    </div>
  );
}

function EventTeam({ event, upd, can, users }) {
  const [nm, setNm] = useState("");
  const [role, setRole] = useState("");
  const [selUser, setSelUser] = useState("");
  const team = event.team || [];
  const existingNames = team.map(m => m.name);
  const availableUsers = (users || []).filter(u => !existingNames.includes(u.username));

  const add = (name, roleVal) => {
    if (!name.trim()) return;
    upd({ team: [...team, { id: uid(), name: name.trim(), role: roleVal.trim() }] });
    setNm(""); setRole(""); setSelUser("");
  };

  return (
    <div>
      <div style={s.card({ marginBottom: "14px" })}>
        <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Équipe de l'événement</div>
        {can("edit_event") && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 2, minWidth: "140px" }}>
              <label style={s.label}>Membre</label>
              {availableUsers.length > 0 && (
                <select style={{ ...s.inp(), marginBottom: "6px" }} value={selUser} onChange={e => { setSelUser(e.target.value); if (e.target.value) setNm(""); }}>
                  <option value="">— Sélectionner dans la liste —</option>
                  {availableUsers.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                </select>
              )}
              <input style={s.inp()} value={nm} placeholder="Ou nom libre…" onChange={e => { setNm(e.target.value); setSelUser(""); }} onKeyDown={e => e.key === "Enter" && add(selUser || nm, role)} />
            </div>
            <div style={{ flex: 1, minWidth: "120px" }}>
              <label style={s.label}>Rôle</label>
              <input style={s.inp()} value={role} placeholder="Ex: Régisseur son" onChange={e => setRole(e.target.value)} onKeyDown={e => e.key === "Enter" && add(selUser || nm, role)} />
            </div>
            <button style={s.btn("primary", { padding: "9px 14px" })} onClick={() => add(selUser || nm, role)}>+</button>
          </div>
        )}
        {team.length === 0 ? (
          <p style={{ color: C.muted, fontSize: "13px" }}>Aucun membre ajouté.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {team.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: C.card2, borderRadius: "8px" }}>
                <div>
                  <span style={{ fontWeight: "500" }}>{m.name}</span>
                  {m.role && <span style={{ color: C.muted, fontSize: "12px" }}> — {m.role}</span>}
                </div>
                {can("edit_event") && <button onClick={() => upd({ team: team.filter(x => x.id !== m.id) })} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}>✕</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EventGear({ event, upd, can, inventory }) {
  const [gearItem, setGearItem] = useState("");
  const [gearQty, setGearQty] = useState("1");
  const [gearDays, setGearDays] = useState("1");
  const gear = event.gear || [];

  const addGear = () => {
    const item = inventory.find(i => i.id === gearItem);
    if (!item) return;
    upd({ gear: [...gear, { id: uid(), itemId: item.id, itemName: item.name, qty: parseInt(gearQty)||1, days: parseInt(gearDays)||1, unitPrice: item.price, priceType: item.priceType }] });
    setGearItem(""); setGearQty("1"); setGearDays("1");
  };

  const gearTotal = gear.reduce((a, g) => a + (g.qty||1) * (g.unitPrice||0) * (g.days||1), 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px", marginBottom: "16px" }}>
        <div style={s.card()}><div style={s.label}>Matériel ({gear.length} articles)</div><div style={{ fontFamily: C.mono, fontSize: "18px", color: C.warn, marginTop: "4px" }}>{fmt(gearTotal)}</div></div>
      </div>
      <div style={s.card()}>
        <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px" }}>Matériel utilisé (inventaire)</div>
        {inventory.length === 0 ? (
          <p style={{ color: C.muted, fontSize: "13px" }}>Aucun article dans l'inventaire.</p>
        ) : can("edit_event") && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 2, minWidth: "140px" }}>
              <label style={s.label}>Article</label>
              <select style={s.inp()} value={gearItem} onChange={e => setGearItem(e.target.value)}>
                <option value="">— Choisir —</option>
                {inventory.map(i => <option key={i.id} value={i.id}>{i.name} ({fmt(i.price)}{i.priceType})</option>)}
              </select>
            </div>
            <div style={{ width: "60px" }}>
              <label style={s.label}>Qté</label>
              <input type="number" style={s.inp()} value={gearQty} onChange={e => setGearQty(e.target.value)} min="1" />
            </div>
            <div style={{ width: "60px" }}>
              <label style={s.label}>Jours</label>
              <input type="number" style={s.inp()} value={gearDays} onChange={e => setGearDays(e.target.value)} min="1" />
            </div>
            <button style={s.btn("primary", { padding: "9px 14px" })} onClick={addGear}>+</button>
          </div>
        )}
        {gear.length === 0 ? (
          <p style={{ color: C.muted, fontSize: "13px" }}>Aucun matériel ajouté.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {gear.map(g => (
              <div key={g.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: C.card2, borderRadius: "8px", flexWrap: "wrap", gap: "6px" }}>
                <div>
                  <span style={{ fontWeight: "500" }}>{g.itemName}</span>
                  <span style={{ color: C.muted, fontSize: "12px" }}> × {g.qty} · {g.days}j</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontFamily: C.mono, fontSize: "12px", color: C.warn }}>{fmt(g.qty * g.unitPrice * g.days)}</span>
                  {can("edit_event") && <button onClick={() => upd({ gear: gear.filter(x => x.id !== g.id) })} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}>✕</button>}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px", fontFamily: C.mono, fontSize: "13px", color: C.warn }}>
              Total matériel : {fmt(gearTotal)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── INVOICES ──────────────────────────────────────────────────────────────────
function InvoicesPage({ data, update }) {
  const [view, setView] = useState("list");
  const [form, setForm] = useState({ clientName: "", clientAddress: "", date: today(), items: [], notes: "" });
  const [itemF, setItemF] = useState({ label: "", qty: "1", unitPrice: "", unit: "" });
  const [catForm, setCatForm] = useState({ name: "", unitPrice: "", unit: "", description: "" });

  const addLine = (fromCat = null) => {
    if (fromCat) {
      setForm(f => ({ ...f, items: [...f.items, { id: uid(), label: fromCat.name, qty: 1, unitPrice: fromCat.unitPrice, unit: fromCat.unit||"" }] }));
    } else {
      if (!itemF.label || !itemF.unitPrice) return;
      setForm(f => ({ ...f, items: [...f.items, { id: uid(), label: itemF.label, qty: parseFloat(itemF.qty)||1, unitPrice: parseFloat(itemF.unitPrice), unit: itemF.unit }] }));
      setItemF({ label: "", qty: "1", unitPrice: "", unit: "" });
    }
  };

  const saveInvoice = () => {
    if (!form.clientName || form.items.length === 0) return;
    const num = `FAC-${Date.now().toString().slice(-6)}`;
    update({ invoices: [...(data.invoices||[]), { id: uid(), number: num, ...form, createdAt: today() }] }, { action: "AJOUT", target: "Factures", details: `${num} → ${form.clientName}` });
    setForm({ clientName: "", clientAddress: "", date: today(), items: [], notes: "" });
    setView("list");
  };

  const printInv = (inv) => {
    const total = inv.items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Facture ${inv.number}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;padding:48px;font-size:13px;color:#1a1a1a}
.top{display:flex;justify-content:space-between;margin-bottom:40px}.inv-n{font-size:30px;font-weight:800;letter-spacing:-1px}
.cli{background:#f5f5f5;border-radius:8px;padding:16px;margin-bottom:32px}
table{width:100%;border-collapse:collapse;margin-bottom:32px}th{padding:10px;background:#111;color:#fff;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
td{padding:11px 10px;border-bottom:1px solid #f0f0f0}.amt{text-align:right;font-family:'Courier New',monospace}
.tot{display:flex;justify-content:flex-end;margin-bottom:24px}.tot-box{width:260px}
.tr{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eee;font-size:13px}
.tf{font-size:15px;font-weight:700;border-top:2px solid #111;border-bottom:none}
footer{border-top:1px solid #eee;padding-top:14px;color:#bbb;font-size:11px;margin-top:48px}
@media print{body{padding:24px}}</style></head><body>
<div class="top">
  <div>${data.assoc.logo?`<img src="${data.assoc.logo}" style="height:55px;display:block;margin-bottom:10px">`:""}
    <strong style="font-size:16px">${data.assoc.name||"Association"}</strong><br>
    <span style="color:#888">${data.assoc.address||""}</span><br>
    ${data.assoc.email?`<span style="color:#888">${data.assoc.email}</span><br>`:""}
    ${data.assoc.siret?`<span style="color:#888">SIRET : ${data.assoc.siret}</span>`:""}
  </div>
  <div style="text-align:right"><div class="inv-n">FACTURE</div><div style="color:#888;font-size:13px">N° ${inv.number}<br>Date : ${inv.date}</div></div>
</div>
<div class="cli"><div style="font-size:10px;text-transform:uppercase;color:#999;margin-bottom:4px;letter-spacing:.5px">Facturer à</div>
<strong>${inv.clientName}</strong><br><span style="white-space:pre-line;color:#666">${inv.clientAddress||""}</span></div>
<table><thead><tr><th>Désignation</th><th>Unité</th><th style="text-align:right">Qté</th><th style="text-align:right">PU HT</th><th style="text-align:right">Total HT</th></tr></thead><tbody>
${inv.items.map(i=>`<tr><td>${i.label}</td><td style="color:#888">${i.unit||"—"}</td><td class="amt">${i.qty}</td><td class="amt">${fmt(i.unitPrice)}</td><td class="amt">${fmt(i.qty*i.unitPrice)}</td></tr>`).join("")}
</tbody></table>
<div class="tot"><div class="tot-box">
<div class="tr"><span>Total HT</span><span>${fmt(total)}</span></div>
<div class="tr"><span>TVA (0%)</span><span>${fmt(0)}</span></div>
<div class="tr tf"><span>TOTAL TTC</span><span>${fmt(total)}</span></div>
</div></div>
${inv.notes?`<div style="padding:12px;background:#f8f8f8;border-radius:8px;font-size:12px;color:#555;margin-bottom:24px"><strong>Notes :</strong> ${inv.notes}</div>`:""}
<footer>${data.assoc.iban?`IBAN : ${data.assoc.iban}<br>`:""}${data.assoc.name||"Association"} · Généré le ${new Date().toLocaleDateString("fr-FR")}</footer>
</body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); w.onload = () => w.print();
  };

  if (view === "catalog") return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "28px" }}>
        <button style={s.btn("ghost", { padding: "7px 12px", fontSize: "12px" })} onClick={() => setView("list")}>← Retour</button>
        <h1 style={{ fontFamily: C.display, fontSize: "24px", fontWeight: "800", letterSpacing: "-0.8px" }}>Catalogue de prestations</h1>
      </div>
      <div style={s.card({ marginBottom: "14px", borderColor: C.accentBg })}>
        <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Ajouter au catalogue</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", alignItems: "end", marginBottom: "10px" }}>
          {[{ key:"name",label:"Nom *",ph:"Sonorisation..." },{ key:"unitPrice",label:"Prix unit. (€) *",type:"number" },{ key:"unit",label:"Unité",ph:"heure, forfait..." },{ key:"description",label:"Description",ph:"Détail..." }].map(({ key,label,type,ph }) => (
            <div key={key}><label style={s.label}>{label}</label><input type={type||"text"} style={s.inp()} value={catForm[key]} placeholder={ph} onChange={e => setCatForm({ ...catForm, [key]: e.target.value })} /></div>
          ))}
        </div>
        <button style={s.btn("primary")} onClick={() => {
          if (!catForm.name || !catForm.unitPrice) return;
          update({ catalog: [...(data.catalog||[]), { id: uid(), name: catForm.name, unitPrice: parseFloat(catForm.unitPrice), unit: catForm.unit, description: catForm.description }] });
          setCatForm({ name: "", unitPrice: "", unit: "", description: "" });
        }}>+ Ajouter</button>
      </div>
      <div style={s.card()}>
        <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Catalogue ({(data.catalog||[]).length})</div>
        <DataTable
          headers={["Nom","Prix unitaire","Unité","Description",""]}
          rows={(data.catalog||[]).map(c => [
            <strong>{c.name}</strong>,
            <span style={{ fontFamily: C.mono, color: C.accent }}>{fmt(c.unitPrice)}</span>,
            <span style={{ color: C.muted }}>{c.unit||"—"}</span>,
            <span style={{ color: C.muted, fontSize: "12px" }}>{c.description||"—"}</span>,
            <button style={s.btn("danger", { padding: "3px 8px", fontSize: "11px" })} onClick={() => update({ catalog: data.catalog.filter(x => x.id !== c.id) })}>✕</button>,
          ])}
          empty="Aucune prestation dans le catalogue."
        />
      </div>
    </div>
  );

  if (view === "create") {
    const lineTotal = form.items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "28px" }}>
          <button style={s.btn("ghost", { padding: "7px 12px", fontSize: "12px" })} onClick={() => setView("list")}>← Retour</button>
          <h1 style={{ fontFamily: C.display, fontSize: "24px", fontWeight: "800", letterSpacing: "-0.8px" }}>Nouvelle facture</h1>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          <div style={s.card()}>
            <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Informations client</div>
            {[{ key:"clientName",label:"Nom / Raison sociale *" },{ key:"date",label:"Date",type:"date" }].map(({ key,label,type }) => (
              <div key={key} style={{ marginBottom: "12px" }}><label style={s.label}>{label}</label><input type={type||"text"} style={s.inp()} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></div>
            ))}
            <div style={{ marginBottom: "12px" }}><label style={s.label}>Adresse</label><textarea style={{ ...s.inp(), resize: "vertical", height: "66px" }} value={form.clientAddress} onChange={e => setForm({ ...form, clientAddress: e.target.value })} /></div>
            <div><label style={s.label}>Notes</label><textarea style={{ ...s.inp(), resize: "vertical", height: "56px" }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Conditions de paiement…" /></div>
          </div>
          <div>
            <div style={s.card({ marginBottom: "14px" })}>
              <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Ajouter une ligne</div>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 0.7fr 1fr 0.7fr auto", gap: "8px", marginBottom: "12px", alignItems: "end" }}>
                {[{ key:"label",label:"Libellé *" },{ key:"qty",label:"Qté",type:"number" },{ key:"unitPrice",label:"Prix unit.",type:"number" },{ key:"unit",label:"Unité",ph:"h, j…" }].map(({ key,label,type,ph }) => (
                  <div key={key}><label style={s.label}>{label}</label><input type={type||"text"} style={s.inp()} value={itemF[key]} placeholder={ph} onChange={e => setItemF({ ...itemF, [key]: e.target.value })} /></div>
                ))}
                <button style={s.btn("primary", { padding: "9px 12px" })} onClick={() => addLine()}>+</button>
              </div>
              {(data.catalog||[]).length > 0 && (
                <div>
                  <div style={{ fontSize: "11px", color: C.muted, marginBottom: "7px" }}>Depuis le catalogue :</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {(data.catalog||[]).map(c => <button key={c.id} onClick={() => addLine(c)} style={s.btn("secondary", { padding: "4px 10px", fontSize: "12px" })}>+ {c.name} ({fmt(c.unitPrice)})</button>)}
                  </div>
                </div>
              )}
            </div>
            <div style={s.card()}>
              <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "12px" }}>Lignes ({form.items.length})</div>
              {form.items.map(i => (
                <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: "13px" }}>{i.label}{i.unit ? ` (${i.unit})` : ""}</span>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <span style={{ fontFamily: C.mono, fontSize: "12px", color: C.muted }}>{i.qty} × {fmt(i.unitPrice)}</span>
                    <span style={{ fontFamily: C.mono, color: C.accent }}>{fmt(i.qty * i.unitPrice)}</span>
                    <button onClick={() => setForm(f => ({ ...f, items: f.items.filter(x => x.id !== i.id) }))} style={s.btn("danger", { padding: "2px 7px", fontSize: "11px" })}>✕</button>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 0 2px", fontFamily: C.mono, fontSize: "16px", color: C.accent }}>Total HT : {fmt(lineTotal)}</div>
              <button style={{ ...s.btn("primary"), width: "100%", padding: "11px", marginTop: "10px" }} onClick={saveInvoice}>Sauvegarder la facture</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
        <div><h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", letterSpacing: "-0.8px", marginBottom: "4px" }}>Factures</h1><p style={{ color: C.muted, fontSize: "13px" }}>Gérez vos factures de prestations</p></div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button style={s.btn("secondary")} onClick={() => setView("catalog")}>📦 Catalogue</button>
          <button style={s.btn("primary")} onClick={() => setView("create")}>+ Nouvelle facture</button>
        </div>
      </div>
      {(data.invoices||[]).length === 0
        ? <div style={{ color: C.muted, textAlign: "center", padding: "70px", fontSize: "13px" }}>Aucune facture. Alimentez d'abord le catalogue puis créez votre première facture.</div>
        : <div style={{ display: "grid", gap: "12px" }}>
            {[...(data.invoices||[])].reverse().map(inv => {
              const total = inv.items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
              return (
                <div key={inv.id} style={s.card({ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" })}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontFamily: C.display, fontWeight: "700" }}>{inv.number}</span>
                      <span style={{ color: C.muted, fontSize: "13px" }}>→ {inv.clientName}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: C.muted, marginTop: "3px" }}>{inv.date} · {inv.items.length} ligne(s)</div>
                  </div>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <span style={{ fontFamily: C.mono, fontSize: "16px", color: C.accent }}>{fmt(total)}</span>
                    <button style={s.btn("secondary")} onClick={() => printInv(inv)}>🖨 PDF</button>
                    <button style={s.btn("danger", { padding: "8px 10px" })} onClick={() => { if (confirm("Supprimer cette facture ?")) update({ invoices: data.invoices.filter(x => x.id !== inv.id) }); }}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
      }
    </div>
  );
}

// ── INVENTORY ─────────────────────────────────────────────────────────────────
function InventoryPage({ data, update }) {
  const [form, setForm] = useState({ name: "", category: "Technique", qty: "1", price: "", priceType: "/jour", location: "" });
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const inventory = (data.inventory||[]).filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()));

  const add = () => {
    if (!form.name.trim()) return;
    update(
      { inventory: [...(data.inventory||[]), { id: uid(), ...form, qty: parseInt(form.qty)||1, price: parseFloat(form.price)||0 }] },
      { action: "AJOUT", target: "Inventaire", details: form.name }
    );
    setForm({ name: "", category: "Technique", qty: "1", price: "", priceType: "/jour", location: "" });
    setAdding(false);
  };

  const CATS_INV = ["Technique","Son","Lumière","Scène","Transport","Mobilier","Cuisine","Autre"];
  const totalItems = (data.inventory||[]).reduce((a, i) => a + i.qty, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", letterSpacing: "-0.8px", marginBottom: "4px" }}>Inventaire</h1>
          <p style={{ color: C.muted, fontSize: "13px" }}>{totalItems} article(s) au total</p>
        </div>
        <button style={s.btn("primary")} onClick={() => setAdding(!adding)}>+ Ajouter un article</button>
      </div>

      {adding && (
        <div style={s.card({ marginBottom: "20px", borderColor: C.accentBg })}>
          <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Nouvel article</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "14px" }}>
            <div><label style={s.label}>Nom *</label><input style={s.inp()} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nom de l'article" /></div>
            <div><label style={s.label}>Catégorie</label><select style={s.inp()} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATS_INV.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><label style={s.label}>Quantité</label><input type="number" style={s.inp()} value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} min="1" /></div>
            <div><label style={s.label}>Prix</label><input type="number" style={s.inp()} value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="0" /></div>
            <div><label style={s.label}>Tarification</label><select style={s.inp()} value={form.priceType} onChange={e => setForm({ ...form, priceType: e.target.value })}>{["/jour","/heure","/forfait"].map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label style={s.label}>Emplacement</label><input style={s.inp()} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Salle A, Local…" /></div>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button style={s.btn("primary")} onClick={add}>Ajouter</button>
            <button style={s.btn("ghost")} onClick={() => setAdding(false)}>Annuler</button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: "16px" }}>
        <input style={s.inp({ maxWidth: "320px" })} value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un article…" />
      </div>

      <div style={s.card()}>
        <DataTable
          headers={["Nom","Catégorie","Quantité","Prix","Emplacement",""]}
          rows={inventory.map(item => [
            <strong>{item.name}</strong>,
            <Badge color="neutral">{item.category}</Badge>,
            <span style={{ fontFamily: C.mono }}>{item.qty}</span>,
            item.price > 0 ? <span style={{ fontFamily: C.mono, color: C.accent }}>{fmt(item.price)}{item.priceType}</span> : <span style={{ color: C.muted }}>—</span>,
            <span style={{ color: C.muted, fontSize: "12px" }}>{item.location||"—"}</span>,
            <button style={s.btn("danger", { padding: "3px 8px", fontSize: "11px" })} onClick={() => update({ inventory: data.inventory.filter(x => x.id !== item.id) })}>✕</button>,
          ])}
          empty="Aucun article dans l'inventaire."
        />
      </div>
    </div>
  );
}

// ── MEETINGS ──────────────────────────────────────────────────────────────────
function MeetingsPage({ data, update }) {
  const EMPTY = { date: today(), location: "", agenda: "", attendees: "", notes: "" };
  const [adding, setAdding]     = useState(false);
  const [form, setForm]         = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const crRefs = useRef({});

  const meetings = data.meetings || [];

  const add = () => {
    if (!form.date) return;
    update({ meetings: [...meetings, { id: uid(), ...form, createdAt: today() }] },
      { action: "AJOUT", target: "Réunions", details: `Réunion du ${form.date}` });
    setForm(EMPTY); setAdding(false);
  };

  const save = (id) => {
    if (!editForm.date) return;
    update({ meetings: meetings.map(m => m.id !== id ? m : { ...m, ...editForm }) },
      { action: "MODIF", target: "Réunions", details: `Réunion du ${editForm.date}` });
    setEditingId(null); setEditForm(null);
  };

  const del = (id) => {
    if (!confirm("Supprimer cette réunion ?")) return;
    update({ meetings: meetings.filter(m => m.id !== id) });
  };

  const uploadCR = async (id, file) => {
    if (!file) return;
    const result = await store.uploadFile(file);
    if (!result) return;
    update({ meetings: meetings.map(m => m.id !== id ? m : {
      ...m, crFile: { name: result.originalName, url: result.url }
    })});
  };

  const removeCR = (id) => update({ meetings: meetings.map(m => m.id !== id ? m : { ...m, crFile: null }) });

  const MeetingForm = ({ vals, setVals, onSave, onCancel, saveLabel }) => (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "14px" }}>
        <div><label style={s.label}>Date *</label><input type="date" style={s.inp()} value={vals.date} onChange={e => setVals({ ...vals, date: e.target.value })} /></div>
        <div><label style={s.label}>Lieu</label><input style={s.inp()} value={vals.location||""} onChange={e => setVals({ ...vals, location: e.target.value })} placeholder="Salle, visio…" /></div>
        <div><label style={s.label}>Participants</label><input style={s.inp()} value={vals.attendees||""} onChange={e => setVals({ ...vals, attendees: e.target.value })} placeholder="Alice, Bob, Carol…" /></div>
        <div style={{ gridColumn: "1/-1" }}><label style={s.label}>Ordre du jour</label><textarea style={{ ...s.inp(), resize: "vertical", height: "70px" }} value={vals.agenda||""} onChange={e => setVals({ ...vals, agenda: e.target.value })} placeholder="Points abordés…" /></div>
        <div style={{ gridColumn: "1/-1" }}><label style={s.label}>Notes</label><textarea style={{ ...s.inp(), resize: "vertical", height: "70px" }} value={vals.notes||""} onChange={e => setVals({ ...vals, notes: e.target.value })} placeholder="Décisions prises, actions…" /></div>
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        <button style={s.btn("primary")} onClick={onSave}>{saveLabel}</button>
        <button style={s.btn("ghost")} onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", letterSpacing: "-0.8px", marginBottom: "4px" }}>Réunions</h1>
          <p style={{ color: C.muted, fontSize: "13px" }}>{meetings.length} réunion{meetings.length !== 1 ? "s" : ""}</p>
        </div>
        <button style={s.btn("primary")} onClick={() => { setAdding(!adding); setForm(EMPTY); }}>+ Nouvelle réunion</button>
      </div>

      {adding && (
        <div style={s.card({ marginBottom: "20px", borderColor: `${C.accent}40` })}>
          <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Nouvelle réunion</div>
          <MeetingForm vals={form} setVals={setForm} onSave={add} onCancel={() => setAdding(false)} saveLabel="Enregistrer" />
        </div>
      )}

      <div style={{ display: "grid", gap: "12px" }}>
        {meetings.length === 0 && !adding && (
          <div style={{ color: C.muted, textAlign: "center", padding: "70px", fontSize: "13px" }}>Aucune réunion enregistrée.</div>
        )}
        {[...meetings].reverse().map(m => (
          <div key={m.id} style={s.card()}>
            {editingId === m.id ? (
              <>
                <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Modifier la réunion</div>
                <MeetingForm vals={editForm} setVals={setEditForm} onSave={() => save(m.id)} onCancel={() => setEditingId(null)} saveLabel="Enregistrer" />
              </>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ cursor: "pointer", flex: 1 }} onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
                    <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px", marginBottom: "4px" }}>
                      Réunion du {m.date}
                      {m.crFile && <span style={{ fontSize: "11px", color: C.accent, marginLeft: "8px", fontFamily: C.font, fontWeight: "400" }}>📎 CR joint</span>}
                    </div>
                    {m.location  && <div style={{ fontSize: "12px", color: C.muted }}>📍 {m.location}</div>}
                    {m.attendees && <div style={{ fontSize: "12px", color: C.muted }}>👥 {m.attendees}</div>}
                  </div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
                    <span style={{ color: C.muted, fontSize: "12px", cursor: "pointer" }} onClick={() => setExpanded(expanded === m.id ? null : m.id)}>{expanded === m.id ? "▲" : "▼"}</span>
                    <button style={s.btn("ghost", { padding: "4px 8px", fontSize: "11px" })} onClick={() => { setEditingId(m.id); setEditForm({ date: m.date, location: m.location||"", agenda: m.agenda||"", attendees: m.attendees||"", notes: m.notes||"" }); }}>✎</button>
                    <button style={s.btn("danger", { padding: "4px 8px", fontSize: "11px" })} onClick={() => del(m.id)}>✕</button>
                  </div>
                </div>

                {expanded === m.id && (
                  <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${C.border}` }}>
                    {m.agenda && <div style={{ marginBottom: "10px" }}><div style={s.label}>Ordre du jour</div><div style={{ fontSize: "13px", whiteSpace: "pre-wrap" }}>{m.agenda}</div></div>}
                    {m.notes  && <div style={{ marginBottom: "14px" }}><div style={s.label}>Notes</div><div style={{ fontSize: "13px", whiteSpace: "pre-wrap" }}>{m.notes}</div></div>}

                    {/* Section CR */}
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "12px" }}>
                      <div style={s.label}>Compte-rendu (fichier)</div>
                      {m.crFile ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
                          <a href={m.crFile.url || m.crFile.data} download={m.crFile.name} style={{ fontSize: "13px", color: C.accent, textDecoration: "none", display: "flex", alignItems: "center", gap: "6px" }}>
                            📎 {m.crFile.name}
                          </a>
                          <button onClick={() => removeCR(m.id)} style={s.btn("danger", { padding: "3px 8px", fontSize: "11px" })}>Supprimer</button>
                        </div>
                      ) : (
                        <div style={{ marginTop: "6px" }}>
                          <input ref={el => crRefs.current[m.id] = el} type="file" style={{ display: "none" }}
                            onChange={e => { uploadCR(m.id, e.target.files[0]); e.target.value = ""; }} />
                          <button style={s.btn("ghost", { fontSize: "12px", padding: "6px 14px" })} onClick={() => crRefs.current[m.id]?.click()}>
                            + Joindre un fichier (PDF, Word, image…)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PRESTATIONS ───────────────────────────────────────────────────────────────
const statutColor = (st) => st === "Confirmé" || st === "Terminé" ? "green" : st === "Annulé" ? "red" : "neutral";

function PrestationsPage({ data, update, users, contacts = [] }) {
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState({ label: "", statut: "Demande", date: today(), notes: "" });

  const create = () => {
    if (!form.label.trim()) return;
    const newP = { id: uid(), label: form.label, statut: form.statut, date: form.date, notes: form.notes,
      client: { name: "", address: "", email: "", phone: "" }, team: [], gear: [], services: [], expenses: [], amount: 0 };
    update({ prestations: [...(data.prestations||[]), newP] }, { action: "AJOUT", target: "Prestations", details: form.label });
    setForm({ label: "", statut: "Demande", date: today(), notes: "" });
    setCreating(false);
    setDetailId(newP.id);
  };

  if (detailId) {
    const p = (data.prestations||[]).find(x => x.id === detailId);
    if (!p) { setDetailId(null); return null; }
    return <PrestationDetail prestation={p} data={data} update={update} back={() => setDetailId(null)} users={users} contacts={contacts} />;
  }

  const prestations = data.prestations || [];
  const byStatut = (st) => prestations.filter(p => p.statut === st).length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", letterSpacing: "-0.8px", marginBottom: "4px" }}>Prestations</h1>
          <p style={{ color: C.muted, fontSize: "13px" }}>
            {prestations.length} prestation{prestations.length !== 1 ? "s" : ""}
            {byStatut("Confirmé") > 0 && <span style={{ color: C.accent }}> · {byStatut("Confirmé")} confirmée{byStatut("Confirmé") > 1 ? "s":""}</span>}
            {byStatut("Demande") > 0 && <span style={{ color: C.warn }}> · {byStatut("Demande")} en attente</span>}
          </p>
        </div>
        <button style={s.btn("primary")} onClick={() => setCreating(!creating)}>+ Nouvelle prestation</button>
      </div>

      {creating && (
        <div style={s.card({ marginBottom: "20px", borderColor: C.accentBg })}>
          <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Nouvelle prestation</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "14px" }}>
            <div style={{ gridColumn: "1/-1" }}><label style={s.label}>Libellé *</label><input style={s.inp()} value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="Ex: Sonorisation Mariage Dupont" autoFocus /></div>
            <div><label style={s.label}>Statut</label><select style={s.inp()} value={form.statut} onChange={e => setForm({ ...form, statut: e.target.value })}>{PRESTATION_STATUTS.map(st => <option key={st}>{st}</option>)}</select></div>
            <div><label style={s.label}>Date</label><input type="date" style={s.inp()} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={s.label}>Notes</label><textarea style={{ ...s.inp(), resize: "vertical", height: "55px" }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button style={s.btn("primary")} onClick={create}>Créer et ouvrir</button>
            <button style={s.btn("ghost")} onClick={() => setCreating(false)}>Annuler</button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: "14px" }}>
        {prestations.length === 0 && !creating && (
          <div style={{ color: C.muted, textAlign: "center", padding: "70px", fontSize: "14px" }}>Aucune prestation enregistrée.</div>
        )}
        {[...prestations].reverse().map(p => {
          const gearTotal = (p.gear||[]).reduce((a, g) => a + g.qty*g.unitPrice*g.days, 0);
          const svcTotal  = (p.services||[]).reduce((a, sv) => a + sv.qty*sv.unitPrice, 0);
          const total = gearTotal + svcTotal;
          const expTotal = sumArr(p.expenses||[], "amount");
          const balance = total - expTotal;
          return (
            <div key={p.id} style={s.card({ cursor: "pointer" })} onClick={() => setDetailId(p.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: C.display, fontSize: "16px", fontWeight: "700" }}>{p.label}</span>
                    <Badge color={statutColor(p.statut)}>{p.statut}</Badge>
                  </div>
                  <div style={{ color: C.muted, fontSize: "12px", marginBottom: "12px", display: "flex", gap: "14px", flexWrap: "wrap" }}>
                    {p.date && <span>{p.date}</span>}
                    {p.client?.name && <span>· {p.client.name}</span>}
                    {(p.team||[]).length > 0 && <span>· {p.team.length} pers.</span>}
                  </div>
                  <div style={{ display: "flex", gap: "20px", fontFamily: C.mono, fontSize: "13px", flexWrap: "wrap" }}>
                    {gearTotal > 0 && <span><span style={{ color: C.muted }}>Matériel: </span><span style={{ color: C.warn }}>{fmt(gearTotal)}</span></span>}
                    {svcTotal > 0 && <span><span style={{ color: C.muted }}>Services: </span><span style={{ color: C.info }}>{fmt(svcTotal)}</span></span>}
                    {total > 0 && <span><span style={{ color: C.muted }}>Total HT: </span><span style={{ color: C.accent }}>{fmt(total)}</span></span>}
                    {expTotal > 0 && <span><span style={{ color: C.muted }}>Dép: </span><span style={{ color: C.danger }}>{fmt(expTotal)}</span></span>}
                  </div>
                  {total > 0 && expTotal > 0 && (
                    <div style={{ marginTop: "10px" }}>
                      <div style={{ fontSize: "11px", color: C.muted, marginBottom: "4px" }}>Marge : {fmt(balance)}</div>
                      <ProgressBar pct={Math.min((expTotal / total) * 100, 100)} color={balance >= 0 ? C.accent : C.danger} />
                    </div>
                  )}
                </div>
                <button onClick={ev => { ev.stopPropagation(); if (confirm("Supprimer cette prestation ?")) update({ prestations: prestations.filter(x => x.id !== p.id) }, { action: "SUPPR", target: "Prestations", details: p.label }); }}
                  style={s.btn("danger", { padding: "6px 10px", fontSize: "11px", marginLeft: "16px" })}>Supprimer</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function calcPrestationTotal(p) {
  const gearTotal = (p.gear||[]).reduce((a, g) => a + (g.qty||1) * (g.unitPrice||0) * (g.days||1), 0);
  const servicesTotal = (p.services||[]).reduce((a, sv) => a + (sv.qty||1) * (sv.unitPrice||0), 0);
  return gearTotal + servicesTotal;
}

function PrestationDetail({ prestation: p, data, update, back, users, contacts = [] }) {
  const upd = (patch) => update({ prestations: data.prestations.map(x => x.id === p.id ? { ...x, ...patch } : x) });
  const [tab, setTab] = useState("overview");

  const gearTotal = (p.gear||[]).reduce((a, g) => a + g.qty*g.unitPrice*g.days, 0);
  const svcTotal  = (p.services||[]).reduce((a, sv) => a + sv.qty*sv.unitPrice, 0);
  const total     = gearTotal + svcTotal;
  const expTotal  = sumArr(p.expenses||[], "amount");

  // Gear
  const [gearItem, setGearItem] = useState("");
  const [gearQty, setGearQty] = useState("1");
  const [gearDays, setGearDays] = useState("1");

  // Team
  const [teamName, setTeamName] = useState("");
  const [teamRole, setTeamRole] = useState("");
  const [teamFree, setTeamFree] = useState("");

  // Services
  const [svcId, setSvcId] = useState("");
  const [svcQty, setSvcQty] = useState("1");

  // Dépenses
  const [depForm, setDepForm] = useState({ label: "", amount: "", category: "Divers", paidBy: "" });

  const addGear = () => {
    const item = (data.inventory||[]).find(i => i.id === gearItem);
    if (!item) return;
    upd({ gear: [...(p.gear||[]), { id: uid(), itemId: item.id, itemName: item.name, qty: parseInt(gearQty)||1, days: parseInt(gearDays)||1, unitPrice: item.price||0, priceType: item.priceType||"/jour" }] });
    setGearItem(""); setGearQty("1"); setGearDays("1");
  };

  const addTeam = (name, role) => {
    if (!name.trim()) return;
    upd({ team: [...(p.team||[]), { id: uid(), name: name.trim(), role: role.trim() }] });
    setTeamName(""); setTeamRole(""); setTeamFree("");
  };

  const addService = () => {
    const cat = (data.catalog||[]).find(c => c.id === svcId);
    if (!cat) return;
    upd({ services: [...(p.services||[]), { id: uid(), label: cat.name, qty: parseInt(svcQty)||1, unitPrice: cat.unitPrice, unit: cat.unit||"" }] });
    setSvcId(""); setSvcQty("1");
  };

  // ── Génération documents ──
  const docStyle = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;padding:48px;font-size:13px;color:#1a1a1a;line-height:1.5}
h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin:0 0 8px}
.top{display:flex;justify-content:space-between;margin-bottom:36px;align-items:flex-start}
.doc-n{font-size:28px;font-weight:800;letter-spacing:-1px}.doc-sub{color:#888;font-size:12px;margin-top:4px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px}
.party{background:#f7f7f7;border-radius:8px;padding:14px}.party-label{font-size:10px;text-transform:uppercase;color:#999;letter-spacing:.5px;margin-bottom:6px}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
th{padding:9px 12px;background:#111;color:#fff;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.3px}
td{padding:9px 12px;border-bottom:1px solid #f0f0f0}
.amt{text-align:right;font-family:'Courier New',monospace}
.tot-box{width:260px;margin-left:auto;margin-bottom:28px}
.tr{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eee;font-size:13px}
.tf{font-size:15px;font-weight:700;border-top:2px solid #111;border-bottom:none;padding-top:10px}
.art{margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid #eee}
.art:last-child{border-bottom:none}
.art-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#555;margin-bottom:6px}
.sig-block{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:48px}
.sig-col{border-top:1px solid #ccc;padding-top:12px}
.sig-label{font-size:11px;color:#888;margin-bottom:36px}
.sig-line{border-top:1px solid #999;margin-top:48px}
footer{border-top:1px solid #eee;padding-top:12px;color:#aaa;font-size:11px;margin-top:40px;display:flex;justify-content:space-between}
@media print{body{padding:24px}}`;

  const assocBlock = () => `${data.assoc.logo ? `<img src="${data.assoc.logo}" style="height:44px;display:block;margin-bottom:8px">` : ""}
    <strong>${data.assoc.name||"Association"}</strong><br>
    ${data.assoc.address ? `<span style="color:#666">${data.assoc.address}</span><br>` : ""}
    ${data.assoc.email  ? `Email : ${data.assoc.email}<br>` : ""}
    ${data.assoc.phone  ? `Tél : ${data.assoc.phone}<br>` : ""}
    ${data.assoc.siret  ? `SIRET : ${data.assoc.siret}` : ""}`;

  const clientBlock = () => `<strong>${p.client?.name||"—"}</strong><br>
    ${p.client?.address ? `<span style="color:#666;white-space:pre-line">${p.client.address}</span><br>` : ""}
    ${p.client?.email   ? `Email : ${p.client.email}<br>` : ""}
    ${p.client?.phone   ? `Tél : ${p.client.phone}` : ""}`;

  const generateDoc = (type) => {
    const gearLines = (p.gear||[]).map(g => ({ label: `${g.itemName} × ${g.days}j`, qty: g.qty, unitPrice: g.unitPrice, unit: g.priceType }));
    const svcLines  = (p.services||[]).map(sv => ({ label: sv.label, qty: sv.qty, unitPrice: sv.unitPrice, unit: sv.unit }));
    const lines = [...gearLines, ...svcLines];
    const docTotal = lines.reduce((a, l) => a + l.qty * l.unitPrice, 0);
    const num = `${type === "devis" ? "DEV" : "FAC"}-${Date.now().toString().slice(-6)}`;
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${type === "devis" ? "Devis" : "Facture"} — ${p.label}</title><style>${docStyle}</style></head><body>
<div class="top">
  <div>${assocBlock()}</div>
  <div style="text-align:right"><div class="doc-n">${type === "devis" ? "DEVIS" : "FACTURE"}</div>
    <div class="doc-sub">N° ${num}<br>${p.date ? new Date(p.date).toLocaleDateString("fr-FR") : new Date().toLocaleDateString("fr-FR")}</div></div>
</div>
<div class="parties">
  <div class="party"><div class="party-label">Émis par</div>${assocBlock()}</div>
  <div class="party"><div class="party-label">${type === "devis" ? "Devis pour" : "Facturer à"}</div>${clientBlock()}</div>
</div>
<p style="margin-bottom:18px"><strong>Objet :</strong> ${p.label}</p>
<table><thead><tr><th>Désignation</th><th>Unité</th><th style="text-align:right">Qté</th><th style="text-align:right">PU HT</th><th style="text-align:right">Total HT</th></tr></thead><tbody>
${lines.map(l=>`<tr><td>${l.label}</td><td style="color:#888">${l.unit||"—"}</td><td class="amt">${l.qty}</td><td class="amt">${fmt(l.unitPrice)}</td><td class="amt">${fmt(l.qty*l.unitPrice)}</td></tr>`).join("")}
</tbody></table>
<div class="tot-box">
  <div class="tr"><span>Total HT</span><span>${fmt(docTotal)}</span></div>
  <div class="tr"><span style="color:#888">TVA (non applicable – art. 293B CGI)</span><span>0,00 €</span></div>
  <div class="tr tf"><span>TOTAL TTC</span><span>${fmt(docTotal)}</span></div>
</div>
${type === "devis" ? `<p style="color:#888;font-size:12px;margin-bottom:24px">Devis valable 30 jours à compter de sa date d'émission.</p>` : ""}
${data.assoc.iban ? `<p style="font-size:12px;margin-bottom:8px"><strong>Règlement par virement :</strong> IBAN ${data.assoc.iban}</p>` : ""}
<footer><span>${data.assoc.name||"Association"} — ${data.assoc.siret ? "SIRET "+data.assoc.siret : ""}</span><span>Généré le ${new Date().toLocaleDateString("fr-FR")}</span></footer>
</body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); w.onload = () => w.print();
  };

  const generateContract = () => {
    const today_str = new Date().toLocaleDateString("fr-FR");
    const datePrest = p.date ? new Date(p.date).toLocaleDateString("fr-FR") : "à définir";
    const gearLines = (p.gear||[]).map(g => `<li>${g.itemName} — ${g.qty} unité(s) × ${g.days} jour(s) à ${fmt(g.unitPrice)}${g.priceType} = <strong>${fmt(g.qty*g.unitPrice*g.days)}</strong></li>`).join("");
    const svcLines  = (p.services||[]).map(sv => `<li>${sv.label} × ${sv.qty} — <strong>${fmt(sv.qty*sv.unitPrice)}</strong></li>`).join("");
    const teamLines = (p.team||[]).map(m => `<li>${m.name}${m.role ? ` (${m.role})` : ""}</li>`).join("");
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Contrat de prestation — ${p.label}</title><style>${docStyle}
body{font-size:12.5px}.contrat-title{font-size:22px;font-weight:800;letter-spacing:-0.5px;margin-bottom:4px}
</style></head><body>
<div class="top">
  <div>${assocBlock()}</div>
  <div style="text-align:right">
    <div class="contrat-title">CONTRAT DE PRESTATION</div>
    <div class="doc-sub">Réf. PREST-${Date.now().toString().slice(-6)}<br>Établi le ${today_str}</div>
  </div>
</div>

<div class="parties">
  <div class="party">
    <div class="party-label">Le Prestataire</div>
    ${assocBlock()}
    <br><em style="color:#888;font-size:11px">Association loi 1901</em>
  </div>
  <div class="party">
    <div class="party-label">Le Client</div>
    ${clientBlock()}
  </div>
</div>

<p style="text-align:center;color:#888;font-size:12px;margin-bottom:28px">
  Ci-après désignés ensemble « les Parties »
</p>

<div class="art">
  <div class="art-title">Article 1 – Objet du contrat</div>
  <p>Le présent contrat a pour objet de définir les conditions dans lesquelles le Prestataire s'engage à réaliser la prestation suivante pour le compte du Client :</p>
  <p style="margin-top:8px;font-weight:600">${p.label}</p>
  ${p.notes ? `<p style="margin-top:6px;color:#555;font-style:italic">${p.notes}</p>` : ""}
</div>

<div class="art">
  <div class="art-title">Article 2 – Date et lieu d'intervention</div>
  <p>La prestation sera réalisée le <strong>${datePrest}</strong>.</p>
  <p style="margin-top:6px;color:#888">Le lieu d'intervention sera précisé d'un commun accord entre les Parties.</p>
</div>

<div class="art">
  <div class="art-title">Article 3 – Description des prestations et matériel fourni</div>
  ${gearLines || svcLines ? `
    ${gearLines ? `<p style="margin-bottom:6px"><strong>Matériel :</strong></p><ul style="margin-left:20px;margin-bottom:10px">${gearLines}</ul>` : ""}
    ${svcLines  ? `<p style="margin-bottom:6px"><strong>Services :</strong></p><ul style="margin-left:20px">${svcLines}</ul>` : ""}
  ` : "<p>À définir.</p>"}
  ${teamLines ? `<p style="margin-top:10px"><strong>Équipe mobilisée :</strong></p><ul style="margin-left:20px">${teamLines}</ul>` : ""}
</div>

<div class="art">
  <div class="art-title">Article 4 – Prix et conditions de paiement</div>
  <p>Le montant total de la prestation est fixé à :</p>
  <p style="font-size:20px;font-weight:800;margin:10px 0">${fmt(total)} HT</p>
  <p style="color:#888;font-size:11px;margin-bottom:10px">TVA non applicable – article 293B du Code Général des Impôts.</p>
  ${gearTotal > 0 ? `<p>Dont matériel : ${fmt(gearTotal)} — Services : ${fmt(svcTotal)}</p>` : ""}
  <p style="margin-top:10px">Modalités de règlement : <strong>virement bancaire</strong>${data.assoc.iban ? ` (IBAN : ${data.assoc.iban})` : ""}, chèque ou espèces.</p>
  <p style="margin-top:6px">Un acompte de <strong>30 %</strong> (soit ${fmt(total * 0.3)}) est exigible à la signature du présent contrat, le solde étant réglé au plus tard le jour de la prestation.</p>
</div>

<div class="art">
  <div class="art-title">Article 5 – Obligations du Prestataire</div>
  <p>Le Prestataire s'engage à :</p>
  <ul style="margin-left:20px;margin-top:6px">
    <li>Mettre à disposition le matériel et le personnel listés à l'article 3 ;</li>
    <li>Assurer la qualité technique et la conformité des équipements mis en œuvre ;</li>
    <li>Respecter les délais convenus et informer le Client de tout imprévu ;</li>
    <li>Assurer la bonne réalisation de la prestation avec diligence et professionnalisme.</li>
  </ul>
</div>

<div class="art">
  <div class="art-title">Article 6 – Obligations du Client</div>
  <p>Le Client s'engage à :</p>
  <ul style="margin-left:20px;margin-top:6px">
    <li>Fournir un accès libre, sécurisé et adapté au lieu de la prestation ;</li>
    <li>Mettre à disposition les branchements électriques nécessaires (alimentation 220V, puissance suffisante) ;</li>
    <li>Informer le Prestataire de toute contrainte technique, logistique ou réglementaire ;</li>
    <li>Régler les sommes dues dans les délais convenus à l'article 4 ;</li>
    <li>S'assurer d'être titulaire de toutes les autorisations nécessaires à la tenue de l'événement.</li>
  </ul>
</div>

<div class="art">
  <div class="art-title">Article 7 – Annulation et résiliation</div>
  <p>Toute annulation devra être notifiée par écrit (e-mail avec accusé de réception ou lettre recommandée).</p>
  <ul style="margin-left:20px;margin-top:6px">
    <li>Annulation plus de 30 jours avant la date : remboursement intégral de l'acompte ;</li>
    <li>Annulation entre 8 et 30 jours : retenue de 50 % du montant total ;</li>
    <li>Annulation moins de 8 jours ou le jour même : facturation de la totalité du montant.</li>
  </ul>
  <p style="margin-top:8px">Le Prestataire se réserve le droit de résilier le présent contrat en cas de non-paiement de l'acompte ou de manquement grave du Client à ses obligations.</p>
</div>

<div class="art">
  <div class="art-title">Article 8 – Responsabilité</div>
  <p>Le Prestataire s'engage à mettre en œuvre tous les moyens nécessaires à la bonne exécution de la prestation (obligation de moyens). Sa responsabilité ne saurait être engagée en cas de dommages indirects ou immatériels. En tout état de cause, l'indemnité versée ne pourra excéder le montant de la prestation.</p>
  <p style="margin-top:8px">Le Client est seul responsable de l'obtention des autorisations administratives et de la sécurité du public lors de l'événement.</p>
</div>

<div class="art">
  <div class="art-title">Article 9 – Force majeure</div>
  <p>Aucune des Parties ne pourra être tenue responsable d'un manquement à ses obligations contractuelles en cas de force majeure au sens de l'article 1218 du Code civil (catastrophe naturelle, pandémie, décision administrative, etc.). La Partie concernée devra en informer l'autre sans délai et les Parties se concerteront pour trouver une solution amiable.</p>
</div>

<div class="art">
  <div class="art-title">Article 10 – Propriété intellectuelle et droits voisins</div>
  <p>Les enregistrements sonores et visuels de la prestation sont soumis à accord préalable écrit du Prestataire et, le cas échéant, des artistes intervenants. Le Client s'engage à respecter les droits SACEM, SACD, SPEDIDAM et autres organismes compétents pour toute diffusion musicale ou artistique dans le cadre de l'événement.</p>
</div>

<div class="art">
  <div class="art-title">Article 11 – Confidentialité</div>
  <p>Les Parties s'engagent à ne pas divulguer à des tiers les informations confidentielles échangées dans le cadre du présent contrat, pendant toute sa durée et durant les deux années suivant son terme.</p>
</div>

<div class="art">
  <div class="art-title">Article 12 – Loi applicable et règlement des litiges</div>
  <p>Le présent contrat est soumis au droit français. En cas de litige, les Parties s'engagent à rechercher une solution amiable dans un délai de 30 jours avant tout recours judiciaire. À défaut d'accord, le litige sera soumis aux tribunaux compétents du ressort du siège social du Prestataire.</p>
</div>

<div class="art" style="margin-top:8px">
  <div class="art-title">Article 13 – Dispositions générales</div>
  <p>Le présent contrat annule et remplace tout accord antérieur entre les Parties portant sur le même objet. Toute modification devra faire l'objet d'un avenant signé des deux Parties. Si une clause est déclarée nulle, les autres dispositions resteront en vigueur.</p>
</div>

<div class="sig-block">
  <div class="sig-col">
    <div class="sig-label"><strong>Pour le Prestataire</strong><br>${data.assoc.name||"L'Association"}<br><span style="color:#888">Nom, qualité et signature</span></div>
    <div style="margin-top:8px;color:#888;font-size:11px">Précédé de la mention « Lu et approuvé »</div>
    <div class="sig-line"></div>
    <div style="margin-top:6px;color:#888;font-size:11px">Fait à _______________________, le ${today_str}</div>
  </div>
  <div class="sig-col">
    <div class="sig-label"><strong>Pour le Client</strong><br>${p.client?.name||"Le Client"}<br><span style="color:#888">Nom, qualité et signature</span></div>
    <div style="margin-top:8px;color:#888;font-size:11px">Précédé de la mention « Lu et approuvé »</div>
    <div class="sig-line"></div>
    <div style="margin-top:6px;color:#888;font-size:11px">Fait à _______________________, le</div>
  </div>
</div>

<footer><span>${data.assoc.name||"Association"} — ${data.assoc.siret ? "SIRET "+data.assoc.siret : "Association loi 1901"}</span><span>Document généré le ${today_str} — 2 exemplaires originaux</span></footer>
</body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); w.onload = () => w.print();
  };

  const TABS = [
    { id: "overview",  label: "Vue d'ensemble" },
    { id: "client",    label: "Client" },
    { id: "team",      label: `Équipe${(p.team||[]).length > 0 ? ` (${p.team.length})` : ""}` },
    { id: "gear",      label: `Matériel${(p.gear||[]).length > 0 ? ` (${p.gear.length})` : ""}` },
    { id: "services",  label: `Services${(p.services||[]).length > 0 ? ` (${p.services.length})` : ""}` },
    { id: "expenses",  label: `Dépenses${(p.expenses||[]).length > 0 ? ` (${p.expenses.length})` : ""}` },
    { id: "docs",      label: "Documents" },
  ];

  return (
    <div>
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px", flexWrap: "wrap" }}>
        <button style={s.btn("ghost", { padding: "7px 12px", fontSize: "12px" })} onClick={back}>← Retour</button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: C.display, fontSize: "22px", fontWeight: "800", letterSpacing: "-0.5px" }}>{p.label}</h1>
            <Badge color={statutColor(p.statut)}>{p.statut}</Badge>
          </div>
          <p style={{ color: C.muted, fontSize: "13px" }}>{p.date}{p.client?.name ? ` · ${p.client.name}` : ""}</p>
        </div>
        <select value={p.statut} onChange={e => upd({ statut: e.target.value })} style={s.inp({ width: "auto", padding: "6px 12px", fontSize: "12px" })}>
          {PRESTATION_STATUTS.map(st => <option key={st}>{st}</option>)}
        </select>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px", marginBottom: "22px" }}>
        {[
          { label: "Matériel",  value: fmt(gearTotal),                          color: C.warn    },
          { label: "Services",  value: fmt(svcTotal),                           color: C.info    },
          { label: "Total HT",  value: fmt(total),                              color: C.accent  },
          { label: "Dépenses",  value: fmt(expTotal),                           color: C.danger  },
          { label: "Marge",     value: fmt(total - expTotal),                   color: total - expTotal >= 0 ? C.accent : C.danger },
          { label: "Équipe",    value: `${(p.team||[]).length} pers.`,          color: C.text    },
        ].map(({ label, value, color }) => (
          <div key={label} style={s.card()}><div style={s.label}>{label}</div><div style={{ fontFamily: C.mono, fontSize: "16px", color, marginTop: "4px" }}>{value}</div></div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "2px", borderBottom: `1px solid ${C.border}`, marginBottom: "24px", overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "9px 16px", background: "none", border: "none", cursor: "pointer",
            borderBottom: `2px solid ${tab === t.id ? C.accent : "transparent"}`,
            color: tab === t.id ? C.accent : C.muted,
            fontFamily: C.font, fontSize: "13px", fontWeight: tab === t.id ? "600" : "400",
            whiteSpace: "nowrap", marginBottom: "-1px", transition: "all 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Vue d'ensemble ── */}
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
          <div style={s.card()}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "12px" }}>Récapitulatif</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
              {(p.gear||[]).length > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.muted }}>Matériel ({p.gear.length} articles)</span><span style={{ fontFamily: C.mono, color: C.warn }}>{fmt(gearTotal)}</span></div>}
              {(p.services||[]).length > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.muted }}>Services ({p.services.length} lignes)</span><span style={{ fontFamily: C.mono, color: C.info }}>{fmt(svcTotal)}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.border}`, paddingTop: "8px", fontWeight: "600" }}><span>Total HT</span><span style={{ fontFamily: C.mono, color: C.accent }}>{fmt(total)}</span></div>
              {expTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.muted }}>Dépenses engagées</span><span style={{ fontFamily: C.mono, color: C.danger }}>−{fmt(expTotal)}</span></div>}
              {expTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "600" }}><span>Marge nette</span><span style={{ fontFamily: C.mono, color: total - expTotal >= 0 ? C.accent : C.danger }}>{fmt(total - expTotal)}</span></div>}
            </div>
          </div>
          <div style={s.card()}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "12px" }}>Notes internes</div>
            <textarea style={{ ...s.inp(), resize: "vertical", height: "120px" }} value={p.notes||""} onChange={e => upd({ notes: e.target.value })} placeholder="Informations internes, remarques…" />
          </div>
          {contacts.length > 0 && (
            <div style={{ gridColumn: "1/-1", ...s.card() }}>
              <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "12px" }}>Contacts liés</div>
              <LinkedContacts linkedIds={p.linkedContacts||[]} contacts={contacts} onChange={ids => upd({ linkedContacts: ids })} />
            </div>
          )}
        </div>
      )}

      {/* ── Client ── */}
      {tab === "client" && (
        <div style={s.card({ maxWidth: "480px" })}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px" }}>Informations client</div>
          {[{ k:"name",l:"Nom / Société",ph:"Entreprise Dupont" },{ k:"address",l:"Adresse",ph:"12 rue…" },{ k:"email",l:"Email",ph:"contact@…" },{ k:"phone",l:"Téléphone",ph:"+33 6…" }].map(({ k,l,ph }) => (
            <div key={k} style={{ marginBottom: "12px" }}>
              <label style={s.label}>{l}</label>
              <input style={s.inp()} value={p.client?.[k]||""} placeholder={ph} onChange={e => upd({ client: { ...(p.client||{}), [k]: e.target.value } })} />
            </div>
          ))}
        </div>
      )}

      {/* ── Équipe ── */}
      {tab === "team" && (
        <div style={s.card()}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px" }}>Équipe</div>
          {/* Depuis la liste users */}
          {(users||[]).length > 0 && (
            <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 2, minWidth: "120px" }}>
                <label style={s.label}>Ajouter un membre</label>
                <select style={s.inp()} value={teamName} onChange={e => setTeamName(e.target.value)}>
                  <option value="">— Choisir un membre —</option>
                  {(users||[]).filter(u => !(p.team||[]).find(m => m.name === u.username)).map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, minWidth: "100px" }}>
                <label style={s.label}>Rôle</label>
                <input style={s.inp()} value={teamRole} onChange={e => setTeamRole(e.target.value)} placeholder="Ex: Régisseur son" />
              </div>
              <button style={s.btn("primary", { padding: "9px 14px" })} onClick={() => addTeam(teamName, teamRole)} disabled={!teamName}>+</button>
            </div>
          )}
          {/* Nom libre */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ flex: 2, minWidth: "120px" }}>
              <label style={s.label}>Nom libre</label>
              <input style={s.inp()} value={teamFree} onChange={e => setTeamFree(e.target.value)} placeholder="Nom" onKeyDown={e => e.key === "Enter" && addTeam(teamFree, teamRole)} />
            </div>
            <button style={s.btn("ghost", { padding: "9px 14px" })} onClick={() => addTeam(teamFree, teamRole)} disabled={!teamFree.trim()}>+ Nom libre</button>
          </div>
          {(p.team||[]).length === 0 ? <p style={{ color: C.muted, fontSize: "13px" }}>Aucun membre ajouté.</p> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {(p.team||[]).map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: C.card2, borderRadius: "8px" }}>
                  <div><span style={{ fontWeight: "500" }}>{m.name}</span>{m.role && <span style={{ color: C.muted, fontSize: "12px" }}> — {m.role}</span>}</div>
                  <button onClick={() => upd({ team: p.team.filter(x => x.id !== m.id) })} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Matériel ── */}
      {tab === "gear" && (
        <div style={s.card()}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px" }}>Matériel (depuis l'inventaire)</div>
          {(data.inventory||[]).length === 0 ? (
            <p style={{ color: C.muted, fontSize: "13px" }}>Aucun article dans l'inventaire.</p>
          ) : (
            <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 2, minWidth: "140px" }}>
                <label style={s.label}>Article</label>
                <select style={s.inp()} value={gearItem} onChange={e => setGearItem(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {(data.inventory||[]).map(i => <option key={i.id} value={i.id}>{i.name} ({fmt(i.price)}{i.priceType})</option>)}
                </select>
              </div>
              <div style={{ width: "65px" }}><label style={s.label}>Qté</label><input type="number" style={s.inp()} value={gearQty} onChange={e => setGearQty(e.target.value)} min="1" /></div>
              <div style={{ width: "65px" }}><label style={s.label}>Jours</label><input type="number" style={s.inp()} value={gearDays} onChange={e => setGearDays(e.target.value)} min="1" /></div>
              <button style={s.btn("primary", { padding: "9px 14px" })} onClick={addGear}>+ Ajouter</button>
            </div>
          )}
          {(p.gear||[]).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {(p.gear||[]).map(g => (
                <div key={g.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: C.card2, borderRadius: "8px", flexWrap: "wrap", gap: "6px" }}>
                  <div><span style={{ fontWeight: "500" }}>{g.itemName}</span><span style={{ color: C.muted, fontSize: "12px" }}> × {g.qty} · {g.days} j · {fmt(g.unitPrice)}{g.priceType}</span></div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontFamily: C.mono, fontSize: "13px", color: C.warn }}>{fmt(g.qty * g.unitPrice * g.days)}</span>
                    <button onClick={() => upd({ gear: p.gear.filter(x => x.id !== g.id) })} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}>✕</button>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "flex-end", fontFamily: C.mono, fontSize: "13px", color: C.warn, marginTop: "4px" }}>
                Sous-total matériel : {fmt(gearTotal)}
              </div>
            </div>
          ) : <p style={{ color: C.muted, fontSize: "13px" }}>Aucun matériel ajouté.</p>}
        </div>
      )}

      {/* ── Services ── */}
      {tab === "services" && (
        <div style={s.card()}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px" }}>Services (catalogue)</div>
          {(data.catalog||[]).length === 0 ? (
            <p style={{ color: C.muted, fontSize: "13px" }}>Aucun service dans le catalogue. Ajoutez-en depuis Factures → Catalogue.</p>
          ) : (
            <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 2, minWidth: "140px" }}>
                <label style={s.label}>Service</label>
                <select style={s.inp()} value={svcId} onChange={e => setSvcId(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {(data.catalog||[]).map(c => <option key={c.id} value={c.id}>{c.name} ({fmt(c.unitPrice)}{c.unit ? " / "+c.unit : ""})</option>)}
                </select>
              </div>
              <div style={{ width: "70px" }}><label style={s.label}>Qté</label><input type="number" style={s.inp()} value={svcQty} onChange={e => setSvcQty(e.target.value)} min="1" /></div>
              <button style={s.btn("primary", { padding: "9px 14px" })} onClick={addService}>+ Ajouter</button>
            </div>
          )}
          {(p.services||[]).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {(p.services||[]).map(sv => (
                <div key={sv.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: C.card2, borderRadius: "8px" }}>
                  <div><span style={{ fontWeight: "500" }}>{sv.label}</span><span style={{ color: C.muted, fontSize: "12px" }}> × {sv.qty}{sv.unit ? " / "+sv.unit : ""} à {fmt(sv.unitPrice)}</span></div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontFamily: C.mono, fontSize: "13px", color: C.info }}>{fmt(sv.qty * sv.unitPrice)}</span>
                    <button onClick={() => upd({ services: p.services.filter(x => x.id !== sv.id) })} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}>✕</button>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "flex-end", fontFamily: C.mono, fontSize: "13px", color: C.info, marginTop: "4px" }}>
                Sous-total services : {fmt(svcTotal)}
              </div>
            </div>
          ) : <p style={{ color: C.muted, fontSize: "13px" }}>Aucun service ajouté.</p>}
        </div>
      )}

      {/* ── Dépenses ── */}
      {tab === "expenses" && (
        <div style={s.card()}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px" }}>Dépenses liées à cette prestation</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px", marginBottom: "14px", alignItems: "end" }}>
            <div><label style={s.label}>Libellé *</label><input style={s.inp()} value={depForm.label} placeholder="Ex: Location camion" onChange={e => setDepForm({ ...depForm, label: e.target.value })} /></div>
            <div><label style={s.label}>Montant (€) *</label><input type="number" style={s.inp()} value={depForm.amount} onChange={e => setDepForm({ ...depForm, amount: e.target.value })} /></div>
            <div><label style={s.label}>Catégorie</label>
              <select style={s.inp()} value={depForm.category} onChange={e => setDepForm({ ...depForm, category: e.target.value })}>
                {CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label style={s.label}>Payé par</label>
              <select style={s.inp()} value={depForm.paidBy} onChange={e => setDepForm({ ...depForm, paidBy: e.target.value })}>
                <option value="">— Sélectionner —</option>
                {(users||[]).map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                {(p.team||[]).filter(m => !(users||[]).find(u => u.username === m.name)).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </div>
            <button style={s.btn("primary", { alignSelf: "flex-end", padding: "9px 14px" })} onClick={() => {
              if (!depForm.label || !depForm.amount) return;
              upd({ expenses: [...(p.expenses||[]), { id: uid(), label: depForm.label, amount: parseFloat(depForm.amount), category: depForm.category, paidBy: depForm.paidBy, date: today() }] });
              setDepForm({ label: "", amount: "", category: "Divers", paidBy: "" });
            }}>+ Ajouter</button>
          </div>
          {(p.expenses||[]).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {(p.expenses||[]).map(ex => (
                <div key={ex.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: C.card2, borderRadius: "8px", flexWrap: "wrap", gap: "6px" }}>
                  <div>
                    <span style={{ fontWeight: "500" }}>{ex.label}</span>
                    {ex.paidBy && <span style={{ color: C.muted, fontSize: "12px" }}> · {ex.paidBy}</span>}
                    <Badge color="neutral">{ex.category}</Badge>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontFamily: C.mono, fontSize: "13px", color: C.warn }}>{fmt(ex.amount)}</span>
                    <button onClick={() => upd({ expenses: p.expenses.filter(x => x.id !== ex.id) })} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}>✕</button>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "flex-end", fontFamily: C.mono, fontSize: "13px", color: C.warn, marginTop: "4px" }}>
                Total dépenses : {fmt(expTotal)}
              </div>
            </div>
          ) : <p style={{ color: C.muted, fontSize: "13px" }}>Aucune dépense enregistrée.</p>}
        </div>
      )}

      {/* ── Documents ── */}
      {tab === "docs" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
          {[
            { title: "Devis", desc: "Document commercial présentant les prestations et le montant HT. Valable 30 jours.", btn: "Générer le devis PDF", action: () => generateDoc("devis"), color: C.info },
            { title: "Facture", desc: "Facture officielle à émettre après réalisation de la prestation.", btn: "Générer la facture PDF", action: () => generateDoc("facture"), color: C.accent },
            { title: "Contrat de prestation", desc: "Contrat juridique complet (13 articles) : objet, prix, obligations, annulation, responsabilité, force majeure, loi applicable, signatures.", btn: "Générer le contrat PDF", action: generateContract, color: C.warn },
          ].map(({ title, desc, btn, action, color }) => (
            <div key={title} style={s.card()}>
              <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px", marginBottom: "8px", color }}>{title}</div>
              <p style={{ color: C.muted, fontSize: "13px", marginBottom: "16px", lineHeight: "1.5" }}>{desc}</p>
              <button style={s.btn("primary", { width: "100%" })} onClick={action}>{btn}</button>
            </div>
          ))}
          <div style={s.card()}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px", marginBottom: "8px" }}>Informations requises</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
              {[
                { ok: !!(data.assoc.name), label: "Nom de l'association" },
                { ok: !!(data.assoc.siret), label: "SIRET" },
                { ok: !!(data.assoc.address), label: "Adresse" },
                { ok: !!(p.client?.name), label: "Nom du client" },
                { ok: !!(p.client?.address), label: "Adresse du client" },
                { ok: total > 0, label: "Au moins une ligne de prestation" },
              ].map(({ ok, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: "8px", color: ok ? C.accent : C.muted }}>
                  <span>{ok ? "✓" : "○"}</span><span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ÉQUIPE ────────────────────────────────────────────────────────────────────
function EquipePage({ users, data, can, session }) {
  const roles = data.roles || [];
  const getRole = (u) => roles.find(r => r.id === u.roleId) || null;

  const initial = (name) => (name || "?")[0].toUpperCase();

  return (
    <div>
      <h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", marginBottom: "6px", letterSpacing: "-0.8px" }}>Équipe</h1>
      <p style={{ color: C.muted, marginBottom: "28px", fontSize: "14px" }}>{users.length} membre{users.length !== 1 ? "s" : ""} inscrit{users.length !== 1 ? "s" : ""}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "14px" }}>
        {users.map(u => {
          const role = getRole(u);
          const isRoot = u.role === "root";
          const effectivePerms = [
            ...(u.permissions || []),
            ...(role?.permissions || []),
          ].filter((p, i, a) => a.indexOf(p) === i);

          return (
            <div key={u.id} style={s.card({ display: "flex", flexDirection: "column", gap: "12px" })}>
              {/* Avatar + nom */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <UserAvatar username={u.username} avatar={u.avatar} color={role ? role.color : isRoot ? C.accent : null} size={42} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: "600", fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.username}</div>
                  <div style={{ fontSize: "11px", color: C.muted, marginTop: "1px" }}>
                    {u.created_at ? `Depuis ${new Date(u.created_at).toLocaleDateString("fr-FR")}` : ""}
                  </div>
                </div>
              </div>

              {/* Badge rôle */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {isRoot && (
                  <span style={{ fontSize: "11px", padding: "2px 9px", borderRadius: "20px", background: `${C.accent}20`, color: C.accent, fontWeight: "600" }}>
                    ★ Administrateur root
                  </span>
                )}
                {role && (
                  <span style={{ fontSize: "11px", padding: "2px 9px", borderRadius: "20px", background: role.color + "22", color: role.color, fontWeight: "600" }}>
                    {role.name}
                  </span>
                )}
                {!isRoot && !role && (u.permissions || []).length === 0 && (
                  <span style={{ fontSize: "11px", color: C.muted }}>Aucun rôle attribué</span>
                )}
              </div>

              {/* Permissions effectives (visible aux admins) */}
              {can("manage_users") && effectivePerms.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {effectivePerms.map(p => (
                    <span key={p} style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "10px", background: C.card2, color: C.muted, border: `1px solid ${C.border}` }}>
                      {PERMISSION_LABELS[p] || p}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── CONTACTS ──────────────────────────────────────────────────────────────────
function LinkedContacts({ linkedIds = [], contacts = [], onChange }) {
  const linked = contacts.filter(c => linkedIds.includes(c.id));
  const unlinked = contacts.filter(c => !linkedIds.includes(c.id));
  const toggle = (id) => onChange(linkedIds.includes(id) ? linkedIds.filter(x => x !== id) : [...linkedIds, id]);
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {contacts.map(c => {
          const active = linkedIds.includes(c.id);
          return (
            <span key={c.id} onClick={() => toggle(c.id)} style={{
              cursor: "pointer", padding: "4px 12px", borderRadius: "20px", fontSize: "12px", userSelect: "none",
              border: `1px solid ${active ? C.accent : C.border}`,
              background: active ? `${C.accent}18` : "transparent",
              color: active ? C.accent : C.muted,
            }}>
              {c.type === "Entité" ? "▣ " : "◉ "}{c.name}
            </span>
          );
        })}
        {contacts.length === 0 && <span style={{ fontSize: "12px", color: C.muted, fontStyle: "italic" }}>Aucun contact — ajoutez-en depuis l'onglet Contacts</span>}
      </div>
      {linked.length > 0 && (
        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {linked.map(c => (
            <div key={c.id} style={{ fontSize: "12px", color: C.muted, display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ color: C.text, fontWeight: "500" }}>{c.name}</span>
              {c.email && <a href={`mailto:${c.email}`} style={{ color: C.accent, textDecoration: "none" }}>✉ {c.email}</a>}
              {c.phone && <span>☎ {c.phone}</span>}
              {c.address && <span>📍 {c.address}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactsPage({ data, update }) {
  const contacts = data.contacts || [];
  const EMPTY = { name: "", type: "Personne", description: "", address: "", email: "", phone: "" };
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [search, setSearch] = useState("");

  const filtered = contacts.filter(c => !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email||"").toLowerCase().includes(search.toLowerCase()) ||
    (c.description||"").toLowerCase().includes(search.toLowerCase())
  );

  const add = () => {
    if (!form.name.trim()) return;
    update({ contacts: [...contacts, { ...form, id: uid(), name: form.name.trim() }] },
      { action: "AJOUT", target: "Contacts", details: form.name });
    setForm(EMPTY); setAdding(false);
  };

  const save = (id) => {
    if (!editForm.name.trim()) return;
    update({ contacts: contacts.map(c => c.id !== id ? c : { ...c, ...editForm, name: editForm.name.trim() }) });
    setEditingId(null); setEditForm(null);
  };

  const del = (id, name) => {
    if (!confirm(`Supprimer "${name}" ?`)) return;
    update({ contacts: contacts.filter(c => c.id !== id) },
      { action: "SUPPR", target: "Contacts", details: name });
  };

  const ContactForm = ({ vals, setVals, onSave, onCancel, saveLabel }) => (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px", marginBottom: "12px" }}>
        <div>
          <label style={s.label}>Type</label>
          <select style={s.inp()} value={vals.type} onChange={e => setVals({ ...vals, type: e.target.value })}>
            <option>Personne</option><option>Entité</option>
          </select>
        </div>
        <div>
          <label style={s.label}>Nom *</label>
          <input style={s.inp()} value={vals.name} placeholder="Alice Dupont / Société X" autoFocus
            onChange={e => setVals({ ...vals, name: e.target.value })}
            onKeyDown={e => e.key === "Enter" && onSave()} />
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <label style={s.label}>Description</label>
          <input style={s.inp()} value={vals.description||""} placeholder="Ex: Prestataire son, client régulier…"
            onChange={e => setVals({ ...vals, description: e.target.value })} />
        </div>
        <div style={{ gridColumn: "1/-1" }}>
          <label style={s.label}>Adresse</label>
          <input style={s.inp()} value={vals.address||""} placeholder="12 rue des Arts, 75001 Paris"
            onChange={e => setVals({ ...vals, address: e.target.value })} />
        </div>
        <div>
          <label style={s.label}>Email</label>
          <input type="email" style={s.inp()} value={vals.email||""} placeholder="contact@exemple.fr"
            onChange={e => setVals({ ...vals, email: e.target.value })} />
        </div>
        <div>
          <label style={s.label}>Téléphone</label>
          <input style={s.inp()} value={vals.phone||""} placeholder="+33 6 xx xx xx xx"
            onChange={e => setVals({ ...vals, phone: e.target.value })} />
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <button style={s.btn("primary")} onClick={onSave}>{saveLabel}</button>
        <button style={s.btn("ghost")} onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "6px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", letterSpacing: "-0.8px" }}>Contacts</h1>
          <p style={{ color: C.muted, fontSize: "14px", marginTop: "4px" }}>
            {contacts.length} contact{contacts.length !== 1 ? "s" : ""}
          </p>
        </div>
        {!adding && <button style={s.btn("primary")} onClick={() => setAdding(true)}>+ Nouveau contact</button>}
      </div>

      {adding && (
        <div style={s.card({ marginBottom: "20px", borderColor: `${C.accent}40` })}>
          <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Nouveau contact</div>
          <ContactForm vals={form} setVals={setForm} onSave={add} onCancel={() => { setAdding(false); setForm(EMPTY); }} saveLabel="Ajouter" />
        </div>
      )}

      {contacts.length > 1 && (
        <input style={{ ...s.inp({ maxWidth: "320px" }), marginBottom: "16px" }}
          value={search} placeholder="Rechercher un contact…" onChange={e => setSearch(e.target.value)} />
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "70px 20px", color: C.muted, fontSize: "14px" }}>
          {contacts.length === 0 ? "Aucun contact. Créez votre premier contact." : "Aucun résultat."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "14px" }}>
          {filtered.map(c => (
            <div key={c.id} style={s.card({ padding: "18px" })}>
              {editingId === c.id ? (
                <>
                  <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "12px" }}>Modifier</div>
                  <ContactForm vals={editForm} setVals={setEditForm}
                    onSave={() => save(c.id)} onCancel={() => setEditingId(null)} saveLabel="Enregistrer" />
                </>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div>
                      <div style={{ fontWeight: "700", fontSize: "14px" }}>{c.name}</div>
                      <div style={{ fontSize: "11px", color: c.type === "Entité" ? C.info : C.accent, marginTop: "2px" }}>
                        {c.type === "Entité" ? "▣ Entité" : "◉ Personne"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                      <button onClick={() => { setEditingId(c.id); setEditForm({ ...c }); }}
                        style={s.btn("ghost", { padding: "3px 8px", fontSize: "11px" })}>✎</button>
                      <button onClick={() => del(c.id, c.name)}
                        style={s.btn("danger", { padding: "3px 8px", fontSize: "11px" })}>✕</button>
                    </div>
                  </div>
                  {c.description && <div style={{ fontSize: "12px", color: C.muted, marginBottom: "8px", fontStyle: "italic" }}>{c.description}</div>}
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    {c.address && <div style={{ fontSize: "12px", color: C.muted }}>📍 {c.address}</div>}
                    {c.email   && <div style={{ fontSize: "12px" }}>✉ <a href={`mailto:${c.email}`} style={{ color: C.accent, textDecoration: "none" }}>{c.email}</a></div>}
                    {c.phone   && <div style={{ fontSize: "12px", color: C.muted }}>☎ {c.phone}</div>}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── DÉPENSES GLOBALES ─────────────────────────────────────────────────────────
// ── Algorithme de remboursements minimaux ──────────────────────────────────────
function computeMinimalTransfers(members, expenses) {
  if (!members.length) return [];
  const regularExpenses = (expenses||[]).filter(ex => !ex.bankCoverage);
  const bankExpenses    = (expenses||[]).filter(ex =>  ex.bankCoverage);

  // Flux bancaires : Banque→paidBy (avance) puis membres→Banque (parts) — nettés par personne
  const bankTransfers = [];
  if (bankExpenses.length > 0) {
    const n = members.length;
    const bankToMember = {}, memberToBank = {};
    bankExpenses.forEach(ex => {
      const share = ex.amount / n;
      if (ex.paidBy) bankToMember[ex.paidBy] = (bankToMember[ex.paidBy]||0) + ex.amount;
      members.forEach(m => { memberToBank[m.name] = (memberToBank[m.name]||0) + share; });
    });
    const allNames = new Set([...Object.keys(bankToMember), ...Object.keys(memberToBank)]);
    allNames.forEach(name => {
      const net = (memberToBank[name]||0) - (bankToMember[name]||0);
      if (net > 0.005)      bankTransfers.push({ id: `${name}→Banque`,  from: name,     to: "Banque", amount: Math.round(net  * 100) / 100, bankOp: true });
      else if (net < -0.005) bankTransfers.push({ id: `Banque→${name}`, from: "Banque", to: name,     amount: Math.round(-net * 100) / 100, bankOp: true });
    });
  }

  if (!regularExpenses.length) return bankTransfers;
  const total = sumArr(regularExpenses, "amount");
  const perPerson = total / members.length;
  const paid = {};
  regularExpenses.forEach(ex => { if (ex.paidBy) paid[ex.paidBy] = (paid[ex.paidBy]||0) + ex.amount; });
  const balances = members.map(m => ({ name: m.name, net: (paid[m.name]||0) - perPerson }));
  const cred = balances.filter(b => b.net >  0.005).map(b => ({...b})).sort((a,b) => b.net - a.net);
  const debt = balances.filter(b => b.net < -0.005).map(b => ({...b})).sort((a,b) => a.net - b.net);
  const transfers = [...bankTransfers];
  let i = 0, j = 0;
  while (i < debt.length && j < cred.length) {
    const amt = Math.min(-debt[i].net, cred[j].net);
    if (amt > 0.005) transfers.push({ id: `${debt[i].name}→${cred[j].name}`, from: debt[i].name, to: cred[j].name, amount: Math.round(amt * 100) / 100 });
    debt[i].net += amt; cred[j].net -= amt;
    if (debt[i].net > -0.005) i++;
    if (cred[j].net <  0.005) j++;
  }
  return transfers;
}

function DepensesPage({ data, update, users, session, can }) {
  const canEdit = can("manage_depenses");
  const isMobile = useMobile();
  const depenses = data.depenses || [];
  const bankBalance = data.assoc?.bankBalance ?? 0;
  const [depTab, setDepTab] = useState("depenses");
  const [formOpen, setFormOpen] = useState(false);

  // Pool global de partage (persisté dans data)
  const pool = data.depensesPool || [];
  const [poolInput, setPoolInput] = useState("");

  const recomputeDepense = (d, newPool) => {
    const n = newPool.length;
    const share = Math.round((n > 0 ? d.amount / n : d.amount) * 100) / 100;
    const settled = (d.reimbursements||[]).filter(r => r.settled);
    if (d.bankCoverage) {
      // Flux : Banque → paidBy (remboursement avance) + tous les membres → Banque (parts)
      const unsettled = [];
      if (d.paidBy && d.paidBy !== "Banque") {
        const alreadySettled = settled.find(r => r.from === "Banque" && r.to === d.paidBy);
        if (!alreadySettled) {
          const existing = (d.reimbursements||[]).find(r => r.from === "Banque" && r.to === d.paidBy && !r.settled);
          unsettled.push(existing ? { ...existing, amount: d.amount } : { id: uid(), from: "Banque", to: d.paidBy, amount: d.amount, settled: false, settledDate: null });
        }
      }
      newPool.forEach(p => {
        const alreadySettled = settled.find(r => r.from === p.name && r.to === "Banque");
        if (!alreadySettled) {
          const existing = (d.reimbursements||[]).find(r => r.from === p.name && r.to === "Banque" && !r.settled);
          unsettled.push(existing ? { ...existing, amount: share } : { id: uid(), from: p.name, to: "Banque", amount: share, settled: false, settledDate: null });
        }
      });
      return { ...d, participants: newPool, reimbursements: [...settled, ...unsettled] };
    } else {
      // Flux normal : membres (sauf paidBy) → paidBy
      const unsettled = newPool
        .filter(p => p.name !== d.paidBy)
        .map(p => {
          const existing = (d.reimbursements||[]).find(r => r.from === p.name && r.to !== "Banque" && !r.settled);
          return existing ? { ...existing, to: d.paidBy, amount: share } : { id: uid(), from: p.name, to: d.paidBy, amount: share, settled: false, settledDate: null };
        });
      return { ...d, participants: newPool, reimbursements: [...settled, ...unsettled] };
    }
  };

  const addToPool = (name) => {
    if (!name.trim() || pool.find(p => p.name === name.trim())) return;
    const newPool = [...pool, { name: name.trim() }];
    update({ depensesPool: newPool, depenses: depenses.map(d => recomputeDepense(d, newPool)) });
    setFormParticipants(prev => [...prev, { name: name.trim() }]);
    setPoolInput("");
  };

  const removeFromPool = (name) => {
    const newPool = pool.filter(p => p.name !== name);
    update({ depensesPool: newPool, depenses: depenses.map(d => recomputeDepense(d, newPool)) });
    setFormParticipants(prev => prev.filter(p => p.name !== name));
  };

  // Formulaire nouvelle dépense
  const [form, setForm] = useState({ label: "", amount: "", category: "Divers", paidBy: "", date: today(), bankCoverage: false });
  const [formParticipants, setFormParticipants] = useState(() => [...pool]);
  const toggleFormParticipant = (name) => setFormParticipants(prev =>
    prev.find(p => p.name === name) ? prev.filter(p => p.name !== name) : [...prev, { name }]
  );
  const [editBalance, setEditBalance] = useState(false);
  const [balVal, setBalVal] = useState(String(bankBalance));

  // Sélection & édition par lot
  const [selected, setSelected] = useState(new Set());
  const [bulkEdit, setBulkEdit] = useState(false);
  const [bulkForm, setBulkForm] = useState({ category: "", paidBy: "", date: "", bankCoverage: null, participants: null });

  const toggleSelect = (id) => setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectAll = () => setSelected(new Set(depenses.map(d => d.id)));
  const clearSelect = () => { setSelected(new Set()); setBulkEdit(false); setBulkForm({ category: "", paidBy: "", date: "", bankCoverage: null, participants: null }); };

  const applyBulk = () => {
    update({
      depenses: depenses.map(d => {
        if (!selected.has(d.id)) return d;
        let updated = {
          ...d,
          ...(bulkForm.category  ? { category: bulkForm.category }   : {}),
          ...(bulkForm.paidBy    ? { paidBy: bulkForm.paidBy }        : {}),
          ...(bulkForm.date      ? { date: bulkForm.date }            : {}),
          ...(bulkForm.bankCoverage !== null ? { bankCoverage: bulkForm.bankCoverage } : {}),
        };
        // Si on change les participants ou le payeur, recalculer les remboursements
        if (bulkForm.participants !== null || bulkForm.paidBy) {
          const newParts = bulkForm.participants !== null ? bulkForm.participants : (d.participants || []);
          const newPaidBy = bulkForm.paidBy || d.paidBy;
          const newBankCoverage = bulkForm.bankCoverage !== null ? bulkForm.bankCoverage : d.bankCoverage;
          updated = { ...updated, participants: newParts, reimbursements: buildReimbursements(updated.amount, newPaidBy, newBankCoverage, newParts) };
        }
        return updated;
      })
    });
    clearSelect();
  };

  const bulkDelete = () => {
    if (!confirm(`Supprimer les ${selected.size} dépenses sélectionnées ?`)) return;
    update({ depenses: depenses.filter(d => !selected.has(d.id)) });
    clearSelect();
  };

  // Édition d'une dépense existante
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editPartInput, setEditPartInput] = useState("");

  const startEdit = (dep) => {
    setEditingId(dep.id);
    setEditForm({
      label: dep.label, amount: String(dep.amount), category: dep.category || "Divers",
      paidBy: dep.paidBy || "", date: dep.date || today(), bankCoverage: dep.bankCoverage || false,
    });
    setEditPartInput("");
  };

  const saveEdit = (dep) => {
    if (!editForm.label.trim() || !editForm.amount) return;
    const amount = parseFloat(editForm.amount);
    const participants = dep.participants || [];
    const settled = (dep.reimbursements || []).filter(r => r.settled);
    const unsettled = buildReimbursements(amount, editForm.paidBy, editForm.bankCoverage, participants)
      .filter(r => !settled.find(s => s.from === r.from && s.to === r.to));
    update({
      depenses: depenses.map(d => d.id !== dep.id ? d : {
        ...d, ...editForm, amount,
        reimbursements: [...settled, ...unsettled],
      })
    });
    setEditingId(null); setEditForm(null);
  };

  const addEditParticipant = (dep, name) => {
    if (!name.trim() || (dep.participants || []).find(p => p.name === name.trim())) return;
    const newParts = [...(dep.participants || []), { name: name.trim() }];
    update({ depenses: depenses.map(d => d.id !== dep.id ? d : { ...d, participants: newParts }) });
    setEditPartInput("");
  };

  const removeEditParticipant = (dep, name) => {
    const newParts = (dep.participants || []).filter(p => p.name !== name);
    update({ depenses: depenses.map(d => d.id !== dep.id ? d : { ...d, participants: newParts }) });
  };

  // Liste unifiée : pool global + utilisateurs inscrits non encore dans le pool
  const allPeople = [
    ...pool,
    ...(users||[]).filter(u => !pool.find(p => p.name === u.username)).map(u => ({ name: u.username }))
  ];

  const buildReimbursements = (amount, paidBy, bankCoverage, participants) => {
    const n = participants.length;
    const share = Math.round((n > 0 ? amount / n : amount) * 100) / 100;
    if (bankCoverage) {
      const reimbursements = [];
      // Banque rembourse le membre qui a avancé l'argent
      if (paidBy && paidBy !== "Banque") {
        reimbursements.push({ id: uid(), from: "Banque", to: paidBy, amount, settled: false, settledDate: null });
      }
      // Chaque membre rembourse la banque sa part
      participants.forEach(p => {
        reimbursements.push({ id: uid(), from: p.name, to: "Banque", amount: share, settled: false, settledDate: null });
      });
      return reimbursements;
    } else {
      return participants
        .filter(p => p.name !== paidBy)
        .map(p => ({ id: uid(), from: p.name, to: paidBy, amount: share, settled: false, settledDate: null }));
    }
  };

  const addDepense = () => {
    if (!form.label.trim() || !form.amount) return;
    const amount = parseFloat(form.amount);
    const dep = {
      id: uid(), label: form.label, amount,
      category: form.category, paidBy: form.paidBy, date: form.date,
      bankCoverage: form.bankCoverage,
      participants: [...formParticipants],
      reimbursements: buildReimbursements(amount, form.paidBy, form.bankCoverage, formParticipants),
    };
    update({ depenses: [...depenses, dep] }, { action: "AJOUT", target: "Dépenses", details: form.label });
    setForm({ label: "", amount: "", category: "Divers", paidBy: "", date: today(), bankCoverage: false });
    setFormParticipants([...pool]);
  };

  const toggleSettled = (depId, reimbId) => {
    update({
      depenses: depenses.map(d => d.id !== depId ? d : {
        ...d, reimbursements: d.reimbursements.map(r => r.id !== reimbId ? r : {
          ...r, settled: !r.settled, settledDate: !r.settled ? today() : null
        })
      })
    });
  };

  const deleteDepense = (depId) => {
    if (!confirm("Supprimer cette dépense et ses remboursements ?")) return;
    update({ depenses: depenses.filter(d => d.id !== depId) }, { action: "SUPPR", target: "Dépenses", details: "" });
  };

  // Stats globales
  const totalDepenses = sumArr(depenses, "amount");
  const assoBankCovered = depenses.filter(d => d.bankCoverage).reduce((a, d) => a + d.amount, 0);
  const eventBankCovered = (data.events||[]).reduce((a, e) =>
    a + (e.expenses||[]).filter(ex => ex.bankCoverage).reduce((b, ex) => b + ex.amount, 0), 0);
  const totalBankCovered = assoBankCovered + eventBankCovered;
  const bankCoveragePct = totalBankCovered > 0 ? Math.min(Math.round(bankBalance / totalBankCovered * 100), 100) : null;
  // Priorité aux événements : ils consomment le solde bancaire en premier
  const bankRemainingAfterEvents = Math.max(0, bankBalance - eventBankCovered);
  const eventNetDeficit = Math.max(0, eventBankCovered - bankBalance);
  const eventUncoveredRatio = eventBankCovered > 0 ? eventNetDeficit / eventBankCovered : 0;
  const assoNetDeficit = Math.max(0, assoBankCovered - bankRemainingAfterEvents);
  const assoUncoveredRatio = assoBankCovered > 0 ? assoNetDeficit / assoBankCovered : 0;

  // Tous les remboursements asso (flat) — on propage bankCoverage de la dépense parente
  const allReimbs = depenses.flatMap(d => (d.reimbursements||[]).map(r => ({ ...r, depLabel: d.label, depId: d.id, depBankCoverage: !!d.bankCoverage })));
  const pendingAsso = allReimbs.filter(r => !r.settled);
  const settledAsso = allReimbs.filter(r => r.settled);

  // Agrégation par paire (from → to) pour l'affichage
  // bankCoverageGroup = true si TOUS les remboursements de la paire sont pour des dépenses bank-covered
  const pendingByPair = {};
  pendingAsso.forEach(r => {
    const key = `${r.from}→${r.to}`;
    if (!pendingByPair[key]) pendingByPair[key] = { from: r.from, to: r.to, total: 0, entries: [], allBankCovered: true };
    pendingByPair[key].total += r.amount;
    pendingByPair[key].entries.push(r);
    if (!r.depBankCoverage) pendingByPair[key].allBankCovered = false;
  });
  const settledByPair = {};
  settledAsso.forEach(r => {
    const key = `${r.from}→${r.to}`;
    if (!settledByPair[key]) settledByPair[key] = { from: r.from, to: r.to, total: 0, count: 0 };
    settledByPair[key].total += r.amount;
    settledByPair[key].count++;
  });

  const settleGroup = (entries) => {
    const ids = new Set(entries.map(r => r.id));
    update({
      depenses: depenses.map(d => ({
        ...d,
        reimbursements: (d.reimbursements||[]).map(r =>
          ids.has(r.id) ? { ...r, settled: true, settledDate: today() } : r
        )
      }))
    });
  };
  const unsettleGroup = (entries) => {
    const ids = new Set(entries.filter(r => !r.confirmed).map(r => r.id));
    if (!ids.size) return;
    update({
      depenses: depenses.map(d => ({
        ...d,
        reimbursements: (d.reimbursements||[]).map(r =>
          ids.has(r.id) ? { ...r, settled: false, settledDate: null } : r
        )
      }))
    });
  };

  const pendingByPerson = {};
  pendingAsso.forEach(r => { if (!pendingByPerson[r.from]) pendingByPerson[r.from] = []; pendingByPerson[r.from].push(r); });

  // Remboursements événements (calculés + statut stocké)
  const eventsWithMembers = (data.events||[]).filter(e => (e.members||[]).length > 0 && (e.expenses||[]).length > 0);
  const toggleEventSettlement = (eventId, sId) => {
    const ev = (data.events||[]).find(e => e.id === eventId);
    const existing = (ev.settlements||[]).find(s => s.id === sId);
    const next = existing
      ? (ev.settlements||[]).map(s => s.id === sId ? { ...s, settled: !s.settled, settledDate: !s.settled ? today() : null } : s)
      : [...(ev.settlements||[]), { id: sId, settled: true, settledDate: today() }];
    update({ events: (data.events||[]).map(e => e.id === eventId ? { ...e, settlements: next } : e) });
  };

  // Soldes nets par personne — séparés membres / banque
  const netMember = {}, netBank = {};
  const addMember = (name, amt) => { if (!name || name === "Banque") return; netMember[name] = (netMember[name]||0) + amt; };
  const addBank   = (name, amt) => { if (!name || name === "Banque") return; netBank[name]   = (netBank[name]||0)   + amt; };
  // Depuis dépenses asso
  allReimbs.filter(r => !r.settled).forEach(r => {
    const dispAmt = r.depBankCoverage ? Math.round(r.amount * assoUncoveredRatio * 100) / 100 : r.amount;
    if (dispAmt < 0.01) return;
    if (r.from === "Banque")      addBank(r.to, dispAmt);
    else if (r.to === "Banque")   addBank(r.from, -dispAmt);
    else { addMember(r.from, -dispAmt); addMember(r.to, dispAmt); }
  });
  // Depuis événements
  eventsWithMembers.forEach(ev => {
    const transfers = computeMinimalTransfers(ev.members||[], ev.expenses||[]);
    transfers.forEach(t => {
      const stored = (ev.settlements||[]).find(s => s.id === t.id);
      if (stored?.settled) return;
      const dispAmt = t.bankOp ? Math.round(t.amount * eventUncoveredRatio * 100) / 100 : t.amount;
      if (dispAmt < 0.01) return;
      if (t.from === "Banque")     addBank(t.to, dispAmt);
      else if (t.to === "Banque")  addBank(t.from, -dispAmt);
      else { addMember(t.from, -dispAmt); addMember(t.to, dispAmt); }
    });
  });
  const allNetNames = new Set([...Object.keys(netMember), ...Object.keys(netBank)]);
  const netList = [...allNetNames].map(name => ({
    name,
    netMember: Math.round((netMember[name]||0) * 100) / 100,
    netBank:   Math.round((netBank[name]||0)   * 100) / 100,
  })).sort((a, b) => (a.netMember + a.netBank) - (b.netMember + b.netBank));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "6px", flexWrap: "wrap", gap: "10px" }}>
        <h1 style={{ fontFamily: C.display, fontSize: isMobile ? "22px" : "26px", fontWeight: "800", letterSpacing: "-0.8px" }}>Dépenses</h1>
        <div style={{ display: "flex", gap: "2px", borderBottom: `1px solid ${C.border}` }}>
          {[
            { id: "depenses",       label: "Dépenses" },
            { id: "remboursements", label: isMobile
                ? `Remb.${netList.some(x=>x.netMember+x.netBank<-0.01) ? ` (${netList.filter(x=>x.netMember+x.netBank<-0.01).length})` : ""}`
                : `Remboursements${netList.some(x=>x.netMember+x.netBank<-0.01) ? ` (${netList.filter(x=>x.netMember+x.netBank<-0.01).length} en attente)` : ""}` },
          ].map(t => (
            <button key={t.id} onClick={() => setDepTab(t.id)} style={{ padding: isMobile ? "8px 12px" : "8px 16px", background: "none", border: "none", cursor: "pointer", borderBottom: `2px solid ${depTab===t.id ? C.accent : "transparent"}`, color: depTab===t.id ? C.accent : C.muted, fontFamily: C.font, fontSize: "13px", fontWeight: depTab===t.id ? "600" : "400", marginBottom: "-1px", transition: "all 0.15s" }}>{t.label}</button>
          ))}
        </div>
      </div>
      {!isMobile && <p style={{ color: C.muted, marginBottom: "24px", fontSize: "14px" }}>Dépenses de l'association, remboursements et solde bancaire</p>}

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(150px, 1fr))", gap: isMobile ? "10px" : "14px", marginBottom: isMobile ? "16px" : "24px" }}>
        <div style={s.card()}>
          <div style={s.label}>Total dépenses</div>
          <div style={{ fontFamily: C.mono, fontSize: "20px", color: C.warn, marginTop: "4px" }}>{fmt(totalDepenses)}</div>
        </div>
        <div style={s.card()}>
          <div style={s.label}>À rembourser</div>
          <div style={{ fontFamily: C.mono, fontSize: "20px", color: C.danger, marginTop: "4px" }}>{fmt(sumArr(pendingAsso, "amount"))}</div>
        </div>
        <div style={s.card()}>
          <div style={s.label}>Engagements bancaires (asso)</div>
          <div style={{ fontFamily: C.mono, fontSize: "20px", color: C.info, marginTop: "4px" }}>{fmt(assoBankCovered)}</div>
          {assoBankCovered > 0 && <div style={{ fontSize: "10px", color: C.muted, marginTop: "3px" }}>Total des dépenses à couvrir par la banque</div>}
        </div>
        <div style={s.card()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={s.label}>Solde bancaire</div>
            {canEdit && <button style={{ ...s.btn("ghost"), padding: "2px 7px", fontSize: "11px" }} onClick={() => { setEditBalance(!editBalance); setBalVal(String(bankBalance)); }}>
              {editBalance ? "Annuler" : "Modifier"}
            </button>}
          </div>
          {editBalance ? (
            <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
              <input type="number" style={s.inp({ flex: 1 })} value={balVal} onChange={e => setBalVal(e.target.value)} />
              <button style={s.btn("primary", { padding: "6px 10px", fontSize: "12px" })} onClick={() => {
                update({ assoc: { ...data.assoc, bankBalance: parseFloat(balVal)||0 } });
                setEditBalance(false);
              }}>OK</button>
            </div>
          ) : (
            <>
              <div style={{ fontFamily: C.mono, fontSize: "20px", color: C.accent, marginTop: "4px" }}>{fmt(bankBalance)}</div>
              {bankCoveragePct !== null && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: C.muted, marginTop: "6px", marginBottom: "3px" }}>
                    <span>Couvre les dépenses bancaires</span>
                    <span style={{ fontFamily: C.mono, color: bankCoveragePct >= 100 ? C.accent : bankCoveragePct >= 50 ? C.warn : C.danger, fontWeight: "600" }}>{bankCoveragePct}%</span>
                  </div>
                  <div style={{ height: "4px", borderRadius: "2px", background: C.border, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${bankCoveragePct}%`, borderRadius: "2px", background: bankCoveragePct >= 100 ? C.accent : bankCoveragePct >= 50 ? C.warn : C.danger, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ fontSize: "10px", color: C.muted, marginTop: "3px" }}>{fmt(totalBankCovered)} d'engagements bancaires</div>
                </>
              )}
              {bankCoveragePct === null && <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>Aucune dépense bancaire active</div>}
            </>
          )}
        </div>
      </div>

      {/* ── Onglet Dépenses ── */}
      {depTab === "depenses" && <>

      {/* Formulaire ajout dépense */}
      {canEdit && isMobile && (
        <button style={s.btn("primary", { width: "100%", marginBottom: "12px", padding: "11px" })} onClick={() => setFormOpen(v => !v)}>
          {formOpen ? "✕ Fermer" : "+ Nouvelle dépense"}
        </button>
      )}
      {canEdit && (!isMobile || formOpen) && <div style={s.card({ marginBottom: "16px", borderColor: C.accentBg })}>
        <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Ajouter une dépense</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px", marginBottom: "10px" }}>
          <div style={isMobile ? { gridColumn: "1 / -1" } : {}}>
            <label style={s.label}>Libellé *</label>
            <input style={s.inp()} value={form.label} placeholder="Ex: Achat matériel" onChange={e => setForm({ ...form, label: e.target.value })} />
          </div>
          <div>
            <label style={s.label}>Montant (€) *</label>
            <input type="number" style={s.inp()} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label style={s.label}>Catégorie</label>
            <select style={s.inp()} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {CATS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Date</label>
            <input type="date" style={s.inp()} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label style={s.label}>Payé par</label>
            <select style={s.inp()} value={form.paidBy} onChange={e => setForm({ ...form, paidBy: e.target.value })}>
              <option value="">— Sélectionner —</option>
              {allPeople.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* Couverture bancaire */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: C.card2, borderRadius: "8px", marginBottom: "10px", cursor: "pointer" }} onClick={() => setForm({ ...form, bankCoverage: !form.bankCoverage })}>
          <div style={{ width: "18px", height: "18px", borderRadius: "4px", border: `2px solid ${form.bankCoverage ? C.info : C.border}`, background: form.bankCoverage ? `${C.info}30` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {form.bankCoverage && <span style={{ color: C.info, fontSize: "11px", fontWeight: "700" }}>✓</span>}
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "500" }}>Couverture bancaire</div>
            <div style={{ fontSize: "11px", color: C.muted }}>La banque de l'association couvre cette dépense — les participants remboursent la banque</div>
          </div>
        </div>

        {/* Participants (sélection individuelle depuis le pool) */}
        <div style={{ padding: "10px 14px", background: C.card2, borderRadius: "8px", marginBottom: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", color: C.muted }}>
              Participants ({formParticipants.length}/{pool.length}) — cliquez pour inclure/exclure
            </span>
            {form.amount && formParticipants.length > 0 && (
              <span style={{ fontSize: "12px", fontFamily: C.mono, color: C.accent }}>
                Part : {fmt(parseFloat(form.amount||0) / formParticipants.length)}
              </span>
            )}
          </div>
          {pool.length === 0
            ? <span style={{ fontSize: "12px", color: C.muted, fontStyle: "italic" }}>Aucun participant — gérez le pool ci-dessous</span>
            : <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                {pool.map(p => {
                  const active = !!formParticipants.find(x => x.name === p.name);
                  return (
                    <span key={p.name} onClick={() => toggleFormParticipant(p.name)} style={{
                      cursor: "pointer", userSelect: "none",
                      background: active ? `${C.accent}20` : "transparent",
                      border: `1px solid ${active ? C.accent : C.border}`,
                      borderRadius: "20px", padding: "3px 10px", fontSize: "12px",
                      color: active ? C.accent : C.muted,
                    }}>
                      {active ? "✓ " : ""}{p.name}
                    </span>
                  );
                })}
              </div>
          }
        </div>

        <button style={s.btn("primary")} onClick={addDepense}>+ Ajouter la dépense</button>
      </div>}

      {/* Gestion du pool de partage */}
      <div style={s.card({ marginBottom: "16px" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px" }}>Pool de partage</div>
            <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>
              Ajouter / retirer une personne met à jour toutes les dépenses et recalcule les parts
            </div>
          </div>
          {pool.length > 0 && form.amount === "" && (
            <span style={{ fontSize: "12px", fontFamily: C.mono, color: C.accent }}>
              Part actuelle : {fmt(depenses.length > 0 ? sumArr(depenses, "amount") / pool.length : 0)} / personne
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
          {(users||[]).filter(u => !pool.find(p => p.name === u.username)).length > 0 && (
            <select style={s.inp({ flex: 1, minWidth: "150px" })} value="" onChange={e => { if (e.target.value) addToPool(e.target.value); }}>
              <option value="">+ Ajouter un membre…</option>
              {(users||[]).filter(u => !pool.find(p => p.name === u.username)).map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
            </select>
          )}
          <input style={s.inp({ flex: 1, minWidth: "140px" })} value={poolInput} placeholder="Ou nom libre…"
            onChange={e => setPoolInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addToPool(poolInput); }} />
          <button style={s.btn("primary", { padding: "9px 14px" })} onClick={() => addToPool(poolInput)} disabled={!poolInput.trim()}>+</button>
        </div>
        {pool.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {pool.map(p => {
              const u = (users||[]).find(u => u.username === p.name);
              return (
                <span key={p.name} style={{ display: "flex", alignItems: "center", gap: "7px", background: C.card2, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "4px 10px 4px 6px", fontSize: "13px" }}>
                  <UserAvatar username={p.name} avatar={u?.avatar} size={20} />
                  {p.name}
                  {canEdit && <button onClick={() => removeFromPool(p.name)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "12px", padding: 0, lineHeight: 1 }}>✕</button>}
                </span>
              );
            })}
          </div>
        ) : (
          <p style={{ color: C.muted, fontSize: "13px" }}>Aucun participant dans le pool. Ajoutez des personnes pour activer le partage automatique.</p>
        )}
      </div>

      {/* Liste des dépenses */}
      {depenses.length > 0 && (
        <div style={s.card({ marginBottom: "16px" })}>
          {/* En-tête avec sélection */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: selected.size > 0 ? "10px" : "14px", flexWrap: "wrap" }}>
            {canEdit && (
              <input type="checkbox" checked={selected.size === depenses.length && depenses.length > 0}
                ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < depenses.length; }}
                onChange={e => e.target.checked ? selectAll() : clearSelect()}
                style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: C.accent }} />
            )}
            <span style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px" }}>
              Dépenses enregistrées ({depenses.length})
            </span>
            {selected.size > 0 && <span style={{ fontSize: "12px", color: C.accent }}>{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>}
          </div>

          {/* Barre d'actions par lot */}
          {canEdit && selected.size > 0 && (
            <div style={{ marginBottom: "12px", padding: "10px 14px", background: `${C.accent}12`, border: `1px solid ${C.accent}30`, borderRadius: "8px" }}>
              {!bulkEdit ? (
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: "12px", color: C.accent, fontWeight: "500" }}>Actions sur la sélection :</span>
                  <button style={s.btn("secondary", { fontSize: "12px", padding: "5px 12px" })} onClick={() => setBulkEdit(true)}>✎ Modifier les champs</button>
                  <button style={s.btn("danger", { fontSize: "12px", padding: "5px 12px" })} onClick={bulkDelete}>✕ Supprimer</button>
                  <button style={s.btn("ghost", { fontSize: "12px", padding: "5px 10px" })} onClick={clearSelect}>Annuler</button>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: "12px", color: C.accent, fontWeight: "500", marginBottom: "10px" }}>
                    Modifier {selected.size} dépense{selected.size > 1 ? "s" : ""} — seuls les champs remplis seront appliqués
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "8px", marginBottom: "10px" }}>
                    <div>
                      <label style={s.label}>Catégorie</label>
                      <select style={s.inp()} value={bulkForm.category} onChange={e => setBulkForm({ ...bulkForm, category: e.target.value })}>
                        <option value="">— inchangée —</option>
                        {CATS.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={s.label}>Payé par</label>
                      <select style={s.inp()} value={bulkForm.paidBy} onChange={e => setBulkForm({ ...bulkForm, paidBy: e.target.value })}>
                        <option value="">— inchangé —</option>
                        {allPeople.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={s.label}>Date</label>
                      <input type="date" style={s.inp()} value={bulkForm.date} onChange={e => setBulkForm({ ...bulkForm, date: e.target.value })} />
                    </div>
                    <div>
                      <label style={s.label}>Couverture bancaire</label>
                      <select style={s.inp()} value={bulkForm.bankCoverage === null ? "" : String(bulkForm.bankCoverage)}
                        onChange={e => setBulkForm({ ...bulkForm, bankCoverage: e.target.value === "" ? null : e.target.value === "true" })}>
                        <option value="">— inchangée —</option>
                        <option value="true">Activée</option>
                        <option value="false">Désactivée</option>
                      </select>
                    </div>
                  </div>
                  {/* Pour qui — sélection multiple depuis allPeople */}
                  <div style={{ marginBottom: "10px" }}>
                    <label style={s.label}>Pour qui (bénéficiaires)</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "8px 10px", background: C.card2, borderRadius: "8px", marginTop: "4px", alignItems: "center" }}>
                      <span style={{ fontSize: "11px", color: C.muted, flexShrink: 0 }}>
                        {bulkForm.participants === null ? "— inchangé —" : bulkForm.participants.length === 0 ? "Personne sélectionné" : `${bulkForm.participants.length} personne(s)`}
                      </span>
                      {allPeople.map(p => {
                        const sel = bulkForm.participants !== null && bulkForm.participants.find(x => x.name === p.name);
                        return (
                          <span key={p.name} onClick={() => {
                            if (bulkForm.participants === null) {
                              setBulkForm({ ...bulkForm, participants: [{ name: p.name }] });
                            } else if (sel) {
                              setBulkForm({ ...bulkForm, participants: bulkForm.participants.filter(x => x.name !== p.name) });
                            } else {
                              setBulkForm({ ...bulkForm, participants: [...bulkForm.participants, { name: p.name }] });
                            }
                          }} style={{ cursor: "pointer", padding: "3px 10px", borderRadius: "20px", fontSize: "12px", border: `1px solid ${sel ? C.accent : C.border}`, background: sel ? `${C.accent}20` : "transparent", color: sel ? C.accent : C.muted }}>
                            {p.name}
                          </span>
                        );
                      })}
                      {bulkForm.participants !== null && (
                        <button style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "11px", padding: "2px 6px" }} onClick={() => setBulkForm({ ...bulkForm, participants: null })}>réinitialiser</button>
                      )}
                      {allPeople.length > 0 && bulkForm.participants === null && (
                        <button style={{ background: "none", border: `1px solid ${C.accent}40`, color: C.accent, cursor: "pointer", fontSize: "11px", padding: "3px 8px", borderRadius: "20px" }} onClick={() => setBulkForm({ ...bulkForm, participants: allPeople.map(p => ({ name: p.name })) })}>Tout sélectionner</button>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button style={s.btn("primary", { fontSize: "12px", padding: "6px 14px" })} onClick={applyBulk}>✓ Appliquer</button>
                    <button style={s.btn("ghost", { fontSize: "12px", padding: "6px 10px" })} onClick={() => setBulkEdit(false)}>Retour</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {[...depenses].reverse().map(dep => {
              const isEditing = editingId === dep.id;
              const availEditUsers = (users||[]).filter(u => !(dep.participants||[]).find(p => p.name === u.username));
              const pendingCount = (dep.reimbursements||[]).filter(r => !r.settled).length;
              return (
                <div key={dep.id} style={{ background: isEditing ? C.card : "transparent", borderRadius: "8px", borderLeft: `3px solid ${isEditing ? (dep.bankCoverage ? C.info : C.warn) : "transparent"}`, overflow: "hidden", transition: "background 0.1s" }}>
                  {/* Ligne résumé */}
                  {isMobile ? (
                    /* ── Mobile : carte 2 lignes ── */
                    <div style={{ padding: "10px 12px", background: selected.has(dep.id) ? `${C.accent}0e` : "transparent", borderRadius: "6px" }}>
                      {/* Ligne 1 : dot + label + montant */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                        {canEdit && (
                          <input type="checkbox" checked={selected.has(dep.id)} onChange={() => toggleSelect(dep.id)}
                            onClick={e => e.stopPropagation()}
                            style={{ width: "15px", height: "15px", cursor: "pointer", flexShrink: 0, accentColor: C.accent }} />
                        )}
                        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: dep.bankCoverage ? C.info : C.warn, flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: "14px", fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dep.label}</span>
                        <span style={{ fontFamily: C.mono, fontSize: "14px", color: C.warn, fontWeight: "700", flexShrink: 0 }}>{fmt(dep.amount)}</span>
                      </div>
                      {/* Ligne 2 : meta + badge + actions */}
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", paddingLeft: canEdit ? "23px" : "15px" }}>
                        <span style={{ fontSize: "11px", color: C.muted, flex: 1 }}>
                          {dep.paidBy || "—"} · {dep.date}
                        </span>
                        {pendingCount > 0 && <span style={{ fontSize: "10px", background: `${C.warn}20`, color: C.warn, borderRadius: "10px", padding: "2px 7px", flexShrink: 0 }}>{pendingCount} remb.</span>}
                        {canEdit && (
                          <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                            <button onClick={() => isEditing ? setEditingId(null) : startEdit(dep)} style={s.btn("ghost", { padding: "3px 9px", fontSize: "12px" })}>
                              {isEditing ? "✕" : "✎"}
                            </button>
                            <button onClick={() => deleteDepense(dep.id)} style={s.btn("danger", { padding: "3px 7px", fontSize: "12px" })}>✕</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ── Desktop : ligne compacte ── */
                    <div style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: "8px", borderRadius: "6px", background: selected.has(dep.id) ? `${C.accent}0e` : "transparent" }}
                      onMouseEnter={e => { if (!isEditing && !selected.has(dep.id)) e.currentTarget.style.background = C.card2; }}
                      onMouseLeave={e => { if (!isEditing && !selected.has(dep.id)) e.currentTarget.style.background = "transparent"; }}>
                      {canEdit && (
                        <input type="checkbox" checked={selected.has(dep.id)} onChange={() => toggleSelect(dep.id)}
                          onClick={e => e.stopPropagation()}
                          style={{ width: "13px", height: "13px", cursor: "pointer", flexShrink: 0, accentColor: C.accent }} />
                      )}
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: dep.bankCoverage ? C.info : C.warn, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: "13px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dep.label}</span>
                      <span style={{ fontFamily: C.mono, fontSize: "13px", color: C.warn, flexShrink: 0 }}>{fmt(dep.amount)}</span>
                      <span style={{ fontSize: "11px", color: C.muted, flexShrink: 0, minWidth: "70px" }}>{dep.paidBy || "—"}</span>
                      <span style={{ fontSize: "11px", color: C.muted, flexShrink: 0, minWidth: "55px" }}>{dep.date}</span>
                      {pendingCount > 0 && <span style={{ fontSize: "10px", background: `${C.warn}20`, color: C.warn, borderRadius: "10px", padding: "1px 6px", flexShrink: 0 }}>{pendingCount} remb.</span>}
                      {canEdit && (
                        <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                          <button onClick={() => isEditing ? setEditingId(null) : startEdit(dep)} style={{ ...s.btn("ghost", { padding: "2px 8px", fontSize: "11px" }) }}>
                            {isEditing ? "✕" : "✎"}
                          </button>
                          <button onClick={() => deleteDepense(dep.id)} style={s.btn("danger", { padding: "2px 6px", fontSize: "11px" })}>✕</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Panneau d'édition inline */}
                  {isEditing && editForm && (
                    <div style={{ padding: "14px 14px 16px", borderTop: `1px solid ${C.border}`, background: C.card }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "8px", marginBottom: "10px" }}>
                        <div>
                          <label style={s.label}>Libellé</label>
                          <input style={s.inp()} value={editForm.label} onChange={e => setEditForm({ ...editForm, label: e.target.value })} />
                        </div>
                        <div>
                          <label style={s.label}>Montant (€)</label>
                          <input type="number" style={s.inp()} value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: e.target.value })} />
                        </div>
                        <div>
                          <label style={s.label}>Catégorie</label>
                          <select style={s.inp()} value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })}>
                            {CATS.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={s.label}>Date</label>
                          <input type="date" style={s.inp()} value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })} />
                        </div>
                        <div>
                          <label style={s.label}>Payé par</label>
                          <select style={s.inp()} value={editForm.paidBy} onChange={e => setEditForm({ ...editForm, paidBy: e.target.value })}>
                            <option value="">— Sélectionner —</option>
                            {allPeople.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                            {editForm.paidBy && !allPeople.find(p => p.name === editForm.paidBy) && (
                              <option value={editForm.paidBy}>{editForm.paidBy} (hors liste)</option>
                            )}
                          </select>
                        </div>
                      </div>

                      {/* Couverture bancaire */}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: C.card2, borderRadius: "8px", marginBottom: "10px", cursor: "pointer" }}
                        onClick={() => setEditForm({ ...editForm, bankCoverage: !editForm.bankCoverage })}>
                        <div style={{ width: "16px", height: "16px", borderRadius: "4px", border: `2px solid ${editForm.bankCoverage ? C.info : C.border}`, background: editForm.bankCoverage ? `${C.info}30` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {editForm.bankCoverage && <span style={{ color: C.info, fontSize: "10px", fontWeight: "700" }}>✓</span>}
                        </div>
                        <span style={{ fontSize: "12px" }}>Couverture bancaire {editForm.bankCoverage ? <span style={{ color: C.info }}>(activée)</span> : <span style={{ color: C.muted }}>(désactivée)</span>}</span>
                      </div>

                      {/* Participants */}
                      <div style={{ marginBottom: "10px" }}>
                        <label style={s.label}>Participants</label>
                        <div style={{ display: "flex", gap: "6px", marginBottom: "6px", flexWrap: "wrap" }}>
                          {availEditUsers.length > 0 && (
                            <select style={s.inp({ flex: 1, minWidth: "120px" })} value="" onChange={e => { if (e.target.value) addEditParticipant(dep, e.target.value); }}>
                              <option value="">+ Depuis la liste…</option>
                              {availEditUsers.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                            </select>
                          )}
                          <input style={s.inp({ flex: 1, minWidth: "120px" })} value={editPartInput} placeholder="Nom libre…" onChange={e => setEditPartInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") { addEditParticipant(dep, editPartInput); } }} />
                          <button style={s.btn("secondary", { padding: "6px 10px", fontSize: "12px" })} onClick={() => addEditParticipant(dep, editPartInput)}>+</button>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                          {(dep.participants||[]).map((p, i) => (
                            <span key={i} style={{ background: C.card2, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "3px 10px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
                              {p.name}
                              <button onClick={() => removeEditParticipant(dep, p.name)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "11px", padding: 0 }}>✕</button>
                            </span>
                          ))}
                        </div>
                        {(dep.participants||[]).length > 0 && editForm.amount && (
                          <div style={{ fontSize: "11px", color: C.muted, marginTop: "4px" }}>
                            Part / personne : <span style={{ color: C.accent, fontFamily: C.mono }}>{fmt(parseFloat(editForm.amount||0) / dep.participants.length)}</span>
                          </div>
                        )}
                      </div>

                      <button style={s.btn("primary", { fontSize: "12px" })} onClick={() => saveEdit(dep)}>✓ Sauvegarder</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      </>}

      {/* ── Onglet Remboursements ── */}
      {depTab === "remboursements" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Soldes nets par personne */}
          {netList.length > 0 && (
            <div style={s.card()}>
              <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "4px" }}>Soldes par personne</div>
              <div style={{ fontSize: "11px", color: C.muted, marginBottom: "14px" }}>
                <span style={{ color: C.warn }}>●</span> Entre membres&nbsp;&nbsp;<span style={{ color: C.info }}>●</span> Avec la banque
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(230px, 1fr))", gap: "10px" }}>
                {netList.map(({ name, netMember, netBank }) => {
                  const u = (users||[]).find(u => u.username === name);
                  const total = netMember + netBank;
                  const borderColor = Math.abs(total) < 0.01 ? C.border : total > 0 ? C.accent+"40" : C.danger+"40";
                  return (
                    <div key={name} style={{ padding: "10px 12px", background: C.card2, borderRadius: "8px", border: `1px solid ${borderColor}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                        <UserAvatar username={name} avatar={u?.avatar} size={28} />
                        <div style={{ fontWeight: "600", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        {/* Solde membres */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                          <span style={{ color: C.muted }}>● Membres</span>
                          <span style={{ fontFamily: C.mono, color: Math.abs(netMember) < 0.01 ? C.muted : netMember > 0 ? C.accent : C.danger, fontWeight: "600" }}>
                            {Math.abs(netMember) < 0.01 ? "—" : netMember > 0 ? `+${fmt(netMember)}` : fmt(netMember)}
                          </span>
                        </div>
                        {/* Solde banque */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                          <span style={{ color: C.muted }}>● Banque</span>
                          <span style={{ fontFamily: C.mono, color: Math.abs(netBank) < 0.01 ? C.muted : netBank > 0 ? C.info : C.warn, fontWeight: "600" }}>
                            {Math.abs(netBank) < 0.01 ? "—" : netBank > 0 ? `+${fmt(netBank)}` : fmt(netBank)}
                          </span>
                        </div>
                        {/* Total */}
                        {(Math.abs(netMember) >= 0.01 || Math.abs(netBank) >= 0.01) && (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", paddingTop: "4px", borderTop: `1px solid ${C.border}`, marginTop: "2px" }}>
                            <span style={{ color: C.muted }}>Total</span>
                            <span style={{ fontFamily: C.mono, color: Math.abs(total) < 0.01 ? C.muted : total > 0 ? C.accent : C.danger, fontWeight: "700" }}>
                              {Math.abs(total) < 0.01 ? "Équilibré ✓" : total > 0 ? `+${fmt(total)}` : fmt(total)}
                            </span>
                          </div>
                        )}
                        {Math.abs(total) < 0.01 && <div style={{ fontSize: "11px", color: C.accent, textAlign: "right" }}>Équilibré ✓</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Remboursements par événement */}
          {eventsWithMembers.map(ev => {
            const transfers = computeMinimalTransfers(ev.members||[], ev.expenses||[]);
            if (transfers.length === 0) return null;
            const storedSettlements = ev.settlements || [];
            // Appliquer eventUncoveredRatio aux transfers bancaires (bankOp=true) ; masquer si absorbé
            const getDisplayAmount = (t) => t.bankOp ? Math.round(t.amount * eventUncoveredRatio * 100) / 100 : t.amount;
            const pendingT = transfers
              .filter(t => !storedSettlements.find(s => s.id === t.id)?.settled)
              .filter(t => getDisplayAmount(t) >= 0.01);
            const settledT = transfers.filter(t =>  storedSettlements.find(s => s.id === t.id)?.settled);
            return (
              <div key={ev.id} style={s.card()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
                  <div>
                    <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px" }}>◆ {ev.name}</div>
                    <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>
                      {ev.date} · Total dépenses : {fmt(sumArr(ev.expenses, "amount"))} · {ev.members.length} participant{ev.members.length > 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    {pendingT.length === 0 && <span style={{ fontSize: "12px", color: C.accent }}>✓ Tout réglé</span>}
                    {pendingT.length > 0 && <span style={{ fontSize: "11px", background: `${C.warn}20`, color: C.warn, padding: "2px 8px", borderRadius: "20px" }}>{pendingT.length} en attente</span>}
                  </div>
                </div>

                {pendingT.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: settledT.length > 0 ? "12px" : 0 }}>
                    {pendingT.map(t => {
                      const dispAmt = getDisplayAmount(t);
                      const fromBank = t.from === "Banque";
                      const toBank = t.to === "Banque";
                      const bColor = fromBank ? C.accent : toBank ? C.info : C.warn;
                      return (
                      <div key={t.id} style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", padding: "10px 14px", background: C.card2, borderRadius: "8px", borderLeft: `3px solid ${bColor}`, flexWrap: "wrap", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                          <UserAvatar username={t.from} avatar={(users||[]).find(u=>u.username===t.from)?.avatar} size={28} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: "600", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {fromBank ? "🏦 Banque" : t.from}
                              <span style={{ color: C.muted, fontWeight: "400" }}> → </span>
                              {toBank ? "🏦 Banque" : t.to}
                            </div>
                            {t.bankOp && eventUncoveredRatio < 1 && (
                              <div style={{ fontSize: "10px", color: C.info, marginTop: "2px" }}>
                                {fmt(t.amount)} brut · {fmt(Math.round(t.amount * (1 - eventUncoveredRatio) * 100) / 100)} absorbé
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                          <span style={{ fontFamily: C.mono, fontSize: "15px", fontWeight: "700", color: bColor }}>{fmt(dispAmt)}</span>
                          <button onClick={() => toggleEventSettlement(ev.id, t.id)} style={s.btn("primary", { padding: isMobile ? "8px 12px" : "6px 14px", fontSize: "12px" })}>
                            {isMobile ? "✓ Réglé" : "Marquer réglé"}
                          </button>
                        </div>
                      </div>
                    );})}

                  </div>
                )}

                {settledT.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ fontSize: "11px", color: C.muted, marginBottom: "6px" }}>Réglés</div>
                    {settledT.map(t => {
                      const stored = storedSettlements.find(s => s.id === t.id);
                      return (
                        <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: `${C.accent}08`, borderRadius: "8px", opacity: 0.7, flexWrap: "wrap", gap: "6px" }}>
                          <div style={{ fontSize: "12px" }}>
                            <span style={{ color: C.accent }}>✓ </span>
                            <span style={{ fontWeight: "500" }}>{t.from}</span>
                            <span style={{ color: C.muted }}> → {t.to}</span>
                            <span style={{ fontFamily: C.mono, color: C.muted, marginLeft: "8px" }}>{fmt(t.amount)}</span>
                            {stored?.settledDate && <span style={{ color: C.muted, fontSize: "11px" }}> · {stored.settledDate}</span>}
                          </div>
                          {stored?.confirmed
                            ? <span style={{ fontSize: "10px", color: C.accent, padding: "2px 8px", border: `1px solid ${C.accent}40`, borderRadius: "10px" }}>Confirmé ✓</span>
                            : <button onClick={() => toggleEventSettlement(ev.id, t.id)} style={s.btn("ghost", { padding: "3px 8px", fontSize: "11px" })}>Annuler</button>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Remboursements dépenses asso */}
          <div style={s.card()}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px" }}>
              Dépenses association · Remboursements
              {pendingAsso.length > 0 && <span style={{ fontSize: "12px", color: C.warn, fontWeight: "400", marginLeft: "8px" }}>{pendingAsso.length} en attente</span>}
            </div>
            {pendingAsso.length === 0 && settledAsso.length === 0 ? (
              <p style={{ color: C.muted, fontSize: "13px" }}>Aucun remboursement enregistré.</p>
            ) : (
              <>
                {Object.keys(pendingByPair).length === 0 ? (
                  <p style={{ color: C.accent, fontSize: "13px", marginBottom: settledAsso.length > 0 ? "12px" : 0 }}>✓ Tout est réglé pour les dépenses asso !</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: settledAsso.length > 0 ? "16px" : 0 }}>
                    {assoBankCovered > 0 && (
                      <div style={{ padding: "8px 12px", background: `${C.info}10`, border: `1px solid ${C.info}30`, borderRadius: "8px", fontSize: "12px", color: C.info }}>
                        {eventBankCovered > 0
                          ? <>Les événements ont la priorité sur le solde bancaire ({fmt(bankBalance)}). Après couverture des événements ({fmt(eventBankCovered)}), il reste <strong>{fmt(bankRemainingAfterEvents)}</strong> pour les dépenses asso ({fmt(assoBankCovered)} d'engagements).</>
                          : <>Le solde bancaire ({fmt(bankBalance)}) couvre les dépenses asso ({fmt(assoBankCovered)} d'engagements).</>
                        }
                        {assoUncoveredRatio === 0
                          ? " Les membres n'ont rien à rembourser à la banque pour les dépenses asso."
                          : assoUncoveredRatio < 1
                          ? ` Les montants ci-dessous sont réduits en conséquence (−${fmt(Math.round((1 - assoUncoveredRatio) * assoBankCovered * 100) / 100)} pris en charge).`
                          : " Le solde restant ne couvre pas les dépenses asso — les membres remboursent la banque intégralement."}
                      </div>
                    )}
                    {Object.values(pendingByPair).map(({ from, to, total, entries, allBankCovered }) => {
                      const toBank = to === "Banque";
                      const fromBank = from === "Banque";
                      // Appliquer assoUncoveredRatio si la paire concerne des dépenses bank-covered (quelle que soit la direction)
                      const isCoveredByBank = toBank || fromBank || allBankCovered;
                      const displayTotal = isCoveredByBank ? Math.round(total * assoUncoveredRatio * 100) / 100 : Math.round(total * 100) / 100;
                      // Ne pas afficher les lignes entièrement absorbées par le solde
                      if (displayTotal < 0.01) return null;
                      const borderColor = fromBank ? C.accent : toBank ? C.info : C.warn;
                      const u = (users||[]).find(u => u.username === from);
                      return (
                        <div key={`${from}→${to}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: C.card2, borderRadius: "10px", borderLeft: `3px solid ${borderColor}`, flexWrap: "wrap", gap: "10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                            <UserAvatar username={from} avatar={u?.avatar} size={32} />
                            <div>
                              <div style={{ fontSize: "13px", fontWeight: "600" }}>
                                {fromBank ? "🏦 Banque" : from}
                                <span style={{ color: C.muted, fontWeight: "400" }}> → </span>
                                {toBank ? "🏦 Banque" : to}
                              </div>
                              <div style={{ fontSize: "11px", color: C.muted }}>{entries.length} dépense{entries.length > 1 ? "s" : ""} · {entries.map(e => e.depLabel).join(", ").slice(0, 60)}{entries.map(e => e.depLabel).join(", ").length > 60 ? "…" : ""}</div>
                              {isCoveredByBank && assoUncoveredRatio < 1 && assoBankCovered > 0 && (
                                <div style={{ fontSize: "10px", color: C.info, marginTop: "2px" }}>
                                  {fmt(total)} brut · {fmt(Math.round(total * (1 - assoUncoveredRatio) * 100) / 100)} absorbé par la banque
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                            <span style={{ fontFamily: C.mono, fontSize: "16px", fontWeight: "700", color: borderColor }}>{fmt(displayTotal)}</span>
                            {canEdit && <button onClick={() => settleGroup(entries)} style={s.btn("primary", { padding: "6px 14px", fontSize: "12px" })}>Marquer réglé</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {Object.keys(settledByPair).length > 0 && (
                  <div>
                    <div style={{ fontSize: "11px", color: C.muted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Réglés</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {Object.values(settledByPair).map(({ from, to, total, count }) => {
                        const settled = settledAsso.filter(r => r.from === from && r.to === to);
                        return (
                          <div key={`${from}→${to}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: `${C.accent}08`, borderRadius: "8px", opacity: 0.75, flexWrap: "wrap", gap: "6px" }}>
                            <div style={{ fontSize: "12px" }}>
                              <span style={{ color: C.accent }}>✓ </span>
                              <span style={{ fontFamily: C.mono }}>{fmt(Math.round(total * 100) / 100)}</span>
                              <span style={{ color: C.muted }}> {from === "Banque" ? "🏦 Banque" : from} → {to === "Banque" ? "🏦 Banque" : to}</span>
                              <span style={{ color: C.muted, fontSize: "11px" }}> · {count} dépense{count > 1 ? "s" : ""}</span>
                            </div>
                            {settled.some(r => r.confirmed)
                              ? <span style={{ fontSize: "10px", color: C.accent, padding: "2px 8px", border: `1px solid ${C.accent}40`, borderRadius: "10px" }}>Confirmé ✓</span>
                              : canEdit && <button onClick={() => unsettleGroup(settled)} style={s.btn("ghost", { padding: "3px 8px", fontSize: "11px" })}>Annuler</button>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Message si rien du tout */}
          {netList.length === 0 && eventsWithMembers.length === 0 && pendingAsso.length === 0 && settledAsso.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted, fontSize: "14px" }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>✓</div>
              Aucun remboursement en attente.<br />
              <span style={{ fontSize: "12px" }}>Ajoutez des participants aux dépenses ou des membres aux événements pour activer le suivi.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── COMPTABILITÉ ──────────────────────────────────────────────────────────────
function ComptaPage({ data, update, can, session }) {
  const canTreasury = can("manage_treasury");
  const username    = session?.user?.username;
  const [tab, setTab] = useState("remboursements");
  const [editBalance, setEditBalance] = useState(false);
  const [balVal, setBalVal]           = useState("");
  const bankBalance = data.assoc?.bankBalance ?? 0;

  // ── Calcul des ratios (même logique que DepensesPage) ──
  const depenses       = data.depenses || [];
  const events         = data.events   || [];
  const assoBankCov    = depenses.filter(d => d.bankCoverage).reduce((a, d) => a + d.amount, 0);
  const eventBankCov   = events.reduce((a, e) => a + (e.expenses||[]).filter(ex => ex.bankCoverage).reduce((b, ex) => b + ex.amount, 0), 0);
  const bankRem        = Math.max(0, bankBalance - eventBankCov);
  const eventUncov     = eventBankCov > 0 ? Math.max(0, eventBankCov - bankBalance) / eventBankCov : 0;
  const assoUncov      = assoBankCov  > 0 ? Math.max(0, assoBankCov  - bankRem)     / assoBankCov  : 0;

  // ── Remboursements unifiés ──
  const assoEntries = depenses.flatMap(d =>
    (d.reimbursements||[]).map(r => {
      const dispAmt = d.bankCoverage ? Math.round(r.amount * assoUncov * 100) / 100 : r.amount;
      return { ...r, source: "asso", label: d.label, depId: d.id, displayAmount: dispAmt };
    })
  );
  const eventEntries = events
    .filter(e => (e.members||[]).length > 0 && (e.expenses||[]).length > 0)
    .flatMap(ev => {
      const transfers = computeMinimalTransfers(ev.members, ev.expenses);
      return transfers.map(t => {
        const stored  = (ev.settlements||[]).find(s => s.id === t.id) || {};
        const dispAmt = t.bankOp ? Math.round(t.amount * eventUncov * 100) / 100 : t.amount;
        return { id: t.id, from: t.from, to: t.to, amount: t.amount, displayAmount: dispAmt,
          bankOp: t.bankOp, source: "event", label: ev.name, eventId: ev.id,
          settled: !!stored.settled, settledDate: stored.settledDate||null,
          confirmed: !!stored.confirmed, confirmedBy: stored.confirmedBy||null, confirmedDate: stored.confirmedDate||null };
      });
    });

  const all = [...assoEntries, ...eventEntries];
  const pending   = all.filter(r => !r.settled && !r.confirmed);
  const awaiting  = all.filter(r =>  r.settled && !r.confirmed && r.displayAmount >= 0.01);
  const confirmed = all.filter(r =>  r.confirmed);

  // Grouper par (from → to) pour affichage agrégé
  const groupByPair = (list) => Object.values(
    list.reduce((acc, r) => {
      const key = `${r.from}→${r.to}`;
      if (!acc[key]) acc[key] = { from: r.from, to: r.to, total: 0, entries: [], sources: [] };
      acc[key].total = Math.round((acc[key].total + r.displayAmount) * 100) / 100;
      acc[key].entries.push(r);
      const src = r.source === "event" ? `◆ ${r.label}` : `€ ${r.label}`;
      if (!acc[key].sources.includes(src)) acc[key].sources.push(src);
      return acc;
    }, {})
  ).filter(g => g.total >= 0.01);

  const pendingGrouped  = groupByPair(pending);
  const awaitingGrouped = groupByPair(awaiting);

  // ── Actions ──
  const confirmEntry = (r) => {
    if (r.source === "asso") {
      update({ depenses: depenses.map(d => d.id !== r.depId ? d : {
        ...d, reimbursements: (d.reimbursements||[]).map(x => x.id !== r.id ? x :
          { ...x, confirmed: true, confirmedBy: username, confirmedDate: today() })
      })});
    } else {
      const ev = events.find(e => e.id === r.eventId);
      const next = (ev.settlements||[]).map(s => s.id !== r.id ? s :
        { ...s, confirmed: true, confirmedBy: username, confirmedDate: today() });
      if (!ev.settlements?.find(s => s.id === r.id))
        next.push({ id: r.id, settled: true, settledDate: today(), confirmed: true, confirmedBy: username, confirmedDate: today() });
      update({ events: events.map(e => e.id !== r.eventId ? e : { ...e, settlements: next }) });
    }
  };

  // Confirmer tout un groupe (from→to) en une seule passe + auto-archive si tout réglé
  const confirmGroup = (group) => {
    const assoByDep = {};
    const evByEvent = {};
    group.entries.forEach(r => {
      if (r.source === "asso") { (assoByDep[r.depId] = assoByDep[r.depId]||[]).push(r.id); }
      else                     { (evByEvent[r.eventId] = evByEvent[r.eventId]||[]).push(r.id); }
    });
    const patch = {};
    if (Object.keys(assoByDep).length > 0) {
      patch.depenses = depenses.map(d => {
        if (!assoByDep[d.id]) return d;
        const ids = assoByDep[d.id];
        const newReimb = (d.reimbursements||[]).map(x =>
          ids.includes(x.id) ? { ...x, confirmed: true, confirmedBy: username, confirmedDate: today() } : x
        );
        const allDone = newReimb.length > 0 && newReimb.every(x => x.confirmed);
        return { ...d, reimbursements: newReimb, ...(allDone ? { archived: true } : {}) };
      });
    }
    if (Object.keys(evByEvent).length > 0) {
      patch.events = events.map(ev => {
        if (!evByEvent[ev.id]) return ev;
        const ids = evByEvent[ev.id];
        let setts = [...(ev.settlements||[])];
        ids.forEach(id => { if (!setts.find(s => s.id === id)) setts.push({ id, settled: true, settledDate: today() }); });
        const newSetts = setts.map(s =>
          ids.includes(s.id) ? { ...s, confirmed: true, confirmedBy: username, confirmedDate: today() } : s
        );
        const allTransfers = computeMinimalTransfers(ev.members, ev.expenses);
        const allDone = allTransfers.length > 0 && allTransfers.every(t => newSetts.find(s => s.id === t.id)?.confirmed);
        return { ...ev, settlements: newSetts, ...(allDone ? { financiallyClosed: true } : {}) };
      });
    }
    if (Object.keys(patch).length > 0) update(patch);
  };

  const unconfirmEntry = (r) => {
    if (r.source === "asso") {
      update({ depenses: depenses.map(d => d.id !== r.depId ? d : {
        ...d, reimbursements: (d.reimbursements||[]).map(x => x.id !== r.id ? x :
          { ...x, confirmed: false, confirmedBy: null, confirmedDate: null })
      })});
    } else {
      update({ events: events.map(e => e.id !== r.eventId ? e : {
        ...e, settlements: (e.settlements||[]).map(s => s.id !== r.id ? s :
          { ...s, confirmed: false, confirmedBy: null, confirmedDate: null })
      })});
    }
  };

  const EntryRow = ({ r, action, actionLabel, actionStyle = "primary" }) => {
    const fromBank = r.from === "Banque", toBank = r.to === "Banque";
    const bColor = fromBank ? C.accent : toBank ? C.info : C.warn;
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: C.card2, borderRadius: "8px", borderLeft: `3px solid ${bColor}`, flexWrap: "wrap", gap: "8px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: "600" }}>
            {fromBank ? "🏦 Banque" : r.from}
            <span style={{ color: C.muted, fontWeight: "400" }}> → </span>
            {toBank ? "🏦 Banque" : r.to}
          </div>
          <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>
            {r.source === "event" ? "◆ " : "€ "}{r.label}
            {r.settledDate && <span> · réglé le {r.settledDate}</span>}
            {r.confirmedBy && <span> · confirmé par {r.confirmedBy} le {r.confirmedDate}</span>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          <span style={{ fontFamily: C.mono, fontSize: "14px", fontWeight: "700", color: bColor }}>{fmt(r.displayAmount)}</span>
          {action && canTreasury && (
            <button onClick={() => action(r)} style={s.btn(actionStyle, { padding: "5px 12px", fontSize: "12px" })}>{actionLabel}</button>
          )}
        </div>
      </div>
    );
  };

  const totalPending  = pendingGrouped.reduce((a, g) => a + g.total, 0);
  const totalAwaiting = awaitingGrouped.reduce((a, g) => a + g.total, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "6px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", letterSpacing: "-0.8px" }}>Comptabilité</h1>
          <p style={{ color: C.muted, fontSize: "14px", marginTop: "4px" }}>Suivi de la trésorerie et des remboursements</p>
        </div>
        <div style={{ display: "flex", gap: "2px", borderBottom: `1px solid ${C.border}` }}>
          {[{ id: "remboursements", label: `Remboursements${awaitingGrouped.length > 0 ? ` (${awaitingGrouped.length} à confirmer)` : ""}` }, { id: "archive", label: `Archive (${confirmed.length})` }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "8px 16px", background: "none", border: "none", cursor: "pointer", borderBottom: `2px solid ${tab === t.id ? C.accent : "transparent"}`, color: tab === t.id ? C.accent : C.muted, fontFamily: C.font, fontSize: "13px", fontWeight: tab === t.id ? "600" : "400", marginBottom: "-1px" }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px", marginBottom: "24px" }}>
        <div style={s.card()}><div style={s.label}>À régler</div><div style={{ fontFamily: C.mono, fontSize: "20px", color: C.danger, marginTop: "4px" }}>{fmt(totalPending)}</div><div style={{ fontSize: "11px", color: C.muted, marginTop: "3px" }}>{pendingGrouped.length} virement{pendingGrouped.length !== 1 ? "s" : ""}</div></div>
        <div style={s.card()}><div style={s.label}>En attente confirmation</div><div style={{ fontFamily: C.mono, fontSize: "20px", color: C.warn, marginTop: "4px" }}>{fmt(totalAwaiting)}</div><div style={{ fontSize: "11px", color: C.muted, marginTop: "3px" }}>{awaitingGrouped.length} virement{awaitingGrouped.length !== 1 ? "s" : ""} à confirmer</div></div>
        <div style={s.card()}><div style={s.label}>Clôturés</div><div style={{ fontFamily: C.mono, fontSize: "20px", color: C.accent, marginTop: "4px" }}>{confirmed.length}</div><div style={{ fontSize: "11px", color: C.muted, marginTop: "3px" }}>remboursements archivés</div></div>
        <div style={s.card()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={s.label}>Solde bancaire</div>
            {canTreasury && <button onClick={() => { setEditBalance(!editBalance); setBalVal(String(bankBalance)); }} style={{ ...s.btn("ghost"), padding: "2px 7px", fontSize: "11px" }}>{editBalance ? "Annuler" : "Modifier"}</button>}
          </div>
          {editBalance ? (
            <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
              <input type="number" style={s.inp({ flex: 1 })} value={balVal} onChange={e => setBalVal(e.target.value)} autoFocus />
              <button style={s.btn("primary", { padding: "6px 10px", fontSize: "12px" })} onClick={() => { update({ assoc: { ...data.assoc, bankBalance: parseFloat(balVal)||0 } }); setEditBalance(false); }}>OK</button>
            </div>
          ) : <div style={{ fontFamily: C.mono, fontSize: "20px", color: C.info, marginTop: "4px" }}>{fmt(bankBalance)}</div>}
        </div>
      </div>

      {tab === "remboursements" && (() => {
        const GroupRow = ({ g, action, actionLabel }) => {
          const fromBank = g.from === "Banque", toBank = g.to === "Banque";
          const bColor = fromBank ? C.accent : toBank ? C.info : C.warn;
          return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: C.card2, borderRadius: "8px", borderLeft: `3px solid ${bColor}`, flexWrap: "wrap", gap: "8px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: "600" }}>
                  {fromBank ? "🏦 Banque" : g.from}
                  <span style={{ color: C.muted, fontWeight: "400" }}> → </span>
                  {toBank ? "🏦 Banque" : g.to}
                </div>
                <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>{g.sources.join(" · ")}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                <span style={{ fontFamily: C.mono, fontSize: "14px", fontWeight: "700", color: bColor }}>{fmt(g.total)}</span>
                {action && canTreasury && (
                  <button onClick={() => action(g)} style={s.btn("primary", { padding: "5px 12px", fontSize: "12px" })}>{actionLabel}</button>
                )}
              </div>
            </div>
          );
        };
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* À régler */}
            <div style={s.card()}>
              <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px" }}>
                À régler
                <span style={{ fontSize: "12px", color: C.muted, fontWeight: "400", marginLeft: "8px" }}>{pendingGrouped.length} virement{pendingGrouped.length !== 1 ? "s" : ""} en attente</span>
              </div>
              {pendingGrouped.length === 0
                ? <p style={{ color: C.accent, fontSize: "13px" }}>✓ Aucun remboursement en attente.</p>
                : <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {pendingGrouped.map(g => <GroupRow key={`${g.from}→${g.to}`} g={g} />)}
                  </div>
              }
            </div>
            {/* En attente de confirmation */}
            <div style={s.card()}>
              <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "4px" }}>
                En attente de confirmation
                <span style={{ fontSize: "12px", color: C.warn, fontWeight: "400", marginLeft: "8px" }}>{awaitingGrouped.length} virement{awaitingGrouped.length !== 1 ? "s" : ""} à confirmer</span>
              </div>
              {canTreasury && awaitingGrouped.length > 0 && <p style={{ fontSize: "12px", color: C.muted, marginBottom: "12px" }}>Vérifiez que chaque virement a bien été effectué avant de le confirmer.</p>}
              {!canTreasury && awaitingGrouped.length > 0 && <p style={{ fontSize: "12px", color: C.muted, marginBottom: "12px" }}>En attente de validation par le comptable.</p>}
              {awaitingGrouped.length === 0
                ? <p style={{ color: C.muted, fontSize: "13px" }}>Aucun remboursement en attente de confirmation.</p>
                : <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {awaitingGrouped.map(g => <GroupRow key={`${g.from}→${g.to}`} g={g} action={confirmGroup} actionLabel="Confirmer ✓" />)}
                  </div>
              }
            </div>
          </div>
        );
      })()}

      {tab === "archive" && (
        <div style={s.card()}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px" }}>
            Remboursements confirmés
            <span style={{ fontSize: "12px", color: C.muted, fontWeight: "400", marginLeft: "8px" }}>{confirmed.length} entrée{confirmed.length !== 1 ? "s" : ""}</span>
          </div>
          {confirmed.length === 0
            ? <p style={{ color: C.muted, fontSize: "13px" }}>Aucun remboursement confirmé pour l'instant.</p>
            : <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {[...confirmed].reverse().map(r => <EntryRow key={`${r.source}-${r.id}`} r={r} action={unconfirmEntry} actionLabel="Annuler clôture" actionStyle="ghost" />)}
              </div>
          }
        </div>
      )}
    </div>
  );
}

// ── TÂCHES (TO-DO) ────────────────────────────────────────────────────────────
const TODO_PRIORITIES = ["normale", "haute", "basse"];
const PRIO_COLORS = { haute: C => C.danger, normale: C => C.info, basse: C => C.muted };
const TODO_STATUS = {
  à_faire:  { label: "À faire",  color: C => C.muted  },
  en_cours: { label: "En cours", color: C => C.warn   },
  terminé:  { label: "Terminé",  color: C => C.accent },
};

function TodosPage({ data, update, session, can }) {
  const isMobile = useMobile();
  const username = session?.user?.username;
  const isAdmin  = can("web_admin");
  const pool     = data.depensesPool || [];
  const todos    = data.todos || [];

  const [tab, setTab]           = useState("actives");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm]         = useState({ title: "", description: "", assignees: [], dueDate: "", priority: "normale" });
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter]     = useState(""); // filtre par assigné

  const active   = todos.filter(t => t.status !== "terminé");
  const done     = todos.filter(t => t.status === "terminé");

  const toggleAssignee = (name) => setForm(f => ({
    ...f,
    assignees: f.assignees.includes(name) ? f.assignees.filter(a => a !== name) : [...f.assignees, name],
  }));

  const submit = () => {
    if (!form.title.trim()) return;
    const todo = {
      id: uid(), title: form.title.trim(), description: form.description.trim(),
      assignees: form.assignees, createdBy: username, createdAt: today(),
      dueDate: form.dueDate || null, priority: form.priority,
      status: "à_faire", statusBy: null, statusAt: null,
    };
    update({ todos: [todo, ...todos] }, { action: "AJOUT", target: "Tâches", details: form.title });
    setForm({ title: "", description: "", assignees: [], dueDate: "", priority: "normale" });
    setFormOpen(false);
  };

  const setStatus = (id, status) => {
    update({
      todos: todos.map(t => t.id !== id ? t : { ...t, status, statusBy: username, statusAt: today() })
    }, { action: "MODIF", target: "Tâches", details: `${status} — ${todos.find(t=>t.id===id)?.title}` });
  };

  const deleteTodo = (id) => {
    if (!confirm("Supprimer cette tâche ?")) return;
    update({ todos: todos.filter(t => t.id !== id) });
  };

  const canChange = (t) => isAdmin || (t.assignees || []).includes(username);

  // Tous les noms disponibles pour l'assignation (pool + username courant si absent)
  const allNames = pool.length > 0 ? pool.map(p => p.name) : (username ? [username] : []);

  const filteredActive = filter ? active.filter(t => (t.assignees||[]).includes(filter)) : active;
  const filteredDone   = filter ? done.filter(t => (t.assignees||[]).includes(filter)) : done;

  const TodoCard = ({ t }) => {
    const isOpen   = expanded === t.id;
    const co       = (t.assignees || []).filter(a => a !== username);
    const stConf   = TODO_STATUS[t.status] || TODO_STATUS.à_faire;
    const prioConf = PRIO_COLORS[t.priority] || PRIO_COLORS.normale;
    const isOverdue = t.dueDate && t.dueDate < today() && t.status !== "terminé";

    return (
      <div style={{ background: C.card2, borderRadius: "10px", border: `1px solid ${isOverdue ? C.danger+"60" : C.border}`, overflow: "hidden" }}>
        <div onClick={() => setExpanded(isOpen ? null : t.id)}
          style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", cursor: "pointer" }}>
          {/* Indicateur priorité */}
          <div style={{ width: "4px", alignSelf: "stretch", borderRadius: "4px", background: prioConf(C), flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
              <span style={{ fontWeight: "600", fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
              <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "20px", background: `${stConf.color(C)}20`, color: stConf.color(C), border: `1px solid ${stConf.color(C)}40`, flexShrink: 0 }}>
                {stConf.label}
              </span>
              {isOverdue && <span style={{ fontSize: "10px", color: C.danger, background: `${C.danger}15`, padding: "2px 7px", borderRadius: "20px", flexShrink: 0 }}>En retard</span>}
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              {/* Assignés */}
              {(t.assignees||[]).length > 0 && (
                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                  {(t.assignees||[]).map(a => (
                    <span key={a} style={{ fontSize: "11px", padding: "1px 7px", borderRadius: "20px", background: a === username ? `${C.accent}25` : C.card, border: `1px solid ${a === username ? C.accent+"60" : C.border}`, color: a === username ? C.accent : C.muted }}>
                      {a === username ? "Moi" : a}
                    </span>
                  ))}
                </div>
              )}
              {t.dueDate && (
                <span style={{ fontSize: "11px", color: isOverdue ? C.danger : C.muted }}>📅 {t.dueDate}</span>
              )}
              {t.createdBy && <span style={{ fontSize: "11px", color: C.muted }}>créé par {t.createdBy}</span>}
            </div>
          </div>
          <span style={{ color: C.muted, fontSize: "12px", flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
        </div>

        {isOpen && (
          <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${C.border}` }}>
            {t.description ? (
              <p style={{ fontSize: "13px", marginTop: "12px", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{t.description}</p>
            ) : (
              <p style={{ fontSize: "13px", color: C.muted, marginTop: "12px", fontStyle: "italic" }}>Pas de description.</p>
            )}
            {t.statusBy && <p style={{ fontSize: "11px", color: C.muted, marginTop: "8px" }}>Dernier statut par {t.statusBy} le {t.statusAt}</p>}

            {/* Actions statut */}
            {canChange(t) && (
              <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
                {t.status !== "à_faire"  && <button onClick={() => setStatus(t.id, "à_faire")}  style={s.btn("ghost",     { fontSize: "12px", padding: "5px 12px" })}>← À faire</button>}
                {t.status !== "en_cours" && <button onClick={() => setStatus(t.id, "en_cours")} style={s.btn("secondary", { fontSize: "12px", padding: "5px 12px" })}>→ En cours</button>}
                {t.status !== "terminé"  && <button onClick={() => setStatus(t.id, "terminé")}  style={s.btn("primary",   { fontSize: "12px", padding: "5px 12px" })}>✓ Terminer</button>}
                {isAdmin && <button onClick={() => deleteTodo(t.id)} style={s.btn("danger", { fontSize: "12px", padding: "5px 10px" })}>✕</button>}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "6px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ fontFamily: C.display, fontSize: isMobile ? "22px" : "26px", fontWeight: "800", letterSpacing: "-0.8px" }}>Tâches</h1>
          {!isMobile && <p style={{ color: C.muted, fontSize: "14px", marginTop: "4px" }}>Suivi des tâches collectives et individuelles</p>}
        </div>
        <div style={{ display: "flex", gap: "2px", borderBottom: `1px solid ${C.border}` }}>
          {[
            { id: "actives",  label: `Actives (${active.length})`  },
            { id: "terminées",label: `Terminées (${done.length})`   },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: isMobile ? "8px 12px" : "8px 16px", background: "none", border: "none", cursor: "pointer", borderBottom: `2px solid ${tab === t.id ? C.accent : "transparent"}`, color: tab === t.id ? C.accent : C.muted, fontFamily: C.font, fontSize: "13px", fontWeight: tab === t.id ? "600" : "400", marginBottom: "-1px" }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        {[
          { label: "À faire",  val: todos.filter(t=>t.status==="à_faire").length,  color: C.muted  },
          { label: "En cours", val: todos.filter(t=>t.status==="en_cours").length, color: C.warn   },
          { label: "Terminées",val: done.length,                                    color: C.accent },
          { label: "Mes tâches",val: todos.filter(t=>t.status!=="terminé"&&(t.assignees||[]).includes(username)).length, color: C.info },
        ].map(k => (
          <div key={k.label} style={s.card({ padding: "14px 16px" })}>
            <div style={s.label}>{k.label}</div>
            <div style={{ fontFamily: C.mono, fontSize: "22px", color: k.color, marginTop: "4px" }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Formulaire */}
      <div style={s.card({ marginBottom: "16px" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: formOpen ? "16px" : 0 }}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px" }}>Nouvelle tâche</div>
          <button onClick={() => setFormOpen(v => !v)} style={s.btn(formOpen ? "ghost" : "primary", { padding: "6px 14px", fontSize: "12px" })}>
            {formOpen ? "Annuler" : "+ Ajouter"}
          </button>
        </div>
        {formOpen && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr auto", gap: "10px", marginBottom: "10px" }}>
              <div style={isMobile ? { gridColumn: "1/-1" } : {}}>
                <label style={s.label}>Titre *</label>
                <input style={s.inp()} value={form.title} placeholder="Ex: Préparer le planning…" autoFocus
                  onChange={e => setForm({...form, title: e.target.value})} onKeyDown={e => e.key==="Enter" && submit()} />
              </div>
              <div>
                <label style={s.label}>Échéance</label>
                <input type="date" style={s.inp()} value={form.dueDate} onChange={e => setForm({...form, dueDate: e.target.value})} />
              </div>
              <div>
                <label style={s.label}>Priorité</label>
                <select style={s.inp()} value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                  {TODO_PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: "10px" }}>
              <label style={s.label}>Description (optionnel)</label>
              <textarea style={{ ...s.inp(), resize: "vertical", minHeight: "60px" }} value={form.description}
                placeholder="Détails de la tâche…" onChange={e => setForm({...form, description: e.target.value})} />
            </div>
            {/* Assignation depuis le pool */}
            <div style={{ marginBottom: "14px" }}>
              <label style={s.label}>Assigner à ({form.assignees.length} sélectionné{form.assignees.length>1?"s":""})</label>
              {allNames.length === 0
                ? <p style={{ fontSize: "12px", color: C.muted, fontStyle: "italic" }}>Aucun membre dans le pool — ajoutez des participants dans la page Dépenses.</p>
                : <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                    {allNames.map(name => {
                      const sel = form.assignees.includes(name);
                      return (
                        <span key={name} onClick={() => toggleAssignee(name)} style={{
                          cursor: "pointer", userSelect: "none",
                          padding: "4px 12px", borderRadius: "20px", fontSize: "13px",
                          background: sel ? `${C.accent}20` : "transparent",
                          border: `1px solid ${sel ? C.accent : C.border}`,
                          color: sel ? C.accent : C.muted,
                        }}>
                          {sel ? "✓ " : ""}{name}
                        </span>
                      );
                    })}
                  </div>
              }
            </div>
            <button style={s.btn("primary")} onClick={submit} disabled={!form.title.trim()}>Créer la tâche</button>
          </div>
        )}
      </div>

      {/* Filtre par assigné */}
      {allNames.length > 1 && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>
          <span onClick={() => setFilter("")} style={{ cursor: "pointer", userSelect: "none", padding: "3px 10px", borderRadius: "20px", fontSize: "12px", background: !filter ? `${C.accent}20` : "transparent", border: `1px solid ${!filter ? C.accent : C.border}`, color: !filter ? C.accent : C.muted }}>
            Tous
          </span>
          {allNames.map(name => (
            <span key={name} onClick={() => setFilter(filter === name ? "" : name)} style={{ cursor: "pointer", userSelect: "none", padding: "3px 10px", borderRadius: "20px", fontSize: "12px", background: filter===name ? `${C.accent}20` : "transparent", border: `1px solid ${filter===name ? C.accent : C.border}`, color: filter===name ? C.accent : C.muted }}>
              {name === username ? "Moi" : name}
            </span>
          ))}
        </div>
      )}

      {/* Liste */}
      {tab === "actives" && (
        filteredActive.length === 0
          ? <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted }}>
              <div style={{ fontSize: "36px", marginBottom: "12px" }}>☑</div>
              <div style={{ fontSize: "14px" }}>{filter ? `Aucune tâche active pour ${filter}.` : "Aucune tâche active."}</div>
            </div>
          : <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {filteredActive.sort((a,b) => {
                const po = { haute: 0, normale: 1, basse: 2 };
                return (po[a.priority]||1) - (po[b.priority]||1) || (a.dueDate||"9").localeCompare(b.dueDate||"9");
              }).map(t => <TodoCard key={t.id} t={t} />)}
            </div>
      )}

      {tab === "terminées" && (
        filteredDone.length === 0
          ? <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted, fontSize: "14px" }}>Aucune tâche terminée.</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {filteredDone.map(t => <TodoCard key={t.id} t={t} />)}
            </div>
      )}
    </div>
  );
}

// ── BOÎTE À IDÉES / TICKETS ───────────────────────────────────────────────────
const TICKET_CATS = ["Idée", "Amélioration", "Bug", "Autre"];
const TICKET_STATUTS = {
  ouvert:    { label: "Ouvert",    color: C => C.info   },
  en_cours:  { label: "En cours",  color: C => C.warn   },
  terminé:   { label: "Terminé",   color: C => C.accent },
};

function TicketsPage({ data, update, session, can }) {
  const isAdmin  = can("web_admin");
  const username = session?.user?.username;
  const tickets  = data.tickets || [];
  const isMobile = useMobile();

  const [tab, setTab]         = useState("ouverts");
  const [form, setForm]       = useState({ title: "", description: "", category: "Idée" });
  const [formOpen, setFormOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const open     = tickets.filter(t => t.status !== "terminé");
  const archived = tickets.filter(t => t.status === "terminé");

  const submit = () => {
    if (!form.title.trim()) return;
    const ticket = {
      id: uid(), title: form.title.trim(), description: form.description.trim(),
      category: form.category, createdBy: username, createdAt: today(),
      status: "ouvert", statusBy: null, statusAt: null,
    };
    update({ tickets: [ticket, ...tickets] }, { action: "AJOUT", target: "Tickets", details: form.title });
    setForm({ title: "", description: "", category: "Idée" });
    setFormOpen(false);
  };

  const setStatus = (id, status) => {
    update({
      tickets: tickets.map(t => t.id !== id ? t : {
        ...t, status, statusBy: username, statusAt: today(),
      })
    }, { action: "MODIF", target: "Tickets", details: `${status} — ${tickets.find(t=>t.id===id)?.title}` });
  };

  const deleteTicket = (id) => {
    if (!confirm("Supprimer ce ticket ?")) return;
    update({ tickets: tickets.filter(t => t.id !== id) });
  };

  const StatusBadge = ({ status }) => {
    const s = TICKET_STATUTS[status] || TICKET_STATUTS.ouvert;
    return (
      <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 9px", borderRadius: "20px", background: `${s.color(C)}20`, color: s.color(C), border: `1px solid ${s.color(C)}40`, flexShrink: 0 }}>
        {s.label}
      </span>
    );
  };

  const TicketCard = ({ t }) => {
    const isOpen = expanded === t.id;
    return (
      <div style={{ background: C.card2, borderRadius: "10px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
        {/* En-tête cliquable */}
        <div onClick={() => setExpanded(isOpen ? null : t.id)}
          style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", cursor: "pointer" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "3px" }}>
              <span style={{ fontWeight: "600", fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
              <StatusBadge status={t.status} />
            </div>
            <div style={{ fontSize: "11px", color: C.muted }}>
              <span style={{ background: `${C.border}`, borderRadius: "4px", padding: "1px 6px", marginRight: "6px" }}>{t.category}</span>
              {t.createdBy} · {t.createdAt}
              {t.statusBy && t.status === "terminé" && <span> · clôturé par {t.statusBy} le {t.statusAt}</span>}
            </div>
          </div>
          <span style={{ color: C.muted, fontSize: "12px", flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
        </div>

        {/* Détail déplié */}
        {isOpen && (
          <div style={{ padding: "0 16px 14px", borderTop: `1px solid ${C.border}` }}>
            {t.description ? (
              <p style={{ fontSize: "13px", color: C.text, marginTop: "12px", lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{t.description}</p>
            ) : (
              <p style={{ fontSize: "13px", color: C.muted, marginTop: "12px", fontStyle: "italic" }}>Pas de description.</p>
            )}

            {/* Actions admin */}
            {isAdmin && (
              <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
                {t.status === "ouvert" && (
                  <button onClick={() => setStatus(t.id, "en_cours")} style={s.btn("secondary", { fontSize: "12px", padding: "5px 12px" })}>
                    → En cours
                  </button>
                )}
                {t.status === "en_cours" && (
                  <button onClick={() => setStatus(t.id, "ouvert")} style={s.btn("ghost", { fontSize: "12px", padding: "5px 12px" })}>
                    ← Réouvrir
                  </button>
                )}
                {t.status !== "terminé" && (
                  <button onClick={() => setStatus(t.id, "terminé")} style={s.btn("primary", { fontSize: "12px", padding: "5px 12px" })}>
                    ✓ Marquer terminé
                  </button>
                )}
                {t.status === "terminé" && (
                  <button onClick={() => setStatus(t.id, "ouvert")} style={s.btn("ghost", { fontSize: "12px", padding: "5px 12px" })}>
                    ↺ Réouvrir
                  </button>
                )}
                <button onClick={() => deleteTicket(t.id)} style={s.btn("danger", { fontSize: "12px", padding: "5px 10px" })}>✕</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "6px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ fontFamily: C.display, fontSize: isMobile ? "22px" : "26px", fontWeight: "800", letterSpacing: "-0.8px" }}>Boîte à idées</h1>
          {!isMobile && <p style={{ color: C.muted, fontSize: "14px", marginTop: "4px" }}>Suggestions, améliorations et signalements</p>}
        </div>
        <div style={{ display: "flex", gap: "2px", borderBottom: `1px solid ${C.border}` }}>
          {[
            { id: "ouverts",  label: `Ouverts (${open.length})`       },
            { id: "archive",  label: `Archive (${archived.length})`    },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: isMobile ? "8px 12px" : "8px 16px", background: "none", border: "none", cursor: "pointer", borderBottom: `2px solid ${tab === t.id ? C.accent : "transparent"}`, color: tab === t.id ? C.accent : C.muted, fontFamily: C.font, fontSize: "13px", fontWeight: tab === t.id ? "600" : "400", marginBottom: "-1px" }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        {[
          { label: "Ouverts",   val: tickets.filter(t=>t.status==="ouvert").length,   color: C.info   },
          { label: "En cours",  val: tickets.filter(t=>t.status==="en_cours").length,  color: C.warn   },
          { label: "Terminés",  val: archived.length,                                  color: C.accent },
        ].map(k => (
          <div key={k.label} style={s.card({ padding: "14px 16px" })}>
            <div style={s.label}>{k.label}</div>
            <div style={{ fontFamily: C.mono, fontSize: "22px", color: k.color, marginTop: "4px" }}>{k.val}</div>
          </div>
        ))}
      </div>

      {tab === "ouverts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Formulaire */}
          <div style={s.card()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: formOpen ? "16px" : 0 }}>
              <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px" }}>Soumettre une idée ou un signalement</div>
              <button onClick={() => setFormOpen(v => !v)} style={s.btn(formOpen ? "ghost" : "primary", { padding: "6px 14px", fontSize: "12px" })}>
                {formOpen ? "Annuler" : "+ Nouveau"}
              </button>
            </div>
            {formOpen && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto", gap: "10px", marginBottom: "10px" }}>
                  <div>
                    <label style={s.label}>Titre *</label>
                    <input style={s.inp()} value={form.title} placeholder="Ex: Ajouter un export CSV…" onChange={e => setForm({ ...form, title: e.target.value })}
                      onKeyDown={e => e.key === "Enter" && submit()} autoFocus />
                  </div>
                  <div>
                    <label style={s.label}>Catégorie</label>
                    <select style={s.inp()} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                      {TICKET_CATS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: "12px" }}>
                  <label style={s.label}>Description (optionnel)</label>
                  <textarea style={{ ...s.inp(), resize: "vertical", minHeight: "72px" }} value={form.description}
                    placeholder="Décris l'idée ou le problème en détail…"
                    onChange={e => setForm({ ...form, description: e.target.value })} />
                </div>
                <button style={s.btn("primary", { padding: "9px 20px" })} onClick={submit} disabled={!form.title.trim()}>
                  Soumettre
                </button>
              </div>
            )}
          </div>

          {/* Liste des tickets ouverts */}
          {open.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted }}>
              <div style={{ fontSize: "36px", marginBottom: "12px" }}>◎</div>
              <div style={{ fontSize: "14px" }}>Aucune idée ou signalement pour l'instant.</div>
              <div style={{ fontSize: "12px", marginTop: "6px" }}>Sois le premier à en soumettre une !</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {open.map(t => <TicketCard key={t.id} t={t} />)}
            </div>
          )}
        </div>
      )}

      {tab === "archive" && (
        <div>
          {archived.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: C.muted, fontSize: "14px" }}>Aucun ticket clôturé pour l'instant.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {archived.map(t => <TicketCard key={t.id} t={t} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── LOGS ──────────────────────────────────────────────────────────────────────
function LogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { store.loadLogs().then(l => { setLogs(l); setLoading(false); }); }, []);
  const actionColor = (a) => a === "SUPPR" ? C.danger : a === "AJOUT" ? C.accent : C.warn;
  return (
    <div>
      <h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", marginBottom: "6px", letterSpacing: "-0.8px" }}>Journal d'activité</h1>
      <p style={{ color: C.muted, marginBottom: "28px", fontSize: "14px" }}>Historique des actions réalisées dans l'application</p>
      <div style={s.card()}>
        {loading ? <div style={{ color: C.muted, fontSize: "13px" }}>Chargement…</div>
          : logs.length === 0 ? <div style={{ color: C.muted, fontSize: "13px" }}>Aucune action enregistrée pour l'instant.</div>
          : logs.map(log => (
              <div key={log.id} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "10px 0", borderBottom: `1px solid ${C.border}40`, flexWrap: "wrap" }}>
                <span style={{ fontFamily: C.mono, fontSize: "10px", color: C.muted, whiteSpace: "nowrap" }}>{new Date(log.date).toLocaleString("fr-FR")}</span>
                <Badge color={log.action === "SUPPR" ? "red" : log.action === "AJOUT" ? "green" : "neutral"}>{log.action}</Badge>
                <span style={{ fontSize: "12px", color: C.muted }}>{log.target}</span>
                <span style={{ fontSize: "13px", flex: 1 }}>{log.details}</span>
                <span style={{ fontSize: "11px", color: C.muted }}>{log.user}</span>
              </div>
            ))
        }
      </div>
    </div>
  );
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────
function SettingsPage({ data, update }) {
  const [form, setForm] = useState({ ...INIT.assoc, ...data.assoc });
  const [saved, setSaved] = useState(false);
  const fileRef = useRef();

  const handleLogo = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const result = await store.uploadFile(f);
    if (result) setForm(x => ({ ...x, logo: result.url }));
  };

  const save = () => {
    update({ assoc: form }, { action: "MODIF", target: "Paramètres", details: "Informations association" });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", letterSpacing: "-0.8px", marginBottom: "6px" }}>Paramètres de l'association</h1>
      <p style={{ color: C.muted, marginBottom: "28px", fontSize: "13px" }}>Ces informations apparaîtront sur vos factures et comptes-rendus</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "28px" }}>
        <div>
          <div style={s.card({ marginBottom: "16px" })}>
            <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "16px" }}>Informations générales</div>
            {[
              { k:"name", l:"Nom de l'association *", ph:"Les Artisans du Son" },
              { k:"address", l:"Adresse", ph:"12 rue des Arts, 75001 Paris" },
              { k:"email", l:"Email", ph:"contact@asso.fr" },
              { k:"phone", l:"Téléphone", ph:"+33 6 xx xx xx xx" },
              { k:"siret", l:"SIRET", ph:"XXX XXX XXX XXXXX" },
              { k:"iban", l:"IBAN", ph:"FR76 XXXX…" },
            ].map(({ k,l,ph }) => (
              <div key={k} style={{ marginBottom: "11px" }}>
                <label style={s.label}>{l}</label>
                <input style={s.inp()} value={form[k]||""} placeholder={ph} onChange={e => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            <div><label style={s.label}>Note bas de facture</label><textarea style={{ ...s.inp(), resize: "vertical", height: "56px" }} value={form.note||""} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="TVA non applicable, art. 293 B du CGI…" /></div>
          </div>
        </div>
        <div>
          <div style={s.card({ marginBottom: "16px" })}>
            <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Logo</div>
            {form.logo ? (
              <div>
                <img src={form.logo} alt="Logo" style={{ maxHeight: "80px", maxWidth: "200px", borderRadius: "8px", background: "#fff", padding: "8px", marginBottom: "10px", display: "block" }} />
                <button onClick={() => setForm({ ...form, logo: null })} style={s.btn("danger", { padding: "6px 12px", fontSize: "12px" })}>Supprimer le logo</button>
              </div>
            ) : (
              <div style={{ border: `2px dashed ${C.border}`, borderRadius: "8px", padding: "28px", textAlign: "center", cursor: "pointer" }} onClick={() => fileRef.current.click()}>
                <div style={{ fontSize: "28px", marginBottom: "8px" }}>🖼</div>
                <div style={{ fontSize: "13px", color: C.muted }}>Cliquez pour sélectionner votre logo</div>
                <div style={{ fontSize: "11px", color: C.muted, marginTop: "4px" }}>PNG, JPG, SVG</div>
              </div>
            )}
            <input type="file" ref={fileRef} accept="image/*" style={{ display: "none" }} onChange={handleLogo} />
          </div>
          <div style={s.card()}>
            <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "12px" }}>Aperçu en-tête</div>
            <div style={{ background: "#fff", color: "#111", borderRadius: "8px", padding: "16px", fontSize: "12px" }}>
              {form.logo && <img src={form.logo} alt="" style={{ height: "36px", marginBottom: "8px", display: "block" }} />}
              <div style={{ fontWeight: "bold", fontSize: "13px" }}>{form.name || <span style={{ color: "#999" }}>Nom de l'association</span>}</div>
              {form.address && <div style={{ color: "#888", marginTop: "2px" }}>{form.address}</div>}
              {form.email && <div style={{ color: "#888" }}>{form.email}</div>}
              {form.siret && <div style={{ color: "#888" }}>SIRET : {form.siret}</div>}
            </div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: "22px" }}>
        <button style={s.btn("primary", { padding: "12px 28px", fontSize: "14px" })} onClick={save}>
          {saved ? "✓ Sauvegardé !" : "Sauvegarder les paramètres"}
        </button>
      </div>
    </div>
  );
}

// ── USER MANAGEMENT ───────────────────────────────────────────────────────────
function UserManagementPage({ session, data, update }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ username: "", password: "", permissions: [], roleId: "", avatar: null });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { token } = session;
  const roles = data?.roles || [];

  const load = () => auth.listUsers(token).then(res => { if (res.ok) setUsers(res.users); setLoading(false); });
  useEffect(() => { load(); }, [token]);

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setTimeout(() => setError(""), 3000); }
    else { setSuccess(msg); setTimeout(() => setSuccess(""), 3000); }
  };

  const openCreate = () => { setForm({ username: "", password: "", permissions: [], roleId: "", avatar: null }); setEditingId(null); setCreating(true); setError(""); };
  const openEdit = (u) => { setForm({ username: u.username, password: "", permissions: [...(u.permissions||[])], roleId: u.roleId || "", avatar: u.avatar || null }); setEditingId(u.id); setCreating(true); setError(""); };

  const togglePerm = (perm) => setForm(f => ({ ...f, permissions: f.permissions.includes(perm) ? f.permissions.filter(p => p !== perm) : [...f.permissions, perm] }));

  const submit = async () => {
    setError("");
    if (!form.username.trim()) return setError("L'identifiant est requis.");
    if (!editingId && form.password.length < 6) return setError("Le mot de passe doit contenir au moins 6 caractères.");
    if (editingId && form.password && form.password.length < 6) return setError("Le mot de passe doit contenir au moins 6 caractères.");
    let res;
    if (editingId) {
      const payload = { id: editingId, username: form.username, role: "user", permissions: form.permissions, roleId: form.roleId || null };
      if (form.password) payload.password = form.password;
      res = await auth.updateUser(token, payload);
      if (res.ok && form.avatar !== undefined) await auth.updateAvatar(token, editingId, form.avatar);
    } else {
      res = await auth.createUser(token, { username: form.username, password: form.password, role: "user", permissions: form.permissions, roleId: form.roleId || null });
      if (res.ok && form.avatar) {
        const allUsers = await store.loadUsers();
        const created = allUsers.find(u => u.username === form.username.trim());
        if (created) await auth.updateAvatar(token, created.id, form.avatar);
      }
    }
    if (res.ok) { flash(editingId ? "Utilisateur mis à jour." : "Utilisateur créé."); setCreating(false); load(); }
    else setError(res.error || "Erreur.");
  };

  // ── Gestion des rôles ──
  const [roleForm, setRoleForm] = useState({ name: "", color: ROLE_COLORS[0], description: "", permissions: [] });
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [roleSection, setRoleSection] = useState(false);

  const toggleRolePerm = (perm) => setRoleForm(f => ({ ...f, permissions: f.permissions.includes(perm) ? f.permissions.filter(p => p !== perm) : [...f.permissions, perm] }));

  const saveRole = () => {
    if (!roleForm.name.trim()) return;
    if (editingRoleId) {
      update({ roles: roles.map(r => r.id === editingRoleId ? { ...r, ...roleForm } : r) });
    } else {
      update({ roles: [...roles, { id: uid(), ...roleForm }] });
    }
    setRoleForm({ name: "", color: ROLE_COLORS[0], description: "", permissions: [] });
    setEditingRoleId(null);
  };

  const editRole = (r) => { setRoleForm({ name: r.name, color: r.color, description: r.description || "", permissions: [...r.permissions] }); setEditingRoleId(r.id); setRoleSection(true); };
  const deleteRole = (id) => { if (!confirm("Supprimer ce rôle ?")) return; update({ roles: roles.filter(r => r.id !== id) }); };

  const deleteUser = async (id) => {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    const res = await auth.deleteUser(token, id);
    if (res.ok) { flash("Utilisateur supprimé."); load(); }
    else flash(res.error || "Erreur.", true);
  };

  // Invitations
  const [invites, setInvites] = useState([]);
  const [genLoading, setGenLoading] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedCode, setCopiedCode] = useState("");

  const loadInvites = () => auth.listInvites().then(setInvites);
  useEffect(() => { loadInvites(); }, []);

  const generateInvite = async () => {
    setGenLoading(true);
    const res = await auth.generateInvite(token);
    setGenLoading(false);
    if (res.ok) { flash(`Code créé : ${res.code}`); loadInvites(); }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(""), 2000);
  };

  const copyAllCodes = () => {
    const available = invites.filter(i => !i.used).map(i => i.code);
    if (!available.length) return;
    navigator.clipboard.writeText(available.join("\n"));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
        <div><h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", letterSpacing: "-0.8px", marginBottom: "4px" }}>Utilisateurs</h1><p style={{ color: C.muted, fontSize: "13px" }}>Gérez les accès à l'application</p></div>
        {!creating && <button style={s.btn("primary")} onClick={openCreate}>+ Nouvel utilisateur</button>}
      </div>

      {(error || success) && (
        <div style={{ marginBottom: "14px", padding: "10px 14px", borderRadius: "8px", background: error ? C.dangerBg : C.accentBg, color: error ? C.danger : C.accent, border: `1px solid ${error ? C.danger : C.accent}30`, fontSize: "13px" }}>
          {error || success}
        </div>
      )}

      {creating && (
        <div style={s.card({ marginBottom: "20px" })}>
          <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "16px" }}>{editingId ? "Modifier l'utilisateur" : "Nouvel utilisateur"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
            <label style={{ cursor: "pointer", position: "relative", flexShrink: 0 }} title="Définir une photo de profil">
              <UserAvatar username={form.username || "?"} avatar={form.avatar} size={56} />
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
                const file = e.target.files[0]; if (!file) return;
                const result = await store.uploadFile(file);
                if (result) setForm(f => ({ ...f, avatar: result.url }));
                e.target.value = "";
              }} />
              <div style={{ position: "absolute", bottom: 0, right: 0, width: "18px", height: "18px", borderRadius: "50%", background: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: C.bg }}>✎</div>
            </label>
            {form.avatar && <button style={{ fontSize: "11px", color: C.danger, background: "none", border: "none", cursor: "pointer", padding: 0 }} onClick={() => setForm(f => ({ ...f, avatar: null }))}>Supprimer la photo</button>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "14px", marginBottom: "16px" }}>
            <div><label style={s.label}>Identifiant *</label><input style={s.inp()} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="identifiant" /></div>
            <div><label style={s.label}>{editingId ? "Nouveau mot de passe (laisser vide)" : "Mot de passe *"}</label><input type="password" style={s.inp()} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" /></div>
            {roles.length > 0 && (
              <div><label style={s.label}>Rôle</label>
                <select style={s.inp()} value={form.roleId} onChange={e => setForm({ ...form, roleId: e.target.value })}>
                  <option value="">— Aucun rôle —</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={s.label}>Permissions</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "6px" }}>
              {ALL_PERMISSIONS.map(perm => {
                const isRoot = editingId && users.find(u => u.id === editingId)?.role === "root";
                const checked = isRoot || form.permissions.includes(perm);
                return (
                  <button key={perm} onClick={() => !isRoot && togglePerm(perm)} style={{ padding: "6px 12px", borderRadius: "20px", border: `1px solid ${checked ? C.accent : C.border}`, background: checked ? `${C.accent}18` : "transparent", color: checked ? C.accent : C.muted, fontSize: "12px", cursor: isRoot ? "default" : "pointer", fontFamily: C.font }}>
                    {checked ? "✓ " : ""}{PERMISSION_LABELS[perm]}
                  </button>
                );
              })}
            </div>
          </div>
          {error && <div style={{ color: C.danger, fontSize: "12px", marginBottom: "10px" }}>{error}</div>}
          <div style={{ display: "flex", gap: "10px" }}>
            <button style={s.btn("primary")} onClick={submit}>{editingId ? "Enregistrer" : "Créer"}</button>
            <button style={s.btn("ghost")} onClick={() => { setCreating(false); setError(""); }}>Annuler</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ color: C.muted, fontSize: "13px" }}>Chargement…</div> : (
        <div style={s.card()}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "16px" }}>Comptes ({users.length})</div>
          {users.length === 0 ? <p style={{ color: C.muted, fontSize: "13px" }}>Aucun utilisateur.</p> : (
            <div style={{ display: "grid", gap: "12px" }}>
              {users.map(u => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px", background: C.card2, borderRadius: "8px", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <UserAvatar username={u.username} avatar={u.avatar} size={36} />
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: "500", fontSize: "14px" }}>{u.username}</span>
                      {u.id === session.user.id && <span style={{ fontSize: "10px", color: C.muted }}>(vous)</span>}
                      {u.role === "root" && <Badge color="green">root</Badge>}
                      {u.roleId && roles.find(r => r.id === u.roleId) && (() => { const r = roles.find(x => x.id === u.roleId); return <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "20px", background: r.color+"22", color: r.color, fontWeight: "600" }}>{r.name}</span>; })()}
                    </div>
                    <div style={{ marginTop: "4px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {u.role === "root" ? <span style={{ fontSize: "11px", color: C.muted }}>Toutes les permissions</span>
                        : (u.permissions||[]).length === 0 && !u.roleId ? <span style={{ fontSize: "11px", color: C.muted }}>Aucune permission</span>
                        : (u.permissions||[]).map(p => <span key={p} style={{ fontSize: "10px", background: C.card, color: C.muted, padding: "2px 7px", borderRadius: "10px", border: `1px solid ${C.border}` }}>{PERMISSION_LABELS[p]||p}</span>)
                      }
                    </div>
                  </div>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <Badge color={u.role === "root" ? "green" : "neutral"}>{u.role === "root" ? "root" : "utilisateur"}</Badge>
                    <button style={s.btn("ghost", { padding: "5px 10px", fontSize: "11px" })} onClick={() => openEdit(u)}>Modifier</button>
                    {u.role !== "root" && <button style={s.btn("danger", { padding: "5px 10px", fontSize: "11px" })} onClick={() => deleteUser(u.id)}>Supprimer</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Gestion des rôles */}
      <div style={{ marginTop: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px" }}>Rôles</div>
            <div style={{ color: C.muted, fontSize: "12px", marginTop: "2px" }}>Créez des rôles avec des permissions spécifiques et assignez-les aux membres</div>
          </div>
          <button style={s.btn("secondary")} onClick={() => { setRoleSection(!roleSection); setEditingRoleId(null); setRoleForm({ name: "", color: ROLE_COLORS[0], description: "", permissions: [] }); }}>
            {roleSection ? "Fermer" : "+ Créer un rôle"}
          </button>
        </div>

        {/* Formulaire création/édition de rôle */}
        {roleSection && (
          <div style={s.card({ marginBottom: "14px", borderColor: C.accentBg })}>
            <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>{editingRoleId ? "Modifier le rôle" : "Nouveau rôle"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "14px" }}>
              <div>
                <label style={s.label}>Nom du rôle *</label>
                <input style={s.inp()} value={roleForm.name} placeholder="Ex: Trésorier" onChange={e => setRoleForm({ ...roleForm, name: e.target.value })} />
              </div>
              <div>
                <label style={s.label}>Description</label>
                <input style={s.inp()} value={roleForm.description} placeholder="Optionnel" onChange={e => setRoleForm({ ...roleForm, description: e.target.value })} />
              </div>
              <div>
                <label style={s.label}>Couleur</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                  {ROLE_COLORS.map(col => (
                    <button key={col} onClick={() => setRoleForm({ ...roleForm, color: col })} style={{ width: "24px", height: "24px", borderRadius: "50%", background: col, border: `3px solid ${roleForm.color === col ? C.text : "transparent"}`, cursor: "pointer", flexShrink: 0 }} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={s.label}>Permissions accordées par ce rôle</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
                {ALL_PERMISSIONS.map(perm => {
                  const checked = roleForm.permissions.includes(perm);
                  return (
                    <button key={perm} onClick={() => toggleRolePerm(perm)} style={{ padding: "5px 11px", borderRadius: "20px", border: `1px solid ${checked ? roleForm.color : C.border}`, background: checked ? roleForm.color + "22" : "transparent", color: checked ? roleForm.color : C.muted, fontSize: "12px", cursor: "pointer", fontFamily: C.font }}>
                      {checked ? "✓ " : ""}{PERMISSION_LABELS[perm]}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button style={s.btn("primary")} onClick={saveRole}>{editingRoleId ? "Enregistrer" : "Créer le rôle"}</button>
              <button style={s.btn("ghost")} onClick={() => { setRoleSection(false); setEditingRoleId(null); }}>Annuler</button>
            </div>
          </div>
        )}

        {/* Liste des rôles */}
        {roles.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "8px" }}>
            {roles.map(r => {
              const assignedCount = users.filter(u => u.roleId === r.id).length;
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: C.card2, borderRadius: "8px", borderLeft: `3px solid ${r.color}`, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: "600", fontSize: "14px", color: r.color }}>{r.name}</span>
                      <span style={{ fontSize: "11px", color: C.muted }}>{assignedCount} membre{assignedCount !== 1 ? "s" : ""}</span>
                    </div>
                    {r.description && <div style={{ fontSize: "12px", color: C.muted, marginTop: "2px" }}>{r.description}</div>}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                      {r.permissions.length === 0
                        ? <span style={{ fontSize: "11px", color: C.muted }}>Aucune permission</span>
                        : r.permissions.map(p => <span key={p} style={{ fontSize: "10px", padding: "1px 7px", borderRadius: "10px", background: r.color+"15", color: r.color, border: `1px solid ${r.color}30` }}>{PERMISSION_LABELS[p]||p}</span>)
                      }
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button style={s.btn("ghost", { padding: "5px 10px", fontSize: "11px" })} onClick={() => editRole(r)}>Modifier</button>
                    <button style={s.btn("danger", { padding: "5px 10px", fontSize: "11px" })} onClick={() => deleteRole(r.id)}>Supprimer</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {roles.length === 0 && !roleSection && <p style={{ color: C.muted, fontSize: "13px" }}>Aucun rôle créé. Créez des rôles pour organiser vos membres.</p>}
      </div>

      {/* Codes d'invitation */}
      <div style={{ marginTop: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px" }}>Codes d'invitation</div>
            <div style={{ color: C.muted, fontSize: "12px", marginTop: "2px" }}>Partagez un code pour permettre à quelqu'un de créer un compte</div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {invites.filter(i => !i.used).length > 1 && (
              <button style={s.btn("ghost")} onClick={copyAllCodes}>
                {copiedAll ? "✓ Copiés !" : `Copier tous (${invites.filter(i => !i.used).length})`}
              </button>
            )}
            <button style={s.btn("secondary")} onClick={generateInvite} disabled={genLoading}>
              {genLoading ? "Génération…" : "+ Générer un code"}
            </button>
          </div>
        </div>
        <div style={s.card()}>
          {invites.length === 0
            ? <p style={{ color: C.muted, fontSize: "13px" }}>Aucun code généré pour l'instant.</p>
            : <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {[...invites].reverse().map(inv => (
                  <div key={inv.code} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: C.card2, borderRadius: "8px", flexWrap: "wrap", gap: "8px" }}>
                    <div>
                      <span style={{ fontFamily: C.mono, fontSize: "16px", letterSpacing: "2px", color: inv.used ? C.muted : C.accent }}>{inv.code}</span>
                      {inv.used && <span style={{ marginLeft: "10px", fontSize: "11px", color: C.muted }}>Utilisé par {inv.usedBy}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "11px", color: C.muted }}>{new Date(inv.createdAt).toLocaleDateString("fr-FR")}</span>
                      {!inv.used && (
                        <button style={s.btn("ghost", { padding: "5px 10px", fontSize: "11px" })} onClick={() => copyCode(inv.code)}>
                          {copiedCode === inv.code ? "✓ Copié !" : "Copier"}
                        </button>
                      )}
                      <Badge color={inv.used ? "neutral" : "green"}>{inv.used ? "Utilisé" : "Disponible"}</Badge>
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

    </div>
  );
}

// ── MAINTENANCE ───────────────────────────────────────────────────────────────
function MaintenancePage({ data, update }) {
  const m = data.maintenance || { enabled: false, message: "" };
  const n = data.notification || { active: false, message: "", date: "" };
  const [msg, setMsg] = useState(m.message || "");
  const [notifMsg, setNotifMsg] = useState(n.message || "");
  const [saved, setSaved] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [tab, setTab] = useState("maintenance");

  const sendNotif = () => {
    if (!notifMsg.trim()) return;
    update({ notification: { active: true, message: notifMsg.trim(), date: new Date().toISOString() } });
    setNotifSaved("sent"); setTimeout(() => setNotifSaved(false), 2000);
  };
  const clearNotif = () => {
    update({ notification: { active: false, message: "", date: "" } });
    setNotifMsg("");
    setNotifSaved("cleared"); setTimeout(() => setNotifSaved(false), 2000);
  };

  const save = (patch) => {
    update({ maintenance: { ...m, ...patch } });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const TABS = [{ id: "maintenance", label: "🔧 Maintenance" }, { id: "logs", label: "≡ Journal" }];

  return (
    <div>
      <h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", marginBottom: "6px", letterSpacing: "-0.8px" }}>Administration</h1>
      <p style={{ color: C.muted, marginBottom: "20px", fontSize: "14px" }}>Outils d'administration du site.</p>
      <div style={{ display: "flex", gap: "6px", marginBottom: "24px", borderBottom: `1px solid ${C.border}`, paddingBottom: "0" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "8px 16px", fontSize: "13px", fontFamily: C.font,
            color: tab === t.id ? C.accent : C.muted,
            borderBottom: `2px solid ${tab === t.id ? C.accent : "transparent"}`,
            marginBottom: "-1px", transition: "color 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {tab === "logs" && <LogsPage />}
      {tab === "maintenance" && (<div>

      <div style={s.card({ marginBottom: "16px" })}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "18px" }}>
          <div>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px" }}>Mode maintenance</div>
            <div style={{ color: C.muted, fontSize: "12px", marginTop: "3px" }}>Bloque l'accès au site pour tous les utilisateurs non-admin</div>
          </div>
          <button onClick={() => save({ enabled: !m.enabled })} style={{
            ...s.btn(m.enabled ? "danger" : "primary"),
            minWidth: "140px",
          }}>
            {m.enabled ? "🔴 Désactiver" : "🟢 Activer la maintenance"}
          </button>
        </div>

        {m.enabled && (
          <div style={{ padding: "12px 16px", background: C.dangerBg, border: `1px solid ${C.danger}40`, borderRadius: "8px", marginBottom: "16px" }}>
            <span style={{ color: C.danger, fontSize: "13px", fontWeight: "500" }}>⚠ Mode maintenance actif — les utilisateurs non-admin voient l'écran de blocage</span>
          </div>
        )}

        <div style={{ marginBottom: "14px" }}>
          <label style={s.label}>Message affiché aux utilisateurs</label>
          <textarea style={{ ...s.inp(), resize: "vertical", height: "80px" }} value={msg}
            onChange={e => setMsg(e.target.value)}
            placeholder="Le site est temporairement indisponible. Revenez bientôt." />
        </div>
        <button style={s.btn("secondary")} onClick={() => save({ message: msg })}>
          {saved ? "✓ Sauvegardé !" : "Sauvegarder le message"}
        </button>
      </div>

      <div style={s.card({ marginBottom: "16px" })}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px" }}>Notification globale</div>
            <div style={{ color: C.muted, fontSize: "12px", marginTop: "3px" }}>Affiche une bannière à tous les utilisateurs connectés</div>
          </div>
          {n.active && <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "20px", background: `${C.info}18`, color: C.info }}>● Active</span>}
        </div>
        {n.active && (
          <div style={{ padding: "10px 14px", background: `${C.info}12`, border: `1px solid ${C.info}40`, borderRadius: "8px", marginBottom: "14px", fontSize: "13px", color: C.info }}>
            📣 Bannière active : « {n.message} »
          </div>
        )}
        <div style={{ marginBottom: "12px" }}>
          <label style={s.label}>Message à diffuser</label>
          <textarea style={{ ...s.inp(), resize: "vertical", height: "70px" }} value={notifMsg}
            onChange={e => setNotifMsg(e.target.value)}
            placeholder="Réunion ce soir à 20h — ne manquez pas ça !" />
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button style={s.btn("primary")} onClick={sendNotif} disabled={!notifMsg.trim()}>
            {notifSaved === "sent" ? "✓ Envoyé !" : "📣 Envoyer la notification"}
          </button>
          {n.active && (
            <button style={s.btn("danger")} onClick={clearNotif}>
              {notifSaved === "cleared" ? "✓ Supprimée !" : "✕ Effacer la bannière"}
            </button>
          )}
        </div>
      </div>

      <div style={s.card()}>
        <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "12px" }}>Aperçu de l'écran de maintenance</div>
        <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "40px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <div style={{ fontSize: "36px" }}>🔧</div>
          <div style={{ fontFamily: C.display, fontSize: "18px", fontWeight: "800", color: C.warn }}>Site en maintenance</div>
          <div style={{ color: C.muted, fontSize: "13px", textAlign: "center", maxWidth: "340px" }}>
            {msg || "Le site est temporairement indisponible. Revenez bientôt."}
          </div>
        </div>
      </div>
      </div>)}
    </div>
  );
}

// ── ACCESS DENIED ─────────────────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: "12px" }}>
      <div style={{ fontSize: "40px" }}>🔒</div>
      <div style={{ fontFamily: C.display, fontSize: "18px", fontWeight: "700", color: C.text }}>Accès refusé</div>
      <div style={{ color: C.muted, fontSize: "14px" }}>Vous n'avez pas la permission d'accéder à cette section.</div>
    </div>
  );
}

// ── COMPOSANTS PARTAGÉS ───────────────────────────────────────────────────────
function Badge({ color, children }) {
  const colors = { green: { bg: `${C.accent}18`, text: C.accent }, red: { bg: `${C.danger}18`, text: C.danger }, neutral: { bg: C.card2, text: C.muted } };
  const { bg, text } = colors[color] || colors.neutral;
  return <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "20px", background: bg, color: text, whiteSpace: "nowrap" }}>{children}</span>;
}

function ProgressBar({ pct }) {
  return (
    <div style={{ height: "5px", background: C.border, borderRadius: "3px" }}>
      <div style={{ height: "100%", width: `${pct}%`, borderRadius: "3px", transition: "width 0.3s", background: pct > 90 ? C.danger : pct > 70 ? C.warn : C.accent }} />
    </div>
  );
}

function DataTable({ headers, rows, empty }) {
  if (rows.length === 0) return <p style={{ color: C.muted, fontSize: "13px", padding: "8px 0" }}>{empty}</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "400px" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {headers.map(h => <th key={h} style={{ textAlign: "left", padding: "7px 8px", fontSize: "10px", color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${C.border}40` }}>
              {row.map((cell, j) => <td key={j} style={{ padding: "10px 8px", fontSize: "13px" }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
