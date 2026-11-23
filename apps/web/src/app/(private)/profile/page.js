import { ProfileView } from "@/features/profile/components/ProfileView";

export const instant = false;

export const metadata = {
  title: "Meu perfil",
};

export default function ProfilePage() {
  return <ProfileView />;
}
