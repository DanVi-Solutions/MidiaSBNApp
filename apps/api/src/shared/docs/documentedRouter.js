import { Router } from "express";
import { authenticate, requireStatus } from "../middlewares/authenticate.js";
import { validate } from "../middlewares/validate.js";
import { registerOperation, registerTag } from "./openapi.js";

export function createDocumentedRouter({ prefix, tag, tagDescription }) {
  const router = Router();
  registerTag(tag, tagDescription);

  const register = (method) => (path, options, ...handlers) => {
    const { auth = true, statuses = ["ACTIVE"], params, query, body, before = [] } = options;

    const middlewares = [
      ...before,
      ...(auth ? [authenticate] : []),
      ...(auth && statuses ? [requireStatus(...statuses)] : []),
      ...(params || query || body ? [validate({ params, query, body })] : []),
    ];

    router[method](path, ...middlewares, ...handlers);

    registerOperation({
      ...options,
      method,
      tag,
      auth,
      statuses: auth ? statuses : null,
      path: `${prefix}${path === "/" ? "" : path}`,
    });
  };

  return {
    prefix,
    tag,
    router,
    get: register("get"),
    post: register("post"),
    put: register("put"),
    patch: register("patch"),
    delete: register("delete"),
  };
}
