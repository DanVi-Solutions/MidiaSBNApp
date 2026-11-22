import { LoginForm } from "./LoginForm";
import { LoginVisualPanel } from "./LoginVisualPanel";
import styles from "./LoginView.module.css";

export function LoginView() {
  return (
    <main className={styles.layout}>
      <LoginVisualPanel />
      <LoginForm />
    </main>
  );
}
