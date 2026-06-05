import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getMyRole,
  type AdminUser,
} from "../services/api";

// ── 小元件 ────────────────────────────────────────────────────────────────────

function Badge({ role }: { role: string }) {
  const isAdmin = role === "admin";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
        isAdmin
          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
          : "bg-slate-600/40 text-slate-300 border border-slate-500/30"
      }`}
    >
      {isAdmin ? "Admin" : "User"}
    </span>
  );
}

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-medium pointer-events-none
        ${type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
    >
      {msg}
    </div>
  );
}

// ── 建立帳號 Modal ─────────────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreated: (user: AdminUser) => void;
}

function CreateModal({ onClose, onCreated }: CreateModalProps) {
  const [form, setForm] = useState({ username: "", password: "", role: "user" as "admin" | "user" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await createUser(form);
      onCreated(user);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.includes("409") ? "帳號已存在" : "建立失敗：" + msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-bold text-white mb-5">建立帳號</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">帳號</label>
            <input
              className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              placeholder="2-32 字元，英數字/底線/連字號"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">密碼</label>
            <input
              type="password"
              className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              placeholder="至少 6 字元"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">角色</label>
            <select
              className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value as "admin" | "user" }))}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition"
            >
              {loading ? "建立中…" : "建立"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 修改密碼 Modal ─────────────────────────────────────────────────────────────

interface EditModalProps {
  user: AdminUser;
  currentAdmin: string;
  onClose: () => void;
  onUpdated: (user: AdminUser) => void;
}

function EditModal({ user, currentAdmin, onClose, onUpdated }: EditModalProps) {
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "user">(user.role);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload: { password?: string; role?: "admin" | "user" } = {};
      if (password) payload.password = password;
      if (role !== user.role) payload.role = role;
      if (!payload.password && !payload.role) {
        setError("請輸入新密碼或更改角色");
        setLoading(false);
        return;
      }
      const updated = await updateUser(user.username, payload);
      onUpdated(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError("更新失敗：" + msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-lg font-bold text-white mb-1">編輯帳號</h2>
        <p className="text-slate-400 text-sm mb-5">@{user.username}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">新密碼（留空不修改）</label>
            <input
              type="password"
              className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              placeholder="至少 6 字元"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">角色</label>
            <select
              className="w-full bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              value={role}
              onChange={e => setRole(e.target.value as "admin" | "user")}
              disabled={user.username === currentAdmin}  // 不能降自己的 role
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            {user.username === currentAdmin && (
              <p className="text-xs text-slate-500 mt-1">不能更改自己的角色</p>
            )}
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition"
            >
              {loading ? "儲存中…" : "儲存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 主頁面 ────────────────────────────────────────────────────────────────────

export function AdminPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [currentAdmin, setCurrentAdmin] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    async function init() {
      try {
        const me = await getMyRole();
        if (me.role !== "admin") {
          navigate("/", { replace: true });
          return;
        }
        setCurrentAdmin(me.username);
        const list = await listUsers();
        setUsers(list);
      } catch {
        navigate("/", { replace: true });
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [navigate]);

  async function handleDelete(username: string) {
    if (!window.confirm(`確定要刪除帳號「${username}」？此操作無法復原。`)) return;
    try {
      await deleteUser(username);
      setUsers(u => u.filter(x => x.username !== username));
      showToast(`帳號 ${username} 已刪除`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("刪除失敗：" + msg, "error");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm">載入中…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <div className="border-b border-slate-700/60 bg-slate-800/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-700"
            title="返回聊天"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-bold">帳號管理</h1>
            <p className="text-xs text-slate-400">共 {users.length} 個帳號</p>
          </div>
          <div className="ml-auto">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              建立帳號
            </button>
          </div>
        </div>
      </div>

      {/* 帳號列表 */}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {users.length === 0 ? (
          <div className="text-center text-slate-500 py-20 text-sm">尚無帳號</div>
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <div
                key={u.username}
                className="flex items-center gap-4 bg-slate-800/60 border border-slate-700/50 rounded-xl px-5 py-4 hover:bg-slate-800/90 transition"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-sm flex-shrink-0">
                  {u.username[0].toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{u.username}</span>
                    {u.username === currentAdmin && (
                      <span className="text-xs text-slate-500">(你)</span>
                    )}
                    <Badge role={u.role} />
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    建立於 {new Date(u.created_at).toLocaleDateString("zh-TW", { year: "numeric", month: "short", day: "numeric" })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setEditTarget(u)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition"
                  >
                    編輯
                  </button>
                  {u.username !== currentAdmin && (
                    <button
                      onClick={() => handleDelete(u.username)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-red-700/50 text-red-400 hover:bg-red-900/30 transition"
                    >
                      刪除
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={user => {
            setUsers(u => [...u, user]);
            setShowCreate(false);
            showToast(`帳號 ${user.username} 建立成功`);
          }}
        />
      )}
      {editTarget && (
        <EditModal
          user={editTarget}
          currentAdmin={currentAdmin}
          onClose={() => setEditTarget(null)}
          onUpdated={updated => {
            setUsers(u => u.map(x => x.username === updated.username ? updated : x));
            setEditTarget(null);
            showToast("帳號已更新");
          }}
        />
      )}

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
