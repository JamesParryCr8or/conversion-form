import { LoginForm } from "@/components/admin/LoginForm";

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-center text-2xl font-bold">CR8OR Forms</h1>
        <LoginForm />
        <p className="mt-4 text-center text-xs text-gray-500">Admin access only.</p>
      </div>
    </main>
  );
}
