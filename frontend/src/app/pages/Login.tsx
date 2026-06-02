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
        setError(res.message || "登入失敗");
      }
    } catch {
      setError("無法連線到伺服器");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-sm shadow-xl">
        <h1 className="text-2xl font-bold text-white mb-2 text-center">YangChat</h1>
        <p className="text-gray-400 text-sm text-center mb-8">請先登入</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="帳號"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
            required
          />
          <input
            type="password"
            placeholder="密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500"
            required
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-3 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "登入中..." : "登入"}
          </button>
        </form>
      </div>
    </div>
  );
}
