# OpenAPI/Swagger Documentation

The API documentation is automatically generated from the route schemas using `@fastify/swagger` and `@fastify/swagger-ui`.

## Accessing the Documentation

Once the server is running, you can access the interactive Swagger UI at:

```
http://localhost:3000/documentation
```

## Features

- **Interactive API Testing**: Test endpoints directly from the browser
- **Request/Response Schemas**: View expected input and output formats
- **Authentication**: Configure API key authentication in the UI
- **Automatic Updates**: Documentation updates automatically when route schemas change

## Viewing the OpenAPI Specification

The raw OpenAPI specification is available in JSON format at:

```
http://localhost:3000/documentation/json
```

Or in YAML format at:

```
http://localhost:3000/documentation/yaml
```

## Checked-in OpenAPI Specification

The OpenAPI specification is checked into the repository at `/openapi.json`. This allows:

- Version control of API changes
- Client SDK generation in CI/CD pipelines
- API contract testing without running the server
- Documentation review in pull requests

### Generating the Specification

When you modify route schemas, regenerate the OpenAPI spec:

```bash
npm run generate:openapi
```

This will update `openapi.json` which you should commit with your changes.

### Validating the Specification

To ensure the checked-in specification is up to date:

```bash
npm run validate:openapi
```

This validation runs automatically in CI, so PRs will fail if the OpenAPI spec is out of sync with the code.

## Exporting the Specification at Runtime

You can also download the OpenAPI specification directly from the running server:

```bash
# Export as JSON
curl http://localhost:3000/documentation/json > openapi-runtime.json

# Export as YAML
curl http://localhost:3000/documentation/yaml > openapi-runtime.yaml
```

## Using with External Tools

The generated OpenAPI specification can be imported into various tools:

- **Postman**: Import the JSON/YAML to create a collection
- **Insomnia**: Import the specification to create requests
- **Client SDK Generation**: Use tools like `openapi-generator` to create client libraries
- **API Testing**: Use with tools like `dredd` or `schemathesis` for contract testing

## Schema Validation

All routes include JSON schemas that provide:

- **Request validation**: Incoming requests are validated against the schema
- **Response validation**: Outgoing responses are validated in development mode
- **Type safety**: Schemas align with TypeScript types
- **Documentation**: Schemas automatically generate API documentation

## Example: Testing with cURL

Using the OpenAPI spec, you can easily test endpoints:

```bash
# Health check (no auth required)
curl http://localhost:3000/api/v1/health

# Get account (requires API key)
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/v1/account

# Search instruments
curl -H "X-API-Key: your-api-key" "http://localhost:3000/api/v1/instruments?q=AAPL"

# Place an order
curl -X POST http://localhost:3000/api/v1/orders \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "conid": 265598,
    "side": "buy",
    "type": "limit",
    "quantity": 100,
    "limitPrice": 150.50
  }'
```

## Customization

To customize the Swagger UI or OpenAPI configuration, edit the settings in `src/app.ts`:

- **UI Settings**: Modify `fastifySwaggerUI` options
- **OpenAPI Metadata**: Update the `openapi` configuration
- **Security Schemes**: Add or modify authentication methods
- **Servers**: Configure different server URLs for environments
