import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icons";
import styles from "./PrivateModulePlaceholder.module.css";

export function PrivateModulePlaceholder({ eyebrow, title, description }) {
  return (
    <section className={styles.card}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.description}>{description}</p>
      <Link href="/schedule" className={styles.backLink}>
        <span>Voltar para Escala do mês</span>
        <ArrowRightIcon />
      </Link>
    </section>
  );
}
