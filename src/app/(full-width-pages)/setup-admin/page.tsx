"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupAdminPage() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [ok, setOk] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const router = useRouter();

  
  const checkAdminExist = async () => {
    const response = await fetch('/api/initial-admin');
    const data = await response.json();
    console.log("has admin: ", data)
    if (response.ok && data.hasAdmin) {
      router.push("/app-working");
    } else {
      setChecking(false);
    }
  }

  useEffect(() => {
    checkAdminExist();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setOk("");
    if (!username || !password) {
      setError("Username and password are required.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      // @ts-ignore
      const res = await fetch('/api/initial-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data?.success) {
        setOk("Admin user has been created. Redirecting to sign-in...");
        setTimeout(() => {
          window.location.href = "/app-working";
        }, 1000);
      } else {
        setError(data?.error || "Failed to create admin user.");
      }
    } catch (err) {
      setError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return <div className="flex items-center justify-center h-screen text-gray-700">Checking...</div>;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Initial Setup - Create Admin</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Please create an admin user. This step is required only once.
        </p>
        {error && <div className="mb-3 p-3 rounded bg-red-500 text-white text-sm">{error}</div>}
        {ok && <div className="mb-3 p-3 rounded bg-green-600 text-white text-sm">{ok}</div>}
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Username</label>
            <input
              className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Password</label>
            <input
              className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-none"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Password (confirm)</label>
            <input
              className="w-full rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm outline-none"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-600 hover:bg-blue-700 text-white text-sm py-2"
          >
            {loading ? "Creating..." : "Create Admin"}
          </button>
        </form>
      </div>
    </div>
  );
}