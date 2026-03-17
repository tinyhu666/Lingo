# Windows Code Signing

Windows installers must be Authenticode-signed before release. Unsigned `.exe` and `.msi`
files trigger browser and SmartScreen "uncommon download" warnings because Windows sees
them as coming from an unknown publisher.

## Recommended Setup: Azure Artifact Signing

This repo now supports Microsoft Artifact Signing as the preferred release path. It keeps
the private key in Microsoft's signing service instead of storing a `.pfx` in GitHub.

Required GitHub secrets:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Required GitHub variables:

- `AZURE_ARTIFACT_SIGNING_ENDPOINT`
- `AZURE_ARTIFACT_SIGNING_ACCOUNT_NAME`
- `AZURE_ARTIFACT_SIGNING_CERTIFICATE_PROFILE_NAME`

Recommended auth model:

- Configure GitHub OIDC federation for the Azure identity.
- Grant the identity the `Artifact Signing Certificate Profile Signer` role on the certificate profile.

Workflow behavior:

1. `release.yml` detects the available Windows signing strategy.
2. On Azure mode, the workflow authenticates with `azure/login@v2`.
3. The workflow downloads Microsoft's `Artifact Signing` SignTool integration package and generates the required metadata JSON.
4. During the Tauri build, `src-tauri/scripts/sign-windows.ps1` signs each Windows installer with `signtool.exe` plus `Azure.CodeSigning.Dlib.dll`.
5. The workflow verifies every signed installer with `Get-AuthenticodeSignature`.

Official references:

- [Artifact Signing setup guide](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations)
- [Artifact Signing GitHub integration guidance](https://github.com/Azure/artifact-signing-action)

## Fallback Setup: PFX Certificate

If Artifact Signing is not ready yet, the workflow still supports importing a base64-encoded `.pfx`.

Required GitHub secrets:

- `WINDOWS_CERTIFICATE`
- `WINDOWS_CERTIFICATE_PASSWORD`

Workflow behavior:

1. The Windows release job imports the PFX into `Cert:\CurrentUser\My`.
2. Tauri calls `src-tauri/scripts/sign-windows.ps1` for each installer artifact.
3. The script signs the artifact with `signtool.exe` and DigiCert timestamping.
4. The workflow verifies every generated `.exe` and `.msi`.

## Operational Notes

- OV certificates improve trust, but SmartScreen reputation may still take time to build.
- EV certificates usually improve SmartScreen trust faster than OV certificates.
- Re-signing old assets is not enough; rebuild and re-upload the release so users download the signed files.
