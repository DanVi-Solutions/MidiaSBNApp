import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { buildOpenApiDocument } from "./openapi.js";

const DOC_INFO = {
  title: "MídiaSBN API",
  version: "0.1.0",
  description: "Documentação gerada automaticamente a partir das rotas e dos schemas zod.",
};

export const docsRoutes = Router();

let document;
const getDocument = () => (document ??= buildOpenApiDocument(DOC_INFO));

docsRoutes.get("/openapi.json", (req, res) => res.json(getDocument()));

docsRoutes.use(
  "/",
  swaggerUi.serve,
  swaggerUi.setup(null, {
    customSiteTitle: DOC_INFO.title,
    swaggerOptions: {
      url: "/docs/openapi.json",
      persistAuthorization: true,
      operationsSorter: function byHttpMethod(a, b) {
        const order = ["get", "post", "put", "patch", "delete"];
        return order.indexOf(a.get("method")) - order.indexOf(b.get("method"));
      },
    },
  }),
);
