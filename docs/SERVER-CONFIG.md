# Central API configuration

The React Native client and technician app resolve their backend from the stable GitHub Pages document:

`https://hamzawysat.github.io/hamzawy-download/server-config.json`

The APK contains only that stable configuration-document URL. It must not contain a Railway, Vercel, or other backend hostname.

## Configuration fields

- `schemaVersion`: configuration format version; currently `1`.
- `configVersion`: increase this integer whenever the server configuration changes.
- `apiProtocol`: must be `https`.
- `apiHost`: backend hostname only, without scheme, port, or path.
- `apiPort`: public HTTPS port, normally `443`.
- `apiPath`: API prefix, currently `/api`.
- `mediaPath`: media endpoint prefix, currently `/api/store/media`.

Do not place credentials, tokens, database connection strings, or secrets in this public file.

## Runtime behavior

The app validates the schema and HTTPS host/port, then caches the last valid configuration in Expo SecureStore. If GitHub Pages is temporarily unreachable or returns invalid data, the app uses the cached last-known-good configuration. API calls and authenticated voice playback resolve their URLs through the same service.

## Safe change procedure

1. Edit `server-config.json` in the `hamzawy-download` repository.
2. Increment `configVersion`.
3. Verify the JSON and host/port/path values.
4. Publish the configuration document to GitHub Pages.
5. Test the new endpoint and a previously installed test APK before relying on the change.

Publishing the configuration document and deploying backend code are separate operations.
