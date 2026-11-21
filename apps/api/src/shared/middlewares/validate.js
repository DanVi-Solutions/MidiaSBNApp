export function validate({ body, params, query } = {}) {
  return (req, res, next) => {
    req.validated = {
      body: body ? body.parse(req.body ?? {}) : undefined,
      params: params ? params.parse(req.params) : undefined,
      query: query ? query.parse(req.query) : undefined,
    };
    next();
  };
}
