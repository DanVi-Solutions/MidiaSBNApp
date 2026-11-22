import { PrivateShell } from "@/components/layout/PrivateShell";

// Ponto de integração futura: validar cookie/sessão autenticada no servidor
// dentro de uma boundary <Suspense> quando os endpoints de auth estiverem ativos.
export default function PrivateLayout({ children }) {
  return <PrivateShell>{children}</PrivateShell>;
}
