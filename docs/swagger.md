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

## Exporting the Specification

You can download the OpenAPI specification file for use with other tools:

```bash
# Export as JSON
curl http://localhost:3000/documentation/json > openapi.json

# Export as YAML
curl http://localhost:3000/documentation/yaml > openapi.yaml
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
