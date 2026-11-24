import { CREDENTIAL_STATUS } from "@/lib/roles";

export const PUBLIC_SITE_URL = "https://midiasbn.vercel.app/";

function firstNameOf(name) {
  return name?.trim().split(/\s+/)[0] || "";
}

function greetingFor(name) {
  const firstName = firstNameOf(name);
  return firstName ? `Olá, ${firstName}!` : "Olá!";
}

function firstAccessMessage({ name, credentialNumber }) {
  return [
    `${greetingFor(name)} 👋`,
    "Sua credencial no sistema da *Mídia Sobrenatural* foi criada. Use o código abaixo para fazer o seu primeiro acesso:",
    credentialNumber,
    "Para entrar, acesse o site abaixo, informe o código e escolha o seu nome de usuário:",
    PUBLIC_SITE_URL,
    "Depois disso, o sistema vai gerar um novo código só seu, que passa a ser o seu acesso. Anote-o em um lugar seguro, porque ninguém mais conseguirá consultá-lo.",
    "Seja bem-vindo(a) à equipe! 🙌",
  ].join("\n\n");
}

function recoveryMessage({ name, credentialNumber }) {
  return [
    `${greetingFor(name)} 👋`,
    "Geramos um código de recuperação para você voltar a acessar o sistema da *Mídia Sobrenatural*:",
    credentialNumber,
    "Para entrar, acesse o site abaixo e informe este código:",
    PUBLIC_SITE_URL,
    "Em seguida, o sistema vai gerar um novo código só seu, que substitui o anterior. Anote-o em um lugar seguro, porque ninguém mais conseguirá consultá-lo.",
  ].join("\n\n");
}

export function buildCredentialInviteMessage({ name, status, credentialNumber }) {
  const build = status === CREDENTIAL_STATUS.RECOVERING ? recoveryMessage : firstAccessMessage;
  return build({ name, credentialNumber });
}
