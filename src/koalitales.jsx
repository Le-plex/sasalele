import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";

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
  assoc: { name: "", logo: null, address: "", email: "", phone: "", iban: "", siret: "", note: "", bankBalance: 0, bankThreshold: 0 },
  events: [], catalog: [], invoices: [], inventory: [], meetings: [], prestations: [], locations: [],
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
    const target = users.find(u => u.id === id);
    await store.saveUsers(users.filter(u => u.id !== id));
    // Auto-retrait du pool si l'entrée a été créée automatiquement pour cet utilisateur
    if (target) {
      const data = await store.load();
      if (data) {
        const pool = data.depensesPool || [];
        const entry = pool.find(p => p.linkedUsername === target.username && p.name === target.username);
        if (entry) {
          await store.save({ ...data, depensesPool: pool.filter(p => p !== entry) });
        }
      }
    }
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
    const trimmed = username.trim();
    if (users.find(u => u.username === trimmed)) return { ok: false, error: "Identifiant déjà utilisé." };
    const user = { id: uid(), username: trimmed, hash: hashPw(password), role: "user", permissions: [], linkedPoolName: trimmed, created_at: new Date().toISOString() };
    await store.saveUsers([...users, user]);
    await store.saveInvites(invites.map(i => i.code === code ? { ...i, used: true, usedBy: trimmed } : i));
    // Auto-ajout dans le pool de dépenses
    const data = await store.load();
    if (data) {
      const pool = data.depensesPool || [];
      if (!pool.find(p => p.name === trimmed)) {
        await store.save({ ...data, depensesPool: [...pool, { name: trimmed, linkedUsername: trimmed }] });
      }
    }
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
    fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "logout", username: session?.user?.username }) }).catch(() => {});
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
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: "100vh", overflow: "hidden", background: C.bg, color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      {needsIdentification && <WhoAreYouModal pool={pool} username={session.user.username} onLink={handleLinkToPool} />}
      <Nav page={page} go={(p) => { setPage(p); setEventId(null); }} session={session} onLogout={handleLogout} can={can} isMobile={isMobile} onAvatarChange={handleAvatarChange} users={users} data={data} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", ...(isMobile ? {} : { maxHeight: "100vh" }) }}>
        {showBanner && (
          <div style={{ background: `${C.info}18`, borderBottom: `1px solid ${C.info}40`, padding: "10px 24px", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
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
        {page === "locations"    && (can("manage_prestations") ? <LocationPage data={data} update={update} /> : <AccessDenied />)}
        {page === "contacts"     && <ContactsPage data={data} update={update} />}
        {page === "compta"       && <ComptaPage data={data} update={update} can={can} session={session} />}
        {page === "depenses"     && <DepensesPage data={data} update={update} users={users} session={session} can={can} />}
        {page === "todos"        && <TodosPage data={data} update={update} session={session} can={can} />}
        {page === "tickets"      && <TicketsPage data={data} update={update} session={session} can={can} />}
        {page === "settings"     && (can("settings")           ? <SettingsPage data={data} update={update} /> : <AccessDenied />)}
        {page === "users"        && (can("manage_users")       ? <UserManagementPage session={session} data={data} update={update} /> : <AccessDenied />)}
        {page === "maintenance"  && (can("web_admin")           ? <MaintenancePage data={data} update={update} session={session} /> : <AccessDenied />)}
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
    if (res.ok) {
      fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "login_ok", username: form.username }) }).catch(() => {});
      onLogin(res.token, res.user);
    } else {
      fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "login_fail", username: form.username }) }).catch(() => {});
      setError(res.error || "Identifiants incorrects.");
    }
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
  const [showPwForm, setShowPwForm] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState(null); // { ok, text }

  const submitPwChange = async () => {
    if (!pwForm.current || !pwForm.next) return setPwMsg({ ok: false, text: "Remplis tous les champs." });
    if (pwForm.next.length < 4) return setPwMsg({ ok: false, text: "Mot de passe trop court (4 car. min)." });
    if (pwForm.next !== pwForm.confirm) return setPwMsg({ ok: false, text: "Les mots de passe ne correspondent pas." });
    const token = session?.token;
    const userId = session?.user?.id;
    // Vérifier l'ancien mot de passe via login
    const check = await auth.login({ username: session.user.username, password: pwForm.current });
    if (!check.ok) return setPwMsg({ ok: false, text: "Mot de passe actuel incorrect." });
    const res = await auth.updateUser(token, { id: userId, password: pwForm.next });
    if (res.ok) {
      setPwMsg({ ok: true, text: "Mot de passe mis à jour !" });
      setPwForm({ current: "", next: "", confirm: "" });
      setTimeout(() => { setShowPwForm(false); setPwMsg(null); }, 1800);
    } else {
      setPwMsg({ ok: false, text: "Erreur lors de la mise à jour." });
    }
  };

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
    const bankBalance = data.assoc?.bankBalance ?? 0;
    const bankThreshold = data.assoc?.bankThreshold ?? 0;
    const effectiveBankBalance = Math.max(0, bankBalance - bankThreshold);
    let netM = 0, netB = 0;

    depenses.flatMap(d => (d.reimbursements||[]).filter(r => !r.settled)).forEach(r => {
      const amt = r.amount;
      if (amt < 0.01) return;
      if (r.from === myName) { r.to === "Banque" ? (netB -= amt) : (netM -= amt); }
      if (r.to   === myName) { r.from === "Banque" ? (netB += amt) : (netM += amt); }
    });

    events.filter(e => (e.members||[]).length > 0 && (e.expenses||[]).length > 0).forEach(ev => {
      computeMinimalTransfers(ev.members, ev.expenses, ev.revenues, effectiveBankBalance).forEach(t => {
        if ((ev.settledTransfers||[]).find(s => s.from === t.from && s.to === t.to)) return;
        const amt = t.amount;
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
    { id: "locations",   icon: "◧", label: "Locations",          perm: "manage_prestations" },
    { id: "contacts",    icon: "◉", label: "Contacts",           always: true },
    { id: "depenses",    icon: "€", label: "Dépenses",          always: true },
    { id: "compta",      icon: "⊞", label: "Comptabilité",      always: true },
    { id: "todos",        icon: "☑", label: "Tâches",             always: true },
    { id: "tickets",     icon: "◎", label: "Suggestions",        always: true },
    { id: "settings",   icon: "⚙", label: "Association",       perm: "settings" },
    { id: "users",       icon: "◈", label: "Utilisateurs",      perm: "manage_users" },
    { id: "maintenance", icon: "⚙", label: "Maintenance",       perm: "web_admin" },
  ].filter(item => item.always || can(item.perm));

  const isActive = (id) => page === id || (id === "events" && page === "eventDetail");

  const navListScroll = useRef(0);

  const NavContent = () => (
    <>
      <div style={{ padding: "22px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: C.display, fontSize: "17px", fontWeight: "800", color: C.accent, letterSpacing: "-0.3px" }}>SASALELE</div>
          <div style={{ fontFamily: C.font, fontSize: "11px", color: C.muted, marginTop: "2px", letterSpacing: "0.3px" }}>Pour Koalisons</div>
        </div>
        {isMobile && <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "20px" }}>✕</button>}
      </div>
      <div
        ref={el => { if (el) el.scrollTop = navListScroll.current; }}
        onScroll={e => { navListScroll.current = e.currentTarget.scrollTop; }}
        style={{ padding: "12px 0", flex: 1, overflowY: "auto" }}
      >
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
          <button
            onClick={() => { setShowPwForm(v => !v); setPwMsg(null); setPwForm({ current: "", next: "", confirm: "" }); }}
            style={{ ...s.btn("ghost", { width: "100%", fontSize: "12px", padding: "6px" }), marginBottom: "6px", color: C.muted }}
          >
            {showPwForm ? "✕ Annuler" : "🔑 Changer mon mot de passe"}
          </button>

          {showPwForm && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" }}>
              <input
                type="password" placeholder="Mot de passe actuel"
                style={s.inp({ fontSize: "12px", padding: "6px 10px" })}
                value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                autoFocus
              />
              <input
                type="password" placeholder="Nouveau mot de passe"
                style={s.inp({ fontSize: "12px", padding: "6px 10px" })}
                value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
              />
              <input
                type="password" placeholder="Confirmer le nouveau"
                style={s.inp({ fontSize: "12px", padding: "6px 10px" })}
                value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && submitPwChange()}
              />
              {pwMsg && (
                <div style={{ fontSize: "11px", padding: "5px 8px", borderRadius: "6px", background: pwMsg.ok ? `${C.accent}18` : `${C.danger}18`, color: pwMsg.ok ? C.accent : C.danger }}>
                  {pwMsg.text}
                </div>
              )}
              <button onClick={submitPwChange} style={s.btn("primary", { width: "100%", fontSize: "12px", padding: "7px" })}>
                Enregistrer
              </button>
            </div>
          )}

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
    <nav style={{ width: "210px", height: "100vh", background: C.sidebar, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto" }}>
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
  const locations   = data.locations   || [];
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
    ...locations.filter(l => l.dateStart >= todayStr && l.statut !== "Annulé").map(l => ({ type: "location", date: l.dateStart, label: l.label || "Location", id: l.id, statut: l.statut, client: l.client?.name, color: locStatutColor(l.statut), icon: "◧" })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 14);

  const pastItems = [
    ...events.filter(e => e.date < todayStr).map(e => ({ type: "event", date: e.date, label: e.name, id: e.id, color: C.muted, icon: "◆" })),
    ...meetings.filter(m => m.date < todayStr).map(m => ({ type: "meeting", date: m.date, label: m.location ? `Réunion · ${m.location}` : "Réunion", id: m.id, color: C.muted, icon: "◈" })),
    ...locations.filter(l => l.dateStart < todayStr && l.statut !== "Annulé").map(l => ({ type: "location", date: l.dateStart, label: l.label || "Location", id: l.id, color: C.muted, icon: "◧" })),
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

  // ── Bilan net global ──
  const dbLocCalcTotal = (l) => { const it = (l.items||[]).reduce((a,i)=>a+(i.qty||1)*(i.unitPrice||0)*(i.days||1),0); const sv=(l.services||[]).reduce((a,sv)=>a+sv.qty*sv.unitPrice,0); return l.customPrice!=null?l.customPrice:it+sv+calcTransportCost(l.transport); };
  const dbPrestCalcTotal = (p2) => { const g=(p2.gear||[]).reduce((a,g2)=>a+g2.qty*g2.unitPrice*g2.days,0); const sv=(p2.services||[]).reduce((a,sv)=>a+sv.qty*sv.unitPrice,0); return p2.customPrice!=null?p2.customPrice:g+sv+calcTransportCost(p2.transport); };
  const dbTotProduits =
    events.reduce((a,e) => a+(e.revenues||[]).reduce((b,r) => b+((e.revenueConfirmations||{})[r.id]?.confirmed ? r.amount : 0), 0), 0)
    + prestations.filter(p2=>p2.paymentConfirmed).reduce((a,p2)=>a+dbPrestCalcTotal(p2),0)
    + locations.filter(l=>l.paymentConfirmed).reduce((a,l)=>a+dbLocCalcTotal(l),0);
  const dbTotCharges = totExpEv + totDepGl + prestations.reduce((a,p2)=>a+sumArr(p2.expenses||[],"amount"),0);
  const dbBilanNet = dbTotProduits - dbTotCharges;

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
          { label: "Solde bancaire",          value: fmt(bankBal),      color: bankBal >= 0 ? C.accent : C.danger,          sub: "Saisi manuellement" },
          { label: "Total produits",           value: fmt(dbTotProduits), color: "#2ecc71",                                  sub: "Encaissements confirmés en compta" },
          { label: "Total charges",            value: fmt(dbTotCharges),  color: C.warn,                                     sub: "Dépenses toutes sources" },
          { label: "Résultat net global",      value: (dbBilanNet >= 0 ? "+" : "") + fmt(dbBilanNet), color: dbBilanNet >= 0 ? "#2ecc71" : C.danger, sub: "Produits − Charges" },
          { label: "Dépenses association",     value: fmt(totDepGl),      color: C.warn,                                     sub: `${depenses.length} entrée${depenses.length>1?"s":""}` },
          { label: "Remb. en attente",         value: fmt(pendingReimb),  color: pendingReimb > 0 ? C.danger : C.muted,      sub: pendingReimb > 0 ? "À régler" : "Tout est soldé" },
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
          { label: "Locations", value: locations.length, sub: `${locations.filter(l=>l.dateStart>=todayStr&&l.statut!=="Annulé").length} à venir`, color: locStatutColor("Confirmé"), page: "locations" },
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
          <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: C.muted, flexWrap: "wrap" }}>
            <span><span style={{ color: C.accent }}>◆</span> Événements</span>
            <span><span style={{ color: C.info }}>◈</span> Réunions</span>
            <span><span style={{ color: C.warn }}>◎</span> Prestations</span>
            <span><span style={{ color: locStatutColor("Confirmé") }}>◧</span> Locations</span>
          </div>
        </div>
        {agendaItems.length === 0 ? (
          <p style={{ color: C.muted, fontSize: "13px" }}>Aucune échéance à venir.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {agendaItems.map((item, i) => {
              const days = daysUntil(item.date);
              return (
                <div key={i} onClick={() => {
                    if (item.type === "event") goEvent(item.id);
                    else if (item.type === "meeting") go("meetings");
                    else if (item.type === "presta") go("prestations");
                    else if (item.type === "location") go("locations");
                  }}
                  style={{ display: "flex", alignItems: "center", gap: "12px", padding: "9px 12px", background: C.card2, borderRadius: "8px", cursor: "pointer", borderLeft: `3px solid ${item.color}` }}>
                  <div style={{ width: "70px", flexShrink: 0, textAlign: "right" }}>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: days === 0 ? C.warn : days <= 7 ? C.accent : C.text }}>{dayLabel(days)}</div>
                    <div style={{ fontSize: "10px", color: C.muted }}>{new Date(item.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div>
                  </div>
                  <span style={{ fontSize: "13px", color: item.color }}>{item.icon}</span>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontWeight: "500", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</div>
                    {(item.type === "presta" || item.type === "location") && item.statut && <div style={{ fontSize: "11px", color: C.muted }}>{item.statut}{item.client ? ` · ${item.client}` : ""}</div>}
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
              <div key={i} onClick={() => item.type === "event" ? goEvent(item.id) : go(item.type === "location" ? "locations" : "meetings")}
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
                        {t.dueDate && <span>{t.dueDate}</span>}
                        {co.length > 0 && <span>avec {co.join(", ")}</span>}
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

      {/* Mes virements à effectuer */}
      {(() => {
        const username = session?.user?.username;
        if (!username) return null;
        const pool = data.depensesPool || [];
        const poolEntry = pool.find(p => p.linkedUsername === username);
        const myName = poolEntry?.name || username;
        const effectiveBal = Math.max(0, (data.assoc?.bankBalance ?? 0) - (data.assoc?.bankThreshold ?? 0));

        // Collecte des virements en attente avec détails complets
        const rawPending = [];
        events.forEach(ev => {
          if (!(ev.members||[]).find(m => m.name === myName)) return;
          computeMinimalTransfers(ev.members || [], ev.expenses || [], ev.revenues || [], effectiveBal)
            .filter(t => t.from === myName && !(ev.settledTransfers||[]).find(s => s.from === t.from && s.to === t.to))
            .forEach(t => rawPending.push({ to: t.to, from: t.from, amount: t.amount, source: ev.name, type: "event", eventId: ev.id }));
        });
        (data.depenses || []).filter(d => !d.archived).forEach(dep => {
          (dep.reimbursements || [])
            .filter(r => r.from === myName && !r.settled)
            .forEach(r => rawPending.push({ to: r.to, from: r.from, amount: r.amount, source: dep.label, type: "depense", reimbId: r.id, depId: dep.id }));
        });

        // Collecte des virements déjà réglés
        const rawSettled = [];
        events.forEach(ev => {
          if (!(ev.members||[]).find(m => m.name === myName)) return;
          computeMinimalTransfers(ev.members || [], ev.expenses || [], ev.revenues || [], effectiveBal)
            .filter(t => t.from === myName && (ev.settledTransfers||[]).find(s => s.from === t.from && s.to === t.to))
            .forEach(t => rawSettled.push({ to: t.to, from: t.from, amount: t.amount, source: ev.name, type: "event", eventId: ev.id }));
        });
        (data.depenses || []).filter(d => !d.archived).forEach(dep => {
          (dep.reimbursements || [])
            .filter(r => r.from === myName && r.settled)
            .forEach(r => rawSettled.push({ to: r.to, from: r.from, amount: r.amount, source: dep.label, type: "depense", reimbId: r.id, depId: dep.id }));
        });

        // Agrégation par destinataire
        const aggregate = (items) => {
          const byTo = {};
          items.forEach(x => {
            if (!byTo[x.to]) byTo[x.to] = { to: x.to, total: 0, sources: [], items: [] };
            byTo[x.to].total = Math.round((byTo[x.to].total + x.amount) * 100) / 100;
            if (!byTo[x.to].sources.includes(x.source)) byTo[x.to].sources.push(x.source);
            byTo[x.to].items.push(x);
          });
          return Object.values(byTo);
        };

        const pendingGroups = aggregate(rawPending);
        const settledGroups = aggregate(rawSettled);

        const settleGroup = (items) => {
          const patch = {};
          const byEvent = {};
          items.filter(x => x.type === "event").forEach(x => { if (!byEvent[x.eventId]) byEvent[x.eventId] = []; byEvent[x.eventId].push(x); });
          if (Object.keys(byEvent).length > 0) {
            patch.events = data.events.map(ev => {
              if (!byEvent[ev.id]) return ev;
              const newSettled = [...(ev.settledTransfers||[])];
              byEvent[ev.id].forEach(x => { if (!newSettled.find(s => s.from === x.from && s.to === x.to)) newSettled.push({ id: uid(), from: x.from, to: x.to, amount: x.amount, settledAt: today() }); });
              return { ...ev, settledTransfers: newSettled };
            });
          }
          const reimbIds = new Set(items.filter(x => x.type === "depense").map(x => x.reimbId));
          if (reimbIds.size > 0) {
            patch.depenses = (data.depenses||[]).map(d => ({ ...d, reimbursements: (d.reimbursements||[]).map(r => reimbIds.has(r.id) ? { ...r, settled: true, settledDate: today() } : r) }));
          }
          update(patch);
        };

        const unsettleGroup = (items) => {
          const patch = {};
          const byEvent = {};
          items.filter(x => x.type === "event").forEach(x => { if (!byEvent[x.eventId]) byEvent[x.eventId] = []; byEvent[x.eventId].push(x); });
          if (Object.keys(byEvent).length > 0) {
            patch.events = data.events.map(ev => {
              if (!byEvent[ev.id]) return ev;
              const toRemove = byEvent[ev.id];
              return { ...ev, settledTransfers: (ev.settledTransfers||[]).filter(s => !toRemove.find(x => x.from === s.from && x.to === s.to)) };
            });
          }
          const reimbIds = new Set(items.filter(x => x.type === "depense").map(x => x.reimbId));
          if (reimbIds.size > 0) {
            patch.depenses = (data.depenses||[]).map(d => ({ ...d, reimbursements: (d.reimbursements||[]).map(r => reimbIds.has(r.id) ? { ...r, settled: false, settledDate: null } : r) }));
          }
          update(patch);
        };

        if (pendingGroups.length === 0 && settledGroups.length === 0) return null;
        return (
          <div style={{ ...s.card({ marginBottom: "24px" }), borderColor: `${C.warn}40` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px" }}>
                  Mes virements à effectuer
                  {pendingGroups.length > 0 && <span style={{ fontSize: "12px", color: C.warn, fontWeight: "400", marginLeft: "8px" }}>{pendingGroups.length} en attente</span>}
                </div>
                {pendingGroups.length > 1 && (
                  <button onClick={() => settleGroup(rawPending)} style={s.btn("primary", { padding: "5px 12px", fontSize: "11px" })}>✓ Tout régler</button>
                )}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
              {pendingGroups.map((t, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: C.card2, borderRadius: "8px", flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: "13px" }}>Virer à <strong style={{ color: t.to === "Banque" ? C.info : C.accent }}>{t.to}</strong></span>
                    <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>{t.sources.join(" · ")}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontFamily: C.mono, fontWeight: "700", color: C.warn }}>{fmt(t.total)}</span>
                    <button onClick={() => settleGroup(t.items)} style={s.btn("ghost", { padding: "5px 10px", fontSize: "11px" })}>✓ Réglé</button>
                  </div>
                </div>
              ))}
              {settledGroups.length > 0 && (
                <div style={{ marginTop: pendingGroups.length > 0 ? "8px" : "0", borderTop: pendingGroups.length > 0 ? `1px solid ${C.border}` : "none", paddingTop: pendingGroups.length > 0 ? "8px" : "0" }}>
                  {settledGroups.map((t, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", background: "transparent", borderRadius: "8px", flexWrap: "wrap", gap: "8px", opacity: 0.55 }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: "13px", textDecoration: "line-through" }}>Virer à <strong>{t.to}</strong></span>
                        <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>{t.sources.join(" · ")}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontFamily: C.mono, fontWeight: "700", color: C.muted }}>{fmt(t.total)}</span>
                        <button onClick={() => unsettleGroup(t.items)} style={s.btn("ghost", { padding: "5px 10px", fontSize: "11px" })}>Annuler</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
      {tab === "team"     && <EventTeam event={event} upd={upd} can={can} users={users} pool={data.depensesPool || []} />}
      {tab === "gear"     && <EventGear event={event} upd={upd} can={can} inventory={data.inventory || []} />}
      {tab === "expenses" && <Expenses event={event} upd={upd} can={can} pool={data.depensesPool || []} />}
      {tab === "revenues" && <Revenues event={event} upd={upd} can={can} />}
      {tab === "split"    && <Split event={event} upd={upd} can={can} pool={data.depensesPool || []} update={update} data={data} />}
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
                <option value="Banque">Banque</option>
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
                        <option value="Banque">Banque</option>
                        {pool.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                        {editForm.paidBy && editForm.paidBy !== "Banque" && !pool.find(p => p.name === editForm.paidBy) && (
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

function Split({ event, upd, can, pool = [], update, data }) {
  const [nm, setNm] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const members = event.members || [];
  const bankExpenses    = (event.expenses||[]).filter(ex => ex.bankCoverage || ex.paidBy === "Banque");
  const regularExpenses = (event.expenses||[]).filter(ex => !ex.bankCoverage && ex.paidBy !== "Banque");

  const totalBankExp    = sumArr(bankExpenses, "amount");
  const totalRegularExp = sumArr(regularExpenses, "amount");
  const totalRevenues   = sumArr(event.revenues||[], "amount");

  // Bank always reimburses whoever advanced bank-covered expenses (full amount)
  const bankToMemberMap = {};
  bankExpenses.forEach(ex => {
    if (ex.paidBy && ex.paidBy !== "Banque") bankToMemberMap[ex.paidBy] = (bankToMemberMap[ex.paidBy]||0) + ex.amount;
  });
  // If revenues don't cover bank expenses, members share the shortfall
  const revCoveringBank = Math.min(totalRevenues, totalBankExp);
  const bankShortfall   = totalBankExp - revCoveringBank;
  const revSurplus      = Math.max(0, totalRevenues - totalBankExp);
  const memberToBankShare = members.length > 0 && bankShortfall > 0.005 ? bankShortfall / members.length : 0;

  const bankNetList = members.map(m => ({
    name: m.name,
    owes: memberToBankShare,
    receives: bankToMemberMap[m.name] || 0,
    net: memberToBankShare - (bankToMemberMap[m.name] || 0),
  }));

  // Regular expenses: split uncovered portion
  const regularUncovered = Math.max(0, totalRegularExp - revSurplus);
  const perPerson = members.length > 0 && regularUncovered > 0 ? regularUncovered / members.length : 0;
  const ratio = totalRegularExp > 0 ? regularUncovered / totalRegularExp : 1;
  const paidMap = {};
  regularExpenses.forEach(ex => { if (ex.paidBy && ex.paidBy !== "Banque") paidMap[ex.paidBy] = (paidMap[ex.paidBy]||0) + ex.amount; });
  const balances = members.map(m => ({ ...m, paid: paidMap[m.name]||0, share: perPerson, balance: (paidMap[m.name]||0) * ratio - perPerson }));

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
            <span style={{ fontFamily: C.mono, fontSize: "13px", color: C.info }}>{fmt(totalBankExp)} · {bankExpenses.length} dépense(s)</span>
          </div>
          <div style={{ fontSize: "11px", color: C.muted, marginBottom: "12px" }}>
            {bankShortfall > 0.005
              ? <>Recettes insuffisantes — flux : <strong style={{ color: C.warn }}>chaque membre → Banque</strong> pour sa part ({fmt(memberToBankShare)}), puis <strong style={{ color: C.info }}>Banque → membre ayant avancé</strong></>
              : <>Recettes couvrent tout — flux : <strong style={{ color: C.info }}>Banque → membre ayant avancé</strong> uniquement</>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {bankNetList.map(b => (
              <div key={b.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: C.card2, borderRadius: "8px", flexWrap: "wrap", gap: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: "500" }}>{b.name}</span>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  {b.receives > 0 && <span style={{ fontSize: "12px", color: C.accent }}>← reçoit {fmt(b.receives)}</span>}
                  {b.owes > 0.005 && <span style={{ fontSize: "12px", color: C.warn }}>→ doit {fmt(b.owes)}</span>}
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
                <span style={{ color: C.muted, fontSize: "13px" }}>Total : <strong style={{ color: C.warn, fontFamily: C.mono }}>{fmt(regularUncovered)}</strong></span>
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

      {/* Virements à confirmer */}
      {members.length > 0 && (() => {
        const allTransfers = computeMinimalTransfers(members, event.expenses || [], event.revenues || [], Math.max(0, (data?.assoc?.bankBalance || 0) - (data?.assoc?.bankThreshold || 0)));
        const settled = event.settledTransfers || [];
        const isSettled = (t) => settled.find(s => s.from === t.from && s.to === t.to);
        const pendingTransfers = allTransfers.filter(t => !isSettled(t));
        const doneTransfers = allTransfers.filter(t => !!isSettled(t));

        const settleTransfer = (t) => {
          const newSettled = [...settled, { id: uid(), from: t.from, to: t.to, amount: t.amount, settledAt: today() }];
          let bankBalance = data?.assoc?.bankBalance ?? 0;
          if (t.to === "Banque") bankBalance = Math.round((bankBalance + t.amount) * 100) / 100;
          else if (t.from === "Banque") bankBalance = Math.round((bankBalance - t.amount) * 100) / 100;
          update({
            events: data.events.map(e => e.id === event.id ? { ...e, settledTransfers: newSettled } : e),
            ...(t.to === "Banque" || t.from === "Banque" ? { assoc: { ...data.assoc, bankBalance } } : {}),
          });
        };
        const unsettle = (t) => {
          const s = isSettled(t);
          if (!s) return;
          let bankBalance = data?.assoc?.bankBalance ?? 0;
          if (t.to === "Banque") bankBalance = Math.round((bankBalance - t.amount) * 100) / 100;
          else if (t.from === "Banque") bankBalance = Math.round((bankBalance + t.amount) * 100) / 100;
          update({
            events: data.events.map(e => e.id === event.id ? { ...e, settledTransfers: settled.filter(x => !(x.from === t.from && x.to === t.to)) } : e),
            ...(t.to === "Banque" || t.from === "Banque" ? { assoc: { ...data.assoc, bankBalance } } : {}),
          });
        };

        if (allTransfers.length === 0) return null;
        return (
          <div style={{ ...s.card({ marginTop: "14px" }), borderColor: `${C.accent}30` }}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px" }}>
              Virements à effectuer
              {doneTransfers.length > 0 && <span style={{ fontSize: "12px", color: C.accent, fontWeight: "400", marginLeft: "8px" }}>{doneTransfers.length}/{allTransfers.length} confirmés</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {allTransfers.map((t, i) => {
                const done = !!isSettled(t);
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: done ? `${C.accent}10` : C.card2, borderRadius: "8px", opacity: done ? 0.75 : 1, flexWrap: "wrap", gap: "8px" }}>
                    <div style={{ flex: 1, fontSize: "13px" }}>
                      <strong style={{ color: t.from === "Banque" ? C.info : C.text }}>{t.from}</strong>
                      <span style={{ color: C.muted }}> → </span>
                      <strong style={{ color: t.to === "Banque" ? C.info : C.text }}>{t.to}</strong>
                      {done && <span style={{ marginLeft: "8px", fontSize: "11px", color: C.accent }}>✓ Confirmé</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontFamily: C.mono, fontWeight: "700", color: done ? C.muted : C.warn }}>{fmt(t.amount)}</span>
                      {can("edit_event") && !done && <button style={s.btn("primary", { padding: "4px 10px", fontSize: "11px" })} onClick={() => settleTransfer(t)}>Confirmer</button>}
                      {can("edit_event") && done && <button style={s.btn("ghost", { padding: "4px 10px", fontSize: "11px" })} onClick={() => unsettle(t)}>Annuler</button>}
                    </div>
                  </div>
                );
              })}
            </div>
            {pendingTransfers.length === 0 && allTransfers.length > 0 && (
              <div style={{ textAlign: "center", padding: "10px", color: C.accent, fontSize: "13px", marginTop: "8px" }}>Tous les virements sont confirmés.</div>
            )}
          </div>
        );
      })()}
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
          <button style={s.btn("primary")} onClick={generate}>Générer le PDF</button>
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

function EventTeam({ event, upd, can, users, pool = [] }) {
  const [nm, setNm] = useState("");
  const [role, setRole] = useState("");
  const [selUser, setSelUser] = useState("");
  const team = event.team || [];
  const existingNames = team.map(m => m.name);
  const availablePool = pool.filter(p => !existingNames.includes(p.name));

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
              {availablePool.length > 0 && (
                <select style={{ ...s.inp(), marginBottom: "6px" }} value={selUser} onChange={e => { setSelUser(e.target.value); if (e.target.value) setNm(""); }}>
                  <option value="">— Sélectionner dans le pool —</option>
                  {availablePool.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
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
        <button style={s.btn("primary")} onClick={() => setView("create")}>+ Nouvelle facture</button>
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
                    <button style={s.btn("secondary")} onClick={() => printInv(inv)}>PDF</button>
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

// ── LOCATIONS ─────────────────────────────────────────────────────────────────
const LOC_STATUTS = ["Devis", "Confirmé", "En cours", "Terminé", "Annulé"];
const locStatutColor = (s) => ({ "Devis": C.muted, "Confirmé": C.accent, "En cours": C.info, "Terminé": "#4affa0", "Annulé": C.danger }[s] || C.muted);

function LocationDetail({ loc, locations, inventory, catalog, assoc, update, calcDays, itemTotal, svcTotal, locTotal, printMateriel, printDevis, printContrat, printFacture, onBack, onDelete }) {
  const [itemPicker, setItemPicker] = useState(false);
  const [svcPicker, setSvcPicker] = useState(false);
  const [customSvc, setCustomSvc] = useState({ label: "", qty: "1", unitPrice: "", unit: "" });
  const [editClient, setEditClient] = useState(false);
  const [clientDraft, setClientDraft] = useState(loc.client || {});
  const [editDates, setEditDates] = useState(false);
  const [datesDraft, setDatesDraft] = useState({ dateStart: loc.dateStart, dateEnd: loc.dateEnd, timeStart: loc.timeStart||"", timeEnd: loc.timeEnd||"" });

  const days = calcDays(loc.dateStart, loc.dateEnd);
  const calcTotal = locTotal(loc);
  const total = (loc.customPrice != null) ? loc.customPrice : calcTotal;

  const updLoc = (patch) => {
    update({ locations: locations.map(l => l.id !== loc.id ? l : { ...l, ...patch }) });
  };

  const addItem = (invItem) => {
    const d = calcDays(loc.dateStart, loc.dateEnd);
    updLoc({ items: [...(loc.items||[]), { id: uid(), itemId: invItem.id, itemName: invItem.name, category: invItem.category, qty: 1, days: d, unitPrice: parseFloat(invItem.price)||0, priceType: invItem.priceType||"/jour" }] });
    setItemPicker(false);
  };
  const addSvcFromCatalog = (cat) => {
    let unitPrice, unit, priceMode;
    if (cat.priceMode === "%") {
      const base = (loc.customPrice != null) ? loc.customPrice : calcTotal;
      unitPrice = Math.round(cat.unitPrice / 100 * base * 100) / 100;
      unit = "%";
      priceMode = "%";
    } else {
      unitPrice = parseFloat(cat.unitPrice) || 0;
      unit = cat.unit || "";
      priceMode = "EUR";
    }
    updLoc({ services: [...(loc.services||[]), { id: uid(), label: cat.name, qty: 1, unitPrice, unit, priceMode, pct: cat.priceMode === "%" ? cat.unitPrice : undefined }] });
    setSvcPicker(false);
  };
  const addCustomSvc = () => {
    if (!customSvc.label || !customSvc.unitPrice) return;
    updLoc({ services: [...(loc.services||[]), { id: uid(), label: customSvc.label, qty: parseFloat(customSvc.qty)||1, unitPrice: parseFloat(customSvc.unitPrice)||0, unit: customSvc.unit }] });
    setCustomSvc({ label: "", qty: "1", unitPrice: "", unit: "" });
    setSvcPicker(false);
  };
  const removeItem = (id) => updLoc({ items: (loc.items||[]).filter(i => i.id !== id) });
  const removeService = (id) => updLoc({ services: (loc.services||[]).filter(s => s.id !== id) });
  const updateItemQty = (id, qty) => updLoc({ items: (loc.items||[]).map(i => i.id !== id ? i : { ...i, qty: parseInt(qty)||1 }) });
  const updateItemDays = (id, d) => updLoc({ items: (loc.items||[]).map(i => i.id !== id ? i : { ...i, days: parseInt(d)||1 }) });
  const updateSvcQty = (id, qty) => updLoc({ services: (loc.services||[]).map(s => s.id !== id ? s : { ...s, qty: parseInt(qty)||1 }) });
  const saveClient = () => { updLoc({ client: clientDraft }); setEditClient(false); };
  const saveDates = () => {
    const newDays = calcDays(datesDraft.dateStart, datesDraft.dateEnd);
    updLoc({ dateStart: datesDraft.dateStart, dateEnd: datesDraft.dateEnd, timeStart: datesDraft.timeStart, timeEnd: datesDraft.timeEnd, items: (loc.items||[]).map(i => i.priceType === "/jour" ? { ...i, days: newDays } : i) });
    setEditDates(false);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <button style={s.btn("ghost")} onClick={onBack}>← Locations</button>
        <span style={{ fontFamily: C.display, fontSize: "20px", fontWeight: "800", flex: 1 }}>{loc.label}</span>
        <Badge color={locStatutColor(loc.statut)}>{loc.statut}</Badge>
        <select style={{ ...s.inp(), width: "auto", fontSize: "12px" }} value={loc.statut} onChange={e => updLoc({ statut: e.target.value })}>
          {LOC_STATUTS.map(st => <option key={st}>{st}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px", marginBottom: "18px" }}>
        <div style={s.card()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontFamily: C.display, fontWeight: "700", fontSize: "13px" }}>Client</span>
            <button style={s.btn("ghost")} onClick={() => { setClientDraft(loc.client||{}); setEditClient(!editClient); }}>{editClient ? "Annuler" : "Modifier"}</button>
          </div>
          {editClient ? (
            <div style={{ display: "grid", gap: "8px" }}>
              {[["Nom","name"],["Adresse","address"],["Email","email"],["Téléphone","phone"]].map(([lbl,key]) => (
                <div key={key}><label style={s.label}>{lbl}</label><input style={s.inp()} value={clientDraft[key]||""} onChange={e => setClientDraft(d => ({ ...d, [key]: e.target.value }))} /></div>
              ))}
              <button style={s.btn("primary")} onClick={saveClient}>Sauvegarder</button>
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: C.muted, lineHeight: "1.7" }}>
              {loc.client?.name ? <div style={{ color: C.text, fontWeight: "600" }}>{loc.client.name}</div> : <div>—</div>}
              {loc.client?.address && <div style={{ whiteSpace: "pre-line" }}>{loc.client.address}</div>}
              {loc.client?.email && <div>{loc.client.email}</div>}
              {loc.client?.phone && <div>{loc.client.phone}</div>}
            </div>
          )}
        </div>

        <div style={s.card()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <span style={{ fontFamily: C.display, fontWeight: "700", fontSize: "13px" }}>Période</span>
            <button style={s.btn("ghost")} onClick={() => { setDatesDraft({ dateStart: loc.dateStart, dateEnd: loc.dateEnd }); setEditDates(!editDates); }}>{editDates ? "Annuler" : "Modifier"}</button>
          </div>
          {editDates ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div><label style={s.label}>Date début</label><input type="date" style={s.inp()} value={datesDraft.dateStart} onChange={e => setDatesDraft(d => ({ ...d, dateStart: e.target.value }))} /></div>
                <div><label style={s.label}>Heure début</label><input type="time" style={s.inp()} value={datesDraft.timeStart} onChange={e => setDatesDraft(d => ({ ...d, timeStart: e.target.value }))} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <div><label style={s.label}>Date fin</label><input type="date" style={s.inp()} value={datesDraft.dateEnd} onChange={e => setDatesDraft(d => ({ ...d, dateEnd: e.target.value }))} /></div>
                <div><label style={s.label}>Heure fin</label><input type="time" style={s.inp()} value={datesDraft.timeEnd} onChange={e => setDatesDraft(d => ({ ...d, timeEnd: e.target.value }))} /></div>
              </div>
              <button style={s.btn("primary")} onClick={saveDates}>Sauvegarder</button>
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: C.muted, lineHeight: "1.8" }}>
              <div>Du <span style={{ color: C.text }}>{loc.dateStart}</span>{loc.timeStart && <span style={{ color: C.info }}> à {loc.timeStart}</span>}</div>
              <div>Au <span style={{ color: C.text }}>{loc.dateEnd}</span>{loc.timeEnd && <span style={{ color: C.info }}> à {loc.timeEnd}</span>}</div>
              <div style={{ color: C.info }}>{days} jour{days > 1 ? "s" : ""}</div>
              <div style={{ marginTop: "8px", fontFamily: C.mono, fontSize: "18px", color: C.accent }}>{fmt(total)}</div>
            </div>
          )}
        </div>

        <div style={s.card()}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "13px", marginBottom: "12px" }}>Documents</div>
          <div style={{ display: "grid", gap: "7px" }}>
            {[["Liste matériel", () => printMateriel(loc)],["Devis", () => printDevis(loc)],["Contrat", () => printContrat(loc)],["Facture", () => printFacture(loc)]].map(([label, fn]) => (
              <button key={label} style={{ ...s.btn("ghost"), textAlign: "left", fontSize: "12px" }} onClick={fn}>⬡ {label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={s.card({ marginBottom: "14px" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <span style={{ fontFamily: C.display, fontWeight: "700" }}>Matériel ({(loc.items||[]).length})</span>
          <button style={s.btn("primary")} onClick={() => { setItemPicker(!itemPicker); setSvcPicker(false); }}>+ Ajouter</button>
        </div>
        {itemPicker && (
          <div style={{ background: C.card2, borderRadius: "8px", padding: "12px", marginBottom: "12px", maxHeight: "200px", overflowY: "auto" }}>
            {inventory.length === 0 && <div style={{ color: C.muted, fontSize: "13px" }}>Aucun item dans l'inventaire.</div>}
            {inventory.map(inv => (
              <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 8px", borderRadius: "6px", cursor: "pointer", marginBottom: "4px" }}
                onMouseEnter={e => e.currentTarget.style.background = C.border} onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                onClick={() => addItem(inv)}>
                <div><span style={{ fontSize: "13px" }}>{inv.name}</span><span style={{ color: C.muted, fontSize: "11px", marginLeft: "8px" }}>{inv.category}</span></div>
                <span style={{ fontFamily: C.mono, fontSize: "12px", color: C.warn }}>{fmt(parseFloat(inv.price)||0)}{inv.priceType||"/jour"}</span>
              </div>
            ))}
          </div>
        )}
        {(loc.items||[]).length === 0 && !itemPicker && <div style={{ color: C.muted, fontSize: "13px", padding: "12px 0" }}>Aucun matériel ajouté.</div>}
        {(loc.items||[]).map(it => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
            <span style={{ flex: 1, fontSize: "13px", minWidth: "120px" }}>{it.itemName}</span>
            <span style={{ color: C.muted, fontSize: "11px" }}>{it.category}</span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <label style={{ ...s.label, marginBottom: 0, fontSize: "11px" }}>Qté</label>
              <input type="number" style={{ ...s.inp(), width: "55px", padding: "4px 8px", fontSize: "12px" }} min="1" value={it.qty} onChange={e => updateItemQty(it.id, e.target.value)} />
            </div>
            {it.priceType === "/jour" && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <label style={{ ...s.label, marginBottom: 0, fontSize: "11px" }}>Jours</label>
                <input type="number" style={{ ...s.inp(), width: "55px", padding: "4px 8px", fontSize: "12px" }} min="1" value={it.days} onChange={e => updateItemDays(it.id, e.target.value)} />
              </div>
            )}
            <span style={{ fontFamily: C.mono, fontSize: "12px", color: C.warn, minWidth: "70px", textAlign: "right" }}>{fmt(itemTotal(it))}</span>
            <button style={{ ...s.btn("ghost"), padding: "3px 8px", fontSize: "11px", color: C.danger }} onClick={() => removeItem(it.id)}>✕</button>
          </div>
        ))}
        {(loc.items||[]).length > 0 && (
          <div style={{ textAlign: "right", fontFamily: C.mono, fontSize: "13px", color: C.warn, paddingTop: "8px" }}>
            Sous-total : {fmt((loc.items||[]).reduce((a,i) => a + itemTotal(i), 0))}
          </div>
        )}
      </div>

      <div style={s.card({ marginBottom: "14px" })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <span style={{ fontFamily: C.display, fontWeight: "700" }}>Services ({(loc.services||[]).length})</span>
          <button style={s.btn("primary")} onClick={() => { setSvcPicker(!svcPicker); setItemPicker(false); }}>+ Ajouter</button>
        </div>
        {svcPicker && (
          <div style={{ background: C.card2, borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
            {catalog.length > 0 && (
              <>
                <div style={{ fontSize: "11px", color: C.muted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Depuis le catalogue</div>
                <div style={{ maxHeight: "140px", overflowY: "auto", marginBottom: "12px" }}>
                  {catalog.map(cat => (
                    <div key={cat.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 8px", borderRadius: "6px", cursor: "pointer", marginBottom: "4px" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.border} onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      onClick={() => addSvcFromCatalog(cat)}>
                      <span style={{ fontSize: "13px" }}>{cat.name}</span>
                      <span style={{ fontFamily: C.mono, fontSize: "12px", color: C.info }}>
                        {cat.priceMode === "%" ? `${cat.unitPrice}%` : `${fmt(parseFloat(cat.unitPrice)||0)}${cat.unit ? ` / ${cat.unit}` : ""}`}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div style={{ fontSize: "11px", color: C.muted, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Service personnalisé</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "8px", alignItems: "end" }}>
              <div><label style={s.label}>Libellé</label><input style={s.inp()} placeholder="Ex : Transport" value={customSvc.label} onChange={e => setCustomSvc(c => ({ ...c, label: e.target.value }))} /></div>
              <div><label style={s.label}>Qté</label><input type="number" style={{ ...s.inp(), width: "60px" }} min="1" value={customSvc.qty} onChange={e => setCustomSvc(c => ({ ...c, qty: e.target.value }))} /></div>
              <div><label style={s.label}>Prix unit.</label><input type="number" style={{ ...s.inp(), width: "90px" }} placeholder="0" value={customSvc.unitPrice} onChange={e => setCustomSvc(c => ({ ...c, unitPrice: e.target.value }))} /></div>
              <div><label style={s.label}>Unité</label><input style={{ ...s.inp(), width: "70px" }} placeholder="km…" value={customSvc.unit} onChange={e => setCustomSvc(c => ({ ...c, unit: e.target.value }))} /></div>
            </div>
            <button style={{ ...s.btn("primary"), marginTop: "8px" }} onClick={addCustomSvc}>Ajouter</button>
          </div>
        )}
        {(loc.services||[]).length === 0 && !svcPicker && <div style={{ color: C.muted, fontSize: "13px", padding: "12px 0" }}>Aucun service ajouté.</div>}
        {(loc.services||[]).map(sv => (
          <div key={sv.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
            <span style={{ flex: 1, fontSize: "13px", minWidth: "120px" }}>{sv.label}</span>
            {sv.unit && <span style={{ color: C.muted, fontSize: "11px" }}>{sv.unit}</span>}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <label style={{ ...s.label, marginBottom: 0, fontSize: "11px" }}>Qté</label>
              <input type="number" style={{ ...s.inp(), width: "55px", padding: "4px 8px", fontSize: "12px" }} min="1" value={sv.qty} onChange={e => updateSvcQty(sv.id, e.target.value)} />
            </div>
            <span style={{ fontFamily: C.mono, fontSize: "12px", color: C.info, minWidth: "70px", textAlign: "right" }}>{fmt(svcTotal(sv))}</span>
            <button style={{ ...s.btn("ghost"), padding: "3px 8px", fontSize: "11px", color: C.danger }} onClick={() => removeService(sv.id)}>✕</button>
          </div>
        ))}
        {(loc.services||[]).length > 0 && (
          <div style={{ textAlign: "right", fontFamily: C.mono, fontSize: "13px", color: C.info, paddingTop: "8px" }}>
            Sous-total : {fmt((loc.services||[]).reduce((a,s) => a + svcTotal(s), 0))}
          </div>
        )}
      </div>

      {/* ── Transport ── */}
      {(() => {
        const tr = loc.transport || {};
        const updTr = (patch) => updLoc({ transport: { ...tr, ...patch } });
        const extraLines = tr.extraLines || [];
        const km = parseFloat(tr.distanceKm)||0, conso = parseFloat(tr.fuelConso)||0, prixL = parseFloat(tr.fuelPrice)||0;
        const fuelCost = km > 0 && conso > 0 && prixL > 0 ? Math.round(km*conso/100*prixL*100)/100 : 0;
        const tolls = parseFloat(tr.tolls)||0;
        const rkm = parseFloat(tr.retourDistanceKm)||0, rconso = parseFloat(tr.retourFuelConso)||0, rprixL = parseFloat(tr.retourFuelPrice)||0;
        const retourFuelCost = rkm > 0 && rconso > 0 && rprixL > 0 ? Math.round(rkm*rconso/100*rprixL*100)/100 : 0;
        const retourTolls = parseFloat(tr.retourTolls)||0;
        const extraTotal = extraLines.reduce((a,l) => a+(parseFloat(l.amount)||0), 0);
        const vr = tr.vehicleRental || {};
        const rentalCost = (vr.enabled && parseFloat(vr.pricePerDay) > 0 && parseFloat(vr.days) > 0)
          ? Math.round(parseFloat(vr.pricePerDay) * parseFloat(vr.days) * 100) / 100 : 0;
        const trTotal = fuelCost + tolls + retourFuelCost + retourTolls + extraTotal + rentalCost;
        const VR_TYPES_LOC = ["Voiture", "Camionnette", "Camion", "Utilitaire", "Van", "Minibus", "Autre"];
        return (
          <div style={s.card({ marginBottom: "14px" })}>
            <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Transport</div>

            {/* Aller */}
            <div style={{ fontSize: "11px", color: C.accent, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>Aller</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginBottom: "10px" }}>
              <div><label style={s.label}>Distance (km)</label><input type="number" min="0" style={s.inp()} value={tr.distanceKm||""} onChange={e => updTr({ distanceKm: e.target.value })} placeholder="0" /></div>
              <div><label style={s.label}>Conso (L/100 km)</label><input type="number" min="0" step="0.1" style={s.inp()} value={tr.fuelConso||""} onChange={e => updTr({ fuelConso: e.target.value })} placeholder="7.5" /></div>
              <div><label style={s.label}>Prix carburant (€/L)</label><input type="number" min="0" step="0.01" style={s.inp()} value={tr.fuelPrice||""} onChange={e => updTr({ fuelPrice: e.target.value })} placeholder="1.85" /></div>
              <div><label style={s.label}>Péages (€)</label><input type="number" min="0" step="0.01" style={s.inp()} value={tr.tolls||""} onChange={e => updTr({ tolls: e.target.value })} placeholder="0" /></div>
            </div>
            {fuelCost > 0 && <div style={{ fontSize: "12px", color: C.info, marginBottom: "10px" }}>Aller — carburant : {fuelCost.toFixed(2)} €</div>}

            {/* Retour */}
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: "10px", paddingTop: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                <div style={{ fontSize: "11px", color: "#a78bfa", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px" }}>Retour</div>
                <button style={s.btn("ghost", { fontSize: "11px", padding: "3px 10px" })} onClick={() => updTr({ retourDistanceKm: tr.distanceKm||"", retourFuelConso: tr.fuelConso||"", retourFuelPrice: tr.fuelPrice||"", retourTolls: tr.tolls||"" })}>Copier depuis l'aller</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px", marginBottom: "10px" }}>
                <div><label style={s.label}>Distance (km)</label><input type="number" min="0" style={s.inp()} value={tr.retourDistanceKm||""} onChange={e => updTr({ retourDistanceKm: e.target.value })} placeholder="0" /></div>
                <div><label style={s.label}>Conso (L/100 km)</label><input type="number" min="0" step="0.1" style={s.inp()} value={tr.retourFuelConso||""} onChange={e => updTr({ retourFuelConso: e.target.value })} placeholder="7.5" /></div>
                <div><label style={s.label}>Prix carburant (€/L)</label><input type="number" min="0" step="0.01" style={s.inp()} value={tr.retourFuelPrice||""} onChange={e => updTr({ retourFuelPrice: e.target.value })} placeholder="1.85" /></div>
                <div><label style={s.label}>Péages (€)</label><input type="number" min="0" step="0.01" style={s.inp()} value={tr.retourTolls||""} onChange={e => updTr({ retourTolls: e.target.value })} placeholder="0" /></div>
              </div>
              {retourFuelCost > 0 && <div style={{ fontSize: "12px", color: C.info, marginBottom: "10px" }}>Retour — carburant : {retourFuelCost.toFixed(2)} €</div>}
            </div>

            {/* Location de véhicule */}
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: "10px", paddingTop: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: vr.enabled ? "12px" : "0" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none" }}>
                  <input type="checkbox" checked={!!vr.enabled} onChange={e => updTr({ vehicleRental: { ...vr, enabled: e.target.checked } })} style={{ accentColor: C.accent, width: "15px", height: "15px" }} />
                  <span style={{ fontSize: "13px", fontWeight: "600" }}>Véhicule loué</span>
                </label>
                {rentalCost > 0 && <span style={{ fontFamily: C.mono, fontSize: "13px", color: "#a78bfa" }}>{rentalCost.toFixed(2)} €</span>}
              </div>
              {vr.enabled && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
                  <div>
                    <label style={s.label}>Type de véhicule</label>
                    <select style={s.inp()} value={vr.type||"Camionnette"} onChange={e => updTr({ vehicleRental: { ...vr, type: e.target.value } })}>
                      {VR_TYPES_LOC.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={s.label}>Désignation (optionnel)</label>
                    <input style={s.inp()} value={vr.label||""} onChange={e => updTr({ vehicleRental: { ...vr, label: e.target.value } })} placeholder="Ex : Renault Trafic" />
                  </div>
                  <div>
                    <label style={s.label}>Durée (jours)</label>
                    <input type="number" min="1" step="0.5" style={s.inp()} value={vr.days||""} onChange={e => updTr({ vehicleRental: { ...vr, days: e.target.value } })} placeholder="1" />
                  </div>
                  <div>
                    <label style={s.label}>Prix / jour (€)</label>
                    <input type="number" min="0" step="0.01" style={s.inp()} value={vr.pricePerDay||""} onChange={e => updTr({ vehicleRental: { ...vr, pricePerDay: e.target.value } })} placeholder="0" />
                  </div>
                </div>
              )}
            </div>

            {/* Lignes supplémentaires */}
            {extraLines.length > 0 && (
              <div style={{ marginTop: "10px" }}>
                {extraLines.map((l) => (
                  <div key={l.id} style={{ display: "flex", gap: "8px", marginBottom: "6px", alignItems: "center" }}>
                    <input style={{ ...s.inp(), flex: 2 }} value={l.label||""} onChange={e => updTr({ extraLines: extraLines.map(ll => ll.id===l.id ? {...ll, label: e.target.value} : ll) })} placeholder="Désignation" />
                    <input type="number" style={{ ...s.inp(), flex: 1 }} value={l.amount||""} onChange={e => updTr({ extraLines: extraLines.map(ll => ll.id===l.id ? {...ll, amount: e.target.value} : ll) })} placeholder="Montant €" />
                    <button style={s.btn("danger", { padding: "7px 10px" })} onClick={() => updTr({ extraLines: extraLines.filter(ll => ll.id !== l.id) })}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <button style={s.btn("ghost", { fontSize: "12px", marginTop: "10px" })} onClick={() => updTr({ extraLines: [...extraLines, { id: uid(), label: "", amount: "" }] })}>+ Ligne supplémentaire</button>

            {/* Total transport */}
            {trTotal > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: "12px", paddingTop: "12px" }}>
                {(fuelCost + tolls) > 0 && (retourFuelCost + retourTolls) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: C.muted, marginBottom: "4px" }}>
                    <span>Aller</span><span style={{ fontFamily: C.mono }}>{(fuelCost + tolls).toFixed(2)} €</span>
                  </div>
                )}
                {(retourFuelCost + retourTolls) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: C.muted, marginBottom: "4px" }}>
                    <span>Retour</span><span style={{ fontFamily: C.mono }}>{(retourFuelCost + retourTolls).toFixed(2)} €</span>
                  </div>
                )}
                {rentalCost > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: C.muted, marginBottom: "4px" }}>
                    <span>Location {vr.type||"véhicule"}{vr.label ? ` — ${vr.label}` : ""}</span><span style={{ fontFamily: C.mono }}>{rentalCost.toFixed(2)} €</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
                  <span style={{ color: C.muted, fontSize: "13px" }}>Sous-total transport</span>
                  <span style={{ fontFamily: C.mono, fontSize: "16px", fontWeight: "700", color: "#a78bfa" }}>{fmt(trTotal)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <div style={s.card({ marginBottom: "14px" })}>
        <label style={s.label}>Notes</label>
        <textarea style={{ ...s.inp(), resize: "vertical", height: "70px" }} value={loc.notes||""} onChange={e => updLoc({ notes: e.target.value })} placeholder="Notes internes…" />
      </div>

      <div style={s.card({ background: C.card2 })}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: loc.customPrice != null ? "10px" : "0" }}>
          <div>
            <span style={{ color: C.muted, fontSize: "13px" }}>Total location</span>
            {loc.customPrice != null && <span style={{ fontSize: "11px", color: C.warn, marginLeft: "8px" }}>· Prix libre (calculé : {fmt(calcTotal)})</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontFamily: C.mono, fontSize: "22px", fontWeight: "700", color: C.accent }}>{fmt(total)}</span>
            <button style={{ ...s.btn("ghost"), fontSize: "11px", padding: "3px 9px", color: loc.customPrice != null ? C.warn : C.muted }}
              onClick={() => updLoc({ customPrice: loc.customPrice != null ? null : calcTotal })}>
              {loc.customPrice != null ? "✕ Retirer prix libre" : "Prix libre"}
            </button>
          </div>
        </div>
        {loc.customPrice != null && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label style={{ ...s.label, marginBottom: 0, whiteSpace: "nowrap" }}>Prix libre (€)</label>
            <input type="number" style={{ ...s.inp(), maxWidth: "180px", fontFamily: C.mono, fontSize: "16px" }} min="0" step="0.01"
              value={loc.customPrice} onChange={e => updLoc({ customPrice: parseFloat(e.target.value) || 0 })} />
          </div>
        )}
      </div>

      <div style={{ marginTop: "18px", textAlign: "right" }}>
        <button style={s.btn("danger")} onClick={() => { if (confirm(`Supprimer la location ${loc.number} ?`)) onDelete(); }}>Supprimer cette location</button>
      </div>
    </div>
  );
}

function LocationPage({ data, update }) {
  const [view, setView] = useState("list");
  const [detailId, setDetailId] = useState(null);
  const EMPTY_LOC = { label: "", statut: "Devis", dateStart: today(), dateEnd: today(), timeStart: "", timeEnd: "", client: { name: "", address: "", email: "", phone: "" }, items: [], services: [], notes: "" };
  const [form, setForm] = useState(EMPTY_LOC);
  const [creating, setCreating] = useState(false);

  const locations = data.locations || [];
  const inventory = (data.inventory || []).filter(i => i.status !== "hs");
  const catalog = data.catalog || [];
  const assoc = data.assoc || {};

  const calcDays = (start, end) => Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1);
  const itemTotal = (it) => it.priceType === "/jour" ? it.unitPrice * it.qty * it.days : it.unitPrice * it.qty;
  const svcTotal = (sv) => sv.qty * sv.unitPrice;
  const locTotal = (loc) => (loc.items||[]).reduce((a,i) => a + itemTotal(i), 0) + (loc.services||[]).reduce((a,s) => a + svcTotal(s), 0) + calcTransportCost(loc.transport);

  const createLoc = () => {
    if (!form.label.trim()) return;
    const num = `LOC-${Date.now().toString().slice(-6)}`;
    const newLoc = { id: uid(), number: num, ...form, createdAt: today() };
    update({ locations: [...locations, newLoc] }, { action: "AJOUT", target: "Locations", details: `${num} – ${form.label}` });
    setForm(EMPTY_LOC);
    setCreating(false);
    setDetailId(newLoc.id);
    setView("detail");
  };

  // ─── PRINT FUNCTIONS ───
  const printStyle = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;padding:48px;font-size:13px;color:#1a1a1a}
.top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}.title{font-size:26px;font-weight:800;letter-spacing:-1px}
.cli{background:#f5f5f5;border-radius:8px;padding:16px;margin-bottom:24px}
table{width:100%;border-collapse:collapse;margin-bottom:24px}
th{padding:9px 10px;background:#111;color:#fff;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
td{padding:10px;border-bottom:1px solid #f0f0f0}.amt{text-align:right;font-family:monospace}
.tf td{font-weight:700;border-top:2px solid #111;border-bottom:none}
.tot-box{margin-left:auto;width:260px;margin-bottom:24px}
.tr{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee}
.grand{font-size:15px;font-weight:700;border-top:2px solid #111;border-bottom:none}
footer{border-top:1px solid #eee;padding-top:12px;color:#aaa;font-size:11px;margin-top:40px}
@media print{body{padding:24px}}`;

  const headerHTML = (loc) => `<div class="top">
  <div>${assoc.logo?`<img src="${assoc.logo}" style="height:50px;display:block;margin-bottom:8px">`:""}
    <strong style="font-size:15px">${assoc.name||"Association"}</strong><br>
    <span style="color:#888;font-size:12px">${assoc.address||""}</span>
    ${assoc.email?`<br><span style="color:#888;font-size:12px">${assoc.email}</span>`:""}
    ${assoc.siret?`<br><span style="color:#888;font-size:12px">SIRET : ${assoc.siret}</span>`:""}
  </div>
  <div style="text-align:right">
    <div class="title">%DOCTITLE%</div>
    <div style="color:#888;font-size:12px">N° ${loc.number}</div>
    <div style="color:#888;font-size:12px">Du ${loc.dateStart}${loc.timeStart?` à ${loc.timeStart}`:""} au ${loc.dateEnd}${loc.timeEnd?` à ${loc.timeEnd}`:""}</div>
  </div>
</div>
<div class="cli">
  <div style="font-size:10px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Client</div>
  <strong>${loc.client?.name||"—"}</strong><br>
  ${loc.client?.address?`<span style="white-space:pre-line;color:#666;font-size:12px">${loc.client.address}</span><br>`:""}
  ${loc.client?.email?`<span style="color:#888;font-size:12px">${loc.client.email}</span><br>`:""}
  ${loc.client?.phone?`<span style="color:#888;font-size:12px">Tél : ${loc.client.phone}</span>`:""}
</div>`;

  const printMateriel = (loc) => {
    const days = calcDays(loc.dateStart, loc.dateEnd);
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Liste matériel ${loc.number}</title>
<style>${printStyle}.check{width:22px;text-align:center;font-size:15px}</style></head><body>
${headerHTML(loc).replace("%DOCTITLE%","LISTE MATÉRIEL")}
<p style="font-size:12px;color:#666;margin-bottom:16px">Location du ${loc.dateStart}${loc.timeStart?` à ${loc.timeStart}`:""} au ${loc.dateEnd}${loc.timeEnd?` à ${loc.timeEnd}`:""} · ${days} jour${days>1?"s":""}</p>
<table><thead><tr><th>Référence</th><th style="text-align:center">Qté</th><th>Cat.</th><th class="check">Départ</th><th class="check">Retour</th></tr></thead><tbody>
${(loc.items||[]).map(i=>`<tr><td>${i.itemName}</td><td style="text-align:center">${i.qty}</td><td style="color:#888">${i.category||"—"}</td><td class="check">☐</td><td class="check">☐</td></tr>`).join("")}
</tbody></table>
${(loc.services||[]).length>0?`<h3 style="margin-bottom:10px;font-size:13px;color:#555">Services inclus</h3>
<table><thead><tr><th>Service</th><th style="text-align:center">Qté</th></tr></thead><tbody>
${(loc.services||[]).map(s=>`<tr><td>${s.label}</td><td style="text-align:center">${s.qty}</td></tr>`).join("")}
</tbody></table>`:""}
<footer>${assoc.name||"Association"} · Généré le ${new Date().toLocaleDateString("fr-FR")}</footer>
</body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); w.onload = () => w.print();
  };

  const printDevis = (loc) => {
    const days = calcDays(loc.dateStart, loc.dateEnd);
    const total = locTotal(loc);
    const trCost = calcTransportCost(loc.transport);
    const tr = loc.transport || {};
    const allerKm = parseFloat(tr.distanceKm)||0, allerConso = parseFloat(tr.fuelConso)||0, allerPrix = parseFloat(tr.fuelPrice)||0;
    const allerFuel = allerKm > 0 && allerConso > 0 && allerPrix > 0 ? Math.round(allerKm*allerConso/100*allerPrix*100)/100 : 0;
    const allerTotal = allerFuel + (parseFloat(tr.tolls)||0);
    const retourKm = parseFloat(tr.retourDistanceKm)||0, retourConso = parseFloat(tr.retourFuelConso)||0, retourPrix = parseFloat(tr.retourFuelPrice)||0;
    const retourFuel = retourKm > 0 && retourConso > 0 && retourPrix > 0 ? Math.round(retourKm*retourConso/100*retourPrix*100)/100 : 0;
    const retourTotal = retourFuel + (parseFloat(tr.retourTolls)||0);
    const vrd = tr.vehicleRental || {};
    const rentalCostD = (vrd.enabled && parseFloat(vrd.pricePerDay) > 0 && parseFloat(vrd.days) > 0)
      ? Math.round(parseFloat(vrd.pricePerDay)*parseFloat(vrd.days)*100)/100 : 0;
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Devis ${loc.number}</title>
<style>${printStyle}</style></head><body>
${headerHTML(loc).replace("%DOCTITLE%","DEVIS")}
${(loc.items||[]).length>0?`<table><thead><tr><th>Matériel</th><th style="text-align:center">Qté</th><th style="text-align:center">Jours</th><th class="amt">PU/jour</th><th class="amt">Total HT</th></tr></thead><tbody>
${(loc.items||[]).map(i=>`<tr><td>${i.itemName}</td><td style="text-align:center">${i.qty}</td><td style="text-align:center">${i.priceType==="/jour"?i.days:"—"}</td><td class="amt">${fmt(i.unitPrice)}</td><td class="amt">${fmt(itemTotal(i))}</td></tr>`).join("")}
<tr class="tf"><td colspan="4">Sous-total matériel</td><td class="amt">${fmt((loc.items||[]).reduce((a,i)=>a+itemTotal(i),0))}</td></tr>
</tbody></table>`:""}
${(loc.services||[]).length>0?`<table><thead><tr><th>Service</th><th>Unité</th><th style="text-align:center">Qté</th><th class="amt">PU HT</th><th class="amt">Total HT</th></tr></thead><tbody>
${(loc.services||[]).map(s=>`<tr><td>${s.label}</td><td style="color:#888">${s.unit||"—"}</td><td style="text-align:center">${s.qty}</td><td class="amt">${fmt(s.unitPrice)}</td><td class="amt">${fmt(svcTotal(s))}</td></tr>`).join("")}
<tr class="tf"><td colspan="4">Sous-total services</td><td class="amt">${fmt((loc.services||[]).reduce((a,s)=>a+svcTotal(s),0))}</td></tr>
</tbody></table>`:""}
${trCost>0?`<table><thead><tr><th>Transport</th><th class="amt">Total HT</th></tr></thead><tbody>
${allerTotal>0?`<tr><td>Transport aller${allerKm>0?` — ${allerKm} km`:""}</td><td class="amt">${fmt(allerTotal)}</td></tr>`:""}
${retourTotal>0?`<tr><td>Transport retour${retourKm>0?` — ${retourKm} km`:""}</td><td class="amt">${fmt(retourTotal)}</td></tr>`:""}
${rentalCostD>0?`<tr><td>Location ${vrd.type||"véhicule"}${vrd.label?` — ${vrd.label}`:""}${vrd.days?` (${vrd.days}j × ${fmt(parseFloat(vrd.pricePerDay)||0)}/j)`:""}</td><td class="amt">${fmt(rentalCostD)}</td></tr>`:""}
${(tr.extraLines||[]).filter(l=>parseFloat(l.amount)>0).map(l=>`<tr><td>${l.label||"Frais transport"}</td><td class="amt">${fmt(parseFloat(l.amount)||0)}</td></tr>`).join("")}
<tr class="tf"><td>Sous-total transport</td><td class="amt">${fmt(trCost)}</td></tr>
</tbody></table>`:""}
<div class="tot-box">
  <div class="tr"><span>Total HT</span><span>${fmt(total)}</span></div>
  <div class="tr"><span>TVA (0%)</span><span>${fmt(0)}</span></div>
  <div class="tr grand"><span>TOTAL TTC</span><span>${fmt(total)}</span></div>
</div>
${loc.notes?`<div style="padding:12px;background:#f8f8f8;border-radius:8px;font-size:12px;color:#555;margin-bottom:24px"><strong>Notes :</strong> ${loc.notes}</div>`:""}
<p style="font-size:11px;color:#999">Devis valable 30 jours à compter de la date d'émission. Le présent devis est soumis à acceptation écrite du client.</p>
<footer>${assoc.iban?`IBAN : ${assoc.iban}<br>`:""}${assoc.name||"Association"} · Généré le ${new Date().toLocaleDateString("fr-FR")}</footer>
</body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); w.onload = () => w.print();
  };

  const printContrat = (loc) => {
    const days = calcDays(loc.dateStart, loc.dateEnd);
    const effectiveTotal = loc.customPrice != null ? loc.customPrice : locTotal(loc);
    const today_str = new Date().toLocaleDateString("fr-FR");
    const hasSvc = (loc.services||[]).length > 0;
    let art = 1;
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Contrat de location ${loc.number}</title>
<style>${printStyle}
body{font-size:12.5px}
.contrat-title{font-size:20px;font-weight:800;letter-spacing:-0.5px}
.art{margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #eee}
.art:last-of-type{border-bottom:none}
.art-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#555;margin-bottom:6px}
p{margin-bottom:8px;line-height:1.6}ul{padding-left:20px;margin-bottom:8px}li{margin-bottom:4px;line-height:1.5}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
.party{background:#f7f7f7;border-radius:8px;padding:12px}.party-label{font-size:10px;text-transform:uppercase;color:#999;letter-spacing:.5px;margin-bottom:5px}
.sig-block{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:40px}
.sig-col{border-top:1px solid #ccc;padding-top:12px}.sig-line{border-top:1px solid #999;margin-top:48px}
footer{border-top:1px solid #eee;padding-top:12px;color:#aaa;font-size:11px;margin-top:32px;display:flex;justify-content:space-between}
@media print{body{padding:24px}}</style></head><body>

<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
  <div>${assoc.logo?`<img src="${assoc.logo}" style="height:45px;display:block;margin-bottom:8px">`:""}
    <strong style="font-size:15px">${assoc.name||"Association"}</strong><br>
    <span style="color:#888;font-size:12px">${assoc.address||""}</span>
    ${assoc.email?`<br><span style="color:#888;font-size:12px">${assoc.email}</span>`:""}
    ${assoc.siret?`<br><span style="color:#888;font-size:12px">SIRET : ${assoc.siret}</span>`:""}
  </div>
  <div style="text-align:right">
    <div class="contrat-title">CONTRAT DE LOCATION DE MATÉRIEL</div>
    <div style="color:#888;font-size:12px;margin-top:4px">Réf. ${loc.number}<br>Établi le ${today_str}</div>
  </div>
</div>

<div class="parties">
  <div class="party">
    <div class="party-label">Le Loueur</div>
    <strong>${assoc.name||"Association"}</strong><br>
    ${assoc.address?`<span style="color:#666;font-size:12px">${assoc.address}</span><br>`:""}
    ${assoc.email?`<span style="color:#888;font-size:12px">${assoc.email}</span><br>`:""}
    <em style="color:#aaa;font-size:11px">Association loi 1901</em>
  </div>
  <div class="party">
    <div class="party-label">Le Locataire</div>
    <strong>${loc.client?.name||"—"}</strong><br>
    ${loc.client?.address?`<span style="color:#666;font-size:12px;white-space:pre-line">${loc.client.address}</span><br>`:""}
    ${loc.client?.email?`<span style="color:#888;font-size:12px">${loc.client.email}</span><br>`:""}
    ${loc.client?.phone?`<span style="color:#888;font-size:12px">Tél : ${loc.client.phone}</span>`:""}
  </div>
</div>
<p style="text-align:center;color:#888;font-size:12px;margin-bottom:24px">Ci-après désignés individuellement « la Partie » et collectivement « les Parties »</p>

<div class="art">
  <div class="art-title">Article 1 – Objet du contrat</div>
  <p>${assoc.name||"L'association"} (ci-après « le Loueur ») met à disposition de ${loc.client?.name||"le Client"} (ci-après « le Locataire ») le matériel listé à l'article 2, pour un usage strictement privatif et non commercial, pour la période du <strong>${loc.dateStart}${loc.timeStart?` à ${loc.timeStart}`:""}</strong> au <strong>${loc.dateEnd}${loc.timeEnd?` à ${loc.timeEnd}`:""}</strong> (${days} jour${days>1?"s":""}). Toute sous-location ou mise à disposition à un tiers est formellement interdite.</p>
</div>

<div class="art">
  <div class="art-title">Article 2 – Matériel loué</div>
  <table><thead><tr><th>Désignation</th><th style="text-align:center">Quantité</th></tr></thead><tbody>
  ${(loc.items||[]).map(i=>`<tr><td>${i.itemName}</td><td style="text-align:center">${i.qty}</td></tr>`).join("")}
  </tbody></table>
  <p style="font-size:11px;color:#888">Un état des lieux contradictoire sera réalisé au départ et au retour du matériel. Tout matériel non mentionné est exclu du présent contrat. Le Loueur se réserve le droit de substituer un équipement par un matériel aux caractéristiques équivalentes ou supérieures.</p>
</div>

${hasSvc?`<div class="art">
  <div class="art-title">Article 3 – Services inclus</div>
  <ul>${(loc.services||[]).map(s=>`<li>${s.label}${s.qty>1?` (×${s.qty})`:""}${s.unit?` — ${s.unit}`:""}</li>`).join("")}</ul>
</div>`:""}

<div class="art">
  <div class="art-title">Article ${hasSvc?4:3} – Conditions financières</div>
  <p>Le montant total de la location s'élève à <strong>${fmt(effectiveTotal)} TTC</strong> (TVA non applicable – art. 293B CGI).</p>
  <p>Un acompte de <strong>30 %</strong> (soit ${fmt(effectiveTotal*0.3)}) est exigible à la signature du présent contrat. Le solde de <strong>${fmt(effectiveTotal*0.7)}</strong> est dû au plus tard le jour de la prise en charge du matériel. Tout retard de paiement entraîne de plein droit des pénalités au taux légal majoré de 5 points et une indemnité forfaitaire de 40 € pour frais de recouvrement.</p>
  ${assoc.iban?`<p>Règlement par virement bancaire (IBAN : ${assoc.iban}), chèque ou espèces.</p>`:""}
</div>

<div class="art">
  <div class="art-title">Article ${hasSvc?5:4} – Obligations du Loueur</div>
  <p>Le Loueur s'engage à :</p>
  <ul>
    <li>Mettre à disposition le matériel listé en bon état de fonctionnement, conforme aux normes de sécurité en vigueur (NF, CE) ;</li>
    <li>Assurer la disponibilité d'un interlocuteur technique joignable pendant toute la durée de la location ;</li>
    <li>Intervenir dans les meilleurs délais en cas de panne ou de défaillance du matériel imputable au Loueur ;</li>
    <li>Remplacer tout matériel défaillant par un équipement de caractéristiques équivalentes si le stock le permet.</li>
  </ul>
</div>

<div class="art">
  <div class="art-title">Article ${hasSvc?6:5} – Obligations du Locataire</div>
  <p>Le Locataire s'engage à :</p>
  <ul>
    <li>Utiliser le matériel avec soin, dans le cadre de l'usage prévu et selon les instructions du Loueur ;</li>
    <li>Ne pas modifier, réparer, démonter ou sous-louer le matériel sans autorisation écrite préalable ;</li>
    <li>Conserver le matériel à l'abri des intempéries, des chocs, de l'humidité et de tout environnement susceptible de l'endommager ;</li>
    <li>Signaler immédiatement au Loueur tout incident, panne ou détérioration constaté(e) ;</li>
    <li>Restituer le matériel complet, propre et en bon état, dans les délais convenus.</li>
  </ul>
</div>

<div class="art">
  <div class="art-title">Article ${hasSvc?7:6} – Droit de retrait et refus de location</div>
  <p>Le Loueur se réserve le droit de <strong>refuser la remise du matériel, de suspendre ou d'interrompre immédiatement</strong> la location sans indemnité, dans les cas suivants :</p>
  <ul>
    <li><strong>Comportement dangereux :</strong> toute attitude violente, menaçante ou abusive à l'encontre du personnel du Loueur entraîne l'interruption immédiate et la facturation de l'intégralité du montant ;</li>
    <li><strong>Conditions impropres :</strong> environnement susceptible d'endommager le matériel (intempéries, humidité excessive, présence de substances corrosives, locaux non sécurisés) ;</li>
    <li><strong>Non-paiement :</strong> absence de règlement de l'acompte ou du solde aux échéances convenues ;</li>
    <li><strong>Usage non conforme :</strong> utilisation du matériel à des fins différentes de celles prévues au contrat, ou par des personnes non habilitées ;</li>
    <li>Toute situation dans laquelle la sécurité du personnel du Loueur ou l'intégrité du matériel ne peut être garantie.</li>
  </ul>
  <p>En cas d'interruption imputable au Locataire, l'intégralité du montant contractuel demeure due. L'acompte versé est définitivement acquis à titre d'indemnité.</p>
</div>

<div class="art">
  <div class="art-title">Article ${hasSvc?8:7} – Dégradations et responsabilité du matériel</div>
  <p>Le Locataire est responsable du matériel dès sa prise en charge et jusqu'à sa restitution effective. Les dégradations constatées sont classifiées et facturées comme suit, selon la grille tarifaire officielle de ${assoc.name||"l'Association"} en vigueur à la date du sinistre :</p>
  <ul>
    <li style="margin-bottom:6px"><strong>Dégradation mineure</strong> (rayures superficielles, salissures, usure anormale, vis ou accessoires manquants) : facturation du coût réel de remise en état, minimum 30 € ;</li>
    <li style="margin-bottom:6px"><strong>Dégradation moyenne</strong> (choc causant un dysfonctionnement partiel, remplacement d'un composant, dommage esthétique significatif) : facturation du coût de réparation ou de remplacement de la pièce selon la grille tarifaire ;</li>
    <li><strong>Dégradation majeure</strong> (destruction totale ou partielle, dommage irréparable, perte ou vol) : facturation de la valeur de remplacement à neuf de l'équipement selon la grille tarifaire officielle.</li>
  </ul>
  <p>En l'absence de réserves formulées par écrit lors de la restitution, le matériel est réputé restitué en bon état, et toute dégradation ultérieurement constatée sera imputée au Locataire. Il est recommandé au Locataire de s'assurer que sa responsabilité civile couvre les dommages aux biens loués.</p>
</div>

<div class="art">
  <div class="art-title">Article ${hasSvc?9:8} – Restitution et retard</div>
  <p>Le matériel devra être restitué <strong>au plus tard le ${loc.dateEnd}${loc.timeEnd?` à ${loc.timeEnd}`:""}</strong>, à l'adresse convenue, en bon état et complet. Tout retard de restitution, sauf cas de force majeure notifié par écrit, sera facturé au tarif journalier en vigueur par jour ou fraction de jour de retard, sans mise en demeure préalable. Au-delà de 48 heures de retard non justifié, le Loueur se réserve le droit de procéder à la récupération forcée du matériel aux frais exclusifs du Locataire.</p>
</div>

<div class="art">
  <div class="art-title">Article ${hasSvc?10:9} – Annulation</div>
  <p>Toute annulation doit être notifiée par écrit (courriel avec accusé de réception ou lettre recommandée AR). Les conditions suivantes s'appliquent :</p>
  <ul>
    <li>Annulation plus de 30 jours avant la prise en charge : remboursement de l'acompte sous déduction des frais engagés ;</li>
    <li>Annulation entre 15 et 30 jours : retenue de 50 % du montant total ;</li>
    <li>Annulation entre 8 et 14 jours : retenue de 75 % du montant total ;</li>
    <li>Annulation moins de 8 jours ou le jour même : facturation de la totalité du montant.</li>
  </ul>
</div>

<div class="art">
  <div class="art-title">Article ${hasSvc?11:10} – Force majeure</div>
  <p>Aucune des Parties ne pourra être tenue responsable d'un manquement résultant d'un cas de force majeure au sens de l'article 1218 du Code civil. La Partie empêchée devra notifier l'autre dans les 48 heures. Si la force majeure persiste au-delà de 15 jours, chaque Partie pourra résoudre le contrat sans indemnité, sous réserve du remboursement des sommes versées déduction faite des frais justifiés.</p>
</div>

<div class="art">
  <div class="art-title">Article ${hasSvc?12:11} – Protection des données personnelles</div>
  <p>Les données personnelles collectées sont traitées par ${assoc.name||"l'Association"} pour la seule gestion de la relation contractuelle, conformément au RGPD (Règlement UE 2016/679). Elles ne sont ni cédées ni revendues. Droit d'accès, rectification et suppression : ${assoc.email||"contacter l'Association"}.</p>
</div>

<div class="art">
  <div class="art-title">Article ${hasSvc?13:12} – Loi applicable et litiges</div>
  <p>Le présent contrat est soumis au droit français. En cas de litige, les Parties recherchent une solution amiable dans un délai de 30 jours. À défaut, compétence exclusive est attribuée aux juridictions du ressort du siège du Loueur.</p>
</div>

${loc.notes?`<div class="art"><div class="art-title">Notes complémentaires</div><p>${loc.notes}</p></div>`:""}

<div class="sig-block">
  <div class="sig-col">
    <div><strong>Pour le Loueur</strong><br><span style="color:#888;font-size:12px">${assoc.name||"Association"}<br>Nom, qualité et signature</span></div>
    <div style="margin-top:8px;color:#aaa;font-size:11px">Précédé de la mention « Lu et approuvé »</div>
    <div class="sig-line"></div>
    <div style="margin-top:6px;color:#888;font-size:11px">Fait à ________________, le ${today_str}</div>
  </div>
  <div class="sig-col">
    <div><strong>Pour le Locataire</strong><br><span style="color:#888;font-size:12px">${loc.client?.name||"Le Locataire"}<br>Nom, qualité et signature</span></div>
    <div style="margin-top:8px;color:#aaa;font-size:11px">Précédé de la mention « Lu et approuvé »</div>
    <div class="sig-line"></div>
    <div style="margin-top:6px;color:#888;font-size:11px">Fait à ________________, le</div>
  </div>
</div>
<p style="text-align:center;font-size:11px;color:#aaa;margin-top:16px">Contrat établi en deux (2) exemplaires originaux, dont un remis à chaque Partie.</p>

<footer><span>${assoc.name||"Association"}${assoc.siret?" — SIRET "+assoc.siret:""}</span><span>Document généré le ${today_str}</span></footer>
</body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); w.onload = () => w.print();
  };

  const printFacture = (loc) => {
    const total = locTotal(loc);
    const num = `FAC-${loc.number}`;
    const trCost = calcTransportCost(loc.transport);
    const tr = loc.transport || {};
    const allerKm = parseFloat(tr.distanceKm)||0, allerConso = parseFloat(tr.fuelConso)||0, allerPrix = parseFloat(tr.fuelPrice)||0;
    const allerFuel = allerKm > 0 && allerConso > 0 && allerPrix > 0 ? Math.round(allerKm*allerConso/100*allerPrix*100)/100 : 0;
    const allerTotal = allerFuel + (parseFloat(tr.tolls)||0);
    const retourKm = parseFloat(tr.retourDistanceKm)||0, retourConso = parseFloat(tr.retourFuelConso)||0, retourPrix = parseFloat(tr.retourFuelPrice)||0;
    const retourFuel = retourKm > 0 && retourConso > 0 && retourPrix > 0 ? Math.round(retourKm*retourConso/100*retourPrix*100)/100 : 0;
    const retourTotal = retourFuel + (parseFloat(tr.retourTolls)||0);
    const vrf = tr.vehicleRental || {};
    const rentalCostF = (vrf.enabled && parseFloat(vrf.pricePerDay) > 0 && parseFloat(vrf.days) > 0)
      ? Math.round(parseFloat(vrf.pricePerDay)*parseFloat(vrf.days)*100)/100 : 0;
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Facture ${num}</title>
<style>${printStyle}</style></head><body>
${headerHTML(loc).replace("%DOCTITLE%","FACTURE")}
${(loc.items||[]).length>0?`<table><thead><tr><th>Matériel</th><th style="text-align:center">Qté</th><th style="text-align:center">Jours</th><th class="amt">PU HT</th><th class="amt">Total HT</th></tr></thead><tbody>
${(loc.items||[]).map(i=>`<tr><td>${i.itemName}</td><td style="text-align:center">${i.qty}</td><td style="text-align:center">${i.priceType==="/jour"?i.days:"—"}</td><td class="amt">${fmt(i.unitPrice)}</td><td class="amt">${fmt(itemTotal(i))}</td></tr>`).join("")}
<tr class="tf"><td colspan="4">Sous-total matériel</td><td class="amt">${fmt((loc.items||[]).reduce((a,i)=>a+itemTotal(i),0))}</td></tr>
</tbody></table>`:""}
${(loc.services||[]).length>0?`<table><thead><tr><th>Service</th><th>Unité</th><th style="text-align:center">Qté</th><th class="amt">PU HT</th><th class="amt">Total HT</th></tr></thead><tbody>
${(loc.services||[]).map(s=>`<tr><td>${s.label}</td><td style="color:#888">${s.unit||"—"}</td><td style="text-align:center">${s.qty}</td><td class="amt">${fmt(s.unitPrice)}</td><td class="amt">${fmt(svcTotal(s))}</td></tr>`).join("")}
<tr class="tf"><td colspan="4">Sous-total services</td><td class="amt">${fmt((loc.services||[]).reduce((a,s)=>a+svcTotal(s),0))}</td></tr>
</tbody></table>`:""}
${trCost>0?`<table><thead><tr><th>Transport</th><th class="amt">Total HT</th></tr></thead><tbody>
${allerTotal>0?`<tr><td>Transport aller${allerKm>0?` — ${allerKm} km`:""}</td><td class="amt">${fmt(allerTotal)}</td></tr>`:""}
${retourTotal>0?`<tr><td>Transport retour${retourKm>0?` — ${retourKm} km`:""}</td><td class="amt">${fmt(retourTotal)}</td></tr>`:""}
${rentalCostF>0?`<tr><td>Location ${vrf.type||"véhicule"}${vrf.label?` — ${vrf.label}`:""}${vrf.days?` (${vrf.days}j × ${fmt(parseFloat(vrf.pricePerDay)||0)}/j)`:""}</td><td class="amt">${fmt(rentalCostF)}</td></tr>`:""}
${(tr.extraLines||[]).filter(l=>parseFloat(l.amount)>0).map(l=>`<tr><td>${l.label||"Frais transport"}</td><td class="amt">${fmt(parseFloat(l.amount)||0)}</td></tr>`).join("")}
<tr class="tf"><td>Sous-total transport</td><td class="amt">${fmt(trCost)}</td></tr>
</tbody></table>`:""}
<div class="tot-box">
  <div class="tr"><span>Total HT</span><span>${fmt(total)}</span></div>
  <div class="tr"><span>TVA (0%)</span><span>${fmt(0)}</span></div>
  <div class="tr grand"><span>TOTAL TTC</span><span>${fmt(total)}</span></div>
</div>
${loc.notes?`<div style="padding:12px;background:#f8f8f8;border-radius:8px;font-size:12px;color:#555;margin-bottom:24px"><strong>Notes :</strong> ${loc.notes}</div>`:""}
<footer>${assoc.iban?`IBAN : ${assoc.iban}<br>`:""}${assoc.name||"Association"} · Facture générée le ${new Date().toLocaleDateString("fr-FR")}</footer>
</body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); w.onload = () => w.print();
  };

  if (view === "detail" && detailId) {
    const loc = locations.find(l => l.id === detailId);
    if (!loc) { setView("list"); setDetailId(null); return null; }
    return <LocationDetail
      loc={loc} locations={locations} inventory={inventory} catalog={catalog} assoc={assoc}
      update={update} calcDays={calcDays} itemTotal={itemTotal} svcTotal={svcTotal} locTotal={locTotal}
      printMateriel={printMateriel} printDevis={printDevis} printContrat={printContrat} printFacture={printFacture}
      onBack={() => { setView("list"); setDetailId(null); }}
      onDelete={() => { update({ locations: locations.filter(l => l.id !== detailId) }); setView("list"); setDetailId(null); }}
    />;
  }

  // ─── LIST VIEW ───
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", letterSpacing: "-0.8px", marginBottom: "4px" }}>Locations</h1>
          <p style={{ color: C.muted, fontSize: "13px" }}>
            {locations.length} location{locations.length !== 1 ? "s" : ""}
            {locations.filter(l => l.statut === "Confirmé" || l.statut === "En cours").length > 0 &&
              <span style={{ color: C.accent }}> · {locations.filter(l => l.statut === "Confirmé" || l.statut === "En cours").length} active{locations.filter(l => l.statut === "Confirmé" || l.statut === "En cours").length > 1 ? "s" : ""}</span>}
          </p>
        </div>
        <button style={s.btn("primary")} onClick={() => setCreating(!creating)}>+ Nouvelle location</button>
      </div>

      {creating && (
        <div style={s.card({ marginBottom: "20px", borderColor: C.accentBg })}>
          <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Nouvelle location</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "14px" }}>
            <div style={{ gridColumn: "1/-1" }}><label style={s.label}>Libellé *</label><input style={s.inp()} value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ex : Location sono mariage Dupont" autoFocus /></div>
            <div><label style={s.label}>Statut</label><select style={s.inp()} value={form.statut} onChange={e => setForm(f => ({ ...f, statut: e.target.value }))}>{LOC_STATUTS.map(st => <option key={st}>{st}</option>)}</select></div>
            <div><label style={s.label}>Date début</label><input type="date" style={s.inp()} value={form.dateStart} onChange={e => setForm(f => ({ ...f, dateStart: e.target.value }))} /></div>
            <div><label style={s.label}>Heure début</label><input type="time" style={s.inp()} value={form.timeStart||""} onChange={e => setForm(f => ({ ...f, timeStart: e.target.value }))} /></div>
            <div><label style={s.label}>Date fin</label><input type="date" style={s.inp()} value={form.dateEnd} onChange={e => setForm(f => ({ ...f, dateEnd: e.target.value }))} /></div>
            <div><label style={s.label}>Heure fin</label><input type="time" style={s.inp()} value={form.timeEnd||""} onChange={e => setForm(f => ({ ...f, timeEnd: e.target.value }))} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={s.label}>Notes</label><textarea style={{ ...s.inp(), resize: "vertical", height: "50px" }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button style={s.btn("primary")} onClick={createLoc}>Créer et ouvrir</button>
            <button style={s.btn("ghost")} onClick={() => setCreating(false)}>Annuler</button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: "12px" }}>
        {locations.length === 0 && !creating && (
          <div style={{ color: C.muted, textAlign: "center", padding: "70px", fontSize: "14px" }}>Aucune location enregistrée.</div>
        )}
        {[...locations].reverse().map(loc => {
          const total = loc.customPrice != null ? loc.customPrice : locTotal(loc);
          const days = calcDays(loc.dateStart, loc.dateEnd);
          return (
            <div key={loc.id} style={s.card({ cursor: "pointer" })} onClick={() => { setDetailId(loc.id); setView("detail"); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
                    <span style={{ fontFamily: C.display, fontSize: "15px", fontWeight: "700" }}>{loc.label}</span>
                    <Badge color={locStatutColor(loc.statut)}>{loc.statut}</Badge>
                    <span style={{ color: C.muted, fontSize: "11px" }}>{loc.number}</span>
                  </div>
                  <div style={{ color: C.muted, fontSize: "12px", marginBottom: "8px", display: "flex", gap: "14px", flexWrap: "wrap" }}>
                    <span>{loc.dateStart}{loc.timeStart ? ` ${loc.timeStart}` : ""} → {loc.dateEnd}{loc.timeEnd ? ` ${loc.timeEnd}` : ""}</span>
                    <span>· {days} jour{days > 1 ? "s" : ""}</span>
                    {loc.client?.name && <span>· {loc.client.name}</span>}
                  </div>
                  <div style={{ display: "flex", gap: "16px", fontSize: "12px", flexWrap: "wrap" }}>
                    {(loc.items||[]).length > 0 && <span style={{ color: C.muted }}>{(loc.items||[]).length} item{(loc.items||[]).length > 1 ? "s" : ""}</span>}
                    {(loc.services||[]).length > 0 && <span style={{ color: C.muted }}>{(loc.services||[]).length} service{(loc.services||[]).length > 1 ? "s" : ""}</span>}
                  </div>
                </div>
                <div style={{ fontFamily: C.mono, fontSize: "18px", color: C.accent, fontWeight: "700", textAlign: "right", whiteSpace: "nowrap" }}>{fmt(total)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── INVENTORY ─────────────────────────────────────────────────────────────────
function InventoryPage({ data, update }) {
  const EMPTY_FORM = { name: "", category: "Technique", qty: "1", price: "", priceType: "/jour", location: "", status: "operationnel" };
  const CATS_INV = ["Technique","Son","Lumière","Scène","Transport","Mobilier","Cuisine","Autre"];

  const [invTab, setInvTab]       = useState("inventaire");
  const [form, setForm]           = useState(EMPTY_FORM);
  const [adding, setAdding]       = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm]   = useState(null);
  const [search, setSearch]       = useState("");
  const [catForm, setCatForm]     = useState({ name: "", unitPrice: "", unit: "", description: "", priceMode: "EUR" });
  const [selected, setSelected]   = useState(new Set());
  const [bulkEdit, setBulkEdit]   = useState(null); // { field, value }
  const [filterCat, setFilterCat] = useState("Tous");
  const [filterStatus, setFilterStatus] = useState("Tous");

  const inventory = (data.inventory||[]).filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()));
  const totalItems = (data.inventory||[]).reduce((a, i) => a + i.qty, 0);

  const add = () => {
    if (!form.name.trim()) return;
    update(
      { inventory: [...(data.inventory||[]), { id: uid(), ...form, qty: parseInt(form.qty)||1, price: parseFloat(form.price)||0 }] },
      { action: "AJOUT", target: "Inventaire", details: form.name }
    );
    setForm(EMPTY_FORM);
    setAdding(false);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditForm({ name: item.name, category: item.category, qty: String(item.qty), price: String(item.price), priceType: item.priceType, location: item.location||"", status: item.status || "operationnel" });
  };

  const saveEdit = () => {
    update(
      { inventory: data.inventory.map(i => i.id !== editingId ? i : { ...i, ...editForm, qty: parseInt(editForm.qty)||1, price: parseFloat(editForm.price)||0 }) },
      { action: "MODIF", target: "Inventaire", details: editForm.name }
    );
    setEditingId(null);
    setEditForm(null);
  };

  const assoc = data.assoc || {};

  const printListeGenerale = () => {
    const allInv = data.inventory || [];
    const cats = [...new Set(allInv.map(i => i.category))].sort();
    const printStyle = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;padding:48px;font-size:13px;color:#1a1a1a}
h1{font-size:24px;font-weight:800;letter-spacing:-1px;margin-bottom:4px}
.sub{color:#888;font-size:12px;margin-bottom:32px}
h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#555;margin:24px 0 8px;padding-bottom:6px;border-bottom:1px solid #e0e0e0}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
th{padding:8px 10px;background:#111;color:#fff;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
td{padding:9px 10px;border-bottom:1px solid #f0f0f0;font-size:13px}.qty{text-align:center;font-family:monospace;font-weight:700}
.hs{color:#c00;font-size:10px;font-weight:700;text-transform:uppercase}
.loc{color:#999;font-size:11px}
footer{border-top:1px solid #eee;padding-top:12px;color:#aaa;font-size:11px;margin-top:40px;display:flex;justify-content:space-between}
@media print{body{padding:24px}}`;
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Liste matériel</title>
<style>${printStyle}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px">
  <div>${assoc.logo?`<img src="${assoc.logo}" style="height:45px;display:block;margin-bottom:8px">`:""}
    <h1>Liste de matériel</h1>
    <div class="sub">${assoc.name||"Association"} · ${allInv.length} article(s) · ${totalItems} unité(s)</div>
  </div>
  <div style="text-align:right;color:#888;font-size:12px">Généré le ${new Date().toLocaleDateString("fr-FR")}</div>
</div>
${cats.map(cat => {
  const items = allInv.filter(i => i.category === cat);
  return `<h2>${cat}</h2>
<table><thead><tr><th>Désignation</th><th style="text-align:center">Qté</th><th>Emplacement</th><th>État</th></tr></thead><tbody>
${items.map(i=>`<tr><td>${i.name}</td><td class="qty">${i.qty}</td><td class="loc">${i.location||"—"}</td><td>${i.status==="hs"?'<span class="hs">Hors service</span>':'<span style="color:#2e7d32;font-size:11px">✓ OK</span>'}</td></tr>`).join("")}
</tbody></table>`;
}).join("")}
<footer><span>${assoc.name||"Association"}</span><span>Document généré le ${new Date().toLocaleDateString("fr-FR")} à ${new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</span></footer>
</body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); w.onload = () => w.print();
  };

  const printGrilleTarifaire = () => {
    const allInv = (data.inventory || []).filter(i => i.price > 0);
    const catalog = data.catalog || [];
    const cats = [...new Set(allInv.map(i => i.category))].sort();
    const printStyle = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;padding:48px;font-size:13px;color:#1a1a1a}
h1{font-size:24px;font-weight:800;letter-spacing:-1px;margin-bottom:4px}
.sub{color:#888;font-size:12px;margin-bottom:32px}
h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#555;margin:24px 0 8px;padding-bottom:6px;border-bottom:2px solid #111}
table{width:100%;border-collapse:collapse;margin-bottom:16px}
th{padding:9px 10px;background:#111;color:#fff;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
td{padding:10px;border-bottom:1px solid #f0f0f0}.amt{text-align:right;font-family:monospace;font-weight:600}
.note{font-size:10px;color:#aaa;margin-top:40px;padding-top:12px;border-top:1px solid #eee;line-height:1.6}
footer{border-top:1px solid #eee;padding-top:12px;color:#aaa;font-size:11px;margin-top:20px;display:flex;justify-content:space-between}
@media print{body{padding:24px}}`;
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Grille tarifaire</title>
<style>${printStyle}</style></head><body>
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px">
  <div>${assoc.logo?`<img src="${assoc.logo}" style="height:45px;display:block;margin-bottom:8px">`:""}
    <h1>Grille tarifaire</h1>
    <div class="sub">${assoc.name||"Association"}${assoc.siret?` · SIRET : ${assoc.siret}`:""}</div>
  </div>
  <div style="text-align:right;color:#888;font-size:12px">En vigueur au<br><strong style="color:#111">${new Date().toLocaleDateString("fr-FR")}</strong></div>
</div>
${allInv.length > 0 ? `<h2>Location de matériel</h2>
${cats.filter(cat => allInv.some(i => i.category === cat)).map(cat => {
  const items = allInv.filter(i => i.category === cat);
  return `<div style="font-size:11px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:.3px;margin:12px 0 4px">${cat}</div>
<table><thead><tr><th>Matériel</th><th style="text-align:center">Qté dispo</th><th class="amt">Prix unitaire HT</th></tr></thead><tbody>
${items.map(i=>`<tr><td>${i.name}</td><td style="text-align:center;color:#888">${i.qty}</td><td class="amt">${fmt(i.price)}<span style="font-size:10px;color:#999;font-weight:400"> / pièce${i.priceType}</span></td></tr>`).join("")}
</tbody></table>`;
}).join("")}` : ""}
${catalog.length > 0 ? `<h2>Prestations de services</h2>
<table><thead><tr><th>Prestation</th><th>Description</th><th class="amt">Tarif HT</th></tr></thead><tbody>
${catalog.map(c=>`<tr><td><strong>${c.name}</strong></td><td style="color:#888;font-size:12px">${c.description||"—"}</td><td class="amt">${c.priceMode==="%"?`${c.unitPrice}%`:`${fmt(c.unitPrice)}${c.unit?` / ${c.unit}`:""}`}</td></tr>`).join("")}
</tbody></table>` : ""}
<div class="note">Les tarifs indiqués sont hors taxes. Toute demande de devis ou de réservation doit être adressée à ${assoc.email||"l'association"}${assoc.phone?` (${assoc.phone})`:""}. Les prix peuvent être modifiés sans préavis. Ce document a valeur indicative et ne constitue pas un engagement contractuel.</div>
<footer><span>${assoc.name||"Association"}${assoc.address?` · ${assoc.address}`:""}</span><span>Grille tarifaire éditée le ${new Date().toLocaleDateString("fr-FR")}</span></footer>
</body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); w.onload = () => w.print();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "6px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", letterSpacing: "-0.8px", marginBottom: "4px" }}>Inventaire</h1>
          <p style={{ color: C.muted, fontSize: "13px" }}>{totalItems} article(s) au total</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button style={{ ...s.btn("ghost"), fontSize: "12px" }} onClick={printListeGenerale}>⬡ Liste matériel</button>
          <button style={{ ...s.btn("ghost"), fontSize: "12px" }} onClick={printGrilleTarifaire}>⬡ Grille tarifaire</button>
          <div style={{ display: "flex", gap: "2px", borderBottom: `1px solid ${C.border}` }}>
            {[{ id: "inventaire", label: "Inventaire" }, { id: "catalogue", label: `Catalogue (${(data.catalog||[]).length})` }].map(t => (
              <button key={t.id} onClick={() => setInvTab(t.id)} style={{ padding: "8px 16px", background: "none", border: "none", cursor: "pointer", borderBottom: `2px solid ${invTab === t.id ? C.accent : "transparent"}`, color: invTab === t.id ? C.accent : C.muted, fontFamily: C.font, fontSize: "13px", fontWeight: invTab === t.id ? "600" : "400", marginBottom: "-1px" }}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {invTab === "catalogue" && (
        <div style={{ marginTop: "20px" }}>
          <div style={s.card({ marginBottom: "14px" })}>
            <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Ajouter au catalogue</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", alignItems: "end", marginBottom: "10px" }}>
              <div><label style={s.label}>Nom *</label><input type="text" style={s.inp()} value={catForm.name} placeholder="Sonorisation…" onChange={e => setCatForm({ ...catForm, name: e.target.value })} /></div>
              <div>
                <label style={s.label}>{catForm.priceMode === "%" ? "Pourcentage (%) *" : "Prix unitaire (€) *"}</label>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input type="number" style={{ ...s.inp(), flex: 1 }} value={catForm.unitPrice} placeholder={catForm.priceMode === "%" ? "10" : "50"} onChange={e => setCatForm({ ...catForm, unitPrice: e.target.value })} />
                  <div style={{ display: "flex", borderRadius: "8px", overflow: "hidden", border: `1px solid ${C.border}` }}>
                    {["EUR", "%"].map(m => (
                      <button key={m} style={{ padding: "0 10px", background: catForm.priceMode === m ? C.accent : "transparent", color: catForm.priceMode === m ? "#fff" : C.muted, border: "none", cursor: "pointer", fontSize: "12px", fontWeight: "600" }} onClick={() => setCatForm({ ...catForm, priceMode: m })}>{m === "EUR" ? "€" : "%"}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div><label style={s.label}>Unité</label><input type="text" style={s.inp()} value={catForm.unit} placeholder="heure, forfait…" onChange={e => setCatForm({ ...catForm, unit: e.target.value })} /></div>
              <div><label style={s.label}>Description</label><input type="text" style={s.inp()} value={catForm.description} placeholder="Détail…" onChange={e => setCatForm({ ...catForm, description: e.target.value })} /></div>
            </div>
            <button style={s.btn("primary")} onClick={() => {
              if (!catForm.name || !catForm.unitPrice) return;
              update({ catalog: [...(data.catalog||[]), { id: uid(), name: catForm.name, unitPrice: parseFloat(catForm.unitPrice), unit: catForm.unit, description: catForm.description, priceMode: catForm.priceMode || "EUR" }] });
              setCatForm({ name: "", unitPrice: "", unit: "", description: "", priceMode: "EUR" });
            }}>+ Ajouter</button>
          </div>
          <div style={s.card()}>
            <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Catalogue ({(data.catalog||[]).length})</div>
            <DataTable
              headers={["Nom","Type","Valeur","Unité","Description",""]}
              rows={(data.catalog||[]).map(c => [
                <strong>{c.name}</strong>,
                <Badge color={c.priceMode === "%" ? "warn" : "info"}>{c.priceMode === "%" ? "%" : "EUR"}</Badge>,
                <span style={{ fontFamily: C.mono, color: c.priceMode === "%" ? C.warn : C.accent }}>{c.priceMode === "%" ? `${c.unitPrice}%` : fmt(c.unitPrice)}</span>,
                <span style={{ color: C.muted }}>{c.unit||"—"}</span>,
                <span style={{ color: C.muted, fontSize: "12px" }}>{c.description||"—"}</span>,
                <button style={s.btn("danger", { padding: "3px 8px", fontSize: "11px" })} onClick={() => update({ catalog: data.catalog.filter(x => x.id !== c.id) })}>✕</button>,
              ])}
              empty="Aucune prestation dans le catalogue."
            />
          </div>
        </div>
      )}

      {invTab === "inventaire" && (() => {
        const allInv = data.inventory || [];
        const filtered = allInv.filter(i =>
          (!search || i.name.toLowerCase().includes(search.toLowerCase())) &&
          (filterCat === "Tous" || i.category === filterCat) &&
          (filterStatus === "Tous" || (filterStatus === "hs" ? i.status === "hs" : i.status !== "hs"))
        );
        const cats = [...new Set(allInv.map(i => i.category))].sort();
        const grouped = cats.map(cat => ({ cat, items: filtered.filter(i => i.category === cat) })).filter(g => g.items.length > 0);
        const allIds = filtered.map(i => i.id);
        const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
        const someSelected = selected.size > 0;

        const toggleAll = () => {
          if (allSelected) setSelected(new Set());
          else setSelected(new Set(allIds));
        };
        const toggleOne = (id) => {
          const s2 = new Set(selected);
          s2.has(id) ? s2.delete(id) : s2.add(id);
          setSelected(s2);
        };

        const applyBulk = () => {
          if (!bulkEdit) return;
          const { field, value } = bulkEdit;
          update({ inventory: allInv.map(i => selected.has(i.id) ? { ...i, [field]: value } : i) });
          setSelected(new Set());
          setBulkEdit(null);
        };

        return (
          <>
            {/* Toolbar */}
            <div style={{ marginTop: "20px", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <input style={{ ...s.inp(), maxWidth: "220px", flex: 1 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" />
              <select style={{ ...s.inp(), width: "auto" }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
                <option value="Tous">Toutes catégories</option>
                {CATS_INV.map(c => <option key={c}>{c}</option>)}
              </select>
              <select style={{ ...s.inp(), width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="Tous">Tous états</option>
                <option value="operationnel">Opérationnel</option>
                <option value="hs">Hors service</option>
              </select>
              <div style={{ flex: 1 }} />
              <button style={s.btn("primary")} onClick={() => { setAdding(!adding); setEditingId(null); }}>+ Ajouter</button>
            </div>

            {/* Bulk action bar */}
            {someSelected && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", background: `${C.accent}15`, border: `1px solid ${C.accent}40`, borderRadius: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", color: C.accent, fontWeight: "600" }}>{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</span>
                <div style={{ flex: 1 }} />
                <select style={{ ...s.inp(), width: "auto", fontSize: "12px" }}
                  value={bulkEdit?.field === "category" ? bulkEdit.value : ""}
                  onChange={e => setBulkEdit({ field: "category", value: e.target.value })}>
                  <option value="" disabled>Changer catégorie…</option>
                  {CATS_INV.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select style={{ ...s.inp(), width: "auto", fontSize: "12px" }}
                  value={bulkEdit?.field === "status" ? bulkEdit.value : ""}
                  onChange={e => setBulkEdit({ field: "status", value: e.target.value })}>
                  <option value="" disabled>Changer statut…</option>
                  <option value="operationnel">Opérationnel</option>
                  <option value="hs">Hors service</option>
                </select>
                <select style={{ ...s.inp(), width: "auto", fontSize: "12px" }}
                  value={bulkEdit?.field === "priceType" ? bulkEdit.value : ""}
                  onChange={e => setBulkEdit({ field: "priceType", value: e.target.value })}>
                  <option value="" disabled>Changer tarification…</option>
                  {["/jour","/heure","/forfait","/pack"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {bulkEdit && <button style={s.btn("primary", { fontSize: "12px", padding: "5px 12px" })} onClick={applyBulk}>Appliquer</button>}
                <button style={s.btn("danger", { fontSize: "12px", padding: "5px 12px" })} onClick={() => {
                  if (!confirm(`Supprimer ${selected.size} article(s) ?`)) return;
                  update({ inventory: allInv.filter(i => !selected.has(i.id)) });
                  setSelected(new Set()); setBulkEdit(null);
                }}>Supprimer</button>
                <button style={s.btn("ghost", { fontSize: "12px", padding: "5px 10px" })} onClick={() => { setSelected(new Set()); setBulkEdit(null); }}>✕</button>
              </div>
            )}

            {/* Add form */}
            {adding && (
              <div style={s.card({ marginBottom: "16px", borderColor: `${C.accent}40` })}>
                <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Nouvel article</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: "12px" }}>
                  <div><label style={s.label}>Nom *</label><input style={s.inp()} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nom de l'article" autoFocus /></div>
                  <div><label style={s.label}>Catégorie</label><select style={s.inp()} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATS_INV.map(c => <option key={c}>{c}</option>)}</select></div>
                  <div><label style={s.label}>Statut</label><select style={s.inp()} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="operationnel">Opérationnel</option><option value="hs">Hors service</option></select></div>
                  <div><label style={s.label}>Quantité</label><input type="number" style={s.inp()} value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} min="1" /></div>
                  <div><label style={s.label}>Prix / pièce</label><input type="number" style={s.inp()} value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="0" /></div>
                  <div><label style={s.label}>Tarification</label><select style={s.inp()} value={form.priceType} onChange={e => setForm({ ...form, priceType: e.target.value })}>{["/jour","/heure","/forfait","/pack"].map(t => <option key={t}>{t}</option>)}</select></div>
                  <div><label style={s.label}>Emplacement</label><input style={s.inp()} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Salle A, Local…" /></div>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button style={s.btn("primary")} onClick={add}>Ajouter</button>
                  <button style={s.btn("ghost")} onClick={() => setAdding(false)}>Annuler</button>
                </div>
              </div>
            )}

            {filtered.length === 0 && (
              <div style={{ color: C.muted, textAlign: "center", padding: "60px", fontSize: "14px" }}>Aucun article trouvé.</div>
            )}

            {/* Table header */}
            {filtered.length > 0 && (
              <div style={{ background: C.card2, borderRadius: "10px", overflow: "hidden", border: `1px solid ${C.border}` }}>
                {/* Column headers */}
                <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 110px 80px 70px 130px 120px 72px", gap: "0", padding: "8px 14px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: "pointer", accentColor: C.accent }} />
                  <span style={{ fontSize: "10px", color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>Désignation</span>
                  <span style={{ fontSize: "10px", color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>Catégorie</span>
                  <span style={{ fontSize: "10px", color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>État</span>
                  <span style={{ fontSize: "10px", color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600", textAlign: "center" }}>Qté</span>
                  <span style={{ fontSize: "10px", color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600", textAlign: "right" }}>Prix / pièce</span>
                  <span style={{ fontSize: "10px", color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: "600" }}>Emplacement</span>
                  <span />
                </div>

                {grouped.map(({ cat, items }) => (
                  <div key={cat}>
                    {/* Category separator */}
                    <div style={{ padding: "6px 14px 4px", background: `${C.accent}08`, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: "11px", fontWeight: "700", color: C.accent, textTransform: "uppercase", letterSpacing: "0.5px" }}>{cat}</span>
                      <span style={{ fontSize: "11px", color: C.muted, marginLeft: "8px" }}>{items.length} article{items.length > 1 ? "s" : ""} · {items.reduce((a,i) => a + i.qty, 0)} unités</span>
                    </div>

                    {items.map((item, idx) => {
                      const isEditing = editingId === item.id;
                      const isSel = selected.has(item.id);
                      return (
                        <div key={item.id} style={{ borderBottom: idx < items.length - 1 ? `1px solid ${C.border}` : "none", background: isSel ? `${C.accent}08` : isEditing ? C.card2 : "transparent", borderLeft: `3px solid ${isEditing ? C.accent : isSel ? `${C.accent}60` : "transparent"}`, transition: "background 0.1s" }}>
                          {/* Read row */}
                          <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 110px 80px 70px 130px 120px 72px", gap: "0", padding: "11px 14px", alignItems: "center" }}>
                            <input type="checkbox" checked={isSel} onChange={() => toggleOne(item.id)} style={{ cursor: "pointer", accentColor: C.accent }} />
                            <span style={{ fontWeight: "600", fontSize: "13px", paddingRight: "12px" }}>{item.name}</span>
                            <span style={{ fontSize: "11px", color: C.muted }}>{item.category}</span>
                            <span>
                              {item.status === "hs"
                                ? <span style={{ fontSize: "11px", fontWeight: "700", padding: "2px 7px", borderRadius: "20px", background: `${C.danger}18`, color: C.danger, border: `1px solid ${C.danger}30` }}>HS</span>
                                : <span style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "20px", background: `#4affa015`, color: "#4affa0", border: `1px solid #4affa030` }}>OK</span>}
                            </span>
                            <span style={{ fontFamily: C.mono, fontSize: "13px", textAlign: "center", color: C.text }}>×{item.qty}</span>
                            <span style={{ fontFamily: C.mono, fontSize: "12px", textAlign: "right", paddingRight: "8px" }}>
                              {item.price > 0
                                ? <><span style={{ color: C.accent }}>{fmt(item.price)}</span><span style={{ fontSize: "10px", color: C.muted }}>{item.priceType}</span></>
                                : <span style={{ color: C.muted }}>—</span>}
                            </span>
                            <span style={{ fontSize: "12px", color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.location||"—"}</span>
                            <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                              <button onClick={() => isEditing ? (setEditingId(null), setEditForm(null)) : startEdit(item)} style={s.btn("ghost", { padding: "3px 8px", fontSize: "11px" })}>{isEditing ? "✕" : "✎"}</button>
                              <button onClick={() => { if (confirm(`Supprimer "${item.name}" ?`)) update({ inventory: allInv.filter(x => x.id !== item.id) }); }} style={s.btn("danger", { padding: "3px 8px", fontSize: "11px" })}>✕</button>
                            </div>
                          </div>
                          {/* Inline edit form */}
                          {isEditing && editForm && (
                            <div style={{ padding: "12px 14px 16px", borderTop: `1px solid ${C.border}` }}>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginBottom: "12px" }}>
                                <div><label style={s.label}>Nom *</label><input style={s.inp()} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} autoFocus /></div>
                                <div><label style={s.label}>Catégorie</label><select style={s.inp()} value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })}>{CATS_INV.map(c => <option key={c}>{c}</option>)}</select></div>
                                <div><label style={s.label}>Statut</label><select style={s.inp()} value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}><option value="operationnel">Opérationnel</option><option value="hs">Hors service</option></select></div>
                                <div><label style={s.label}>Quantité</label><input type="number" style={s.inp()} value={editForm.qty} onChange={e => setEditForm({ ...editForm, qty: e.target.value })} min="1" /></div>
                                <div><label style={s.label}>Prix / pièce</label><input type="number" style={s.inp()} value={editForm.price} onChange={e => setEditForm({ ...editForm, price: e.target.value })} placeholder="0" /></div>
                                <div><label style={s.label}>Tarification</label><select style={s.inp()} value={editForm.priceType} onChange={e => setEditForm({ ...editForm, priceType: e.target.value })}>{["/jour","/heure","/forfait","/pack"].map(t => <option key={t}>{t}</option>)}</select></div>
                                <div><label style={s.label}>Emplacement</label><input style={s.inp()} value={editForm.location} onChange={e => setEditForm({ ...editForm, location: e.target.value })} placeholder="Salle A, Local…" /></div>
                              </div>
                              <div style={{ display: "flex", gap: "8px" }}>
                                <button style={s.btn("primary", { padding: "6px 14px", fontSize: "12px" })} onClick={saveEdit}>Enregistrer</button>
                                <button style={s.btn("ghost", { padding: "6px 14px", fontSize: "12px" })} onClick={() => { setEditingId(null); setEditForm(null); }}>Annuler</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </>
        );
      })()}
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
                      {m.crFile && <span style={{ fontSize: "11px", color: C.accent, marginLeft: "8px", fontFamily: C.font, fontWeight: "400" }}>CR joint</span>}
                    </div>
                    {m.location  && <div style={{ fontSize: "12px", color: C.muted }}>{m.location}</div>}
                    {m.attendees && <div style={{ fontSize: "12px", color: C.muted }}>{m.attendees}</div>}
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
                            {m.crFile.name}
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
  const [form, setForm] = useState({ label: "", statut: "Demande", dateStart: today(), timeStart: "", dateEnd: today(), timeEnd: "", notes: "" });

  const create = () => {
    if (!form.label.trim()) return;
    const newP = { id: uid(), label: form.label, statut: form.statut, date: form.dateStart,
      dateStart: form.dateStart, timeStart: form.timeStart, dateEnd: form.dateEnd, timeEnd: form.timeEnd,
      notes: form.notes, client: { name: "", address: "", email: "", phone: "" }, team: [], gear: [], services: [], expenses: [], amount: 0 };
    update({ prestations: [...(data.prestations||[]), newP] }, { action: "AJOUT", target: "Prestations", details: form.label });
    setForm({ label: "", statut: "Demande", dateStart: today(), timeStart: "", dateEnd: today(), timeEnd: "", notes: "" });
    setCreating(false);
    setDetailId(newP.id);
  };

  if (detailId) {
    const p = (data.prestations||[]).find(x => x.id === detailId);
    if (!p) { setDetailId(null); return null; }
    return <PrestationDetail prestation={p} data={data} update={update} back={() => setDetailId(null)} users={users} contacts={contacts} pool={data.depensesPool || []} />;
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
            <div><label style={s.label}>Date début</label><input type="date" style={s.inp()} value={form.dateStart} onChange={e => setForm({ ...form, dateStart: e.target.value })} /></div>
            <div><label style={s.label}>Heure début</label><input type="time" style={s.inp()} value={form.timeStart} onChange={e => setForm({ ...form, timeStart: e.target.value })} /></div>
            <div><label style={s.label}>Date fin</label><input type="date" style={s.inp()} value={form.dateEnd} onChange={e => setForm({ ...form, dateEnd: e.target.value })} /></div>
            <div><label style={s.label}>Heure fin</label><input type="time" style={s.inp()} value={form.timeEnd} onChange={e => setForm({ ...form, timeEnd: e.target.value })} /></div>
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
          const trTotal   = calcTransportCost(p.transport);
          const total = p.customPrice != null ? p.customPrice : gearTotal + svcTotal + trTotal;
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
                    {(p.dateStart || p.date) && <span>{p.dateStart||p.date}{p.timeStart ? ` ${p.timeStart}` : ""}{p.dateEnd && p.dateEnd !== (p.dateStart||p.date) ? ` → ${p.dateEnd}${p.timeEnd ? ` ${p.timeEnd}` : ""}` : p.timeEnd ? ` → ${p.timeEnd}` : ""}</span>}
                    {p.location && <span>· {p.location}</span>}
                    {p.client?.name && <span>· {p.client.name}</span>}
                    {(p.team||[]).length > 0 && <span>· {p.team.length} pers.</span>}
                  </div>
                  <div style={{ display: "flex", gap: "20px", fontFamily: C.mono, fontSize: "13px", flexWrap: "wrap" }}>
                    {gearTotal > 0 && <span><span style={{ color: C.muted }}>Matériel: </span><span style={{ color: C.warn }}>{fmt(gearTotal)}</span></span>}
                    {svcTotal > 0 && <span><span style={{ color: C.muted }}>Services: </span><span style={{ color: C.info }}>{fmt(svcTotal)}</span></span>}
                    {trTotal > 0 && <span><span style={{ color: C.muted }}>Transport: </span><span style={{ color: "#a78bfa" }}>{fmt(trTotal)}</span></span>}
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

function calcTransportCost(tr) {
  if (!tr) return 0;
  const km = parseFloat(tr.distanceKm)||0, conso = parseFloat(tr.fuelConso)||0, prixL = parseFloat(tr.fuelPrice)||0;
  const allerFuel = km > 0 && conso > 0 && prixL > 0 ? Math.round(km*conso/100*prixL*100)/100 : 0;
  const rkm = parseFloat(tr.retourDistanceKm)||0, rconso = parseFloat(tr.retourFuelConso)||0, rprixL = parseFloat(tr.retourFuelPrice)||0;
  const retourFuel = rkm > 0 && rconso > 0 && rprixL > 0 ? Math.round(rkm*rconso/100*rprixL*100)/100 : 0;
  const vr = tr.vehicleRental;
  const rentalCost = (vr?.enabled && parseFloat(vr.pricePerDay) > 0 && parseFloat(vr.days) > 0)
    ? Math.round(parseFloat(vr.pricePerDay) * parseFloat(vr.days) * 100) / 100 : 0;
  return allerFuel + (parseFloat(tr.tolls)||0) + retourFuel + (parseFloat(tr.retourTolls)||0) + (tr.extraLines||[]).reduce((a,l)=>a+(parseFloat(l.amount)||0),0) + rentalCost;
}

function calcPrestationTotal(p) {
  const gearTotal = (p.gear||[]).reduce((a, g) => a + (g.qty||1) * (g.unitPrice||0) * (g.days||1), 0);
  const servicesTotal = (p.services||[]).reduce((a, sv) => a + (sv.qty||1) * (sv.unitPrice||0), 0);
  return gearTotal + servicesTotal + calcTransportCost(p.transport);
}

function PrestationDetail({ prestation: p, data, update, back, users, contacts = [], pool = [] }) {
  const upd = (patch) => update({ prestations: data.prestations.map(x => x.id === p.id ? { ...x, ...patch } : x) });
  const [tab, setTab] = useState("overview");

  // Duration helpers
  const parseDT = (date, time) => date ? new Date(`${date}${time ? "T"+time : "T00:00"}`) : null;
  const calcPrestDays = () => {
    const start = parseDT(p.dateStart || p.date, p.timeStart);
    const end   = parseDT(p.dateEnd   || p.date, p.timeEnd);
    if (!start || !end || end <= start) return 1;
    return Math.max(1, Math.ceil((end - start) / 86400000));
  };
  const prestDays = calcPrestDays();
  const prestDuration = (() => {
    const start = parseDT(p.dateStart || p.date, p.timeStart);
    const end   = parseDT(p.dateEnd   || p.date, p.timeEnd);
    if (!start || !end || end <= start) return null;
    const totalMin = Math.round((end - start) / 60000);
    if (totalMin < 1440) return `${Math.floor(totalMin/60)}h${totalMin%60>0?String(totalMin%60).padStart(2,"0")+"min":""}`;
    return `${prestDays} jour${prestDays>1?"s":""}`;
  })();

  const gearTotal = (p.gear||[]).reduce((a, g) => a + g.qty*g.unitPrice*g.days, 0);
  const svcTotal  = (p.services||[]).reduce((a, sv) => a + sv.qty*sv.unitPrice, 0);
  const calcTrTotal = calcTransportCost(p.transport);
  const calcTotal = gearTotal + svcTotal + calcTrTotal;
  const total     = (p.customPrice != null) ? p.customPrice : calcTotal;
  const expTotal  = sumArr(p.expenses||[], "amount");

  // Gear
  const [gearItem, setGearItem] = useState("");
  const [gearQty, setGearQty] = useState("1");
  const [gearDays, setGearDays] = useState(String(prestDays));

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
    if (cat.priceMode === "%") {
      const base = gearTotal + svcTotal;
      const computedPrice = cat.unitPrice / 100 * base;
      upd({ services: [...(p.services||[]), { id: uid(), label: cat.name, qty: 1, unitPrice: computedPrice, priceMode: "%", pct: cat.unitPrice, unit: "%" }] });
    } else {
      upd({ services: [...(p.services||[]), { id: uid(), label: cat.name, qty: parseInt(svcQty)||1, unitPrice: cat.unitPrice, unit: cat.unit||"" }] });
    }
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
    const trDoc = p.transport || {};
    const trDocKm = parseFloat(trDoc.distanceKm)||0, trDocConso = parseFloat(trDoc.fuelConso)||0, trDocPrixL = parseFloat(trDoc.fuelPrice)||0;
    const trDocAllerFuel = trDocKm > 0 && trDocConso > 0 && trDocPrixL > 0 ? Math.round(trDocKm*trDocConso/100*trDocPrixL*100)/100 : 0;
    const trDocRkm = parseFloat(trDoc.retourDistanceKm)||0, trDocRconso = parseFloat(trDoc.retourFuelConso)||0, trDocRprixL = parseFloat(trDoc.retourFuelPrice)||0;
    const trDocRetourFuel = trDocRkm > 0 && trDocRconso > 0 && trDocRprixL > 0 ? Math.round(trDocRkm*trDocRconso/100*trDocRprixL*100)/100 : 0;
    const trDocAllerTotal = trDocAllerFuel + (parseFloat(trDoc.tolls)||0);
    const trDocRetourTotal = trDocRetourFuel + (parseFloat(trDoc.retourTolls)||0);
    const trDocVR = trDoc.vehicleRental || {};
    const trDocRentalCost = (trDocVR.enabled && parseFloat(trDocVR.pricePerDay) > 0 && parseFloat(trDocVR.days) > 0)
      ? Math.round(parseFloat(trDocVR.pricePerDay)*parseFloat(trDocVR.days)*100)/100 : 0;
    const trLines = [
      ...(trDocAllerTotal > 0 ? [{ label: `Transport aller${trDocKm > 0 ? ` — ${trDocKm} km` : ""}`, qty: 1, unitPrice: trDocAllerTotal, unit: "forfait" }] : []),
      ...(trDocRetourTotal > 0 ? [{ label: `Transport retour${trDocRkm > 0 ? ` — ${trDocRkm} km` : ""}`, qty: 1, unitPrice: trDocRetourTotal, unit: "forfait" }] : []),
      ...(trDocRentalCost > 0 ? [{ label: `Location ${trDocVR.type||"véhicule"}${trDocVR.label ? ` — ${trDocVR.label}` : ""}`, qty: parseFloat(trDocVR.days)||1, unitPrice: parseFloat(trDocVR.pricePerDay)||0, unit: "jour" }] : []),
      ...(trDoc.extraLines||[]).filter(l=>parseFloat(l.amount)>0).map(l => ({ label: l.label||"Frais transport", qty: 1, unitPrice: parseFloat(l.amount)||0, unit: "forfait" })),
    ];
    const lines = [...gearLines, ...svcLines, ...trLines];
    const docTotal = p.customPrice != null ? p.customPrice : lines.reduce((a, l) => a + l.qty * l.unitPrice, 0);
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
<p style="margin-bottom:${p.location ? "6px" : "18px"}"><strong>Objet :</strong> ${p.label}</p>
${p.location ? `<p style="margin-bottom:18px;color:#555;font-size:12px">Lieu : ${p.location}</p>` : ""}
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
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString("fr-FR") : null;
    const dateStart = p.dateStart || p.date;
    const dateEnd   = p.dateEnd;
    const periodeStr = (() => {
      if (!dateStart) return "à définir";
      const d1 = fmtDate(dateStart);
      const t1 = p.timeStart ? ` à ${p.timeStart}` : "";
      if (!dateEnd || dateEnd === dateStart) {
        const t2 = p.timeEnd ? ` jusqu'à ${p.timeEnd}` : "";
        return `le <strong>${d1}${t1}${t2}</strong>`;
      }
      const d2 = fmtDate(dateEnd);
      const t2 = p.timeEnd ? ` à ${p.timeEnd}` : "";
      return `du <strong>${d1}${t1}</strong> au <strong>${d2}${t2}</strong>`;
    })();
    const durationStr = prestDuration ? ` (durée : ${prestDuration})` : "";
    const gearLines = (p.gear||[]).map(g => `<li>${g.itemName} — ${g.qty} unité(s) × ${g.days} jour(s) à ${fmt(g.unitPrice)}${g.priceType} = <strong>${fmt(g.qty*g.unitPrice*g.days)}</strong></li>`).join("");
    const svcLines  = (p.services||[]).map(sv => `<li>${sv.label} × ${sv.qty} — <strong>${fmt(sv.qty*sv.unitPrice)}</strong></li>`).join("");
    const teamLines = (p.team||[]).map(m => `<li>${m.name}${m.role ? ` (${m.role})` : ""}</li>`).join("");
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Contrat de prestation — ${p.label}</title><style>${docStyle}
body{font-size:12.5px}.contrat-title{font-size:22px;font-weight:800;letter-spacing:-0.5px;margin-bottom:4px}
</style></head><body>
<div class="top">
  <div>${assocBlock()}</div>
  <div style="text-align:right">
    <div class="contrat-title">CONTRAT DE PRESTATION DE SERVICES</div>
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
<p style="text-align:center;color:#888;font-size:12px;margin-bottom:28px">Ci-après désignés individuellement « la Partie » et collectivement « les Parties »</p>

<div class="art">
  <div class="art-title">Article 1 – Objet du contrat</div>
  <p>Le présent contrat a pour objet de définir les conditions et modalités dans lesquelles le Prestataire s'engage à réaliser, pour le compte du Client, la prestation de services suivante :</p>
  <p style="margin-top:8px;font-weight:700;font-size:14px">${p.label}</p>
  ${p.notes ? `<p style="margin-top:6px;color:#555;font-style:italic">${p.notes}</p>` : ""}
  <p style="margin-top:8px">Le présent contrat prévaut sur tout document antérieur, devis ou accord verbal entre les Parties relatif au même objet.</p>
</div>

<div class="art">
  <div class="art-title">Article 2 – Date, durée et lieu d'intervention</div>
  <p>La prestation sera réalisée ${periodeStr}${durationStr}.</p>
  ${p.location ? `<p style="margin-top:6px"><strong>Lieu d'intervention :</strong> ${p.location}</p>` : `<p style="margin-top:6px">Le lieu précis d'intervention sera confirmé par écrit au plus tard <strong>72 heures</strong> avant le début de la prestation.</p>`}
  <p style="margin-top:6px">Toute modification de lieu après confirmation devra être acceptée par le Prestataire et pourra entraîner une révision tarifaire.</p>
  <p style="margin-top:6px">En cas de retard d'accès au lieu imputable au Client, la prestation débutera à l'heure initialement convenue et prendra fin à l'heure prévue, sans prolongation ni déduction de prix.</p>
</div>

<div class="art">
  <div class="art-title">Article 3 – Description des prestations et matériel fourni</div>
  ${gearLines || svcLines ? `
    ${gearLines ? `<p style="margin-bottom:6px"><strong>Matériel mis à disposition :</strong></p><ul style="margin-left:20px;margin-bottom:10px">${gearLines}</ul>` : ""}
    ${svcLines  ? `<p style="margin-bottom:6px"><strong>Services inclus :</strong></p><ul style="margin-left:20px">${svcLines}</ul>` : ""}
  ` : "<p>Le détail des prestations et du matériel sera précisé par avenant annexé au présent contrat.</p>"}
  ${teamLines ? `<p style="margin-top:10px"><strong>Équipe mobilisée :</strong></p><ul style="margin-left:20px">${teamLines}</ul>` : ""}
  <p style="margin-top:8px;font-size:11px;color:#888">Le matériel listé est fourni à titre indicatif. Le Prestataire se réserve le droit de substituer tout équipement par un matériel de caractéristiques équivalentes ou supérieures, sans modification du prix.</p>
</div>

<div class="art">
  <div class="art-title">Article 4 – Prix et conditions de paiement</div>
  <p>Le montant total de la prestation est arrêté à :</p>
  <p style="font-size:20px;font-weight:800;margin:10px 0">${fmt(total)} HT</p>
  <p style="color:#888;font-size:11px;margin-bottom:10px">TVA non applicable en vertu de l'article 293B du Code Général des Impôts.</p>
  ${(p.customPrice == null && (gearTotal > 0 || svcTotal > 0 || calcTrTotal > 0)) ? `<p style="margin-bottom:8px">${[gearTotal > 0 ? `Matériel : ${fmt(gearTotal)}` : "", svcTotal > 0 ? `Services : ${fmt(svcTotal)}` : "", calcTrTotal > 0 ? `Transport : ${fmt(calcTrTotal)}` : ""].filter(Boolean).join(" — ")}</p>` : ""}
  <p>Modalités de règlement acceptées : <strong>virement bancaire</strong>${data.assoc.iban ? ` (IBAN : ${data.assoc.iban})` : ""}, chèque libellé à l'ordre de ${data.assoc.name||"l'Association"}, ou espèces (dans la limite légale en vigueur).</p>
  <p style="margin-top:8px">Un acompte non remboursable de <strong>30 %</strong> (soit ${fmt(total * 0.3)}) est exigible à la signature du présent contrat et conditionne sa prise d'effet. Le solde de <strong>${fmt(total * 0.7)}</strong> est dû au plus tard le jour de la prestation, avant le début de l'installation. Tout défaut de paiement à l'échéance entraîne de plein droit l'application d'intérêts de retard au taux légal en vigueur, majoré de 5 points, ainsi qu'une indemnité forfaitaire pour frais de recouvrement de 40 €.</p>
</div>

<div class="art">
  <div class="art-title">Article 5 – Engagements et obligations du Prestataire</div>
  <p>Le Prestataire s'engage expressément à :</p>
  <ul style="margin-left:20px;margin-top:6px">
    <li style="margin-bottom:5px"><strong>Présence d'une équipe complète et qualifiée :</strong> mobiliser l'intégralité du personnel prévu à l'article 3, ponctuel et compétent pour la mission. En cas d'indisponibilité d'un membre, le Prestataire s'engage à le remplacer par une personne aux compétences équivalentes, sans surcoût pour le Client ;</li>
    <li style="margin-bottom:5px"><strong>Fourniture de matériel conforme :</strong> mettre à disposition des équipements en bon état de fonctionnement, conformes aux normes électriques et de sécurité en vigueur (NF, CE), régulièrement entretenus et vérifiés avant chaque prestation ;</li>
    <li style="margin-bottom:5px"><strong>Disponibilité et réactivité :</strong> rester disponible pendant toute la durée de la prestation pour intervenir en cas de panne, d'incident technique ou de toute difficulté affectant le bon déroulement de l'événement ;</li>
    <li style="margin-bottom:5px">Respecter les horaires convenus et informer le Client sans délai de tout imprévu susceptible d'affecter l'exécution ;</li>
    <li>Assurer la discrétion, la propreté du poste de travail et le respect des lieux mis à disposition.</li>
  </ul>
</div>

<div class="art">
  <div class="art-title">Article 6 – Obligations du Client</div>
  <p>Le Client s'engage à :</p>
  <ul style="margin-left:20px;margin-top:6px">
    <li style="margin-bottom:5px">Fournir un accès libre, sécurisé et adapté au lieu d'intervention, dès l'heure convenue pour l'installation ;</li>
    <li style="margin-bottom:5px">Mettre à disposition les alimentations électriques suffisantes (220V monophasé ou 380V triphasé selon besoins communiqués), en conformité avec les normes NF C 15-100 ;</li>
    <li style="margin-bottom:5px">Communiquer au Prestataire, au plus tard <strong>5 jours ouvrés</strong> avant la prestation, toute contrainte technique, acoustique, d'accès ou réglementaire (copropriété, arrêté municipal, etc.) ;</li>
    <li style="margin-bottom:5px">Garantir un environnement sécurisé pour le personnel et le matériel du Prestataire tout au long de l'intervention ;</li>
    <li style="margin-bottom:5px">Régler les sommes dues aux échéances fixées à l'article 4 ;</li>
    <li>Être titulaire de toutes les autorisations administratives nécessaires à la tenue de l'événement (déclaration en préfecture, licence d'entrepreneur de spectacle, autorisation de voirie, etc.).</li>
  </ul>
</div>

<div class="art">
  <div class="art-title">Article 7 – Droit de retrait et suspension immédiate de la prestation</div>
  <p>Le Prestataire se réserve le droit de <strong>suspendre ou d'interrompre immédiatement</strong> la prestation, sans préavis et sans indemnité due au Client, dans les situations suivantes :</p>
  <ul style="margin-left:20px;margin-top:6px">
    <li style="margin-bottom:5px"><strong>Danger pour les personnes :</strong> comportement violent, menaçant, harcelant ou discriminatoire à l'encontre du personnel du Prestataire, de la part du Client, de ses représentants ou de tout tiers présent sur le lieu de la prestation ;</li>
    <li style="margin-bottom:5px"><strong>Conditions impropres à l'exercice :</strong> conditions climatiques extrêmes (intempéries, chaleur ou froid excessifs), environnement dégradé, accès rendu impossible ou dangereux, absence d'alimentation électrique conforme ;</li>
    <li style="margin-bottom:5px"><strong>Risque pour le matériel :</strong> exposition du matériel à un risque de dommage avéré (humidité excessive, vandalisme, manipulation non autorisée par des tiers) ;</li>
    <li style="margin-bottom:5px"><strong>Non-respect des obligations contractuelles :</strong> défaut de paiement du solde avant le début de l'installation, refus d'accès aux locaux, ou modification unilatérale des conditions de la prestation ;</li>
    <li>Tout autre situation dans laquelle la sécurité physique du personnel ou l'intégrité du matériel du Prestataire ne peut être garantie.</li>
  </ul>
  <p style="margin-top:8px">En cas d'interruption fondée sur l'un des motifs ci-dessus, l'intégralité du montant contractuel reste due. Si l'interruption intervient avant le début effectif de la prestation, l'acompte est définitivement acquis à titre d'indemnité forfaitaire.</p>
</div>

<div class="art">
  <div class="art-title">Article 8 – Annulation, modification et résiliation</div>
  <p>Toute demande d'annulation ou de modification substantielle doit être adressée par écrit (courriel avec accusé de réception ou lettre recommandée avec AR).</p>
  <p style="margin-top:8px"><strong>Annulation à l'initiative du Client :</strong></p>
  <ul style="margin-left:20px;margin-top:4px">
    <li>Plus de 30 jours avant la prestation : remboursement de l'acompte sous déduction des frais engagés justifiés ;</li>
    <li>Entre 15 et 30 jours : retenue de 50 % du montant total TTC ;</li>
    <li>Entre 8 et 14 jours : retenue de 75 % du montant total TTC ;</li>
    <li>Moins de 8 jours ou le jour même : facturation de la totalité du montant contractuel.</li>
  </ul>
  <p style="margin-top:8px"><strong>Modification à l'initiative du Client :</strong> toute modification du programme, de la durée ou de la configuration technique demandée moins de 72 heures avant la prestation sera facturée en sus selon la grille tarifaire en vigueur.</p>
  <p style="margin-top:8px"><strong>Résiliation par le Prestataire :</strong> le Prestataire peut résilier le contrat de plein droit, par notification écrite, en cas de non-paiement de l'acompte dans les 8 jours suivant la signature, ou de manquement grave et non remédié du Client à ses obligations.</p>
</div>

<div class="art">
  <div class="art-title">Article 9 – Dégradations et responsabilité du matériel</div>
  <p>Tout matériel mis à disposition par le Prestataire reste sa propriété exclusive. Le Client est responsable de tout dommage causé au matériel du fait de son personnel, de ses invités ou de tiers présents lors de l'événement. Les dégradations sont classifiées comme suit :</p>
  <ul style="margin-left:20px;margin-top:8px">
    <li style="margin-bottom:6px"><strong>Dégradation mineure</strong> (rayures, salissures, usure anormale, accessoires manquants) : facturation du coût réel de remise en état, selon la grille tarifaire en vigueur, minimum 30 € ;</li>
    <li style="margin-bottom:6px"><strong>Dégradation moyenne</strong> (choc entraînant un dysfonctionnement partiel, détérioration d'un composant remplaçable, dommage esthétique significatif) : facturation du coût de réparation ou de remplacement de la pièce endommagée, selon la grille tarifaire en vigueur ;</li>
    <li><strong>Dégradation majeure</strong> (destruction totale ou partielle, dommage irréparable rendant l'équipement inutilisable, perte) : facturation de la valeur de remplacement à neuf de l'équipement, telle qu'indiquée dans la grille tarifaire officielle de ${data.assoc.name||"l'Association"} en vigueur à la date du sinistre.</li>
  </ul>
  <p style="margin-top:8px">Un état des lieux contradictoire du matériel pourra être réalisé en début et en fin de prestation. En l'absence de réserves formulées par écrit à la restitution du matériel, l'état du matériel sera réputé conforme.</p>
  <p style="margin-top:6px">Il est fortement recommandé au Client de souscrire une assurance responsabilité civile couvrant les dommages causés aux équipements de tiers lors de l'événement.</p>
</div>

<div class="art">
  <div class="art-title">Article 10 – Responsabilité du Prestataire</div>
  <p>Le Prestataire est tenu à une <strong>obligation de moyens</strong>. Sa responsabilité ne saurait être engagée en cas de :</p>
  <ul style="margin-left:20px;margin-top:6px">
    <li>Dommages indirects, immatériels, ou préjudices consécutifs (perte d'exploitation, atteinte à l'image, manque à gagner) ;</li>
    <li>Défaillance technique due à une cause extérieure (coupure de courant, surtension, acte de vandalisme d'un tiers) ;</li>
    <li>Manquements résultant d'informations inexactes ou incomplètes transmises par le Client ;</li>
    <li>Impossibilité d'exécution résultant du comportement du Client ou de tiers.</li>
  </ul>
  <p style="margin-top:8px">En tout état de cause, la responsabilité totale du Prestataire est plafonnée au montant HT de la prestation concernée. Le Client est seul responsable de l'obtention des autorisations administratives et réglementaires nécessaires à la tenue de son événement.</p>
</div>

<div class="art">
  <div class="art-title">Article 11 – Force majeure</div>
  <p>Aucune des Parties ne pourra être tenue responsable de l'inexécution de ses obligations contractuelles si celle-ci est due à un cas de force majeure au sens de l'article 1218 du Code civil (catastrophe naturelle, incendie, inondation, épidémie, acte terroriste, décision gouvernementale ou administrative imprévisible, grève générale des transports, etc.).</p>
  <p style="margin-top:6px">La Partie empêchée devra notifier l'autre Partie dans un délai de <strong>48 heures</strong> par tout moyen écrit. Si la force majeure persiste au-delà de 15 jours, chaque Partie pourra résoudre le contrat par notification écrite, sans indemnité, sous réserve du remboursement des sommes déjà versées déduction faite des frais engagés et dûment justifiés.</p>
</div>

<div class="art">
  <div class="art-title">Article 12 – Propriété intellectuelle et droits voisins</div>
  <p>Toute captation sonore, photographique ou audiovisuelle de la prestation ou du matériel du Prestataire est soumise à autorisation préalable écrite de ce dernier. Le Client s'engage à respecter les droits des organismes de gestion collective (SACEM, SACD, SPEDIDAM, ADAMI) pour toute diffusion d'œuvres protégées lors de l'événement, et à effectuer les déclarations et versements correspondants.</p>
</div>

<div class="art">
  <div class="art-title">Article 13 – Protection des données personnelles</div>
  <p>Les données personnelles collectées dans le cadre du présent contrat sont traitées par ${data.assoc.name||"l'Association"} pour la seule gestion de la relation contractuelle, conformément au Règlement Général sur la Protection des Données (RGPD – Règlement UE 2016/679). Elles ne sont ni cédées ni revendues à des tiers. Le Client dispose d'un droit d'accès, de rectification et de suppression en adressant sa demande à ${data.assoc.email||"l'Association"}.</p>
</div>

<div class="art">
  <div class="art-title">Article 14 – Loi applicable et règlement des litiges</div>
  <p>Le présent contrat est soumis au droit français. En cas de litige, les Parties s'engagent à rechercher une solution amiable dans un délai de <strong>30 jours</strong> à compter de la notification écrite du différend. À défaut d'accord amiable dans ce délai, le litige sera porté devant les juridictions compétentes du ressort du siège social du Prestataire, auxquelles les Parties font expressément attribution de compétence.</p>
</div>

<div class="art">
  <div class="art-title">Article 15 – Dispositions générales</div>
  <p>Le présent contrat constitue l'intégralité de l'accord entre les Parties et annule tout accord, devis, courrier ou engagement oral antérieur portant sur le même objet. Toute modification devra faire l'objet d'un avenant écrit, signé des deux Parties. La nullité éventuelle d'une clause n'affecte pas la validité des autres stipulations. Le fait pour l'une des Parties de ne pas se prévaloir d'un manquement de l'autre ne saurait valoir renonciation à s'en prévaloir à l'avenir.</p>
</div>

<div class="sig-block">
  <div class="sig-col">
    <div class="sig-label"><strong>Pour le Prestataire</strong><br>${data.assoc.name||"L'Association"}<br><span style="color:#888">Nom, qualité et signature</span></div>
    <div style="margin-top:8px;color:#888;font-size:11px">Précédé de la mention manuscrite « Lu et approuvé »</div>
    <div class="sig-line"></div>
    <div style="margin-top:6px;color:#888;font-size:11px">Fait à _______________________, le ${today_str}</div>
  </div>
  <div class="sig-col">
    <div class="sig-label"><strong>Pour le Client</strong><br>${p.client?.name||"Le Client"}<br><span style="color:#888">Nom, qualité et signature</span></div>
    <div style="margin-top:8px;color:#888;font-size:11px">Précédé de la mention manuscrite « Lu et approuvé »</div>
    <div class="sig-line"></div>
    <div style="margin-top:6px;color:#888;font-size:11px">Fait à _______________________, le</div>
  </div>
</div>
<p style="text-align:center;font-size:11px;color:#aaa;margin-top:20px">Contrat établi en deux (2) exemplaires originaux, dont un remis à chaque Partie.</p>

<footer><span>${data.assoc.name||"Association"} — ${data.assoc.siret ? "SIRET "+data.assoc.siret : "Association loi 1901"}</span><span>Document généré le ${today_str}</span></footer>
</body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); w.onload = () => w.print();
  };

  const printRoadmap = () => {
    const tr = p.transport || {};
    const vehicles = tr.vehicles || [];
    const stops = tr.stops || [];
    const retourStopsDoc = tr.retourStops || [];
    const today_str = new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" });
    const assocName = data.assoc?.name || "Association";
    const fuelCost = (() => {
      const km = parseFloat(tr.distanceKm)||0;
      const conso = parseFloat(tr.fuelConso)||0;
      const prixL = parseFloat(tr.fuelPrice)||0;
      return km > 0 && conso > 0 && prixL > 0 ? Math.round(km * conso / 100 * prixL * 100) / 100 : 0;
    })();
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Feuille de route — ${p.label}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#111;background:#fff;padding:28px}
h1{font-size:22px;font-weight:800;margin-bottom:4px}h2{font-size:15px;font-weight:700;margin:20px 0 10px;border-bottom:2px solid #9d6fe8;padding-bottom:4px;color:#9d6fe8}
.meta{color:#555;font-size:12px;margin-bottom:20px}.section{margin-bottom:20px}
table{width:100%;border-collapse:collapse;margin-bottom:12px}th{background:#9d6fe8;color:#fff;padding:7px 10px;text-align:left;font-size:12px}
td{padding:6px 10px;border-bottom:1px solid #eee;font-size:12px}.label{color:#666;font-size:11px;display:block;margin-bottom:2px}
.stop-row{display:flex;gap:16px;align-items:flex-start;padding:8px 0;border-bottom:1px solid #eee}
.stop-icon{width:28px;height:28px;border-radius:50%;background:#9d6fe8;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0}
.stop-icon.start{background:#4affa0;color:#111}.stop-icon.end{background:#ff4d72;color:#fff}
.vehicle-card{border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:10px}
.vh{font-weight:700;font-size:13px;margin-bottom:6px}.tag{display:inline-block;background:#f0eaff;color:#7040b0;border-radius:4px;padding:2px 7px;font-size:11px;margin:2px}
.info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.info-box{border:1px solid #eee;border-radius:6px;padding:8px;text-align:center}.info-val{font-size:18px;font-weight:700;color:#9d6fe8}.info-lbl{font-size:11px;color:#666}
footer{margin-top:28px;padding-top:10px;border-top:1px solid #ddd;display:flex;justify-content:space-between;font-size:11px;color:#888}
@media print{body{padding:14px}}
</style></head><body>
<h1>Feuille de route — ${p.label}</h1>
<div class="meta">${assocName} · ${(p.dateStart||p.date)||""}${p.timeStart ? " "+p.timeStart : ""}${p.dateEnd && p.dateEnd !== (p.dateStart||p.date) ? " → "+p.dateEnd+(p.timeEnd?" "+p.timeEnd:"") : ""}</div>

${tr.distanceKm || tr.fuelConso || tr.fuelPrice || tr.tolls ? `<div class="info-grid">
  ${tr.distanceKm ? `<div class="info-box"><div class="info-val">${tr.distanceKm} km</div><div class="info-lbl">Distance totale</div></div>` : ""}
  ${fuelCost > 0 ? `<div class="info-box"><div class="info-val">${fuelCost.toFixed(2)} €</div><div class="info-lbl">Carburant estimé</div></div>` : ""}
  ${tr.tolls ? `<div class="info-box"><div class="info-val">${parseFloat(tr.tolls).toFixed(2)} €</div><div class="info-lbl">Péages estimés</div></div>` : ""}
</div>` : ""}

<h2>Itinéraire</h2>
<div class="section">
  ${tr.departAddress || tr.departTime ? `<div class="stop-row">
    <div class="stop-icon start">⬆</div>
    <div><strong>Départ</strong>${tr.departTime ? ` — ${tr.departTime}` : ""}${tr.departDate ? ` (${tr.departDate})` : ""}<br/><span style="color:#555">${tr.departAddress||"Adresse non précisée"}</span></div>
  </div>` : ""}
  ${stops.map((s, i) => `<div class="stop-row">
    <div class="stop-icon">${i+1}</div>
    <div><strong>${s.label||"Arrêt "+(i+1)}</strong>${s.time ? ` — ${s.time}` : ""}<br/><span style="color:#555">${s.address||""}</span></div>
  </div>`).join("")}
  ${tr.arrivalAddress || tr.arrivalTime ? `<div class="stop-row">
    <div class="stop-icon end">⬇</div>
    <div><strong>Arrivée</strong>${tr.arrivalTime ? ` — ${tr.arrivalTime}` : ""}${tr.arrivalDate ? ` (${tr.arrivalDate})` : ""}<br/><span style="color:#555">${tr.arrivalAddress||"Adresse non précisée"}</span></div>
  </div>` : ""}
</div>
${(tr.retourDepartAddress || tr.retourDepartTime || retourStopsDoc.length > 0 || tr.retourArrivalAddress) ? `<h2>Retour</h2>
<div class="section">
  ${tr.retourDepartAddress || tr.retourDepartTime ? `<div class="stop-row">
    <div class="stop-icon end">⬆</div>
    <div><strong>Départ retour</strong>${tr.retourDepartTime ? ` — ${tr.retourDepartTime}` : ""}${tr.retourDepartDate ? ` (${tr.retourDepartDate})` : ""}<br/><span style="color:#555">${tr.retourDepartAddress||tr.arrivalAddress||"Adresse non précisée"}</span></div>
  </div>` : ""}
  ${retourStopsDoc.map((s, i) => `<div class="stop-row">
    <div class="stop-icon">${i+1}</div>
    <div><strong>${s.label||"Arrêt "+(i+1)}</strong>${s.time ? ` — ${s.time}` : ""}<br/><span style="color:#555">${s.address||""}</span></div>
  </div>`).join("")}
  ${tr.retourArrivalAddress || tr.retourArrivalTime ? `<div class="stop-row">
    <div class="stop-icon start">⬇</div>
    <div><strong>Arrivée retour</strong>${tr.retourArrivalTime ? ` — ${tr.retourArrivalTime}` : ""}${tr.retourArrivalDate ? ` (${tr.retourArrivalDate})` : ""}<br/><span style="color:#555">${tr.retourArrivalAddress||tr.departAddress||"Adresse non précisée"}</span></div>
  </div>` : ""}
</div>` : ""}

${vehicles.length > 0 ? `<h2>Véhicules (${vehicles.length})</h2>
${vehicles.map(v => `<div class="vehicle-card">
  <div class="vh">${v.type||"Véhicule"} — ${v.label||"Sans nom"}${v.driver ? ` · Conducteur : ${v.driver}` : ""}</div>
  ${v.team && v.team.length > 0 ? `<div>${v.team.map(m => `<span class="tag">${m}</span>`).join("")}</div>` : "<div style='color:#888;font-size:12px'>Aucun membre assigné</div>"}
</div>`).join("")}` : ""}

${tr.notes ? `<h2>Notes</h2><p style="color:#444;font-size:13px">${tr.notes}</p>` : ""}

<footer><span>${assocName}</span><span>Généré le ${today_str}</span></footer>
</body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); w.onload = () => w.print();
  };

  const printTransportDevis = () => {
    const tr = p.transport || {};
    const vehicles = tr.vehicles || [];
    const today_str = new Date().toLocaleDateString("fr-FR", { day:"2-digit", month:"long", year:"numeric" });
    const assocName = data.assoc?.name || "Association";
    const km = parseFloat(tr.distanceKm)||0;
    const conso = parseFloat(tr.fuelConso)||0;
    const prixL = parseFloat(tr.fuelPrice)||0;
    const fuelCost = km > 0 && conso > 0 && prixL > 0 ? Math.round(km * conso / 100 * prixL * 100) / 100 : 0;
    const tolls = parseFloat(tr.tolls)||0;
    const rkm = parseFloat(tr.retourDistanceKm)||0;
    const rconso = parseFloat(tr.retourFuelConso)||0;
    const rprixL = parseFloat(tr.retourFuelPrice)||0;
    const retourFuelCostDoc = rkm > 0 && rconso > 0 && rprixL > 0 ? Math.round(rkm * rconso / 100 * rprixL * 100) / 100 : 0;
    const retourTollsDoc = parseFloat(tr.retourTolls)||0;
    const extraLines = tr.extraLines || [];
    const subtotal = fuelCost + tolls + retourFuelCostDoc + retourTollsDoc + extraLines.reduce((a, l) => a + (parseFloat(l.amount)||0), 0);
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Devis transport — ${p.label}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'DM Sans',Arial,sans-serif;font-size:13px;color:#111;background:#fff;padding:28px}
h1{font-size:22px;font-weight:800;margin-bottom:4px}
.meta{color:#555;font-size:12px;margin-bottom:24px}
table{width:100%;border-collapse:collapse;margin-bottom:20px}
th{background:#9d6fe8;color:#fff;padding:8px 12px;text-align:left;font-size:12px}
td{padding:8px 12px;border-bottom:1px solid #eee;font-size:13px}
td.right{text-align:right}.total-row td{font-weight:700;font-size:15px;border-top:2px solid #9d6fe8;background:#f8f5ff}
.section-title{font-weight:700;font-size:14px;color:#9d6fe8;margin:18px 0 8px}
.trip-header td{background:#f3eeff;font-weight:700;font-size:12px;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px}
.info-row{display:flex;gap:40px;margin-bottom:16px;flex-wrap:wrap}
.info-block{flex:1;min-width:200px}.info-label{font-size:11px;color:#888;margin-bottom:2px}.info-val{font-size:13px;font-weight:600}
footer{margin-top:28px;padding-top:10px;border-top:1px solid #ddd;display:flex;justify-content:space-between;font-size:11px;color:#888}
@media print{body{padding:14px}}
</style></head><body>
<h1>Devis transport — ${p.label}</h1>
<div class="meta">${assocName} · Prestation du ${(p.dateStart||p.date)||""}</div>

<div class="info-row">
  ${tr.departAddress ? `<div class="info-block"><div class="info-label">Départ aller</div><div class="info-val">${tr.departAddress}</div></div>` : ""}
  ${tr.arrivalAddress ? `<div class="info-block"><div class="info-label">Arrivée aller</div><div class="info-val">${tr.arrivalAddress}</div></div>` : ""}
  ${km > 0 ? `<div class="info-block"><div class="info-label">Distance aller</div><div class="info-val">${km} km</div></div>` : ""}
  ${rkm > 0 ? `<div class="info-block"><div class="info-label">Distance retour</div><div class="info-val">${rkm} km</div></div>` : ""}
  ${vehicles.length > 0 ? `<div class="info-block"><div class="info-label">Véhicules</div><div class="info-val">${vehicles.length}</div></div>` : ""}
</div>

<table>
  <tr><th>Désignation</th><th style="text-align:right">Détail</th><th style="text-align:right">Montant</th></tr>
  ${(fuelCost > 0 || tolls > 0) ? `<tr class="trip-header"><td colspan="3">Aller</td></tr>` : ""}
  ${fuelCost > 0 ? `<tr><td>Carburant aller (${km} km × ${conso} L/100 × ${prixL} €/L${vehicles.length > 1 ? " × "+vehicles.length+" véh." : ""})</td><td class="right">${(km*conso/100).toFixed(2)} L</td><td class="right">${fuelCost.toFixed(2)} €</td></tr>` : ""}
  ${tolls > 0 ? `<tr><td>Péages aller</td><td class="right">—</td><td class="right">${tolls.toFixed(2)} €</td></tr>` : ""}
  ${(retourFuelCostDoc > 0 || retourTollsDoc > 0) ? `<tr class="trip-header"><td colspan="3">Retour</td></tr>` : ""}
  ${retourFuelCostDoc > 0 ? `<tr><td>Carburant retour (${rkm} km × ${rconso} L/100 × ${rprixL} €/L${vehicles.length > 1 ? " × "+vehicles.length+" véh." : ""})</td><td class="right">${(rkm*rconso/100).toFixed(2)} L</td><td class="right">${retourFuelCostDoc.toFixed(2)} €</td></tr>` : ""}
  ${retourTollsDoc > 0 ? `<tr><td>Péages retour</td><td class="right">—</td><td class="right">${retourTollsDoc.toFixed(2)} €</td></tr>` : ""}
  ${extraLines.length > 0 ? `<tr class="trip-header"><td colspan="3">Frais supplémentaires</td></tr>` : ""}
  ${extraLines.map(l => `<tr><td>${l.label||"Ligne supplémentaire"}</td><td class="right">—</td><td class="right">${(parseFloat(l.amount)||0).toFixed(2)} €</td></tr>`).join("")}
  <tr class="total-row"><td colspan="2">Total transport HT</td><td class="right">${subtotal.toFixed(2)} €</td></tr>
</table>

${vehicles.length > 0 ? `<div class="section-title">Répartition des équipes</div>
<table>
  <tr><th>Véhicule</th><th>Type</th><th>Conducteur</th><th>Équipe</th></tr>
  ${vehicles.map(v => `<tr><td>${v.label||"Véhicule"}</td><td>${v.type||"—"}</td><td>${v.driver||"—"}</td><td>${(v.team||[]).join(", ")||"—"}</td></tr>`).join("")}
</table>` : ""}

<p style="font-size:11px;color:#888;margin-top:10px">Devis établi le ${today_str} — valable 30 jours.</p>
<footer><span>${assocName}</span><span>Généré le ${today_str}</span></footer>
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
    { id: "split",     label: "Partage" },
    { id: "docs",      label: "Documents" },
    { id: "transport", label: "Transport" },
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
          <p style={{ color: C.muted, fontSize: "13px" }}>
            {(p.dateStart||p.date)}{p.timeStart ? ` ${p.timeStart}` : ""}
            {(p.dateEnd && p.dateEnd !== (p.dateStart||p.date)) || p.timeEnd ? ` → ${p.dateEnd||""}${p.timeEnd ? ` ${p.timeEnd}` : ""}` : ""}
            {prestDuration ? <span style={{ color: C.info }}> · {prestDuration}</span> : ""}
            {p.client?.name ? ` · ${p.client.name}` : ""}
          </p>
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
          ...(calcTrTotal > 0 ? [{ label: "Transport", value: fmt(calcTrTotal), color: "#a78bfa" }] : []),
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
          {/* Période */}
          <div style={s.card()}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "12px" }}>Période & Lieu</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
              <div><label style={s.label}>Date début</label><input type="date" style={s.inp()} value={p.dateStart||p.date||""} onChange={e => upd({ dateStart: e.target.value, date: e.target.value })} /></div>
              <div><label style={s.label}>Heure début</label><input type="time" style={s.inp()} value={p.timeStart||""} onChange={e => upd({ timeStart: e.target.value })} /></div>
              <div><label style={s.label}>Date fin</label><input type="date" style={s.inp()} value={p.dateEnd||p.date||""} onChange={e => upd({ dateEnd: e.target.value })} /></div>
              <div><label style={s.label}>Heure fin</label><input type="time" style={s.inp()} value={p.timeEnd||""} onChange={e => upd({ timeEnd: e.target.value })} /></div>
            </div>
            <div style={{ marginBottom: "12px" }}>
              <label style={s.label}>Lieu de la prestation</label>
              <input style={s.inp()} value={p.location||""} onChange={e => upd({ location: e.target.value })} placeholder="Ex : Salle des fêtes, 12 rue de la Paix, Lyon" />
            </div>
            {prestDuration && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: `${C.info}12`, borderRadius: "8px", border: `1px solid ${C.info}30` }}>
                <span style={{ fontSize: "13px", color: C.info }}>Durée : <strong>{prestDuration}</strong></span>
                <button style={{ ...s.btn("ghost"), fontSize: "11px", padding: "3px 10px" }}
                  onClick={() => upd({ gear: (p.gear||[]).map(g => ({ ...g, days: prestDays })) })}>
                  Appliquer aux {(p.gear||[]).length} article{(p.gear||[]).length>1?"s":""}
                </button>
              </div>
            )}
          </div>
          <div style={s.card()}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "12px" }}>Récapitulatif</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
              {(p.gear||[]).length > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.muted }}>Matériel ({p.gear.length} articles)</span><span style={{ fontFamily: C.mono, color: C.warn }}>{fmt(gearTotal)}</span></div>}
              {(p.services||[]).length > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.muted }}>Services ({p.services.length} lignes)</span><span style={{ fontFamily: C.mono, color: C.info }}>{fmt(svcTotal)}</span></div>}
              {calcTrTotal > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.muted }}>Transport</span><span style={{ fontFamily: C.mono, color: "#a78bfa" }}>{fmt(calcTrTotal)}</span></div>}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: "600", marginBottom: p.customPrice != null ? "8px" : "0" }}>
                  <div>
                    <span>Total HT</span>
                    {p.customPrice != null && <span style={{ fontSize: "11px", color: C.warn, marginLeft: "8px", fontWeight: "400" }}>prix libre (calculé : {fmt(calcTotal)})</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontFamily: C.mono, color: C.accent }}>{fmt(total)}</span>
                    <button style={{ ...s.btn("ghost"), fontSize: "10px", padding: "2px 7px", color: p.customPrice != null ? C.warn : C.muted }}
                      onClick={() => upd({ customPrice: p.customPrice != null ? null : calcTotal })}>
                      {p.customPrice != null ? "✕" : "Prix libre"}
                    </button>
                  </div>
                </div>
                {p.customPrice != null && (
                  <input type="number" style={{ ...s.inp(), fontFamily: C.mono, fontSize: "15px", marginBottom: "6px" }} min="0" step="0.01"
                    value={p.customPrice} onChange={e => upd({ customPrice: parseFloat(e.target.value) || 0 })} />
                )}
              </div>
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
          {/* Depuis le pool */}
          {pool.length > 0 && (
            <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 2, minWidth: "120px" }}>
                <label style={s.label}>Ajouter un membre</label>
                <select style={s.inp()} value={teamName} onChange={e => setTeamName(e.target.value)}>
                  <option value="">— Choisir dans le pool —</option>
                  {pool.filter(p2 => !(p.team||[]).find(m => m.name === p2.name)).map(p2 => <option key={p2.name} value={p2.name}>{p2.name}</option>)}
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
        <>
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
                  {(data.catalog||[]).map(c => <option key={c.id} value={c.id}>{c.name} {c.priceMode === "%" ? `(${c.unitPrice}% du total)` : `(${fmt(c.unitPrice)}${c.unit ? " / "+c.unit : ""})`}</option>)}
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
                  <div>
                    <span style={{ fontWeight: "500" }}>{sv.label}</span>
                    {sv.priceMode === "%" ? <span style={{ color: C.muted, fontSize: "12px" }}> · {sv.pct}% du sous-total</span> : <span style={{ color: C.muted, fontSize: "12px" }}> × {sv.qty}{sv.unit ? " / "+sv.unit : ""} à {fmt(sv.unitPrice)}</span>}
                  </div>
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

        {/* ── Aperçu facture ── */}
        {((p.gear||[]).length > 0 || (p.services||[]).length > 0 || calcTrTotal > 0) && (
          <div style={{ ...s.card(), marginTop: "16px", borderColor: C.accent + "40" }}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px", color: C.accent }}>Aperçu de la facture</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Désignation","Qté","P.U. HT","Total HT"].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: h === "Désignation" ? "left" : "right", color: C.muted, fontWeight: "600", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(p.gear||[]).length > 0 && <tr><td colSpan="4" style={{ padding: "8px 10px 2px", color: C.warn, fontWeight: "600", fontSize: "11px", textTransform: "uppercase" }}>Matériel</td></tr>}
                {(p.gear||[]).map(g => (
                  <tr key={g.id} style={{ borderBottom: `1px solid ${C.border}30` }}>
                    <td style={{ padding: "6px 10px" }}>{g.itemName}<span style={{ color: C.muted, fontSize: "11px" }}> · {g.days} j</span></td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: C.mono }}>{g.qty}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: C.mono }}>{fmt(g.unitPrice)}{g.priceType}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: C.mono, color: C.warn }}>{fmt(g.qty * g.unitPrice * g.days)}</td>
                  </tr>
                ))}
                {(p.gear||[]).length > 0 && (
                  <tr><td colSpan="3" style={{ padding: "4px 10px", textAlign: "right", color: C.muted, fontSize: "12px" }}>Sous-total matériel</td><td style={{ padding: "4px 10px", textAlign: "right", fontFamily: C.mono, color: C.warn, fontWeight: "600" }}>{fmt(gearTotal)}</td></tr>
                )}
                {(p.services||[]).length > 0 && <tr><td colSpan="4" style={{ padding: "8px 10px 2px", color: C.info, fontWeight: "600", fontSize: "11px", textTransform: "uppercase" }}>Services</td></tr>}
                {(p.services||[]).map(sv => (
                  <tr key={sv.id} style={{ borderBottom: `1px solid ${C.border}30` }}>
                    <td style={{ padding: "6px 10px" }}>{sv.label}{sv.priceMode === "%" && <span style={{ color: C.muted, fontSize: "11px" }}> · {sv.pct}% du sous-total</span>}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: C.mono }}>{sv.priceMode === "%" ? "—" : sv.qty}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: C.mono }}>{sv.priceMode === "%" ? `${sv.pct}%` : fmt(sv.unitPrice)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: C.mono, color: C.info }}>{fmt(sv.qty * sv.unitPrice)}</td>
                  </tr>
                ))}
                {(p.services||[]).length > 0 && (
                  <tr><td colSpan="3" style={{ padding: "4px 10px", textAlign: "right", color: C.muted, fontSize: "12px" }}>Sous-total services</td><td style={{ padding: "4px 10px", textAlign: "right", fontFamily: C.mono, color: C.info, fontWeight: "600" }}>{fmt(svcTotal)}</td></tr>
                )}
                {calcTrTotal > 0 && (() => {
                  const tr2 = p.transport || {};
                  const km2 = parseFloat(tr2.distanceKm)||0, conso2 = parseFloat(tr2.fuelConso)||0, prixL2 = parseFloat(tr2.fuelPrice)||0;
                  const allerFuel2 = km2 > 0 && conso2 > 0 && prixL2 > 0 ? Math.round(km2*conso2/100*prixL2*100)/100 : 0;
                  const rkm2 = parseFloat(tr2.retourDistanceKm)||0, rconso2 = parseFloat(tr2.retourFuelConso)||0, rprixL2 = parseFloat(tr2.retourFuelPrice)||0;
                  const retourFuel2 = rkm2 > 0 && rconso2 > 0 && rprixL2 > 0 ? Math.round(rkm2*rconso2/100*rprixL2*100)/100 : 0;
                  const allerTotal2 = allerFuel2 + (parseFloat(tr2.tolls)||0);
                  const retourTotal2 = retourFuel2 + (parseFloat(tr2.retourTolls)||0);
                  const extraLines2 = tr2.extraLines||[];
                  return (<>
                    <tr><td colSpan="4" style={{ padding: "8px 10px 2px", color: "#a78bfa", fontWeight: "600", fontSize: "11px", textTransform: "uppercase" }}>Transport</td></tr>
                    {allerTotal2 > 0 && <tr style={{ borderBottom: `1px solid ${C.border}30` }}><td style={{ padding: "6px 10px" }}>Transport aller{km2 > 0 ? ` — ${km2} km` : ""}</td><td style={{ padding: "6px 10px", textAlign: "right", fontFamily: C.mono }}>1</td><td style={{ padding: "6px 10px", textAlign: "right", fontFamily: C.mono }}>—</td><td style={{ padding: "6px 10px", textAlign: "right", fontFamily: C.mono, color: "#a78bfa" }}>{fmt(allerTotal2)}</td></tr>}
                    {retourTotal2 > 0 && <tr style={{ borderBottom: `1px solid ${C.border}30` }}><td style={{ padding: "6px 10px" }}>Transport retour{rkm2 > 0 ? ` — ${rkm2} km` : ""}</td><td style={{ padding: "6px 10px", textAlign: "right", fontFamily: C.mono }}>1</td><td style={{ padding: "6px 10px", textAlign: "right", fontFamily: C.mono }}>—</td><td style={{ padding: "6px 10px", textAlign: "right", fontFamily: C.mono, color: "#a78bfa" }}>{fmt(retourTotal2)}</td></tr>}
                    {extraLines2.filter(l=>parseFloat(l.amount)>0).map(l => <tr key={l.id} style={{ borderBottom: `1px solid ${C.border}30` }}><td style={{ padding: "6px 10px" }}>{l.label||"Frais transport"}</td><td style={{ padding: "6px 10px", textAlign: "right", fontFamily: C.mono }}>1</td><td style={{ padding: "6px 10px", textAlign: "right", fontFamily: C.mono }}>—</td><td style={{ padding: "6px 10px", textAlign: "right", fontFamily: C.mono, color: "#a78bfa" }}>{fmt(parseFloat(l.amount))}</td></tr>)}
                    <tr><td colSpan="3" style={{ padding: "4px 10px", textAlign: "right", color: C.muted, fontSize: "12px" }}>Sous-total transport</td><td style={{ padding: "4px 10px", textAlign: "right", fontFamily: C.mono, color: "#a78bfa", fontWeight: "600" }}>{fmt(calcTrTotal)}</td></tr>
                  </>);
                })()}
                <tr style={{ borderTop: `2px solid ${C.border}` }}>
                  <td colSpan="3" style={{ padding: "10px", textAlign: "right", fontWeight: "700" }}>TOTAL HT</td>
                  <td style={{ padding: "10px", textAlign: "right", fontFamily: C.mono, color: C.accent, fontWeight: "700", fontSize: "15px" }}>{fmt(total)}</td>
                </tr>
                <tr>
                  <td colSpan="3" style={{ padding: "4px 10px", textAlign: "right", color: C.muted, fontSize: "12px" }}>TVA (0 %)</td>
                  <td style={{ padding: "4px 10px", textAlign: "right", fontFamily: C.mono, color: C.muted }}>0,00 €</td>
                </tr>
                <tr style={{ borderTop: `1px solid ${C.border}` }}>
                  <td colSpan="3" style={{ padding: "8px 10px", textAlign: "right", fontWeight: "700" }}>TOTAL TTC</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: C.mono, color: C.accent, fontWeight: "700" }}>{fmt(total)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ color: C.muted, fontSize: "11px", marginTop: "8px", textAlign: "right" }}>TVA non applicable — art. 293B du CGI</div>
          </div>
        )}
        </>
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
                <option value="Banque">Banque</option>
                {pool.map(p2 => <option key={p2.name} value={p2.name}>{p2.name}</option>)}
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

      {/* ── Partage ── */}
      {tab === "split" && (() => {
        const members = (p.team||[]).length > 0
          ? (p.team||[]).map(m => ({ id: m.id, name: m.name }))
          : (p.splitMembers||[]);
        const allMembers = (p.splitMembers||[]).length > 0 ? (p.splitMembers||[]) : members;

        const expenses = p.expenses||[];
        const settled = p.settledTransfers||[];
        const perPerson = allMembers.length > 0 && expTotal > 0 ? expTotal / allMembers.length : 0;
        const paidMap = {};
        expenses.forEach(ex => { if (ex.paidBy) paidMap[ex.paidBy] = (paidMap[ex.paidBy]||0) + ex.amount; });
        const balances = allMembers.map(m => ({ name: m.name, paid: paidMap[m.name]||0, share: perPerson, balance: (paidMap[m.name]||0) - perPerson }));
        const allTransfers = computeMinimalTransfers(allMembers, expenses, [], 0);
        const isSettled = (t) => settled.find(s => s.from === t.from && s.to === t.to);
        const settleT = (t) => upd({ settledTransfers: [...settled, { id: uid(), from: t.from, to: t.to, amount: t.amount, settledAt: today() }] });
        const unsettle = (t) => upd({ settledTransfers: settled.filter(s => !(s.from === t.from && s.to === t.to)) });
        const doneCount = allTransfers.filter(t => !!isSettled(t)).length;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

            {/* Membres supplémentaires (si pas dans l'équipe) */}
            {(p.team||[]).length === 0 && (
              <div style={s.card()}>
                <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "12px" }}>Membres du partage</div>
                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                  <input style={s.inp({ flex: 1 })} placeholder="Nom…"
                    value={p._splitNmTmp||""}
                    onChange={e => upd({ _splitNmTmp: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === "Enter" && (p._splitNmTmp||"").trim()) {
                        const nm = p._splitNmTmp.trim();
                        if (!(p.splitMembers||[]).find(m => m.name === nm))
                          upd({ splitMembers: [...(p.splitMembers||[]), { id: uid(), name: nm }], _splitNmTmp: "" });
                      }
                    }}
                  />
                  <button style={s.btn("primary")} onClick={() => {
                    const nm = (p._splitNmTmp||"").trim();
                    if (!nm || (p.splitMembers||[]).find(m => m.name === nm)) return;
                    upd({ splitMembers: [...(p.splitMembers||[]), { id: uid(), name: nm }], _splitNmTmp: "" });
                  }}>+ Ajouter</button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {(p.splitMembers||[]).map(m => (
                    <span key={m.id} style={{ background: C.card2, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "4px 12px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
                      {m.name}
                      <button onClick={() => upd({ splitMembers: (p.splitMembers||[]).filter(x => x.id !== m.id) })} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "12px", padding: 0 }}>✕</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(p.team||[]).length > 0 && (
              <div style={{ padding: "10px 14px", background: `${C.info}10`, border: `1px solid ${C.info}25`, borderRadius: "8px", fontSize: "12px", color: C.info }}>
                Membres basés sur l'équipe ({(p.team||[]).length} pers.) — modifie l'onglet Équipe pour changer les membres.
              </div>
            )}

            {allMembers.length === 0 && (
              <p style={{ color: C.muted, fontSize: "13px" }}>Ajoute des membres via l'onglet Équipe pour commencer le partage.</p>
            )}

            {allMembers.length > 0 && expenses.length === 0 && (
              <p style={{ color: C.muted, fontSize: "13px" }}>Aucune dépense à partager — ajoute des dépenses dans l'onglet Dépenses.</p>
            )}

            {/* Tableau de répartition */}
            {allMembers.length > 0 && expenses.length > 0 && (
              <div style={s.card()}>
                <div style={{ fontFamily: C.display, fontWeight: "700", marginBottom: "14px" }}>Répartition</div>
                <div style={{ padding: "10px 14px", background: C.card2, borderRadius: "8px", marginBottom: "14px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ color: C.muted, fontSize: "13px" }}>Total dépenses : <strong style={{ color: C.warn, fontFamily: C.mono }}>{fmt(expTotal)}</strong></span>
                  <span style={{ color: C.muted, fontSize: "13px" }}>Part / personne ({allMembers.length}) : <strong style={{ color: C.accent, fontFamily: C.mono }}>{fmt(perPerson)}</strong></span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {balances.map(b => (
                    <div key={b.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: C.card2, borderRadius: "8px", flexWrap: "wrap", gap: "6px" }}>
                      <strong style={{ fontSize: "13px" }}>{b.name}</strong>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ color: C.muted, fontSize: "12px" }}>Payé : <span style={{ fontFamily: C.mono, color: C.text }}>{fmt(b.paid)}</span></span>
                        <span style={{ color: C.muted, fontSize: "12px" }}>Part : <span style={{ fontFamily: C.mono, color: C.text }}>{fmt(b.share)}</span></span>
                        <Badge color={b.balance > 0.01 ? "green" : b.balance < -0.01 ? "red" : "neutral"}>
                          {b.balance > 0.01 ? `Doit recevoir ${fmt(b.balance)}` : b.balance < -0.01 ? `Doit payer ${fmt(Math.abs(b.balance))}` : "Équilibré"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Virements à effectuer */}
            {allTransfers.length > 0 && (
              <div style={{ ...s.card(), borderColor: `${C.accent}30` }}>
                <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px" }}>
                  Virements à effectuer
                  {doneCount > 0 && <span style={{ fontSize: "12px", color: C.accent, fontWeight: "400", marginLeft: "8px" }}>{doneCount}/{allTransfers.length} confirmés</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {allTransfers.map((t, i) => {
                    const done = !!isSettled(t);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: done ? `${C.accent}10` : C.card2, borderRadius: "8px", opacity: done ? 0.75 : 1, flexWrap: "wrap", gap: "8px" }}>
                        <div style={{ flex: 1, fontSize: "13px" }}>
                          <strong>{t.from}</strong>
                          <span style={{ color: C.muted }}> → </span>
                          <strong>{t.to}</strong>
                          {done && <span style={{ marginLeft: "8px", fontSize: "11px", color: C.accent }}>✓ Confirmé</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ fontFamily: C.mono, fontWeight: "700", color: done ? C.muted : C.warn }}>{fmt(t.amount)}</span>
                          {!done && <button style={s.btn("primary", { padding: "4px 10px", fontSize: "11px" })} onClick={() => settleT(t)}>Confirmer</button>}
                          {done && <button style={s.btn("ghost", { padding: "4px 10px", fontSize: "11px" })} onClick={() => unsettle(t)}>Annuler</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {doneCount === allTransfers.length && allTransfers.length > 0 && (
                  <div style={{ textAlign: "center", padding: "10px", color: C.accent, fontSize: "13px", marginTop: "8px" }}>Tous les virements sont confirmés.</div>
                )}
              </div>
            )}

          </div>
        );
      })()}

      {/* ── Transport ── */}
      {tab === "transport" && (() => {
        const tr = p.transport || {};
        const updTr = (patch) => upd({ transport: { ...tr, ...patch } });
        const vehicles = tr.vehicles || [];
        const stops = tr.stops || [];
        const retourStops = tr.retourStops || [];
        const extraLines = tr.extraLines || [];
        const km = parseFloat(tr.distanceKm)||0;
        const conso = parseFloat(tr.fuelConso)||0;
        const prixL = parseFloat(tr.fuelPrice)||0;
        const fuelCost = km > 0 && conso > 0 && prixL > 0 ? Math.round(km * conso / 100 * prixL * 100) / 100 : 0;
        const tolls = parseFloat(tr.tolls)||0;
        const rkm = parseFloat(tr.retourDistanceKm)||0;
        const rconso = parseFloat(tr.retourFuelConso)||0;
        const rprixL = parseFloat(tr.retourFuelPrice)||0;
        const retourFuelCost = rkm > 0 && rconso > 0 && rprixL > 0 ? Math.round(rkm * rconso / 100 * rprixL * 100) / 100 : 0;
        const retourTolls = parseFloat(tr.retourTolls)||0;
        const extraTotal = extraLines.reduce((a, l) => a + (parseFloat(l.amount)||0), 0);
        const vr = tr.vehicleRental || {};
        const rentalCost = (vr.enabled && parseFloat(vr.pricePerDay) > 0 && parseFloat(vr.days) > 0)
          ? Math.round(parseFloat(vr.pricePerDay) * parseFloat(vr.days) * 100) / 100 : 0;
        const transportTotal = fuelCost + tolls + retourFuelCost + retourTolls + extraTotal + rentalCost;
        const VTYPES = ["Berline", "Break", "Van", "Camion", "Utilitaire", "Autre"];
        const VR_TYPES = ["Voiture", "Camionnette", "Camion", "Utilitaire", "Van", "Minibus", "Autre"];
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

            {/* Itinéraire */}
            <div style={s.card()}>
              <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px", marginBottom: "16px", color: C.accent }}>Itinéraire</div>

              {/* ── Aller ── */}
              <div style={{ fontSize: "11px", color: C.accent, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>Aller</div>

              {/* Départ */}
              <div style={{ marginBottom: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#4affa0", color: "#111", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "700" }}>⬆</span>
                  <span style={{ fontWeight: "700", fontSize: "13px" }}>Départ</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", paddingLeft: "32px" }}>
                  <div>
                    <label style={s.label}>Adresse de départ</label>
                    <input style={s.inp()} value={tr.departAddress||""} onChange={e => updTr({ departAddress: e.target.value })} placeholder="Ex : 12 rue des Arts, Paris" />
                  </div>
                  <div>
                    <label style={s.label}>Date</label>
                    <input type="date" style={s.inp()} value={tr.departDate||""} onChange={e => updTr({ departDate: e.target.value })} />
                  </div>
                  <div>
                    <label style={s.label}>Heure</label>
                    <input type="time" style={s.inp()} value={tr.departTime||""} onChange={e => updTr({ departTime: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Arrêts */}
              {stops.map((st, i) => (
                <div key={st.id} style={{ marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: C.card2, border: `1px solid ${C.border}`, color: C.text, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700" }}>{i+1}</span>
                    <span style={{ fontWeight: "700", fontSize: "13px" }}>Arrêt {i+1}</span>
                    <button style={s.btn("danger", { padding: "2px 8px", fontSize: "11px", marginLeft: "auto" })} onClick={() => updTr({ stops: stops.filter(s2 => s2.id !== st.id) })}>Supprimer</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", paddingLeft: "32px" }}>
                    <div>
                      <label style={s.label}>Adresse</label>
                      <input style={s.inp()} value={st.address||""} onChange={e => updTr({ stops: stops.map(s2 => s2.id===st.id ? {...s2, address: e.target.value} : s2) })} placeholder="Adresse" />
                    </div>
                    <div>
                      <label style={s.label}>Heure</label>
                      <input type="time" style={s.inp()} value={st.time||""} onChange={e => updTr({ stops: stops.map(s2 => s2.id===st.id ? {...s2, time: e.target.value} : s2) })} />
                    </div>
                    <div>
                      <label style={s.label}>Label</label>
                      <input style={s.inp()} value={st.label||""} onChange={e => updTr({ stops: stops.map(s2 => s2.id===st.id ? {...s2, label: e.target.value} : s2) })} placeholder="Ex : Chargement, Pause…" />
                    </div>
                  </div>
                </div>
              ))}
              <button style={s.btn("ghost", { fontSize: "12px", marginBottom: "14px", marginLeft: "32px" })} onClick={() => updTr({ stops: [...stops, { id: uid(), address: "", time: "", label: "" }] })}>+ Ajouter un arrêt</button>

              {/* Arrivée aller */}
              <div style={{ marginBottom: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: C.danger, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "700" }}>⬇</span>
                  <span style={{ fontWeight: "700", fontSize: "13px" }}>Arrivée</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", paddingLeft: "32px" }}>
                  <div>
                    <label style={s.label}>Adresse d'arrivée</label>
                    <input style={s.inp()} value={tr.arrivalAddress||""} onChange={e => updTr({ arrivalAddress: e.target.value })} placeholder="Ex : Salle des fêtes, Lyon" />
                  </div>
                  <div>
                    <label style={s.label}>Date</label>
                    <input type="date" style={s.inp()} value={tr.arrivalDate||""} onChange={e => updTr({ arrivalDate: e.target.value })} />
                  </div>
                  <div>
                    <label style={s.label}>Heure</label>
                    <input type="time" style={s.inp()} value={tr.arrivalTime||""} onChange={e => updTr({ arrivalTime: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* ── Retour ── */}
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: "18px", paddingTop: "18px" }}>
                <div style={{ fontSize: "11px", color: "#a78bfa", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>Retour</div>

                {/* Départ retour */}
                <div style={{ marginBottom: "14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: C.danger, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "700" }}>⬆</span>
                    <span style={{ fontWeight: "700", fontSize: "13px" }}>Départ retour</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", paddingLeft: "32px" }}>
                    <div>
                      <label style={s.label}>Adresse de départ</label>
                      <input style={s.inp()} value={tr.retourDepartAddress||""} onChange={e => updTr({ retourDepartAddress: e.target.value })} placeholder={tr.arrivalAddress || "Ex : Salle des fêtes, Lyon"} />
                    </div>
                    <div>
                      <label style={s.label}>Date</label>
                      <input type="date" style={s.inp()} value={tr.retourDepartDate||""} onChange={e => updTr({ retourDepartDate: e.target.value })} />
                    </div>
                    <div>
                      <label style={s.label}>Heure</label>
                      <input type="time" style={s.inp()} value={tr.retourDepartTime||""} onChange={e => updTr({ retourDepartTime: e.target.value })} />
                    </div>
                  </div>
                </div>

                {/* Arrêts retour */}
                {retourStops.map((st, i) => (
                  <div key={st.id} style={{ marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: C.card2, border: `1px solid ${C.border}`, color: C.text, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700" }}>{i+1}</span>
                      <span style={{ fontWeight: "700", fontSize: "13px" }}>Arrêt retour {i+1}</span>
                      <button style={s.btn("danger", { padding: "2px 8px", fontSize: "11px", marginLeft: "auto" })} onClick={() => updTr({ retourStops: retourStops.filter(s2 => s2.id !== st.id) })}>Supprimer</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", paddingLeft: "32px" }}>
                      <div>
                        <label style={s.label}>Adresse</label>
                        <input style={s.inp()} value={st.address||""} onChange={e => updTr({ retourStops: retourStops.map(s2 => s2.id===st.id ? {...s2, address: e.target.value} : s2) })} placeholder="Adresse" />
                      </div>
                      <div>
                        <label style={s.label}>Heure</label>
                        <input type="time" style={s.inp()} value={st.time||""} onChange={e => updTr({ retourStops: retourStops.map(s2 => s2.id===st.id ? {...s2, time: e.target.value} : s2) })} />
                      </div>
                      <div>
                        <label style={s.label}>Label</label>
                        <input style={s.inp()} value={st.label||""} onChange={e => updTr({ retourStops: retourStops.map(s2 => s2.id===st.id ? {...s2, label: e.target.value} : s2) })} placeholder="Ex : Déchargement, Pause…" />
                      </div>
                    </div>
                  </div>
                ))}
                <button style={s.btn("ghost", { fontSize: "12px", marginBottom: "14px", marginLeft: "32px" })} onClick={() => updTr({ retourStops: [...retourStops, { id: uid(), address: "", time: "", label: "" }] })}>+ Ajouter un arrêt retour</button>

                {/* Arrivée retour */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#4affa0", color: "#111", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "700" }}>⬇</span>
                    <span style={{ fontWeight: "700", fontSize: "13px" }}>Arrivée retour</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", paddingLeft: "32px" }}>
                    <div>
                      <label style={s.label}>Adresse d'arrivée</label>
                      <input style={s.inp()} value={tr.retourArrivalAddress||""} onChange={e => updTr({ retourArrivalAddress: e.target.value })} placeholder={tr.departAddress || "Ex : 12 rue des Arts, Paris"} />
                    </div>
                    <div>
                      <label style={s.label}>Date</label>
                      <input type="date" style={s.inp()} value={tr.retourArrivalDate||""} onChange={e => updTr({ retourArrivalDate: e.target.value })} />
                    </div>
                    <div>
                      <label style={s.label}>Heure</label>
                      <input type="time" style={s.inp()} value={tr.retourArrivalTime||""} onChange={e => updTr({ retourArrivalTime: e.target.value })} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Véhicules */}
            <div style={s.card()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px", color: C.accent }}>Véhicules</div>
                <button style={s.btn("primary", { fontSize: "12px" })} onClick={() => updTr({ vehicles: [...vehicles, { id: uid(), type: "Berline", label: "", driver: "", team: [] }] })}>+ Ajouter</button>
              </div>
              {vehicles.length === 0 && <p style={{ color: C.muted, fontSize: "13px" }}>Aucun véhicule ajouté.</p>}
              {vehicles.map((v, vi) => (
                <div key={v.id} style={{ background: C.card2, borderRadius: "8px", padding: "14px", marginBottom: "12px", border: `1px solid ${C.border}` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "8px", marginBottom: "10px", alignItems: "end" }}>
                    <div>
                      <label style={s.label}>Type</label>
                      <select style={s.inp()} value={v.type||"Berline"} onChange={e => updTr({ vehicles: vehicles.map(vv => vv.id===v.id ? {...vv, type: e.target.value} : vv) })}>
                        {VTYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={s.label}>Label / Immatriculation</label>
                      <input style={s.inp()} value={v.label||""} onChange={e => updTr({ vehicles: vehicles.map(vv => vv.id===v.id ? {...vv, label: e.target.value} : vv) })} placeholder="Ex : AB-123-CD" />
                    </div>
                    <div>
                      <label style={s.label}>Conducteur</label>
                      <input style={s.inp()} value={v.driver||""} onChange={e => updTr({ vehicles: vehicles.map(vv => vv.id===v.id ? {...vv, driver: e.target.value} : vv) })} placeholder="Nom du conducteur" />
                    </div>
                    <button style={s.btn("danger", { padding: "7px 10px", alignSelf: "end" })} onClick={() => updTr({ vehicles: vehicles.filter(vv => vv.id !== v.id) })}>✕</button>
                  </div>
                  <div>
                    <label style={s.label}>Membres à bord (1 par ligne ou séparés par virgule)</label>
                    <textarea
                      style={{ ...s.inp(), height: "60px", resize: "vertical" }}
                      value={(v.team||[]).join("\n")}
                      onChange={e => updTr({ vehicles: vehicles.map(vv => vv.id===v.id ? {...vv, team: e.target.value.split(/[\n,]+/).map(t => t.trim()).filter(Boolean)} : vv) })}
                      placeholder="Ex : Alice, Bob, Charlie…"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Estimation des coûts */}
            <div style={s.card()}>
              <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px", marginBottom: "16px", color: C.accent }}>Estimation des coûts</div>

              {/* Aller */}
              <div style={{ fontSize: "11px", color: C.accent, fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>Aller</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "12px" }}>
                <div>
                  <label style={s.label}>Distance (km)</label>
                  <input type="number" min="0" style={s.inp()} value={tr.distanceKm||""} onChange={e => updTr({ distanceKm: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <label style={s.label}>Consommation (L/100 km)</label>
                  <input type="number" min="0" step="0.1" style={s.inp()} value={tr.fuelConso||""} onChange={e => updTr({ fuelConso: e.target.value })} placeholder="7.5" />
                </div>
                <div>
                  <label style={s.label}>Prix carburant (€/L)</label>
                  <input type="number" min="0" step="0.01" style={s.inp()} value={tr.fuelPrice||""} onChange={e => updTr({ fuelPrice: e.target.value })} placeholder="1.85" />
                </div>
                <div>
                  <label style={s.label}>Péages (€)</label>
                  <input type="number" min="0" step="0.01" style={s.inp()} value={tr.tolls||""} onChange={e => updTr({ tolls: e.target.value })} placeholder="0" />
                </div>
              </div>
              {fuelCost > 0 && (
                <div style={{ background: `${C.info}12`, border: `1px solid ${C.info}30`, borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", display: "flex", gap: "8px", fontSize: "13px" }}>
                  <span style={{ color: C.info }}>⛽</span>
                  <span>Aller — Carburant : <strong style={{ color: C.info }}>{fuelCost.toFixed(2)} €</strong> ({km} km × {conso} L/100 × {prixL} €/L{vehicles.length > 1 ? ` × ${vehicles.length} véhicules` : ""})</span>
                </div>
              )}

              {/* Retour */}
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: "14px", paddingTop: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div style={{ fontSize: "11px", color: "#a78bfa", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px" }}>Retour</div>
                  <button style={s.btn("ghost", { fontSize: "11px", padding: "3px 10px" })} onClick={() => updTr({ retourDistanceKm: tr.distanceKm||"", retourFuelConso: tr.fuelConso||"", retourFuelPrice: tr.fuelPrice||"", retourTolls: tr.tolls||"" })}>Copier depuis l'aller</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={s.label}>Distance (km)</label>
                    <input type="number" min="0" style={s.inp()} value={tr.retourDistanceKm||""} onChange={e => updTr({ retourDistanceKm: e.target.value })} placeholder="0" />
                  </div>
                  <div>
                    <label style={s.label}>Consommation (L/100 km)</label>
                    <input type="number" min="0" step="0.1" style={s.inp()} value={tr.retourFuelConso||""} onChange={e => updTr({ retourFuelConso: e.target.value })} placeholder="7.5" />
                  </div>
                  <div>
                    <label style={s.label}>Prix carburant (€/L)</label>
                    <input type="number" min="0" step="0.01" style={s.inp()} value={tr.retourFuelPrice||""} onChange={e => updTr({ retourFuelPrice: e.target.value })} placeholder="1.85" />
                  </div>
                  <div>
                    <label style={s.label}>Péages (€)</label>
                    <input type="number" min="0" step="0.01" style={s.inp()} value={tr.retourTolls||""} onChange={e => updTr({ retourTolls: e.target.value })} placeholder="0" />
                  </div>
                </div>
                {retourFuelCost > 0 && (
                  <div style={{ background: `${C.info}12`, border: `1px solid ${C.info}30`, borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", display: "flex", gap: "8px", fontSize: "13px" }}>
                    <span style={{ color: C.info }}>⛽</span>
                    <span>Retour — Carburant : <strong style={{ color: C.info }}>{retourFuelCost.toFixed(2)} €</strong> ({rkm} km × {rconso} L/100 × {rprixL} €/L{vehicles.length > 1 ? ` × ${vehicles.length} véhicules` : ""})</span>
                  </div>
                )}
              </div>

              {/* Location de véhicule */}
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: "14px", paddingTop: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: vr.enabled ? "12px" : "0" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none" }}>
                    <input type="checkbox" checked={!!vr.enabled} onChange={e => updTr({ vehicleRental: { ...vr, enabled: e.target.checked } })} style={{ accentColor: C.accent, width: "15px", height: "15px" }} />
                    <span style={{ fontSize: "13px", fontWeight: "600" }}>Véhicule loué</span>
                  </label>
                  {rentalCost > 0 && <span style={{ fontFamily: C.mono, fontSize: "13px", color: "#a78bfa" }}>{rentalCost.toFixed(2)} €</span>}
                </div>
                {vr.enabled && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
                    <div>
                      <label style={s.label}>Type de véhicule</label>
                      <select style={s.inp()} value={vr.type||"Camionnette"} onChange={e => updTr({ vehicleRental: { ...vr, type: e.target.value } })}>
                        {VR_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={s.label}>Désignation (optionnel)</label>
                      <input style={s.inp()} value={vr.label||""} onChange={e => updTr({ vehicleRental: { ...vr, label: e.target.value } })} placeholder="Ex : Renault Trafic" />
                    </div>
                    <div>
                      <label style={s.label}>Durée (jours)</label>
                      <input type="number" min="1" step="0.5" style={s.inp()} value={vr.days||""} onChange={e => updTr({ vehicleRental: { ...vr, days: e.target.value } })} placeholder="1" />
                    </div>
                    <div>
                      <label style={s.label}>Prix / jour (€)</label>
                      <input type="number" min="0" step="0.01" style={s.inp()} value={vr.pricePerDay||""} onChange={e => updTr({ vehicleRental: { ...vr, pricePerDay: e.target.value } })} placeholder="0" />
                    </div>
                  </div>
                )}
              </div>

              {/* Lignes supplémentaires */}
              {extraLines.length > 0 && (
                <div style={{ marginTop: "14px", marginBottom: "12px" }}>
                  <div style={{ fontSize: "12px", color: C.muted, marginBottom: "6px" }}>Lignes supplémentaires</div>
                  {extraLines.map((l, li) => (
                    <div key={l.id} style={{ display: "flex", gap: "8px", marginBottom: "6px", alignItems: "center" }}>
                      <input style={{ ...s.inp(), flex: 2 }} value={l.label||""} onChange={e => updTr({ extraLines: extraLines.map(ll => ll.id===l.id ? {...ll, label: e.target.value} : ll) })} placeholder="Désignation" />
                      <input type="number" style={{ ...s.inp(), flex: 1 }} value={l.amount||""} onChange={e => updTr({ extraLines: extraLines.map(ll => ll.id===l.id ? {...ll, amount: e.target.value} : ll) })} placeholder="Montant €" />
                      <button style={s.btn("danger", { padding: "7px 10px" })} onClick={() => updTr({ extraLines: extraLines.filter(ll => ll.id !== l.id) })}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <button style={s.btn("ghost", { fontSize: "12px", marginBottom: "14px" })} onClick={() => updTr({ extraLines: [...extraLines, { id: uid(), label: "", amount: "" }] })}>+ Ligne supplémentaire</button>

              {/* Total */}
              {transportTotal > 0 && (
                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "12px" }}>
                  {(fuelCost + tolls) > 0 && (retourFuelCost + retourTolls) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: C.muted, marginBottom: "4px" }}>
                      <span>Aller</span><span style={{ fontFamily: "'DM Mono', monospace" }}>{(fuelCost + tolls).toFixed(2)} €</span>
                    </div>
                  )}
                  {(retourFuelCost + retourTolls) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: C.muted, marginBottom: "4px" }}>
                      <span>Retour</span><span style={{ fontFamily: "'DM Mono', monospace" }}>{(retourFuelCost + retourTolls).toFixed(2)} €</span>
                    </div>
                  )}
                  {rentalCost > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: C.muted, marginBottom: "4px" }}>
                      <span>Location {vr.type||"véhicule"}{vr.label ? ` — ${vr.label}` : ""}</span><span style={{ fontFamily: "'DM Mono', monospace" }}>{rentalCost.toFixed(2)} €</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                    <span style={{ color: C.muted, fontSize: "13px" }}>Total transport estimé</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "20px", fontWeight: "700", color: C.accent }}>{transportTotal.toFixed(2)} €</span>
                  </div>
                </div>
              )}
            </div>

            {/* Notes */}
            <div style={s.card()}>
              <label style={s.label}>Notes transport</label>
              <textarea style={{ ...s.inp(), height: "80px", resize: "vertical" }} value={tr.notes||""} onChange={e => updTr({ notes: e.target.value })} placeholder="Instructions particulières, points de rendez-vous, équipements à charger…" />
            </div>

            {/* Actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <button style={s.btn("primary", { padding: "12px" })} onClick={printRoadmap}>🗺 Feuille de route PDF</button>
              <button style={s.btn("ghost", { padding: "12px" })} onClick={printTransportDevis}>📄 Devis transport PDF</button>
            </div>

          </div>
        );
      })()}

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
              {c.address && <span>{c.address}</span>}
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
                    {c.address && <div style={{ fontSize: "12px", color: C.muted }}>{c.address}</div>}
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
function computeMinimalTransfers(members, expenses, revenues = [], bankBalance = 0) {
  if (!members.length) return [];
  const n = members.length;
  const bankExpenses    = (expenses||[]).filter(ex => ex.bankCoverage || ex.paidBy === "Banque");
  const regularExpenses = (expenses||[]).filter(ex => !ex.bankCoverage && ex.paidBy !== "Banque");
  const totalBankExp    = sumArr(bankExpenses, "amount");
  const totalRegularExp = sumArr(regularExpenses, "amount");
  const totalRevenues   = sumArr(revenues||[], "amount");

  const transfers = [];

  // La banque doit rembourser ceux qui ont avancé des frais couverts par la banque
  const bankToMemberMap = {};
  bankExpenses.forEach(ex => {
    if (ex.paidBy && ex.paidBy !== "Banque") {
      bankToMemberMap[ex.paidBy] = (bankToMemberMap[ex.paidBy]||0) + ex.amount;
    }
  });

  // Les recettes sont supposées déjà dans le solde bancaire (mis à jour manuellement par le comptable)
  const bankShortfall = Math.max(0, totalBankExp - bankBalance);

  // Seul le "shortfall" (ce que la banque ne peut PAS couvrir) est réparti entre les membres
  const perPersonBank = bankShortfall > 0.005 ? bankShortfall / n : 0;

  // Création des flux nets pour la partie "Banque"
  members.forEach(m => {
    const toReceiveFromBank = bankToMemberMap[m.name] || 0;
    const toPayToBank = perPersonBank;
    const net = toReceiveFromBank - toPayToBank;

    if (net > 0.005) {
      transfers.push({ id: `Banque→${m.name}`, from: "Banque", to: m.name, amount: Math.round(net * 100) / 100, bankOp: true });
    } else if (net < -0.005) {
      transfers.push({ id: `${m.name}→Banque`, from: m.name, to: "Banque", amount: Math.round(Math.abs(net) * 100) / 100, bankOp: true });
    }
  });

  // Dépenses régulières : toujours partagées intégralement entre les membres
  const regularUncovered = totalRegularExp;
  if (regularUncovered < 0.005 || !regularExpenses.length) return transfers;

  const perPerson = regularUncovered / n;
  const ratio = totalRegularExp > 0 ? regularUncovered / totalRegularExp : 1;
  const paid = {};
  regularExpenses.forEach(ex => { if (ex.paidBy && ex.paidBy !== "Banque") paid[ex.paidBy] = (paid[ex.paidBy]||0) + ex.amount; });
  const balances = members.map(m => ({ name: m.name, net: (paid[m.name]||0) * ratio - perPerson }));
  const cred = balances.filter(b => b.net >  0.005).map(b => ({...b})).sort((a,b) => b.net - a.net);
  const debt = balances.filter(b => b.net < -0.005).map(b => ({...b})).sort((a,b) => a.net - b.net);
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
  const bankThreshold = data.assoc?.bankThreshold ?? 0;
  const effectiveBankBalance = Math.max(0, bankBalance - bankThreshold);
  const [depTab, setDepTab] = useState("depenses");
  const [formOpen, setFormOpen] = useState(false);
  const [showReimbInfo, setShowReimbInfo] = useState(false);
  const [showArchivedDep, setShowArchivedDep] = useState(false);

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
    const bankBalance = data.assoc?.bankBalance ?? 0;
    
    if (bankCoverage) {
      const reimbursements = [];
      // La banque rembourse le membre qui a avancé l'argent (toujours)
      if (paidBy && paidBy !== "Banque") {
        reimbursements.push({ id: uid(), from: "Banque", to: paidBy, amount, settled: false, settledDate: null });
      }
      
      // Les membres ne remboursent la banque que si le solde effectif est insuffisant
      const shortfall = Math.max(0, amount - effectiveBankBalance);
      if (shortfall > 0.005) {
        const share = Math.round((shortfall / n) * 100) / 100;
        participants.forEach(p => {
          reimbursements.push({ id: uid(), from: p.name, to: "Banque", amount: share, settled: false, settledDate: null });
        });
      }
      return reimbursements;
    } else {
      const share = Math.round((n > 0 ? amount / n : amount) * 100) / 100;
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
  const bankCoveragePct = totalBankCovered > 0 ? Math.min(Math.round(effectiveBankBalance / totalBankCovered * 100), 100) : null;
  // Priorité aux événements : ils consomment le solde effectif en premier
  const bankRemainingAfterEvents = Math.max(0, effectiveBankBalance - eventBankCovered);
  const eventNetDeficit = Math.max(0, eventBankCovered - effectiveBankBalance);
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
  const toggleEventSettlement = (eventId, from, to) => {
    const ev = (data.events||[]).find(e => e.id === eventId);
    const existing = (ev.settledTransfers||[]).find(s => s.from === from && s.to === to);
    const next = existing
      ? (ev.settledTransfers||[]).filter(s => !(s.from === from && s.to === to))
      : [...(ev.settledTransfers||[]), { id: uid(), from, to, settledAt: today() }];
    update({ events: (data.events||[]).map(e => e.id === eventId ? { ...e, settledTransfers: next } : e) });
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
    const transfers = computeMinimalTransfers(ev.members||[], ev.expenses||[], ev.revenues||[]);
    transfers.forEach(t => {
      const stored = (ev.settledTransfers||[]).find(s => s.from === t.from && s.to === t.to);
      if (stored) return;
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
            { id: "depenses",       label: `Dépenses${depenses.filter(d => d.archived).length > 0 ? ` (${depenses.filter(d => !d.archived).length} actives)` : ""}` },
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
          {assoBankCovered > 0 && (
            <div style={{ fontSize: "10px", color: assoNetDeficit === 0 ? C.accent : assoNetDeficit < assoBankCovered ? C.warn : C.danger, marginTop: "3px" }}>
              {assoNetDeficit === 0
                ? "✓ Entièrement couvert par le solde"
                : assoNetDeficit < assoBankCovered
                  ? `${fmt(bankRemainingAfterEvents)} couvert · ${fmt(assoNetDeficit)} à financer`
                  : `Solde insuffisant — ${fmt(assoBankCovered)} à financer`}
            </div>
          )}
        </div>
        <div style={s.card()}>
          <div style={s.label}>Solde bancaire</div>
          {(
            <>
              <div style={{ fontFamily: C.mono, fontSize: "20px", color: C.accent, marginTop: "4px" }}>{fmt(bankBalance)}</div>
              {bankThreshold > 0 && (
                <div style={{ fontSize: "11px", color: C.muted, marginTop: "4px" }}>
                  Seuil : <span style={{ color: C.warn, fontFamily: C.mono }}>{fmt(bankThreshold)}</span>
                  {" · "}Dispo : <span style={{ color: effectiveBankBalance > 0 ? C.accent : C.danger, fontFamily: C.mono, fontWeight: "600" }}>{fmt(effectiveBankBalance)}</span>
                </div>
              )}
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
              <option value="Banque">Banque</option>
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
              Ajouter ou retirer une personne recalcule les parts non réglées dans toutes les dépenses existantes.
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
            {[...depenses].reverse().filter(dep => !dep.archived).map(dep => {
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
                            <option value="Banque">Banque</option>
                            {allPeople.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                            {editForm.paidBy && editForm.paidBy !== "Banque" && !allPeople.find(p => p.name === editForm.paidBy) && (
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

          {/* Archive dépenses */}
          {depenses.filter(d => d.archived).length > 0 && (
            <div style={{ marginTop: "8px" }}>
              <button
                onClick={() => setShowArchivedDep(v => !v)}
                style={{ display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", cursor: "pointer", color: C.muted, fontFamily: C.font, fontSize: "13px", padding: "6px 0" }}
              >
                <span style={{ color: C.accent }}>{showArchivedDep ? "▲" : "▼"}</span>
                Archive — {depenses.filter(d => d.archived).length} dépense{depenses.filter(d => d.archived).length > 1 ? "s" : ""} clôturée{depenses.filter(d => d.archived).length > 1 ? "s" : ""}
              </button>
              {showArchivedDep && (
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "6px", opacity: 0.6 }}>
                  {[...depenses].reverse().filter(d => d.archived).map(dep => (
                    <div key={dep.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: `${C.accent}08`, borderRadius: "8px", borderLeft: `3px solid ${C.accent}30`, flexWrap: "wrap", gap: "6px" }}>
                      <div style={{ display: "flex", align: "center", gap: "8px", flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: "10px", color: C.accent, padding: "2px 6px", border: `1px solid ${C.accent}30`, borderRadius: "10px", flexShrink: 0 }}>✓ Clôturé</span>
                        <span style={{ fontSize: "13px", fontWeight: "500", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dep.label}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                        <span style={{ fontFamily: C.mono, fontSize: "13px", color: C.muted }}>{fmt(dep.amount)}</span>
                        <span style={{ fontSize: "11px", color: C.muted }}>{dep.date}</span>
                        {canEdit && (
                          <button
                            onClick={() => update({ depenses: depenses.map(d => d.id !== dep.id ? d : { ...d, archived: false }) })}
                            style={s.btn("ghost", { padding: "2px 8px", fontSize: "11px" })}
                            title="Désarchiver"
                          >↩</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}

      </>}

      {/* ── Onglet Remboursements ── */}
      {depTab === "remboursements" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Bouton info + panneau explicatif */}
          <div>
            <button
              onClick={() => setShowReimbInfo(v => !v)}
              title="Comment fonctionnent les remboursements ?"
              style={{ display: "flex", alignItems: "center", gap: "6px", background: showReimbInfo ? `${C.info}20` : `${C.info}10`, border: `1px solid ${C.info}30`, borderRadius: "20px", padding: "4px 12px", cursor: "pointer", color: C.info, fontSize: "12px", fontFamily: C.font }}
            >
              <span style={{ fontWeight: "700", fontSize: "13px" }}>ⓘ</span>
              Comment fonctionnent les remboursements ?
              <span style={{ color: C.muted, fontSize: "11px" }}>{showReimbInfo ? "▲" : "▼"}</span>
            </button>
            {showReimbInfo && (
              <div style={{ marginTop: "10px", padding: "18px 20px", background: `${C.info}08`, border: `1px solid ${C.info}25`, borderRadius: "12px", fontSize: "13px", lineHeight: "1.7", color: C.text }}>
                <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", color: C.info, marginBottom: "14px" }}>Comment les remboursements sont calculés</div>

                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

                  <div>
                    <div style={{ fontWeight: "600", marginBottom: "4px" }}>🏦 Le solde bancaire, point de départ</div>
                    <div style={{ color: C.muted }}>
                      Le <strong style={{ color: C.text }}>solde bancaire</strong> est saisi manuellement par le comptable. Il représente ce que l'association a réellement sur son compte en ce moment. Les recettes des événements (billetterie, subventions…) sont considérées comme <em>déjà incluses</em> dans ce solde — le comptable le met à jour au fur et à mesure qu'elles arrivent.
                    </div>
                  </div>

                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "14px" }}>
                    <div style={{ fontWeight: "600", marginBottom: "4px" }}>💸 Les dépenses couvertes par la banque</div>
                    <div style={{ color: C.muted }}>
                      Certaines dépenses sont marquées <strong style={{ color: C.info }}>"couvertes par la banque"</strong>. Cela signifie que l'argent est censé venir du compte de l'association. Si quelqu'un a avancé la somme de sa poche, la banque doit lui rembourser. Si le solde est insuffisant pour tout couvrir, la différence est répartie entre tous les membres de l'équipe.
                    </div>
                  </div>

                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "14px" }}>
                    <div style={{ fontWeight: "600", marginBottom: "4px" }}>🔄 Le flux concret : qui paye qui ?</div>
                    <div style={{ color: C.muted, display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div>① <strong style={{ color: C.text }}>Quelqu'un avance une dépense</strong> de sa poche (ex : Alice paye 120 € pour du matériel couvert par la banque).</div>
                      <div>② <strong style={{ color: C.text }}>Les membres font leur virement vers le compte asso</strong> — chacun paye sa quote-part si le solde bancaire est insuffisant.</div>
                      <div>③ <strong style={{ color: C.text }}>Le compte asso rembourse Alice</strong> — une fois les virements reçus, on vire le total dû à Alice depuis le compte.</div>
                    </div>
                  </div>

                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "14px" }}>
                    <div style={{ fontWeight: "600", marginBottom: "4px" }}>👥 Les dépenses entre membres (sans banque)</div>
                    <div style={{ color: C.muted }}>
                      Pour les dépenses <strong style={{ color: C.warn }}>non couvertes par la banque</strong> (ex : Bob avance 60 € pour un repas), le coût est divisé également entre tous les membres. Chacun rembourse directement Bob de sa part. Pas de passage par le compte asso.
                    </div>
                  </div>

                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "14px" }}>
                    <div style={{ fontWeight: "600", marginBottom: "4px" }}>📊 Les soldes affichés</div>
                    <div style={{ color: C.muted, display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div><span style={{ color: C.warn }}>●</span> <strong style={{ color: C.text }}>Membres</strong> : ce que tu dois (ou on te doit) entre personnes — hors banque.</div>
                      <div><span style={{ color: C.info }}>●</span> <strong style={{ color: C.text }}>Banque</strong> : ta relation avec le compte asso — positif = la banque te doit, négatif = tu dois virer à la banque.</div>
                      <div>Un solde <strong style={{ color: C.accent }}>équilibré ✓</strong> signifie que tout a été réglé pour cette personne.</div>
                    </div>
                  </div>

                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "14px" }}>
                    <div style={{ fontWeight: "600", marginBottom: "4px" }}>✅ Comment marquer un remboursement comme réglé ?</div>
                    <div style={{ color: C.muted }}>
                      Quand un virement a été effectué, clique sur <strong style={{ color: C.text }}>"Marquer réglé"</strong>. Le comptable voit ensuite apparaître l'entrée dans l'onglet <strong style={{ color: C.text }}>Comptabilité</strong> pour la confirmer une fois qu'il a vérifié sur le relevé bancaire. Une fois confirmé, le remboursement passe en archive.
                    </div>
                  </div>

                </div>
              </div>
            )}
          </div>

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
            const transfers = computeMinimalTransfers(ev.members||[], ev.expenses||[], ev.revenues||[], effectiveBankBalance);
            if (transfers.length === 0) return null;

            const storedSettlements = ev.settledTransfers || [];
            const totalBankExp = sumArr((ev.expenses||[]).filter(ex => ex.bankCoverage), "amount");

            // Les recettes sont supposées déjà dans le solde bancaire (seuil déduit)
            const eventUncoveredRatio = totalBankExp > 0
              ? Math.max(0, (totalBankExp - effectiveBankBalance) / totalBankExp)
              : 0;

            const pendingT = transfers.filter(t => !storedSettlements.find(s => s.from === t.from && s.to === t.to));
            const settledT = transfers.filter(t =>  storedSettlements.find(s => s.from === t.from && s.to === t.to));
            
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
                      const fromBank = t.from === "Banque";
                      const toBank = t.to === "Banque";
                      const bColor = fromBank ? C.accent : toBank ? C.info : C.warn;
                      return (
                        <div key={t.id} style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", padding: "10px 14px", background: C.card2, borderRadius: "8px", borderLeft: `3px solid ${bColor}`, flexWrap: "wrap", gap: "8px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                            <UserAvatar username={t.from} avatar={(users||[]).find(u=>u.username===t.from)?.avatar} size={28} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: "600", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {fromBank ? "Banque" : t.from}
                                <span style={{ color: C.muted, fontWeight: "400" }}> → </span>
                                {toBank ? "Banque" : t.to}
                              </div>
                              {t.bankOp && (
                                <div style={{ fontSize: "10px", color: C.info, marginTop: "2px" }}>
                                  {fmt(t.amount)} total · {eventUncoveredRatio <= 0 ? "Couvert par recettes/banque" : `${fmt(Math.round(t.amount * (1 - eventUncoveredRatio) * 100) / 100)} payable maintenant`}
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                            <span style={{ fontFamily: C.mono, fontSize: "15px", fontWeight: "700", color: bColor }}>{fmt(t.amount)}</span>
                            <button onClick={() => toggleEventSettlement(ev.id, t.from, t.to)} style={s.btn("primary", { padding: isMobile ? "8px 12px" : "6px 14px", fontSize: "12px" })}>
                              {isMobile ? "✓ Réglé" : "Marquer réglé"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {settledT.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ fontSize: "11px", color: C.muted, marginBottom: "6px" }}>Réglés</div>
                    {settledT.map(t => {
                      const stored = storedSettlements.find(s => s.from === t.from && s.to === t.to);
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
                            : <button onClick={() => toggleEventSettlement(ev.id, t.from, t.to)} style={s.btn("ghost", { padding: "3px 8px", fontSize: "11px" })}>Annuler</button>}
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
                                {fromBank ? "Banque" : from}
                                <span style={{ color: C.muted, fontWeight: "400" }}> → </span>
                                {toBank ? "Banque" : to}
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
                              <span style={{ color: C.muted }}> {from === "Banque" ? "Banque" : from} → {to === "Banque" ? "Banque" : to}</span>
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
const REC_EXT_CATS = ["Vente matériel", "Don", "Mécénat", "Subvention", "Cotisations", "Autre"];

function ComptaPage({ data, update, can, session }) {
  const canTreasury = can("manage_treasury");
  const username    = session?.user?.username;
  const [tab, setTab] = useState("remboursements");
  const [bilanMonth, setBilanMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; });
  const [anneeGlobal, setAnneeGlobal] = useState(() => new Date().getFullYear());
  const [editBalance, setEditBalance] = useState(false);
  const [balVal, setBalVal]           = useState("");
  const [editThreshold, setEditThreshold] = useState(false);
  const [threshVal, setThreshVal]         = useState("");
  const [recExtOpen, setRecExtOpen] = useState(false);
  const [recExtForm, setRecExtForm] = useState({ label: "", amount: "", date: today(), cat: "Autre", note: "" });
  const [recExtEdit, setRecExtEdit] = useState(null);
  const bankBalance   = data.assoc?.bankBalance   ?? 0;
  const bankThreshold = data.assoc?.bankThreshold ?? 0;
  const effectiveBankBalance = Math.max(0, bankBalance - bankThreshold);

  // ── Calcul des ratios (même logique que DepensesPage, solde effectif) ──
  const depenses       = data.depenses      || [];
  const events         = data.events        || [];
  const recExternes    = data.recettesExternes || [];
  const assoBankCov    = depenses.filter(d => d.bankCoverage).reduce((a, d) => a + d.amount, 0);
  const eventBankCov   = events.reduce((a, e) => a + (e.expenses||[]).filter(ex => ex.bankCoverage).reduce((b, ex) => b + ex.amount, 0), 0);
  const bankRem        = Math.max(0, effectiveBankBalance - eventBankCov);
  const eventUncov     = eventBankCov > 0 ? Math.max(0, eventBankCov - effectiveBankBalance) / eventBankCov : 0;
  const assoUncov      = assoBankCov  > 0 ? Math.max(0, assoBankCov  - bankRem)               / assoBankCov  : 0;

  // ── Remboursements unifiés ──
  const assoEntries = depenses.flatMap(d =>
    (d.reimbursements||[]).map(r => {
      // Banque → X : toujours plein (la banque rembourse le payeur en totalité)
      // X → Banque : réduit par assoUncov (part membre ajustée selon ce que la banque peut couvrir)
      const dispAmt = d.bankCoverage
        ? (r.from === "Banque" ? r.amount : Math.round(r.amount * assoUncov * 100) / 100)
        : r.amount;
      return { ...r, source: "asso", label: d.label, depId: d.id, displayAmount: dispAmt };
    })
  );
  const eventEntries = events
    .filter(e => (e.members||[]).length > 0 && (e.expenses||[]).length > 0)
    .flatMap(ev => {
      const transfers = computeMinimalTransfers(ev.members, ev.expenses, ev.revenues, effectiveBankBalance);
      return transfers.map(t => {
        const stored  = (ev.settledTransfers||[]).find(s => s.from === t.from && s.to === t.to) || {};
        const dispAmt = t.bankOp ? Math.round(t.amount * eventUncov * 100) / 100 : t.amount;
        return { id: `${t.from}→${t.to}`, from: t.from, to: t.to, amount: t.amount, displayAmount: dispAmt,
          bankOp: t.bankOp, source: "event", label: ev.name, eventId: ev.id,
          settled: !!stored.settledAt, settledDate: stored.settledAt||null,
          confirmed: !!stored.confirmed, confirmedBy: stored.confirmedBy||null, confirmedDate: stored.confirmedDate||null };
      });
    });

  const all = [...assoEntries, ...eventEntries];
  const pending   = all.filter(r => !r.settled && !r.confirmed);
  const awaiting  = all.filter(r =>  r.settled && !r.confirmed && r.displayAmount >= 0.01);
  const confirmed = all.filter(r =>  r.confirmed);

  // ── Recettes événements à encaisser ──
  const revenueEntries = events
    .filter(e => (e.revenues||[]).length > 0)
    .flatMap(ev =>
      (ev.revenues||[]).map(rev => {
        const rc = (ev.revenueConfirmations||{})[rev.id] || {};
        return {
          id: `rev_${rev.id}`, revId: rev.id, eventId: ev.id,
          from: rev.label, to: "Banque",
          amount: rev.amount, displayAmount: rev.amount,
          type: rev.type, source: "revenue", label: ev.name,
          confirmed: !!rc.confirmed,
          confirmedBy: rc.confirmedBy || null,
          confirmedDate: rc.confirmedDate || null,
        };
      })
    );
  const pendingRevenues   = revenueEntries.filter(r => !r.confirmed);
  const confirmedRevenues = revenueEntries.filter(r =>  r.confirmed);

  const confirmRevenue = (r) => {
    const ev = events.find(e => e.id === r.eventId);
    const newConf = { ...(ev.revenueConfirmations||{}), [r.revId]: { confirmed: true, confirmedBy: username, confirmedDate: today() } };
    update({ events: events.map(e => e.id !== r.eventId ? e : { ...e, revenueConfirmations: newConf }) });
  };
  const unconfirmRevenue = (r) => {
    const ev = events.find(e => e.id === r.eventId);
    const newConf = { ...(ev.revenueConfirmations||{}), [r.revId]: { confirmed: false, confirmedBy: null, confirmedDate: null } };
    update({ events: events.map(e => e.id !== r.eventId ? e : { ...e, revenueConfirmations: newConf }) });
  };

  // ── Fonctions de calcul prestations/locations (utilisées ici et dans le bilan) ──
  const prestations = data.prestations || [];
  const locations   = data.locations   || [];
  const locCalcTotal = (l) => {
    const items = (l.items||[]).reduce((a, it) => a + (it.qty||1)*(it.unitPrice||0)*(it.days||1), 0);
    const svcs  = (l.services||[]).reduce((a, sv) => a + (sv.qty||1)*(sv.unitPrice||0), 0);
    return l.customPrice != null ? l.customPrice : items + svcs;
  };
  const prestCalcTotal = (p2) => {
    const g  = (p2.gear||[]).reduce((a, g2) => a + g2.qty*g2.unitPrice*g2.days, 0);
    const sv = (p2.services||[]).reduce((a, sv) => a + sv.qty*sv.unitPrice, 0);
    return p2.customPrice != null ? p2.customPrice : g + sv;
  };

  // ── Paiements prestations à encaisser ──
  const prestEntries = prestations
    .filter(p => p.statut === "Confirmé" || p.statut === "Terminé")
    .map(p => {
      const total = prestCalcTotal(p);
      return {
        id: `presta_${p.id}`, prestId: p.id,
        from: p.client?.name || p.label, to: "Banque",
        amount: total, displayAmount: total,
        source: "prestation", label: p.label,
        clientName: p.client?.name || null,
        date: p.dateStart || p.date || null,
        confirmed: !!p.paymentConfirmed,
        confirmedBy: p.paymentConfirmedBy || null,
        confirmedDate: p.paymentConfirmedDate || null,
      };
    }).filter(r => r.amount > 0);

  const pendingPresta   = prestEntries.filter(r => !r.confirmed);
  const confirmedPresta = prestEntries.filter(r =>  r.confirmed);

  const confirmPresta = (r) => {
    update({ prestations: (data.prestations||[]).map(p => p.id !== r.prestId ? p :
      { ...p, paymentConfirmed: true, paymentConfirmedBy: username, paymentConfirmedDate: today() }) });
  };
  const unconfirmPresta = (r) => {
    update({ prestations: (data.prestations||[]).map(p => p.id !== r.prestId ? p :
      { ...p, paymentConfirmed: false, paymentConfirmedBy: null, paymentConfirmedDate: null }) });
  };

  // ── Paiements locations à encaisser ──
  const locEntries = locations
    .filter(l => l.statut === "Confirmé" || l.statut === "Terminé" || l.statut === "En cours")
    .map(l => {
      const total = locCalcTotal(l);
      return {
        id: `loc_${l.id}`, locId: l.id,
        from: l.client?.name || l.label || "Location", to: "Banque",
        amount: total, displayAmount: total,
        source: "location", label: l.label || "Location",
        clientName: l.client?.name || null,
        date: l.dateStart || null,
        confirmed: !!l.paymentConfirmed,
        confirmedBy: l.paymentConfirmedBy || null,
        confirmedDate: l.paymentConfirmedDate || null,
      };
    }).filter(r => r.amount > 0);

  const pendingLoc   = locEntries.filter(r => !r.confirmed);
  const confirmedLoc = locEntries.filter(r =>  r.confirmed);

  const confirmLoc = (r) => {
    update({ locations: (data.locations||[]).map(l => l.id !== r.locId ? l :
      { ...l, paymentConfirmed: true, paymentConfirmedBy: username, paymentConfirmedDate: today() }) });
  };
  const unconfirmLoc = (r) => {
    update({ locations: (data.locations||[]).map(l => l.id !== r.locId ? l :
      { ...l, paymentConfirmed: false, paymentConfirmedBy: null, paymentConfirmedDate: null }) });
  };

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
      const newST = (ev.settledTransfers||[]).map(s =>
        (s.from === r.from && s.to === r.to)
          ? { ...s, confirmed: true, confirmedBy: username, confirmedDate: today() }
          : s
      );
      if (!ev.settledTransfers?.find(s => s.from === r.from && s.to === r.to))
        newST.push({ id: uid(), from: r.from, to: r.to, amount: r.amount, settledAt: today(), confirmed: true, confirmedBy: username, confirmedDate: today() });
      update({ events: events.map(e => e.id !== r.eventId ? e : { ...e, settledTransfers: newST }) });
    }
  };

  // Confirmer tout un groupe (from→to) en une seule passe + auto-archive si tout réglé
  const confirmGroup = (group) => {
    const assoByDep = {};
    const evByEvent = {};
    group.entries.forEach(r => {
      if (r.source === "asso") { (assoByDep[r.depId] = assoByDep[r.depId]||[]).push(r.id); }
      else                     { (evByEvent[r.eventId] = evByEvent[r.eventId]||[]).push({ from: r.from, to: r.to, amount: r.amount }); }
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
        const pairs = evByEvent[ev.id];
        const newST = (ev.settledTransfers||[]).map(s => {
          const match = pairs.find(p => p.from === s.from && p.to === s.to);
          return match ? { ...s, confirmed: true, confirmedBy: username, confirmedDate: today() } : s;
        });
        pairs.forEach(p => {
          if (!newST.find(s => s.from === p.from && s.to === p.to))
            newST.push({ id: uid(), from: p.from, to: p.to, amount: p.amount, settledAt: today(), confirmed: true, confirmedBy: username, confirmedDate: today() });
        });
        const allTransfers = computeMinimalTransfers(ev.members, ev.expenses, ev.revenues);
        const allDone = allTransfers.length > 0 && allTransfers.every(t => newST.find(s => s.from === t.from && s.to === t.to)?.confirmed);
        return { ...ev, settledTransfers: newST, ...(allDone ? { financiallyClosed: true } : {}) };
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
        ...e, settledTransfers: (e.settledTransfers||[]).map(s =>
          (s.from === r.from && s.to === r.to)
            ? { ...s, confirmed: false, confirmedBy: null, confirmedDate: null }
            : s
        )
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
            {fromBank ? "Banque" : r.from}
            <span style={{ color: C.muted, fontWeight: "400" }}> → </span>
            {toBank ? "Banque" : r.to}
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

  // ── Recettes externes CRUD ──
  const submitRecExt = () => {
    if (!recExtForm.label.trim() || !recExtForm.amount) return;
    const entry = { id: uid(), label: recExtForm.label.trim(), amount: parseFloat(recExtForm.amount) || 0, date: recExtForm.date || today(), cat: recExtForm.cat, note: recExtForm.note.trim(), createdBy: username };
    update({ recettesExternes: [...recExternes, entry] }, { action: "AJOUT", target: "Comptabilité", details: `Recette externe : ${entry.label}` });
    setRecExtForm({ label: "", amount: "", date: today(), cat: "Autre", note: "" });
    setRecExtOpen(false);
  };
  const saveRecExtEdit = () => {
    if (!recExtEdit) return;
    update({ recettesExternes: recExternes.map(r => r.id !== recExtEdit.id ? r : { ...r, label: recExtEdit.label, amount: parseFloat(recExtEdit.amount)||0, date: recExtEdit.date, cat: recExtEdit.cat, note: recExtEdit.note }) });
    setRecExtEdit(null);
  };
  const deleteRecExt = (id) => {
    if (!confirm("Supprimer cette recette ?")) return;
    update({ recettesExternes: recExternes.filter(r => r.id !== id) }, { action: "SUPPR", target: "Comptabilité", details: "Recette externe supprimée" });
  };

  // ── Bilan comptable ──
  const totRevEv     = events.reduce((a, e) => a + sumArr(e.revenues||[], "amount"), 0);
  const totExpEv     = events.reduce((a, e) => a + sumArr(e.expenses||[], "amount"), 0);
  const totDepAsso   = sumArr(depenses, "amount");
  const totPrestCA   = prestations.filter(p2 => p2.statut === "Confirmé" || p2.statut === "Terminé").reduce((a, p2) => a + prestCalcTotal(p2), 0);
  const totPrestExp  = prestations.reduce((a, p2) => a + sumArr(p2.expenses||[], "amount"), 0);
  const totLocCA     = locations.filter(l => l.statut === "Confirmé" || l.statut === "Terminé" || l.statut === "En cours").reduce((a, l) => a + locCalcTotal(l), 0);
  const totRecExt    = sumArr(recExternes, "amount");
  const totProduits  = totRevEv + totPrestCA + totLocCA + totRecExt;
  const totCharges   = totExpEv + totDepAsso + totPrestExp;
  const bilanNet     = totProduits - totCharges;

  // ── Bilan mensuel ──
  const [bilanYear, bilanMonthNum] = bilanMonth.split("-").map(Number);
  const inMonth = (dateStr) => {
    if (!dateStr) return false;
    const [y, m] = dateStr.split("-").map(Number);
    return y === bilanYear && m === bilanMonthNum;
  };
  const mRevEv    = events.reduce((a, e) => a + (e.revenues||[]).filter(r => inMonth(r.date||e.date)).reduce((b, r) => b + r.amount, 0), 0);
  const mExpEv    = events.reduce((a, e) => a + (e.expenses||[]).filter(ex => inMonth(ex.date||e.date)).reduce((b, ex) => b + ex.amount, 0), 0);
  const mDepAsso  = depenses.filter(d => inMonth(d.date)).reduce((a, d) => a + d.amount, 0);
  const mPrestCA  = prestations.filter(p2 => inMonth(p2.dateStart||p2.date) && (p2.statut === "Confirmé" || p2.statut === "Terminé")).reduce((a, p2) => a + prestCalcTotal(p2), 0);
  const mPrestExp = prestations.reduce((a, p2) => a + (p2.expenses||[]).filter(ex => inMonth(ex.date)).reduce((b, ex) => b + ex.amount, 0), 0);
  const mLocCA    = locations.filter(l => inMonth(l.dateStart) && (l.statut === "Confirmé" || l.statut === "Terminé" || l.statut === "En cours")).reduce((a, l) => a + locCalcTotal(l), 0);
  const mRecExt   = recExternes.filter(r => inMonth(r.date)).reduce((a, r) => a + r.amount, 0);
  const mProduits = mRevEv + mPrestCA + mLocCA + mRecExt;
  const mCharges  = mExpEv + mDepAsso + mPrestExp;
  const mBilanNet = mProduits - mCharges;

  const printRapportMensuel = () => {
    const monthLabel = new Date(bilanYear, bilanMonthNum - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const genDate    = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    const assocName  = data.assoc?.name || "Association";
    const siret      = data.assoc?.siret ? `SIRET ${data.assoc.siret}` : "Association loi 1901";

    // Lignes détail événements revenus du mois
    const evRevLines = events.flatMap(e =>
      (e.revenues||[]).filter(r => inMonth(r.date||e.date)).map(r => ({ label: r.label||r.type||"Recette", source: e.name, amount: r.amount, type: r.type }))
    );
    const recExtLines = recExternes.filter(r => inMonth(r.date)).map(r => ({ label: r.label, source: r.cat||"Autre", amount: r.amount, note: r.note||"" }));
    const evExpLines = events.flatMap(e =>
      (e.expenses||[]).filter(ex => inMonth(ex.date||e.date)).map(ex => ({ label: ex.label, source: e.name, amount: ex.amount, cat: ex.category, paidBy: ex.paidBy }))
    );
    const assoExpLines = depenses.filter(d => inMonth(d.date)).map(d => ({ label: d.label, source: "Asso", amount: d.amount, cat: d.category }));
    const prestLines = prestations.filter(p2 => inMonth(p2.dateStart||p2.date) && (p2.statut === "Confirmé" || p2.statut === "Terminé")).map(p2 => ({ label: p2.label, amount: prestCalcTotal(p2), client: p2.client?.name }));
    const prestExpLines = prestations.flatMap(p2 => (p2.expenses||[]).filter(ex => inMonth(ex.date)).map(ex => ({ label: ex.label, source: p2.label, amount: ex.amount, cat: ex.category })));
    const locLines = locations.filter(l => inMonth(l.dateStart) && (l.statut === "Confirmé" || l.statut === "Terminé" || l.statut === "En cours")).map(l => ({ label: l.label, amount: locCalcTotal(l), client: l.client?.name }));

    const row = (label, source, amount, extra = "") =>
      `<tr><td>${label}</td><td style="color:#888">${source||""}</td><td style="color:#888;font-size:11px">${extra}</td><td class="right">${amount >= 0 ? "+" : ""}${amount.toLocaleString("fr-FR", { style:"currency", currency:"EUR" })}</td></tr>`;

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Rapport comptable ${monthLabel} — ${assocName}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#111;padding:32px}
h1{font-size:22px;font-weight:800;margin-bottom:2px}h2{font-size:14px;font-weight:700;margin:20px 0 10px;border-bottom:2px solid #9d6fe8;padding-bottom:4px;color:#9d6fe8}
.meta{color:#555;font-size:12px;margin-bottom:24px}
table{width:100%;border-collapse:collapse;margin-bottom:8px}
th{background:#9d6fe8;color:#fff;padding:7px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
td{padding:6px 10px;border-bottom:1px solid #eee;font-size:12px}td.right{text-align:right;font-family:'Courier New',monospace;font-weight:600}
.total-row td{font-weight:700;border-top:2px solid #9d6fe8;background:#f8f5ff;font-size:13px}
.bilan-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px}
.bilan-box{border:1px solid #ddd;border-radius:8px;padding:12px;text-align:center}
.bilan-val{font-size:20px;font-weight:800;font-family:'Courier New',monospace}
.bilan-lbl{font-size:11px;color:#666;margin-top:4px}
.positive{color:#2ecc71}.negative{color:#e74c3c}.neutral{color:#9d6fe8}
footer{margin-top:28px;padding-top:10px;border-top:1px solid #ddd;display:flex;justify-content:space-between;font-size:10px;color:#888}
@media print{body{padding:16px}}
</style></head><body>
<h1>Rapport comptable — ${monthLabel}</h1>
<div class="meta">${assocName} · ${siret} · Généré le ${genDate}</div>

<div class="bilan-grid">
  <div class="bilan-box"><div class="bilan-val positive">+${mProduits.toLocaleString("fr-FR",{style:"currency",currency:"EUR"})}</div><div class="bilan-lbl">Total produits</div></div>
  <div class="bilan-box"><div class="bilan-val negative">-${mCharges.toLocaleString("fr-FR",{style:"currency",currency:"EUR"})}</div><div class="bilan-lbl">Total charges</div></div>
  <div class="bilan-box"><div class="bilan-val ${mBilanNet >= 0 ? "positive" : "negative"}">${mBilanNet >= 0 ? "+" : ""}${mBilanNet.toLocaleString("fr-FR",{style:"currency",currency:"EUR"})}</div><div class="bilan-lbl">Résultat net du mois</div></div>
</div>

${evRevLines.length > 0 ? `<h2>Recettes événements (${evRevLines.length})</h2>
<table><tr><th>Libellé</th><th>Événement</th><th>Type</th><th>Montant</th></tr>
${evRevLines.map(l => row(l.label, l.source, l.amount, l.type||"")).join("")}
<tr class="total-row"><td colspan="3">Sous-total</td><td class="right">+${mRevEv.toLocaleString("fr-FR",{style:"currency",currency:"EUR"})}</td></tr>
</table>` : ""}

${recExtLines.length > 0 ? `<h2>Recettes externes (${recExtLines.length})</h2>
<table><tr><th>Libellé</th><th>Catégorie</th><th>Note</th><th>Montant</th></tr>
${recExtLines.map(l => row(l.label, l.source, l.amount, l.note||"")).join("")}
<tr class="total-row"><td colspan="3">Sous-total</td><td class="right">+${mRecExt.toLocaleString("fr-FR",{style:"currency",currency:"EUR"})}</td></tr>
</table>` : ""}

${prestLines.length > 0 ? `<h2>CA Prestations (${prestLines.length})</h2>
<table><tr><th>Prestation</th><th>Client</th><th></th><th>Montant</th></tr>
${prestLines.map(l => row(l.label, l.client||"—", l.amount, "")).join("")}
<tr class="total-row"><td colspan="3">Sous-total</td><td class="right">+${mPrestCA.toLocaleString("fr-FR",{style:"currency",currency:"EUR"})}</td></tr>
</table>` : ""}

${locLines.length > 0 ? `<h2>CA Locations (${locLines.length})</h2>
<table><tr><th>Location</th><th>Client</th><th></th><th>Montant</th></tr>
${locLines.map(l => row(l.label, l.client||"—", l.amount, "")).join("")}
<tr class="total-row"><td colspan="3">Sous-total</td><td class="right">+${mLocCA.toLocaleString("fr-FR",{style:"currency",currency:"EUR"})}</td></tr>
</table>` : ""}

${evExpLines.length > 0 ? `<h2>Dépenses événements (${evExpLines.length})</h2>
<table><tr><th>Libellé</th><th>Événement</th><th>Catégorie</th><th>Montant</th></tr>
${evExpLines.map(l => row(l.label, l.source, -l.amount, l.cat||"")).join("")}
<tr class="total-row"><td colspan="3">Sous-total</td><td class="right">-${mExpEv.toLocaleString("fr-FR",{style:"currency",currency:"EUR"})}</td></tr>
</table>` : ""}

${assoExpLines.length > 0 ? `<h2>Dépenses association (${assoExpLines.length})</h2>
<table><tr><th>Libellé</th><th>Source</th><th>Catégorie</th><th>Montant</th></tr>
${assoExpLines.map(l => row(l.label, l.source, -l.amount, l.cat||"")).join("")}
<tr class="total-row"><td colspan="3">Sous-total</td><td class="right">-${mDepAsso.toLocaleString("fr-FR",{style:"currency",currency:"EUR"})}</td></tr>
</table>` : ""}

${prestExpLines.length > 0 ? `<h2>Dépenses prestations (${prestExpLines.length})</h2>
<table><tr><th>Libellé</th><th>Prestation</th><th>Catégorie</th><th>Montant</th></tr>
${prestExpLines.map(l => row(l.label, l.source, -l.amount, l.cat||"")).join("")}
<tr class="total-row"><td colspan="3">Sous-total</td><td class="right">-${mPrestExp.toLocaleString("fr-FR",{style:"currency",currency:"EUR"})}</td></tr>
</table>` : ""}

${(mProduits === 0 && mCharges === 0) ? `<p style="color:#888;font-style:italic;margin-top:20px">Aucune opération enregistrée pour ce mois.</p>` : ""}

<footer><span>${assocName} — ${siret}</span><span>Rapport généré le ${genDate}</span></footer>
</body></html>`;
    const w = window.open("", "_blank"); w.document.write(html); w.document.close(); w.onload = () => w.print();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "6px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ fontFamily: C.display, fontSize: "26px", fontWeight: "800", letterSpacing: "-0.8px" }}>Comptabilité</h1>
          <p style={{ color: C.muted, fontSize: "14px", marginTop: "4px" }}>Suivi de la trésorerie et des remboursements</p>
        </div>
        <div style={{ display: "flex", gap: "2px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
          {[
            { id: "remboursements", label: `Remboursements${awaitingGrouped.length + pendingRevenues.length + pendingPresta.length + pendingLoc.length > 0 ? ` (${awaitingGrouped.length + pendingRevenues.length + pendingPresta.length + pendingLoc.length})` : ""}` },
            { id: "recettes",       label: `Recettes externes${recExternes.length > 0 ? ` (${recExternes.length})` : ""}` },
            { id: "bilan",          label: "Bilan comptable" },
            { id: "archive",        label: `Archive (${confirmed.length + confirmedRevenues.length + confirmedPresta.length + confirmedLoc.length})` },
          ].map(t => (
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
          ) : (
            <>
              <div style={{ fontFamily: C.mono, fontSize: "20px", color: C.info, marginTop: "4px" }}>{fmt(bankBalance)}</div>
              {bankThreshold > 0 && (
                <div style={{ fontSize: "11px", marginTop: "4px", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ color: C.muted }}>Seuil : <span style={{ color: C.warn, fontFamily: C.mono }}>{fmt(bankThreshold)}</span></span>
                  <span style={{ color: C.muted }}>Dispo : <span style={{ fontFamily: C.mono, fontWeight: "700", color: effectiveBankBalance > 0 ? C.accent : C.danger }}>{fmt(effectiveBankBalance)}</span></span>
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ ...s.card(), border: bankThreshold > 0 ? `1px solid ${C.warn}30` : undefined }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={s.label}>Seuil de sécurité</div>
            {canTreasury && <button onClick={() => { setEditThreshold(!editThreshold); setThreshVal(String(bankThreshold)); }} style={{ ...s.btn("ghost"), padding: "2px 7px", fontSize: "11px" }}>{editThreshold ? "Annuler" : "Modifier"}</button>}
          </div>
          {editThreshold ? (
            <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
              <input type="number" min="0" style={s.inp({ flex: 1 })} value={threshVal} onChange={e => setThreshVal(e.target.value)} autoFocus placeholder="0" />
              <button style={s.btn("primary", { padding: "6px 10px", fontSize: "12px" })} onClick={() => { update({ assoc: { ...data.assoc, bankThreshold: Math.max(0, parseFloat(threshVal)||0) } }); setEditThreshold(false); }}>OK</button>
            </div>
          ) : (
            <>
              <div style={{ fontFamily: C.mono, fontSize: "20px", color: bankThreshold > 0 ? C.warn : C.muted, marginTop: "4px" }}>{fmt(bankThreshold)}</div>
              <div style={{ fontSize: "10px", color: C.muted, marginTop: "3px" }}>
                {bankThreshold > 0 ? "Montant réservé, jamais utilisé pour les remboursements" : "Aucun seuil défini — le compte peut descendre à 0"}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Virements sortants banque — sous les KPIs */}
      {tab === "remboursements" && (() => {
        const bankPending   = pendingGrouped.filter(g => g.from === "Banque");
        const bankConfirmed = groupByPair(confirmed.filter(r => r.from === "Banque"));
        if (bankPending.length === 0 && bankConfirmed.length === 0) return null;
        return (
          <div style={{ ...s.card({ marginBottom: "20px" }), borderColor: `${C.accent}40` }}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px" }}>
              Virements sortants banque
              {bankPending.length > 0 && <span style={{ fontSize: "12px", color: C.accent, fontWeight: "400", marginLeft: "8px" }}>{bankPending.length} à confirmer</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {bankPending.map(g => (
                <div key={`${g.from}→${g.to}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: C.card2, borderRadius: "8px", borderLeft: `3px solid ${C.accent}`, flexWrap: "wrap", gap: "8px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: "600" }}>
                      Banque <span style={{ color: C.muted, fontWeight: "400" }}>→</span> <span style={{ color: C.accent }}>{g.to}</span>
                    </div>
                    <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>{g.sources.join(" · ")}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                    <span style={{ fontFamily: C.mono, fontSize: "14px", fontWeight: "700", color: C.accent }}>{fmt(g.total)}</span>
                    {canTreasury && <button onClick={() => confirmGroup(g)} style={s.btn("primary", { padding: "5px 12px", fontSize: "12px" })}>Confirmer ✓</button>}
                  </div>
                </div>
              ))}
              {bankConfirmed.length > 0 && bankPending.length > 0 && <div style={{ borderTop: `1px solid ${C.border}`, marginTop: "4px", paddingTop: "4px" }} />}
              {bankConfirmed.map(g => (
                <div key={`confirmed-${g.from}→${g.to}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: `${C.accent}08`, borderRadius: "8px", opacity: 0.7, flexWrap: "wrap", gap: "6px" }}>
                  <div style={{ fontSize: "12px" }}>
                    <span style={{ color: C.accent }}>✓ </span>
                    <span>Banque → <strong>{g.to}</strong></span>
                    <span style={{ fontFamily: C.mono, color: C.muted, marginLeft: "8px" }}>{fmt(g.total)}</span>
                    <div style={{ fontSize: "11px", color: C.muted, marginTop: "1px" }}>{g.sources.join(" · ")}</div>
                  </div>
                  {canTreasury && <button onClick={() => g.entries.forEach(r => unconfirmEntry(r))} style={s.btn("ghost", { padding: "3px 8px", fontSize: "11px" })}>Annuler</button>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {tab === "remboursements" && (() => {
        const GroupRow = ({ g, action, actionLabel }) => {
          const fromBank = g.from === "Banque", toBank = g.to === "Banque";
          const bColor = fromBank ? C.accent : toBank ? C.info : C.warn;
          return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: C.card2, borderRadius: "8px", borderLeft: `3px solid ${bColor}`, flexWrap: "wrap", gap: "8px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: "600" }}>
                  {fromBank ? "Banque" : g.from}
                  <span style={{ color: C.muted, fontWeight: "400" }}> → </span>
                  {toBank ? "Banque" : g.to}
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
                : (() => {
                    // Regrouper par payeur (from)
                    const byPayer = Object.values(
                      pendingGrouped.reduce((acc, g) => {
                        if (!acc[g.from]) acc[g.from] = { from: g.from, total: 0, rows: [] };
                        acc[g.from].total = Math.round((acc[g.from].total + g.total) * 100) / 100;
                        acc[g.from].rows.push(g);
                        return acc;
                      }, {})
                    );
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {byPayer.map(payer => (
                          <div key={payer.from} style={{ background: C.card2, borderRadius: "10px", overflow: "hidden" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
                              <span style={{ fontSize: "13px", fontWeight: "700" }}>{payer.from}</span>
                              <span style={{ fontFamily: C.mono, fontSize: "13px", fontWeight: "700", color: C.warn }}>{fmt(payer.total)}</span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              {payer.rows.map(g => (
                                <div key={`${g.from}→${g.to}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "transparent", flexWrap: "wrap", gap: "8px" }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ fontSize: "13px", color: C.muted }}>→ </span>
                                    <span style={{ fontSize: "13px", fontWeight: "600", color: g.to === "Banque" ? C.info : C.accent }}>{g.to}</span>
                                    <div style={{ fontSize: "11px", color: C.muted, marginTop: "1px" }}>{g.sources.join(" · ")}</div>
                                  </div>
                                  <span style={{ fontFamily: C.mono, fontSize: "13px", fontWeight: "600", color: C.warn }}>{fmt(g.total)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()
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

            {/* Recettes attendues */}
            {(() => {
              const totalPending = pendingRevenues.length + pendingPresta.length + pendingLoc.length;
              const RecetteRow = ({ r, onConfirm, onUnconfirm, color, icon, extra }) => (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: r.confirmed ? `${color}08` : C.card2, borderRadius: "8px", borderLeft: `3px solid ${r.confirmed ? color+"40" : color}`, flexWrap: "wrap", gap: "8px", opacity: r.confirmed ? 0.75 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: "600" }}>
                      {r.confirmed && <span style={{ color }}> ✓ </span>}
                      {r.from}
                      <span style={{ color: C.muted, fontWeight: "400" }}> → </span>
                      Banque
                    </div>
                    <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>
                      {icon} {r.label}
                      {extra && <span> · {extra}</span>}
                      {r.date && <span> · {r.date}</span>}
                      {r.confirmed && r.confirmedBy && <span> · confirmé par {r.confirmedBy} le {r.confirmedDate}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                    <span style={{ fontFamily: C.mono, fontSize: "14px", fontWeight: "700", color }}>{fmt(r.amount)}</span>
                    {canTreasury && !r.confirmed && <button onClick={() => onConfirm(r)} style={s.btn("primary", { padding: "5px 12px", fontSize: "12px" })}>Confirmer reçu ✓</button>}
                    {canTreasury && r.confirmed && onUnconfirm && <button onClick={() => onUnconfirm(r)} style={s.btn("ghost", { padding: "3px 8px", fontSize: "11px" })}>Annuler</button>}
                  </div>
                </div>
              );
              return (
                <div style={s.card()}>
                  <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "4px" }}>
                    Recettes à encaisser
                    {totalPending > 0 && <span style={{ fontSize: "12px", color: C.info, fontWeight: "400", marginLeft: "8px" }}>{totalPending} en attente</span>}
                  </div>
                  <p style={{ fontSize: "12px", color: C.muted, marginBottom: "12px" }}>Confirmez dès qu'un paiement est visible sur le compte, puis mettez le solde à jour.</p>
                  {totalPending === 0
                    ? <p style={{ color: C.accent, fontSize: "13px" }}>✓ Toutes les recettes ont été confirmées.</p>
                    : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {pendingRevenues.length > 0 && (
                          <div>
                            <div style={{ fontSize: "11px", color: C.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Recettes événements</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {pendingRevenues.map(r => <RecetteRow key={r.id} r={r} onConfirm={confirmRevenue} onUnconfirm={null} color={C.info} icon="◆" extra={r.type} />)}
                            </div>
                          </div>
                        )}
                        {pendingPresta.length > 0 && (
                          <div>
                            <div style={{ fontSize: "11px", color: C.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Prestations</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {pendingPresta.map(r => <RecetteRow key={r.id} r={r} onConfirm={confirmPresta} onUnconfirm={null} color={C.accent} icon="◎" extra={null} />)}
                            </div>
                          </div>
                        )}
                        {pendingLoc.length > 0 && (
                          <div>
                            <div style={{ fontSize: "11px", color: C.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Locations</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {pendingLoc.map(r => <RecetteRow key={r.id} r={r} onConfirm={confirmLoc} onUnconfirm={null} color={C.warn} icon="◧" extra={null} />)}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  }
                </div>
              );
            })()}
          </div>
        );
      })()}

      {tab === "recettes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Formulaire d'ajout */}
          <div style={s.card()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: recExtOpen ? "16px" : "0" }}>
              <div>
                <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px" }}>Recettes externes</div>
                <div style={{ fontSize: "12px", color: C.muted, marginTop: "2px" }}>Ventes de matériel, dons, cotisations, etc.</div>
              </div>
              {canTreasury && (
                <button style={s.btn(recExtOpen ? "ghost" : "primary")} onClick={() => { setRecExtOpen(!recExtOpen); setRecExtForm({ label: "", amount: "", date: today(), cat: "Autre", note: "" }); }}>
                  {recExtOpen ? "Annuler" : "+ Ajouter"}
                </button>
              )}
            </div>
            {recExtOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <div style={s.label}>Libellé *</div>
                    <input style={s.inp()} placeholder="Ex : Vente sono, Don association…" value={recExtForm.label} onChange={e => setRecExtForm(f => ({ ...f, label: e.target.value }))} />
                  </div>
                  <div>
                    <div style={s.label}>Montant (€) *</div>
                    <input type="number" min="0" step="0.01" style={s.inp()} placeholder="0.00" value={recExtForm.amount} onChange={e => setRecExtForm(f => ({ ...f, amount: e.target.value }))} />
                  </div>
                  <div>
                    <div style={s.label}>Date</div>
                    <input type="date" style={s.inp()} value={recExtForm.date} onChange={e => setRecExtForm(f => ({ ...f, date: e.target.value }))} />
                  </div>
                  <div>
                    <div style={s.label}>Catégorie</div>
                    <select style={s.inp()} value={recExtForm.cat} onChange={e => setRecExtForm(f => ({ ...f, cat: e.target.value }))}>
                      {REC_EXT_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div style={s.label}>Note (optionnel)</div>
                  <input style={s.inp()} placeholder="Précision, contexte…" value={recExtForm.note} onChange={e => setRecExtForm(f => ({ ...f, note: e.target.value }))} />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button style={s.btn("primary")} onClick={submitRecExt}>Enregistrer</button>
                </div>
              </div>
            )}
          </div>

          {/* Liste des recettes */}
          <div style={s.card()}>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px" }}>
              Historique
              <span style={{ fontSize: "12px", color: C.muted, fontWeight: "400", marginLeft: "8px" }}>{recExternes.length} entrée{recExternes.length !== 1 ? "s" : ""} · total {fmt(totRecExt)}</span>
            </div>
            {recExternes.length === 0
              ? <p style={{ color: C.muted, fontSize: "13px" }}>Aucune recette externe enregistrée.</p>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {[...recExternes].sort((a, b) => (b.date||"").localeCompare(a.date||"")).map(r => (
                    <div key={r.id}>
                      {recExtEdit?.id === r.id ? (
                        <div style={{ background: C.card2, borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            <input style={s.inp()} value={recExtEdit.label} onChange={e => setRecExtEdit(x => ({ ...x, label: e.target.value }))} />
                            <input type="number" min="0" step="0.01" style={s.inp()} value={recExtEdit.amount} onChange={e => setRecExtEdit(x => ({ ...x, amount: e.target.value }))} />
                            <input type="date" style={s.inp()} value={recExtEdit.date} onChange={e => setRecExtEdit(x => ({ ...x, date: e.target.value }))} />
                            <select style={s.inp()} value={recExtEdit.cat} onChange={e => setRecExtEdit(x => ({ ...x, cat: e.target.value }))}>
                              {REC_EXT_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <input style={s.inp()} placeholder="Note…" value={recExtEdit.note||""} onChange={e => setRecExtEdit(x => ({ ...x, note: e.target.value }))} />
                          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                            <button style={s.btn("ghost", { padding: "5px 12px", fontSize: "12px" })} onClick={() => setRecExtEdit(null)}>Annuler</button>
                            <button style={s.btn("primary", { padding: "5px 12px", fontSize: "12px" })} onClick={saveRecExtEdit}>Sauvegarder</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: C.card2, borderRadius: "8px", borderLeft: `3px solid #2ecc71`, flexWrap: "wrap", gap: "8px" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: "600" }}>{r.label}</div>
                            <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>
                              {r.cat}
                              {r.date && <span> · {r.date}</span>}
                              {r.note && <span> · {r.note}</span>}
                              {r.createdBy && <span> · par {r.createdBy}</span>}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                            <span style={{ fontFamily: C.mono, fontSize: "14px", fontWeight: "700", color: "#2ecc71" }}>+{fmt(r.amount)}</span>
                            {canTreasury && (
                              <>
                                <button onClick={() => setRecExtEdit({ ...r })} style={s.btn("ghost", { padding: "4px 9px", fontSize: "11px" })}>Modifier</button>
                                <button onClick={() => deleteRecExt(r.id)} style={s.btn("danger", { padding: "4px 9px", fontSize: "11px" })}>Suppr.</button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        </div>
      )}

      {tab === "bilan" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

          {/* Bilan annuel par mois */}
          {(() => {
            const MOIS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
            const inY = (dateStr) => dateStr && dateStr.startsWith(String(anneeGlobal));
            const byMonth = Array.from({ length: 12 }, (_, mi) => {
              const m = mi + 1;
              const pad = String(m).padStart(2, "0");
              const pfx = `${anneeGlobal}-${pad}`;
              const inM = (d) => d && d.startsWith(pfx);
              const revEv   = events.reduce((a,e) => a + (e.revenues||[]).filter(r=>inM(r.date||e.date)).reduce((b,r)=>b+r.amount,0), 0);
              const expEv   = events.reduce((a,e) => a + (e.expenses||[]).filter(ex=>inM(ex.date||e.date)).reduce((b,ex)=>b+ex.amount,0), 0);
              const depA    = depenses.filter(d=>inM(d.date)).reduce((a,d)=>a+d.amount,0);
              const prestCA = prestations.filter(p2=>inM(p2.dateStart||p2.date)&&(p2.statut==="Confirmé"||p2.statut==="Terminé")).reduce((a,p2)=>a+prestCalcTotal(p2),0);
              const prestEx = prestations.reduce((a,p2)=>a+(p2.expenses||[]).filter(ex=>inM(ex.date)).reduce((b,ex)=>b+ex.amount,0),0);
              const locCA   = locations.filter(l=>inM(l.dateStart)&&(l.statut==="Confirmé"||l.statut==="Terminé"||l.statut==="En cours")).reduce((a,l)=>a+locCalcTotal(l),0);
              const recExt  = recExternes.filter(r=>inM(r.date||"")).reduce((a,r)=>a+r.amount,0);
              const produits = revEv + prestCA + locCA + recExt;
              const charges  = expEv + depA + prestEx;
              return { mois: MOIS[mi], produits, charges, net: produits - charges };
            });
            const anneeTotal = byMonth.reduce((a,m) => ({ produits: a.produits+m.produits, charges: a.charges+m.charges, net: a.net+m.net }), { produits:0, charges:0, net:0 });
            const hasData = byMonth.some(m => m.produits > 0 || m.charges > 0);
            const tooltipStyle2 = { background: C.card2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 };
            // Années disponibles (à partir des données)
            const allYears = [...new Set([
              ...events.flatMap(e => [(e.date||"").slice(0,4), ...(e.revenues||[]).map(r=>(r.date||"").slice(0,4)), ...(e.expenses||[]).map(ex=>(ex.date||"").slice(0,4))]),
              ...depenses.map(d=>(d.date||"").slice(0,4)),
              ...prestations.map(p2=>(p2.dateStart||p2.date||"").slice(0,4)),
              ...locations.map(l=>(l.dateStart||"").slice(0,4)),
            ].filter(Boolean).filter(y=>y.length===4).map(Number))].sort((a,b)=>b-a);
            if (allYears.length === 0) allYears.push(new Date().getFullYear());

            return (
              <div style={s.card()}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px" }}>Bilan annuel par mois</div>
                  <select style={s.inp({ width: "auto" })} value={anneeGlobal} onChange={e => setAnneeGlobal(Number(e.target.value))}>
                    {allYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>

                {/* KPIs annuels */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginBottom: "18px" }}>
                  {[
                    { label: "Produits", value: anneeTotal.produits, color: "#2ecc71", sign: "+" },
                    { label: "Charges",  value: anneeTotal.charges,  color: C.danger,  sign: "-" },
                    { label: "Résultat net", value: anneeTotal.net, color: anneeTotal.net >= 0 ? "#2ecc71" : C.danger, sign: anneeTotal.net >= 0 ? "+" : "" },
                    { label: "Solde bancaire", value: bankBalance, color: bankBalance >= 0 ? C.accent : C.danger, sign: "" },
                  ].map(({ label, value, color, sign }) => (
                    <div key={label} style={{ background: C.card2, borderRadius: "8px", padding: "12px 14px", border: `1px solid ${C.border}` }}>
                      <div style={s.label}>{label}</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "18px", fontWeight: "700", color, marginTop: "4px" }}>{sign}{fmt(Math.abs(value))}</div>
                    </div>
                  ))}
                </div>

                {/* Graphique */}
                {hasData && (
                  <div style={{ marginBottom: "18px" }}>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={byMonth} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="25%">
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                        <XAxis dataKey="mois" tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                        <Tooltip contentStyle={tooltipStyle2} formatter={(v, n) => [fmt(v), n]} />
                        <Legend wrapperStyle={{ fontSize: 11, color: C.muted }} />
                        <Bar dataKey="produits" name="Produits" fill="#2ecc71" radius={[3,3,0,0]} />
                        <Bar dataKey="charges"  name="Charges"  fill={C.danger}  radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Tableau mensuel */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr>
                        {["Mois","Produits","Charges","Résultat net"].map(h => (
                          <th key={h} style={{ padding: "7px 10px", textAlign: h === "Mois" ? "left" : "right", background: C.card2, color: C.muted, fontWeight: "600", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.4px", borderBottom: `1px solid ${C.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {byMonth.map((m, i) => {
                        const isCurrentMonth = new Date().getFullYear() === anneeGlobal && new Date().getMonth() === i;
                        const hasActivity = m.produits > 0 || m.charges > 0;
                        return (
                          <tr key={m.mois} style={{ opacity: hasActivity ? 1 : 0.4, background: isCurrentMonth ? `${C.accent}10` : "transparent" }}>
                            <td style={{ padding: "7px 10px", fontWeight: isCurrentMonth ? "700" : "400", color: isCurrentMonth ? C.accent : C.text }}>
                              {m.mois} {isCurrentMonth && <span style={{ fontSize: "10px", background: `${C.accent}25`, color: C.accent, padding: "1px 6px", borderRadius: "10px", marginLeft: "4px" }}>Ce mois</span>}
                            </td>
                            <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "'DM Mono',monospace", color: m.produits > 0 ? "#2ecc71" : C.muted }}>{m.produits > 0 ? `+${fmt(m.produits)}` : "—"}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "'DM Mono',monospace", color: m.charges > 0 ? C.danger : C.muted }}>{m.charges > 0 ? `-${fmt(m.charges)}` : "—"}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "'DM Mono',monospace", fontWeight: hasActivity ? "700" : "400", color: !hasActivity ? C.muted : m.net >= 0 ? "#2ecc71" : C.danger }}>
                              {hasActivity ? `${m.net >= 0 ? "+" : ""}${fmt(m.net)}` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${C.border}` }}>
                        <td style={{ padding: "8px 10px", fontWeight: "700", fontSize: "13px" }}>Total {anneeGlobal}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono',monospace", fontWeight: "700", color: "#2ecc71" }}>+{fmt(anneeTotal.produits)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono',monospace", fontWeight: "700", color: C.danger }}>-{fmt(anneeTotal.charges)}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "'DM Mono',monospace", fontWeight: "800", fontSize: "13px", color: anneeTotal.net >= 0 ? "#2ecc71" : C.danger }}>{anneeTotal.net >= 0 ? "+" : ""}{fmt(anneeTotal.net)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {!hasData && <p style={{ color: C.muted, fontSize: "13px", marginTop: "12px" }}>Aucune donnée pour {anneeGlobal}.</p>}
              </div>
            );
          })()}

          {/* Rapport mensuel */}
          <div style={s.card()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px" }}>Rapport mensuel</div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <input type="month" style={s.inp({ width: "auto" })} value={bilanMonth} onChange={e => setBilanMonth(e.target.value)} />
                <button style={s.btn("primary", { padding: "8px 16px" })} onClick={printRapportMensuel}>📄 Exporter PDF</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginBottom: "14px" }}>
              {[
                { label: "Produits",    value: mProduits, color: "#2ecc71", sign: "+" },
                { label: "Charges",     value: mCharges,  color: C.danger,  sign: "-" },
                { label: "Résultat",    value: mBilanNet, color: mBilanNet >= 0 ? "#2ecc71" : C.danger, sign: mBilanNet >= 0 ? "+" : "" },
              ].map(({ label, value, color, sign }) => (
                <div key={label} style={{ background: C.card2, borderRadius: "8px", padding: "12px 14px", border: `1px solid ${C.border}` }}>
                  <div style={s.label}>{label}</div>
                  <div style={{ fontFamily: "'DM Mono', monospace", fontSize: "18px", fontWeight: "700", color, marginTop: "4px" }}>{sign}{fmt(Math.abs(value))}</div>
                </div>
              ))}
            </div>
            {mProduits === 0 && mCharges === 0
              ? <p style={{ color: C.muted, fontSize: "13px" }}>Aucune opération enregistrée pour ce mois.</p>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {[
                    { label: "Recettes événements", value: mRevEv, color: "#2ecc71", sign: "+" },
                    { label: "CA Prestations", value: mPrestCA, color: "#2ecc71", sign: "+" },
                    { label: "CA Locations", value: mLocCA, color: "#2ecc71", sign: "+" },
                    { label: "Recettes externes", value: mRecExt, color: "#2ecc71", sign: "+" },
                    { label: "Dépenses événements", value: mExpEv, color: C.danger, sign: "-" },
                    { label: "Dépenses association", value: mDepAsso, color: C.danger, sign: "-" },
                    { label: "Dépenses prestations", value: mPrestExp, color: C.danger, sign: "-" },
                  ].filter(l => l.value > 0).map(({ label, value, color, sign }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: C.card2, borderRadius: "6px", fontSize: "12px" }}>
                      <span style={{ color: C.muted }}>{label}</span>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: "600", color }}>{sign}{fmt(value)}</span>
                    </div>
                  ))}
                </div>
              )}
          </div>

        </div>
      )}

      {tab === "archive" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
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
        {(confirmedRevenues.length > 0 || confirmedPresta.length > 0 || confirmedLoc.length > 0) && (() => {
          const ArchiveRow = ({ r, color, icon, extra, onUnconfirm }) => (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: `${color}08`, borderRadius: "8px", borderLeft: `3px solid ${color}40`, opacity: 0.8, flexWrap: "wrap", gap: "8px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13px", fontWeight: "600" }}>
                  <span style={{ color }}>✓ </span>{r.from}
                  <span style={{ color: C.muted, fontWeight: "400" }}> → </span>Banque
                </div>
                <div style={{ fontSize: "11px", color: C.muted, marginTop: "2px" }}>
                  {icon} {r.label}{extra ? ` · ${extra}` : ""}
                  {r.confirmedBy && <span> · confirmé par {r.confirmedBy} le {r.confirmedDate}</span>}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                <span style={{ fontFamily: C.mono, fontSize: "14px", fontWeight: "700", color }}>{fmt(r.amount)}</span>
                {canTreasury && <button onClick={() => onUnconfirm(r)} style={s.btn("ghost", { padding: "3px 8px", fontSize: "11px" })}>Annuler</button>}
              </div>
            </div>
          );
          const total = confirmedRevenues.length + confirmedPresta.length + confirmedLoc.length;
          return (
            <div style={s.card()}>
              <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "14px", marginBottom: "14px" }}>
                Recettes encaissées confirmées
                <span style={{ fontSize: "12px", color: C.muted, fontWeight: "400", marginLeft: "8px" }}>{total} recette{total !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {confirmedRevenues.length > 0 && (
                  <div>
                    <div style={{ fontSize: "11px", color: C.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Événements</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {[...confirmedRevenues].reverse().map(r => <ArchiveRow key={r.id} r={r} color={C.info} icon="◆" extra={r.type} onUnconfirm={unconfirmRevenue} />)}
                    </div>
                  </div>
                )}
                {confirmedPresta.length > 0 && (
                  <div>
                    <div style={{ fontSize: "11px", color: C.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Prestations</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {[...confirmedPresta].reverse().map(r => <ArchiveRow key={r.id} r={r} color={C.accent} icon="◎" extra={null} onUnconfirm={unconfirmPresta} />)}
                    </div>
                  </div>
                )}
                {confirmedLoc.length > 0 && (
                  <div>
                    <div style={{ fontSize: "11px", color: C.muted, fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Locations</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {[...confirmedLoc].reverse().map(r => <ArchiveRow key={r.id} r={r} color={C.warn} icon="◧" extra={null} onUnconfirm={unconfirmLoc} />)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
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
                <span style={{ fontSize: "11px", color: isOverdue ? C.danger : C.muted }}>{t.dueDate}</span>
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

  const [tab, setTab]           = useState("ouverts");
  const [form, setForm]         = useState({ title: "", description: "", category: "Idée" });
  const [formOpen, setFormOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [commentInputs, setCommentInputs] = useState({});

  const addComment = (ticketId, text) => {
    if (!text.trim()) return;
    const comment = { id: uid(), author: username, text: text.trim(), createdAt: today() };
    update({ tickets: tickets.map(t => t.id !== ticketId ? t : { ...t, comments: [...(t.comments||[]), comment] }) });
    setCommentInputs(prev => ({ ...prev, [ticketId]: "" }));
  };

  const deleteComment = (ticketId, commentId) => {
    update({ tickets: tickets.map(t => t.id !== ticketId ? t : { ...t, comments: (t.comments||[]).filter(c => c.id !== commentId) }) });
  };

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
          <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.border}` }}>
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

            {/* Commentaires */}
            <div style={{ marginTop: "18px", borderTop: `1px solid ${C.border}`, paddingTop: "14px" }}>
              <div style={{ fontSize: "12px", fontWeight: "600", color: C.muted, marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Commentaires {(t.comments||[]).length > 0 && `(${t.comments.length})`}
              </div>

              {(t.comments||[]).length === 0 && (
                <p style={{ fontSize: "12px", color: C.muted, fontStyle: "italic", marginBottom: "12px" }}>Aucun commentaire pour l'instant.</p>
              )}

              {(t.comments||[]).map(c => (
                <div key={c.id} style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                  <UserAvatar username={c.author} size={28} />
                  <div style={{ flex: 1, background: C.bg, borderRadius: "8px", padding: "8px 12px", border: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "600", color: C.accent }}>{c.author}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "11px", color: C.muted }}>{c.createdAt}</span>
                        {(isAdmin || c.author === username) && (
                          <button onClick={() => deleteComment(t.id, c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: "11px", padding: "0 2px", lineHeight: 1 }}>✕</button>
                        )}
                      </div>
                    </div>
                    <p style={{ fontSize: "13px", color: C.text, lineHeight: "1.5", whiteSpace: "pre-wrap", margin: 0 }}>{c.text}</p>
                  </div>
                </div>
              ))}

              {/* Saisie nouveau commentaire */}
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <UserAvatar username={username} size={28} />
                <div style={{ flex: 1, display: "flex", gap: "6px" }}>
                  <textarea
                    style={{ ...s.inp(), flex: 1, resize: "none", minHeight: "38px", lineHeight: "1.4", padding: "8px 10px" }}
                    placeholder="Ajouter un commentaire…"
                    rows={1}
                    value={commentInputs[t.id] || ""}
                    onChange={e => setCommentInputs(prev => ({ ...prev, [t.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(t.id, commentInputs[t.id] || ""); } }}
                  />
                  <button
                    onClick={() => addComment(t.id, commentInputs[t.id] || "")}
                    disabled={!(commentInputs[t.id]||"").trim()}
                    style={s.btn("primary", { padding: "6px 12px", fontSize: "12px", alignSelf: "flex-start", opacity: (commentInputs[t.id]||"").trim() ? 1 : 0.4 })}
                  >↵</button>
                </div>
              </div>
            </div>
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
          <h1 style={{ fontFamily: C.display, fontSize: isMobile ? "22px" : "26px", fontWeight: "800", letterSpacing: "-0.8px" }}>Suggestions</h1>
          {!isMobile && <p style={{ color: C.muted, fontSize: "14px", marginTop: "4px" }}>Suggestions, améliorations et signalements</p>}
        </div>
        <div style={{ display: "flex", gap: "2px", borderBottom: `1px solid ${C.border}` }}>
          {[
            { id: "ouverts",  label: `Ouverts (${open.length})`    },
            { id: "archive",  label: `Archive (${archived.length})` },
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
function MaintenancePage({ data, update, session }) {
  const m = data.maintenance || { enabled: false, message: "" };
  const n = data.notification || { active: false, message: "", date: "" };
  const [msg, setMsg] = useState(m.message || "");
  const [notifMsg, setNotifMsg] = useState(n.message || "");
  const [saved, setSaved] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [tab, setTab] = useState("maintenance");
  const [syncStatus, setSyncStatus] = useState(null);

  // Mises à jour
  const [updateInfo, setUpdateInfo] = useState(null); // null | 'checking' | 'applying' | { upToDate, current, commits? } | { error }

  const checkUpdate = async () => {
    setUpdateInfo('checking');
    try {
      const res = await fetch('/api/update-check');
      const json = await res.json();
      setUpdateInfo(json.error ? { error: json.error } : json);
    } catch (e) { setUpdateInfo({ error: e.message }); }
  };

  const applyUpdate = async () => {
    setUpdateInfo('applying');
    try {
      const res = await fetch('/api/update-apply', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        if (json.needsRestart) {
          setUpdateInfo({ done: true, message: 'Mise à jour appliquée — le service redémarre, rechargement dans 5s…' });
          setTimeout(() => window.location.reload(), 5000);
        } else {
          setUpdateInfo({ done: true, message: 'Mise à jour appliquée — rechargement dans 2s…' });
          setTimeout(() => window.location.reload(), 2000);
        }
      } else {
        setUpdateInfo({ error: json.error || 'Erreur lors de la mise à jour' });
      }
    } catch (e) { setUpdateInfo({ error: e.message }); }
  };

  // Sauvegardes
  const [backupFile, setBackupFile] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const importInputRef = useRef(null);

  const [exportLoading, setExportLoading] = useState(false);

  // Panic Button
  const [panicOpen, setPanicOpen] = useState(false);
  const [panicText, setPanicText] = useState("");
  const [panicStatus, setPanicStatus] = useState(null);
  const assocName = data?.assoc?.name || "";

  const doPanic = async () => {
    setPanicStatus("loading");
    try {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assocName: panicText }),
      });
      const json = await res.json();
      if (json.ok) {
        setPanicStatus("done");
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setPanicStatus({ error: json.error || "Erreur" });
      }
    } catch (e) { setPanicStatus({ error: e.message }); }
  };
  const doExport = async () => {
    setExportLoading(true);
    try {
      const res = await fetch('/api/export');
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Erreur serveur');
      window.location.href = json.url;
    } catch (e) {
      alert('Erreur lors de l\'export : ' + e.message);
    } finally {
      setExportLoading(false);
    }
  };

  const selectImportFile = (e) => {
    const file = e.target.files?.[0];
    if (file) setBackupFile(file);
    e.target.value = '';
  };

  const confirmImport = async () => {
    if (!backupFile) return;
    const file = backupFile;
    setBackupFile(null);
    setImportStatus('loading');
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'X-Filename': encodeURIComponent(file.name) },
        body: file,
      });
      const json = await res.json();
      if (json.ok) {
        setImportStatus({ ok: true, message: 'Import réussi — rechargement dans 2s…' });
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setImportStatus({ ok: false, message: json.error || 'Erreur lors de l\'import' });
        setTimeout(() => setImportStatus(null), 6000);
      }
    } catch (e) {
      setImportStatus({ ok: false, message: e.message });
      setTimeout(() => setImportStatus(null), 6000);
    }
  };

  // Qonto
  const [qontoSlug, setQontoSlug] = useState("");
  const [qontoKey, setQontoKey] = useState("");
  const [qontoConfigured, setQontoConfigured] = useState(false);
  const [qontoShowKey, setQontoShowKey] = useState(false);
  const [qontoSaveStatus, setQontoSaveStatus] = useState(null);
  const [qontoSyncStatus, setQontoSyncStatus] = useState(null);

  useEffect(() => {
    fetch("/api/qonto-config")
      .then(r => r.json())
      .then(cfg => {
        setQontoConfigured(cfg.configured);
        if (cfg.slug) setQontoSlug(cfg.slug);
      })
      .catch(() => {});
  }, []);

  const saveQontoConfig = async () => {
    if (!qontoSlug.trim() || !qontoKey.trim()) return;
    setQontoSaveStatus("loading");
    try {
      const r = await fetch("/api/qonto-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: qontoSlug.trim(), key: qontoKey.trim() }),
      });
      const res = await r.json();
      if (res.ok) {
        setQontoConfigured(true);
        setQontoKey("");
        setQontoSaveStatus("ok");
      } else {
        setQontoSaveStatus("error");
      }
    } catch { setQontoSaveStatus("error"); }
    setTimeout(() => setQontoSaveStatus(null), 3000);
  };

  const syncQonto = async () => {
    setQontoSyncStatus("loading");
    try {
      const r = await fetch("/api/qonto-sync", { method: "POST" });
      const res = await r.json();
      if (res.ok) {
        update({ assoc: { ...(data.assoc || {}), bankBalance: res.balance, bankLastSync: res.syncedAt } });
        setQontoSyncStatus({ ok: true, balance: res.balance, accounts: res.accounts });
      } else {
        setQontoSyncStatus({ ok: false, error: res.error || "Erreur Qonto" });
      }
    } catch (e) { setQontoSyncStatus({ ok: false, error: e.message }); }
    setTimeout(() => setQontoSyncStatus(null), 6000);
  };

  const syncPool = async () => {
    setSyncStatus("loading");
    const users = await store.loadUsers();
    const pool = data.depensesPool || [];
    const added = [];
    const removed = [];
    const usernames = new Set(users.map(u => u.username));
    // Ajouter les utilisateurs manquants dans le pool
    const newPool = [...pool];
    for (const u of users) {
      if (!newPool.find(p => p.name === u.username)) {
        newPool.push({ name: u.username, linkedUsername: u.username });
        added.push(u.username);
      }
    }
    // Supprimer les entrées auto-créées dont l'utilisateur n'existe plus
    const finalPool = newPool.filter(p => {
      if (p.linkedUsername && !usernames.has(p.linkedUsername)) {
        removed.push(p.name);
        return false;
      }
      return true;
    });
    update({ depensesPool: finalPool });
    setSyncStatus(`+${added.length} ajouté(s), -${removed.length} supprimé(s)`);
    setTimeout(() => setSyncStatus(null), 4000);
  };

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

  const TABS = [{ id: "maintenance", label: "Maintenance" }, { id: "logs", label: "≡ Journal" }];

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
            {m.enabled ? "Désactiver" : "Activer la maintenance"}
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
            Bannière active : « {n.message} »
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
            {notifSaved === "sent" ? "Envoyé !" : "Envoyer la notification"}
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
          <div style={{ fontFamily: C.display, fontSize: "18px", fontWeight: "800", color: C.warn }}>Site en maintenance</div>
          <div style={{ color: C.muted, fontSize: "13px", textAlign: "center", maxWidth: "340px" }}>
            {msg || "Le site est temporairement indisponible. Revenez bientôt."}
          </div>
        </div>
      </div>

      <div style={s.card({ marginBottom: "16px" })}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px" }}>Compte bancaire Qonto</div>
            <div style={{ color: C.muted, fontSize: "12px", marginTop: "3px" }}>Synchronise automatiquement le solde bancaire depuis l'API Qonto</div>
          </div>
          {qontoConfigured
            ? <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "20px", background: `${C.accent}18`, color: C.accent }}>● Configuré</span>
            : <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "20px", background: C.card2, color: C.muted }}>Non configuré</span>
          }
        </div>

        {data.assoc?.bankLastSync && (
          <div style={{ fontSize: "12px", color: C.muted, marginBottom: "14px" }}>
            Dernière sync : {new Date(data.assoc.bankLastSync).toLocaleString("fr-FR")}
            {" — Solde : "}
            <span style={{ color: C.accent, fontFamily: C.mono, fontWeight: "600" }}>
              {(data.assoc.bankBalance ?? 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
            </span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
          <div>
            <label style={s.label}>Identifiant organisation (slug)</label>
            <input style={s.inp()} value={qontoSlug} onChange={e => setQontoSlug(e.target.value)}
              placeholder="koalisons-xxxxx" />
          </div>
          <div>
            <label style={s.label}>Clé API secrète</label>
            <div style={{ position: "relative" }}>
              <input style={{ ...s.inp(), paddingRight: "36px" }}
                type={qontoShowKey ? "text" : "password"}
                value={qontoKey} onChange={e => setQontoKey(e.target.value)}
                placeholder={qontoConfigured ? "••••••••• (laisser vide pour conserver)" : "Votre clé secrète Qonto"} />
              <button onClick={() => setQontoShowKey(v => !v)} style={{
                position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: "12px", padding: "2px 4px",
              }}>{qontoShowKey ? "Cacher" : "Voir"}</button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button style={s.btn("secondary")} onClick={saveQontoConfig}
            disabled={!qontoSlug.trim() || (!qontoKey.trim() && !qontoConfigured) || qontoSaveStatus === "loading"}>
            {qontoSaveStatus === "loading" ? "Sauvegarde…"
              : qontoSaveStatus === "ok" ? "✓ Identifiants sauvegardés !"
              : qontoSaveStatus === "error" ? "✕ Erreur"
              : "Sauvegarder les identifiants"}
          </button>
          {qontoConfigured && (
            <button style={s.btn("primary")} onClick={syncQonto} disabled={qontoSyncStatus === "loading"}>
              {qontoSyncStatus === "loading" ? "Synchronisation…" : "Synchroniser le solde"}
            </button>
          )}
        </div>

        {qontoSyncStatus && qontoSyncStatus !== "loading" && (
          <div style={{
            marginTop: "10px", fontSize: "12px", padding: "8px 12px", borderRadius: "6px",
            background: qontoSyncStatus.ok ? `${C.accent}12` : `${C.danger}12`,
            color: qontoSyncStatus.ok ? C.accent : C.danger,
          }}>
            {qontoSyncStatus.ok
              ? `Solde synchronisé : ${(qontoSyncStatus.balance).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} (${qontoSyncStatus.accounts} compte${qontoSyncStatus.accounts > 1 ? "s" : ""})`
              : `Erreur : ${qontoSyncStatus.error}`}
          </div>
        )}
      </div>

      <div style={s.card()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          <div>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px" }}>Synchronisation du pool</div>
            <div style={{ color: C.muted, fontSize: "12px", marginTop: "3px" }}>Ajoute les comptes manquants dans le pool de dépenses et retire ceux supprimés</div>
          </div>
          <button style={s.btn("secondary")} onClick={syncPool} disabled={syncStatus === "loading"}>
            {syncStatus === "loading" ? "Synchronisation…" : "Synchroniser"}
          </button>
        </div>
        {syncStatus && syncStatus !== "loading" && (
          <div style={{ fontSize: "12px", color: C.accent, marginTop: "6px" }}>
            Synchronisation effectuée : {syncStatus}
          </div>
        )}
      </div>

      <div style={s.card({ marginTop: "16px" })}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
          <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px" }}>Mises à jour</div>
          {updateInfo && updateInfo !== 'checking' && updateInfo !== 'applying' && !updateInfo.done && (
            <span style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "20px",
              background: updateInfo.error ? `${C.danger}18` : updateInfo.upToDate ? `${C.accent}18` : `${C.warn}18`,
              color: updateInfo.error ? C.danger : updateInfo.upToDate ? C.accent : C.warn,
            }}>
              {updateInfo.error ? "Erreur" : updateInfo.upToDate ? "A jour" : `${updateInfo.commits?.length} commit(s) disponible(s)`}
            </span>
          )}
        </div>
        <div style={{ color: C.muted, fontSize: "12px", marginBottom: "16px" }}>Met à jour l'application depuis le dépôt git</div>

        {(!updateInfo || updateInfo === 'checking') && (
          <button style={s.btn("secondary")} onClick={checkUpdate} disabled={updateInfo === 'checking'}>
            {updateInfo === 'checking' ? "Vérification…" : "Vérifier les mises à jour"}
          </button>
        )}

        {updateInfo === 'applying' && (
          <div style={{ fontSize: "13px", color: C.muted }}>Application de la mise à jour en cours…</div>
        )}

        {updateInfo?.done && (
          <div style={{ fontSize: "12px", padding: "8px 12px", borderRadius: "6px", background: `${C.accent}12`, color: C.accent }}>
            {updateInfo.message}
          </div>
        )}

        {updateInfo?.error && (
          <div style={{ fontSize: "12px", padding: "8px 12px", borderRadius: "6px", background: `${C.danger}12`, color: C.danger, marginBottom: "10px" }}>
            {updateInfo.error}
          </div>
        )}

        {updateInfo && !updateInfo.done && updateInfo !== 'checking' && updateInfo !== 'applying' && !updateInfo.error && (
          <div>
            {updateInfo.upToDate ? (
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ fontSize: "13px", color: C.muted }}>
                  Version actuelle : <span style={{ fontFamily: C.mono, color: C.text }}>{updateInfo.current}</span> — aucune mise à jour disponible.
                </div>
                <button style={s.btn("ghost", { fontSize: "12px", padding: "5px 12px" })} onClick={checkUpdate}>Revérifier</button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: "13px", marginBottom: "12px", color: C.muted }}>
                  Version actuelle : <span style={{ fontFamily: C.mono, color: C.text }}>{updateInfo.current}</span>
                  {" → "}<span style={{ fontFamily: C.mono, color: C.accent }}>{updateInfo.remote}</span>
                </div>
                <div style={{ marginBottom: "14px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {updateInfo.commits?.map(c => (
                    <div key={c.hash} style={{ display: "flex", gap: "10px", fontSize: "12px" }}>
                      <span style={{ fontFamily: C.mono, color: C.muted, flexShrink: 0 }}>{c.hash}</span>
                      <span style={{ color: C.text }}>{c.message}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button style={s.btn("primary")} onClick={applyUpdate}>Mettre à jour</button>
                  <button style={s.btn("ghost", { fontSize: "12px", padding: "5px 12px" })} onClick={() => setUpdateInfo(null)}>Annuler</button>
                </div>
              </div>
            )}
          </div>
        )}

        {updateInfo?.error && (
          <button style={{ ...s.btn("ghost", { fontSize: "12px", padding: "5px 12px" }), marginTop: "8px" }} onClick={() => setUpdateInfo(null)}>Réessayer</button>
        )}
      </div>

      <div style={s.card({ marginTop: "16px" })}>
        <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px", marginBottom: "4px" }}>Sauvegardes</div>
        <div style={{ color: C.muted, fontSize: "12px", marginBottom: "20px" }}>Export et import de toutes les données — événements, dépenses, réunions, utilisateurs, fichiers uploadés, etc.</div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "16px", borderBottom: `1px solid ${C.border}` }}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "500", marginBottom: "3px" }}>Exporter</div>
            <div style={{ fontSize: "12px", color: C.muted }}>Télécharge une archive <span style={{ fontFamily: C.mono }}>.tar.gz</span> de tout le dossier data/</div>
          </div>
          <button style={s.btn("primary")} onClick={doExport} disabled={exportLoading}>
            {exportLoading ? "Génération…" : "Télécharger la sauvegarde"}
          </button>
        </div>

        <div style={{ paddingTop: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: "500", marginBottom: "3px" }}>Restaurer</div>
          <div style={{ fontSize: "12px", color: C.muted, marginBottom: "12px" }}>
            Importer une sauvegarde <span style={{ fontFamily: C.mono }}>.tar.gz</span> — <span style={{ color: C.danger }}>écrase toutes les données actuelles</span>
          </div>

          <input ref={importInputRef} type="file" accept=".tar.gz,.tgz" style={{ display: "none" }} onChange={selectImportFile} />

          {!backupFile && importStatus !== 'loading' && (
            <button style={s.btn("secondary")} onClick={() => importInputRef.current?.click()}>
              Choisir une archive…
            </button>
          )}

          {backupFile && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ padding: "8px 12px", background: C.card2, border: `1px solid ${C.border}`, borderRadius: "8px", fontSize: "12px", fontFamily: C.mono, color: C.text }}>
                {backupFile.name}
              </div>
              <button style={s.btn("danger")} onClick={confirmImport}>
                Confirmer la restauration
              </button>
              <button style={s.btn("ghost")} onClick={() => setBackupFile(null)}>
                Annuler
              </button>
            </div>
          )}

          {importStatus === 'loading' && (
            <div style={{ fontSize: "13px", color: C.muted }}>Import en cours…</div>
          )}

          {importStatus && importStatus !== 'loading' && (
            <div style={{
              marginTop: "10px", fontSize: "12px", padding: "8px 12px", borderRadius: "6px",
              background: importStatus.ok ? `${C.accent}12` : `${C.danger}12`,
              color: importStatus.ok ? C.accent : C.danger,
            }}>
              {importStatus.message}
            </div>
          )}
        </div>
      </div>
      <div style={{ marginTop: "16px", border: `1px solid ${C.danger}60`, borderRadius: "12px", padding: "22px", background: `${C.danger}08` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: C.display, fontWeight: "700", fontSize: "15px", color: C.danger }}>Zone de danger</div>
            <div style={{ color: C.muted, fontSize: "12px", marginTop: "3px" }}>Efface définitivement toutes les données, utilisateurs et fichiers</div>
          </div>
          <button style={{ ...s.btn("danger"), fontWeight: "700", letterSpacing: "0.3px" }} onClick={() => { setPanicOpen(true); setPanicText(""); setPanicStatus(null); }}>
            Panic Button
          </button>
        </div>
      </div>

      {panicOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ background: C.card, border: `1px solid ${C.danger}80`, borderRadius: "14px", padding: "28px", width: "100%", maxWidth: "440px" }}>
            <div style={{ fontFamily: C.display, fontSize: "18px", fontWeight: "800", color: C.danger, marginBottom: "8px" }}>Réinitialisation totale</div>
            <div style={{ fontSize: "13px", color: C.muted, marginBottom: "20px", lineHeight: "1.6" }}>
              Cette action est <strong style={{ color: C.danger }}>irréversible</strong>. Toutes les données seront effacées :
              événements, dépenses, réunions, utilisateurs, fichiers uploadés.<br /><br />
              Pour confirmer, tapez le nom exact de l'association :
              <div style={{ marginTop: "8px", padding: "6px 12px", background: C.card2, borderRadius: "6px", fontFamily: C.mono, fontSize: "13px", color: C.text }}>{assocName || "(non défini)"}</div>
            </div>
            <input
              style={{ ...s.inp({ marginBottom: "14px", borderColor: panicText === assocName && assocName ? C.danger : C.border }) }}
              placeholder={assocName || "Nom de l'association"}
              value={panicText}
              onChange={e => { setPanicText(e.target.value); setPanicStatus(null); }}
              autoFocus
            />
            {panicStatus && panicStatus !== "loading" && panicStatus !== "done" && (
              <div style={{ fontSize: "12px", color: C.danger, marginBottom: "10px" }}>{panicStatus.error}</div>
            )}
            {panicStatus === "done" && (
              <div style={{ fontSize: "12px", color: C.accent, marginBottom: "10px" }}>Réinitialisation effectuée — rechargement…</div>
            )}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button style={s.btn("ghost")} onClick={() => setPanicOpen(false)} disabled={panicStatus === "loading" || panicStatus === "done"}>
                Annuler
              </button>
              <button
                style={{ ...s.btn("danger"), fontWeight: "700", opacity: (panicText === assocName && assocName && panicStatus !== "loading" && panicStatus !== "done") ? 1 : 0.4 }}
                onClick={doPanic}
                disabled={panicText !== assocName || !assocName || panicStatus === "loading" || panicStatus === "done"}
              >
                {panicStatus === "loading" ? "Réinitialisation…" : "Tout effacer"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>)}
    </div>
  );
}

// ── ACCESS DENIED ─────────────────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: "12px" }}>
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
