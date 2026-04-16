import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in · A4G Recruitment",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <LoginForm />
    </main>
  );
}
