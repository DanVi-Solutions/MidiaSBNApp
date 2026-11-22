export function toPublicCredential(credential) {
  if (!credential) return credential;
  const { departmentIds, credentialNumber, ...publicCredential } = credential;
  return publicCredential;
}

export const withCredentialNumber = (credential, credentialNumber = credential.credentialNumber) => ({
  ...toPublicCredential(credential),
  credentialNumber,
});
