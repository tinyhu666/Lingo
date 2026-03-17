# Windows Code Signing

Windows installers must be Authenticode-signed before release. Unsigned `.exe` and `.msi`
files trigger browser and SmartScreen "uncommon download" warnings because Windows sees
them as coming from an unknown publisher.

## Required GitHub Secrets

- `WINDOWS_CERTIFICATE`: base64-encoded `.pfx` code-signing certificate
- `WINDOWS_CERTIFICATE_PASSWORD`: password for the `.pfx`

## How Release Signing Works

1. The Windows release job imports the PFX into `Cert:\CurrentUser\My`.
2. Tauri calls `src-tauri/scripts/sign-windows.ps1` for each installer artifact.
3. The script signs the artifact with `signtool.exe` and DigiCert timestamping.
4. The workflow verifies every generated `.exe` and `.msi` with `Get-AuthenticodeSignature`.

If either secret is missing, the Windows release job fails instead of uploading an unsigned installer.

## Operational Notes

- OV certificates improve trust, but SmartScreen reputation may still take time to build.
- EV certificates usually remove Windows reputation friction much faster.
- Re-signing old assets is not enough; rebuild and re-upload the release so users download the signed files.
