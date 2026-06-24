import { useEffect, useState } from "react";

export default function App() {
  const [msg, setMsg] = useState("加载中…");
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/hello")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setMsg(data.msg))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>韩语翻译插件 · 控制台</h1>
      <p>后端 /api/hello 返回：</p>
      {error ? (
        <p style={{ color: "crimson" }}>请求失败：{error}</p>
      ) : (
        <p style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{msg}</p>
      )}
    </main>
  );
}
