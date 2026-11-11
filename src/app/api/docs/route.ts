/**
 * Swagger UI for the public API, at /api/docs. It renders
 * /api/v1/openapi.json; "Authorize" takes an API key so the "Try it out"
 * buttons can call the API from this page.
 */
export const dynamic = "force-static";

const SWAGGER_UI = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14";

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Solo Kanban API</title>
  <link rel="stylesheet" href="${SWAGGER_UI}/swagger-ui.css"
    integrity="sha384-wxLW6kwyHktdDGr6Pv1zgm/VGJh99lfUbzSn6HNHBENZlCN7W602k9VkGdxuFvPn" crossorigin="anonymous">
  <style>body { margin: 0; background: #fff; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${SWAGGER_UI}/swagger-ui-bundle.js"
    integrity="sha384-wmyclcVGX/WhUkdkATwhaK1X1JtiNrr2EoYJ+diV3vj4v6OC5yCeSu+yW13SYJep" crossorigin="anonymous"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "/api/v1/openapi.json",
      dom_id: "#swagger-ui",
      deepLinking: true,
      persistAuthorization: true,
      tryItOutEnabled: true,
      displayRequestDuration: true,
      docExpansion: "list",
      defaultModelsExpandDepth: 0,
    });
  </script>
</body>
</html>`;

export function GET() {
  return new Response(HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Only this page's inline boot script and the pinned Swagger UI assets may run.
      "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'",
        "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    },
  });
}
