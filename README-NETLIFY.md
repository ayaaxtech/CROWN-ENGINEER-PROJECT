# CROWN ENGINEERS LTD SYSTEM

Static Netlify deployment package.

## Netlify drag-and-drop

1. Open Netlify and choose **Add new site → Deploy manually**.
2. Upload the contents of this ZIP (or upload the ZIP itself if the uploader accepts ZIP files).
3. Leave the build command and publish directory empty/default; this is a static HTML site.

## Environment variables

None are required for the current static build. The site uses inline HTML/CSS/JavaScript and public source URLs. If you later add private APIs, add only those keys in Netlify Site configuration → Environment variables and keep them out of the ZIP.

## Halo hand controls

After deployment on the HTTPS Netlify URL, click **START HANDS** and allow camera access. The Holo Gestures MediaPipe runtime is self-hosted in `vendor/`, so no API key or environment variable is needed and camera frames stay in the browser.

- Index-point: orbit the engineering view
- Pinch: toggle exploded view
- Fist: toggle wireframe
- Peace sign: reset the view

The repository attribution is included in `THIRD-PARTY-HOLO-GESTURES-LICENSE`.
## Free Jarvis AI

Jarvis uses WebLLM and a small open-source model in the browser. It does not need `OPENAI_API_KEY`, a paid AI account, or any Netlify environment variable. The first use downloads the model into the browser cache; Chrome or Edge with WebGPU is recommended. The model is grounded by the selected product record and document links, and it must not replace a qualified engineer or an approved machine-specific procedure.
## Conceptual 3D workbench

The site bundles one separate GLTF/BIN conceptual model per catalog product under `models/`. The models include named frame, conveyor, guard, cabinet, control panel, pneumatic and tooling components. The viewer supports orbit rotation, wheel zoom, Shift-drag pan, x-ray opacity, wireframe mode, reset view, exploded view and a clickable component tree. These are visual concepts generated from public product imagery and records; they are not production CAD, verified dimensions, or safety documentation.

Product images and accessible public documents are copied into `assets/` for local site access. Where a public product image was not available, the card uses a clearly labelled conceptual preview.

## Automatic machine-plate scanner

Use **Scan machine plate** to start the rear camera on a phone/tablet or upload a plate photo. The website runs a bundled English OCR runtime in the browser, extracts the plate text, detects supported model codes such as S07, captures serial/date/voltage text in the readout, and opens the matching local machine record. The record then loads its conceptual GLTF model, local image, available local documents, installation/electrical/pneumatic reference profile, parts groups and machine-specific Jarvis context.

Camera access requires HTTPS (or localhost) and is only requested after the user presses **Start camera**. OCR and model recognition are reference assistance, not a substitute for verifying the physical nameplate, approved electrical drawings, pneumatic requirements, risk assessment or manufacturer documentation.

## Scan-first global identification

The home screen is now centered on **Scan anything. Ask Jarvis.** Jarvis is visible by default. The scanner has two modes:

- **Local-first:** bundled OCR plus the local Freemantle catalog and locally bundled models/documents.
- **Global AI + web:** bundled OCR plus an optional secure Netlify Function for visual AI, followed by public Wikidata research. The function keeps the AI key on the server and never exposes it in browser code. It can return multiple candidate machines/components with confidence and reasons rather than pretending an uncertain visual match is verified.

To activate visual AI after deployment, configure the Netlify environment variable `OPENAI_API_KEY` and optionally `VISION_MODEL`. Without that variable, Global mode still performs OCR and public Wikidata lookup and clearly reports that visual AI is not configured. The function is provider-agnostic at the endpoint level and uses the configured OpenAI-compatible base URL if `OPENAI_API_BASE` is set.

The system is designed to identify more than Freemantle plates: motors, pumps, valves, sensors, drives, control panels, generic machines and unknown components. Exact part numbers, electrical ratings, pneumatic requirements and safety-critical installation data must still be verified against the physical nameplate and approved manufacturer documentation.

## Jarvis providers and voice

Jarvis now supports typed and spoken conversations. Use **Talk** for browser speech recognition and optionally enable **Speak replies** for browser speech synthesis. Chrome/Edge provide the strongest browser voice support.

For a working server-side free-tier AI option, set `GEMINI_API_KEY` in Netlify and use the default `GEMINI_MODEL=gemini-2.0-flash-lite` (or choose another Gemini model available to the account). Jarvis sends only the current context and conversation to the secure function; the key is never shipped to the browser. If Gemini is not configured, the function can use the existing OpenAI-compatible route via `OPENAI_API_KEY`, and finally the browser-local WebGPU model.

PDF documents are now served from the locally bundled `assets/documents` directory. The site does not rely on the external Real3D Flipbook JavaScript or cross-origin PDF access.

## Global search

The main search box now searches both the local machine library and free public sources for arbitrary queries. It can be used for machine names, manufacturers, motors, valves, sensors, drives, technical terms or general subjects. The deployed search function queries Wikipedia, Wikidata and DuckDuckGo’s public instant-answer index, then displays linked results below the local records. It does not require an API key. Search results are informational and should be checked against the component nameplate and approved technical documentation for engineering decisions.

## Render deployment

This project now includes a single Render-compatible Node web service. Deploy the repository as a **Web Service** with `npm install` as the build command and `npm start` as the start command, or use the included `render.yaml`. Add `GEMINI_API_KEY` as a Render environment variable for Universal Engineer chat and visual identification. The server also serves the website, GLTF models, PDFs, OCR assets and global-search API from one origin; no Netlify Functions or separate backend are required.
