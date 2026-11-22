import { z } from "zod";

const person = z.object({ id: z.uuid(), name: z.string(), username: z.string().nullable() });

export const changeRequest = z.object({
  id: z.uuid().meta({ description: "ID da participação na escala." }),
  changeStatus: z.enum(["NONE", "REQUESTED", "REJECTED"]).meta({
    description: "NONE (sem pedido), REQUESTED (aguardando o substituto), REJECTED (o substituto recusou).",
  }),
  credentialId: z.uuid(),
  credentialChangeId: z.uuid().nullable(),
  credential: person.meta({ description: "Quem está escalado (e pediu a troca)." }),
  credentialChange: person.nullable().meta({ description: "Substituto indicado." }),
  schedule: z.object({
    id: z.uuid(),
    name: z.string(),
    scheduleAt: z.iso.datetime(),
    published: z.boolean(),
    department: z.object({ id: z.uuid(), name: z.string() }),
  }),
});

export const myChangeRequests = z.object({
  received: z.array(changeRequest).meta({ description: "Pedidos em que você foi indicado como substituto." }),
  sent: z.array(changeRequest).meta({ description: "Pedidos que você fez (aguardando resposta ou recusados)." }),
});
