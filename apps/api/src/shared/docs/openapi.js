import { z } from "zod";

const operations = [];
const tagDescriptions = new Map();

export function registerOperation(operation) {
  operations.push(operation);
}

export function registerTag(name, description) {
  tagDescriptions.set(name, description);
}

function override({ jsonSchema }) {
  if (jsonSchema.format === "uuid") delete jsonSchema.pattern;
}

function toJsonSchema(schema, io) {
  const jsonSchema = z.toJSONSchema(schema, { io, unrepresentable: "any", override });
  delete jsonSchema.$schema;
  return jsonSchema;
}

function toParameters(schema, location) {
  if (!schema) return [];
  const json = toJsonSchema(schema, "input");
  return Object.entries(json.properties ?? {}).map(([name, property]) => ({
    name,
    in: location,
    required: location === "path" || (json.required ?? []).includes(name),
    description: property.description,
    schema: property,
  }));
}

const errorContent = {
  "application/json": {
    schema: {
      type: "object",
      properties: { error: { type: "string" }, details: {} },
      required: ["error"],
    },
  },
};

const errorResponse = (description) => ({ description, content: errorContent });

function toResponse(definition) {
  if (definition === null) return { description: "Sem conteúdo" };

  const isZod = definition instanceof z.ZodType;
  const description = isZod ? "Sucesso" : definition.description;
  const schema = isZod ? definition : definition.schema;

  return {
    description,
    ...(schema && { content: { "application/json": { schema: toJsonSchema(schema, "output") } } }),
  };
}

function toOperation(op) {
  const responses = Object.fromEntries(
    Object.entries(op.responses ?? {}).map(([status, def]) => [status, toResponse(def)]),
  );

  if (op.body || op.params || op.query) responses[422] ??= errorResponse("Dados inválidos");
  if (op.params) responses[404] ??= errorResponse("Recurso não encontrado");
  if (op.auth) {
    responses[401] ??= errorResponse("Não autenticado");
    responses[403] ??= errorResponse("Sem permissão");
  }

  const statusNote = op.auth && op.statuses ? `\n\nStatus da credencial exigido: ${op.statuses.join(", ")}.` : "";

  return {
    tags: [op.tag],
    summary: op.summary,
    description: `${op.description ?? ""}${statusNote}`.trim() || undefined,
    security: op.auth ? [{ bearerAuth: [] }] : [],
    parameters: [...toParameters(op.params, "path"), ...toParameters(op.query, "query")],
    ...(op.body && {
      requestBody: {
        required: true,
        content: { "application/json": { schema: toJsonSchema(op.body, "input") } },
      },
    }),
    responses,
  };
}

export function buildOpenApiDocument({ title, version, description }) {
  const paths = {};

  for (const op of operations) {
    const path = op.path.replace(/:(\w+)/g, "{$1}");
    paths[path] ??= {};
    paths[path][op.method] = toOperation(op);
  }

  const tagsInRegistrationOrder = [...new Set(operations.map((op) => op.tag))].map((name) => ({
    name,
    description: tagDescriptions.get(name),
  }));

  return {
    openapi: "3.1.0",
    info: { title, version, description },
    tags: tagsInRegistrationOrder,
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    },
  };
}
