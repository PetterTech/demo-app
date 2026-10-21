# PetterTech · Live container

A small, self-contained demo image for Azure Container Apps, Docker, and presentations.
It combines PetterTech branding, Montserrat fonts, a dark background (`#232323`),
and a yellow accent (`#F4D64C`) with an animated wireframe cube, orbiting lights,
and response-triggered pulses.
The graphics are abstract decoration, **not a visualization of actual infrastructure**.

No database, Azure SDK, authentication, or runtime npm dependencies.
The logo, fonts, CSS, and JavaScript are bundled in the image; there are no CDN requests.

## Publish a public container image

The [GitHub Actions workflow](.github/workflows/container.yml) runs backend,
browser, and Docker tests on pushes to `main` and pull requests. Manual runs also
test only. Pushing a version tag publishes a Linux AMD64 + ARM64 image to GHCR
after the tests pass:

```sh
git tag v1.0.0
git push origin v1.0.0
```

Publishing uses GitHub's built-in `GITHUB_TOKEN`; no custom credentials are needed.
The image name is derived from the lowercase repository owner and name. For this
repository, the reference is `ghcr.io/pettertech/demo-app:1.0.0`.
The workflow's **Summary** shows the exact image reference and digest.

After the first publish, open the owner's **Packages** page, select the container
package, and choose **Package settings > Change visibility > Public**.
**A public repository does not automatically make its container package public.**
Once public, the image can be pulled without registry credentials.

Use a new version tag for each release, such as `v1.0.1`; do not move or reuse tags.
Only `vX.Y.Z` releases are supported, without prerelease suffixes.
The workflow deliberately does not publish a `latest` tag.
Use the digest-pinned reference from the Summary when you need immutable content.

## Run locally with Docker

From the repository root:

```sh
docker build -t pettertech-demo:1.0.0 .
docker run --rm -p 127.0.0.1:8080:8080 --name pettertech-demo pettertech-demo:1.0.0
```

Open http://localhost:8080. Stop with Ctrl+C or `docker stop pettertech-demo`.
The loopback binding limits access to your own machine. Use `-p 8080:8080` instead
if you intentionally want to expose the port on all network interfaces.

Apple Silicon Macs normally build ARM64 images locally. For Azure Container Apps,
explicitly build or publish Linux AMD64 (see below). The GHCR workflow publishes
both architectures.

Optional hardened local run:

```sh
docker run --rm -p 127.0.0.1:8080:8080 --read-only --memory=256m --cpus=0.5 --cap-drop ALL --security-opt no-new-privileges pettertech-demo:1.0.0
```

## Run without Docker

With Node.js 22 or later:

```sh
node server.mjs
```

No `npm install` is required to run the app. The default port is 8080.

## Customize the demo

Demo configuration and runtime details are **public**. Never put secrets in these values.

- `DEMO_MESSAGE`: message below the heading. Default: `Less clicking. More creating.`
- `DEMO_ACCENT`: accent color in `#RRGGBB` format. Default: `#F4D64C`. Choose a light color against the dark background.
- `DEMO_VERSION`: displayed version. Default: `1.0.0`.
- `BUILD_COMMIT`: optional public commit ID. Displays "Not provided" when unset.
- `PORT`: listening port. Default: `8080`.

`DEMO_VERSION` and `BUILD_COMMIT` can be set with `--build-arg` or as runtime environment
variables. This example works in both bash and PowerShell:

```sh
docker run --rm -p 127.0.0.1:8080:8080 -e "DEMO_MESSAGE=Hello, NIC!" -e "DEMO_ACCENT=#F4D64C" -e "DEMO_VERSION=2.0" pettertech-demo:1.0.0
```

Text is limited to 256 characters and rendered as text, never HTML.
Arbitrary environment variables are not exposed.

## Azure Container Apps

The image serves HTTP on **target port 8080**. Configure ingress as needed.
The app does not need a managed identity or Azure API access to display its runtime data.

ACA sets these variables automatically; **do not set them manually in a real ACA app**:

- `CONTAINER_APP_NAME`
- `CONTAINER_APP_REVISION`
- `CONTAINER_APP_REPLICA_NAME`

Without these values, the UI shows "Standalone container / process", "Not provided"
for the revision, and the actual hostname for the instance. It does not guess that
it is running in Azure.

Once the GHCR package is public, use `ghcr.io/pettertech/demo-app:1.0.0` directly in
Container Apps, without registry authentication or an ACR in your demo environment.
Use the version you have actually published, or its digest-pinned reference.

**Alternative: your own ACR.** If you already have an Azure Container Registry,
build from the repository root. Replace `YOUR_ACR_NAME` with the registry name
(not its fully qualified login server name):

