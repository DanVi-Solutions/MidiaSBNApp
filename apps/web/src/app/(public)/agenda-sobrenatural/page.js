import { Bricolage_Grotesque } from "next/font/google";
import { Suspense } from "react";
import { PublicAgendaView } from "@/features/agenda/components/public/PublicAgendaView";

const displayFont = Bricolage_Grotesque({
  variable: "--font-agenda-display",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

export const instant = false;

export const metadata = {
  title: "Agenda Sobrenatural",
  description: "Eventos da igreja ao longo do ano: cultos especiais, conferências e encontros.",
};

export default function PublicAgendaPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100dvh", backgroundColor: "#16141d" }} />}>
      <PublicAgendaView fontClassName={displayFont.variable} />
    </Suspense>
  );
}
