# OpenAPI Specification Workflow

## Overview

The OpenAPI specification for this API is automatically generated from the Fastify route schemas and checked into the repository at `openapi.json`. This approach provides several benefits:

1. **Version Control**: API changes are tracked in git
2. **Code Generation**: CI/CD pipelines can generate client SDKs
3. **Contract Testing**: API contracts can be validated without running the server
4. **Documentation**: Changes to the API are visible in pull requests
5. **Single Source of Truth**: Route schemas define both behavior and documentation

## Development Workflow

### Making API Changes

When you modify routes or add new endpoints:

1. **Update the route schema** in the appropriate route file:
   ```typescript
   fastify.get('/endpoint', {
     schema: {
       tags: ['Category'],
       summary: 'Brief description',
       description: 'Detailed description',
       // ... other schema properties
     },
   }, handlerFunction);
   ```

2. **Regenerate the OpenAPI spec**:
   ```bash
   npm run generate:openapi
   ```

3. **Commit both the code changes and the updated `openapi.json`**:
   ```bash
   git add src/api/routes/your-file.ts openapi.json
   git commit -m "Add new endpoint"
   ```

4. **Validation happens automatically** in CI when you open a PR

### Validating Locally

Before pushing, validate that your OpenAPI spec is up to date:

```bash
npm run validate:openapi
```

If validation fails, you'll see:
```
✗ OpenAPI specification is out of date!
  The checked-in openapi.json does not match the current code.
  Run: npm run generate:openapi
  Then commit the updated openapi.json file.
  Generated spec written to openapi.generated.json for comparison.
```

The script creates `openapi.generated.json` so you can compare with the checked-in version to see what changed.

## CI/CD Integration

### GitHub Actions Workflow

The CI pipeline includes an OpenAPI validation step:

```yaml
- name: Validate OpenAPI spec
  run: npm run validate:openapi
```

This ensures:
- PRs fail if the spec is out of date
- The main branch always has an accurate specification
- API changes are explicitly committed

### What Gets Validated

The validation script:
1. Starts the Fastify app with mock configuration
2. Generates the OpenAPI spec from current code
3. Compares it byte-for-byte with `openapi.json`
4. Fails if they don't match exactly

This catches:
- Forgotten `generate:openapi` runs
- Manual edits to `openapi.json` (discouraged)
- Inconsistencies between code and documentation

## Using the OpenAPI Spec

### In Development

Access the interactive Swagger UI:
```
http://localhost:3000/documentation
```

### For Client Generation

Generate type-safe clients for any language:

```bash
# TypeScript/JavaScript client
npx @openapitools/openapi-generator-cli generate \
  -i openapi.json \
  -g typescript-fetch \
  -o ./generated/client

# Python client
npx @openapitools/openapi-generator-cli generate \
  -i openapi.json \
  -g python \
  -o ./generated/python-client

# Other languages: java, go, ruby, php, etc.
```

### For Contract Testing

Use tools like `schemathesis` or `dredd`:

```bash
# Install schemathesis
pip install schemathesis

# Run contract tests
schemathesis run openapi.json \
  --base-url http://localhost:3000 \
  --header "X-API-Key: your-key"
```

### For API Documentation Sites

Many documentation tools can consume `openapi.json`:

- **Redoc**: `npx redoc-cli serve openapi.json`
- **Stoplight Elements**: Import the file in your docs site
- **Readme.io / GitBook**: Import for API reference pages

## Technical Details

### Generation Script

`scripts/generate-openapi.ts`:
- Creates a Fastify instance with mock configuration
- Calls `fastify.swagger()` to get the OpenAPI object
- Writes formatted JSON to `openapi.json`
- Exits cleanly without starting the server

### Validation Script

`scripts/validate-openapi.ts`:
- Generates the spec the same way
- Reads the checked-in `openapi.json`
- Performs exact string comparison
- Exits with code 1 if they differ

### Mock Configuration

Both scripts use identical mock configuration to ensure consistent generation. The actual values don't matter since we're just generating the schema structure, not connecting to real services.

## Best Practices

### Do's

✅ **Run `generate:openapi` after every route change**
✅ **Commit `openapi.json` with your code changes**
✅ **Use the validation script before pushing**
✅ **Review OpenAPI changes in PRs** - they document API changes
✅ **Keep schemas detailed** - they power documentation and validation

### Don'ts

❌ **Don't manually edit `openapi.json`** - it's generated from code
❌ **Don't skip validation** - it catches inconsistencies early
❌ **Don't commit without running the generator** - CI will fail
❌ **Don't use vague descriptions** - schemas are your API documentation

## Troubleshooting

### Validation fails but nothing changed

Run the generator to see if there are formatting differences:
```bash
npm run generate:openapi
git diff openapi.json
```

If there are changes, commit them. Sometimes the Fastify Swagger plugin changes its output format in updates.

### Generator fails

Check that:
- All route schemas are valid JSON Schema
- No circular references in schemas
- All required plugins are loaded

### Spec doesn't match runtime behavior

The generated spec reflects the schemas in your code. If runtime behavior differs:
- Your schemas might be incomplete
- Request/response validation might be disabled
- There might be middleware modifying requests/responses

## Future Enhancements

Potential improvements to this workflow:

1. **Pre-commit hook**: Automatically run `generate:openapi` before commits
2. **PR comments**: Bot that posts schema diffs in PRs
3. **Breaking change detection**: Alert if changes are backward-incompatible
4. **Multiple output formats**: Generate both JSON and YAML versions
5. **Schema versioning**: Support multiple API versions simultaneously