```sh
az acr build --registry YOUR_ACR_NAME --image pettertech-demo:1.0.0 --platform linux/amd64 .
```

Then use `YOUR_ACR_NAME.azurecr.io/pettertech-demo:1.0.0` as the Container App image.
A private ACR requires pull access for the Container App.
This project does not provision Azure resources. A local `docker build` publishes
nothing; the included GitHub workflow publishes to GHCR when you push a version tag.

### Suggested live demo

1. Deploy a revision with the yellow accent and your own message.
2. Change `DEMO_MESSAGE`, `DEMO_ACCENT`, and optionally `DEMO_VERSION` in a new revision.
3. Enable multiple revision mode and set traffic weights if both should stay active.
4. Use **the app's normal URL**, not a revision-specific URL.
5. The page highlights responses from a different revision or replica.

Traffic splitting does not mean alternating requests. Session affinity can keep a
browser on the same replica; disable it when demonstrating load distribution.
One browser request at a time is not a load test and may not trigger scale-out.
The app shows the responding instance, not the total replica count.

**Auto-refresh sends a request every three seconds** while the tab is visible.
This can keep the app warm and affect scale-to-zero. Disable auto-refresh or close
the tab when demonstrating scale-down. "Pause motion" stops only the graphics.
A hidden tab stops both polling and the animation loop.

See the [ACA environment variable documentation](https://learn.microsoft.com/en-us/azure/container-apps/environment-variables#apps).

## What the measurements mean

- **Process uptime**: time since the Node.js process started, not host uptime.
- **Process memory**: Node.js process RSS, not total container or host memory.
- **Container memory / limit**: Linux cgroup v2, with a v1 fallback. Unlimited or
  unavailable limits are explicitly labeled; host RAM is never used as the container limit.
- **Round trip**: browser-measured time to fetch and read the API response, including network time.
- **Responses this visit**: successful API responses in this page, not a global traffic counter.
- **Revision / replica**: public ACA-provided values, with explicit local fallbacks.
- On failure, the last values are marked as stale rather than presented as live data.

Graphics run in the browser at approximately 30 frames per second at most, with
bounded pixel resolution. A pause button and `prefers-reduced-motion` are supported.
Reduced motion starts with the graphics paused.

## Endpoints and security

- `/`: demo page
- `/api/runtime`: the same public runtime data as JSON, with `Cache-Control: no-store`
- `/healthz`: HTTP 200 for a live HTTP server
- Only explicitly allowed static assets are served, not source code or `.env` files.
- GET/HEAD only, with CSP, nosniff, and restricted browser permissions.
- No environment dump, reflected request headers, client IP, or credentials in responses.
- The image runs as the non-root `node` user and supports a read-only filesystem.

This app is a demo, not an internal operations dashboard. App name, hostname,
revision, runtime version, and optional commit ID are intentionally public diagnostics.
Configure ACA startup/liveness/readiness probes against `/healthz` as needed;
Docker HEALTHCHECK is not a substitute for platform probes.

## Tests

```sh
npm ci
npx playwright install chromium
npm test
npm run test:ui
```

Backend tests cover the asset allowlist, runtime data, allowed HTTP methods, and
rejection of file paths. Browser tests cover actual canvas pixel changes,
pause/resume, reduced motion, mobile layout, real HTTP requests, and technical details.
Two local HTTP servers with **explicit test fixtures** cover revision changes,
safe text rendering, accent color, failure handling, and recovery.
These tests do not verify an actual Azure deployment.

For browser checks against a running container, set `BASE_URL` before running
`npm run test:ui`. The behavior suite still uses its own local fixtures.
[test/record-preview.mjs](test/record-preview.mjs) can record a short video from
the same URL.

## Maintenance

Node 22 Alpine is pinned to an image digest for reproducible builds.
Update the digest regularly for security fixes and rerun the tests.
Playwright is a development-only dependency and is not copied into the image.
Dependabot proposes monthly updates for GitHub Actions, the Docker base image,
and npm development dependencies; updates are not merged automatically.

## License and assets

The project's original code and documentation are licensed under the
[MIT License](LICENSE).

- **PetterTech branding:** the PetterTech name, logo, and favicon are not covered
  by the MIT license. All rights are reserved in the logo and favicon, and no
  trademark rights are granted. Obtain permission before reusing these assets;
  replace the branding when adapting this project for your own use.
- **Montserrat fonts:** the bundled fonts are licensed separately under the
  [SIL Open Font License 1.1](public/OFL-Montserrat.txt). Keep that license with
  any redistributed copies of the fonts.
