import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../services/api";

export function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await login(username, password);
      if (res.success && res.token) {
        localStorage.setItem("token", res.token);
        navigate("/", { replace: true });
      } else {
        // 統一顯示友善訊息，不洩漏後端細節
        setError("帳號或密碼錯誤");
      }
    } catch {
      // F-C1 (login): 統一友善訊息
      setError("帳號或密碼錯誤");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "#08090a" }}>
      <div
        className="w-full max-w-sm rounded-2xl p-10 shadow-2xl"
        style={{
          backgroundColor: "#111219",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-[#5e6ad2] text-3xl mb-3 select-none">✦</div>
          <h1
            className="text-[24px] font-semibold tracking-tight"
            style={{ color: "#f0f1f3", letterSpacing: "-0.03em" }}
          >
            YangChat
          </h1>
          <p className="text-[13px] mt-1.5" style={{ color: "#62666d" }}>
            請先登入以繼續
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="帳號"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "#0d0e14",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#f0f1f3",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#5e6ad2")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
            required
          />
          <input
            type="password"
            placeholder="密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg px-4 py-3 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "#0d0e14",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#f0f1f3",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#5e6ad2")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.08)")}
            required
          />

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-3 text-sm font-medium text-white transition-all duration-150 disabled:opacity-50 mt-2"
            style={{ backgroundColor: "#5e6ad2" }}
            onMouseEnter={(e) => {
              if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = "#6e7ae0";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.backgroundColor = "#5e6ad2";
            }}
          >
            {loading ? "登入中..." : "登入"}
          </button>
        </form>
      </div>
    </div>
  );
}
