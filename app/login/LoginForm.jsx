"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("manager");
  const [password, setPassword] = useState("manager123");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    setLoading(false);

    if (!data.success) {
      setMessage(data.error || "Login failed");
      return;
    }

    router.replace(data.home);
  }

  return (
    <div className="login-page">
      <form className="login-box stack" onSubmit={submit}>
        <img src="/bb-logo.png" alt="BillyBeez" className="logo" />
        <h1>BDS MOT</h1>
        <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" />
        <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" />
        <button disabled={loading}>{loading ? "Loading..." : "Login"}</button>
        <div className="message">{message}</div>
      </form>
    </div>
  );
}
