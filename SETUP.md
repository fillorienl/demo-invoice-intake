# Setting up the invoice intake demo

From a fresh Mac to a running demo in about 10 minutes. For what the demo shows and how it works, see [README.md](README.md).

## 1. Install Node.js

You need Node.js 20 or newer. Check what you have:

```bash
node -v
```

If the command isn't found or the version is lower than 20, install the current LTS version from [nodejs.org](https://nodejs.org) or with Homebrew:

```bash
brew install node
```

## 2. Install the project

```bash
cd ~/workbench/fillorie/claude/invoice-intake-demo
npm install
```

This downloads Next.js, the AI provider SDK, pdf.js (turns PDF pages into images for some providers) and the IBM Plex fonts. Nothing is installed globally.

## 3. Choose the AI provider

Create your settings file from the example:

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in one provider. `LLM_PROVIDER` decides which one is used, so you can keep keys for several providers in the file.

**Claude (default)**
```bash
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
# optional, defaults to claude-sonnet-5-5
ANTHROPIC_MODEL=claude-haiku-5-5
```
Get a key at [console.anthropic.com](https://console.anthropic.com).

**Mistral (EU-hosted)**
```bash
LLM_PROVIDER=mistral
MISTRAL_API_KEY=...
```
Get a key at [console.mistral.ai](https://console.mistral.ai). Uses Mistral OCR; invoices can be at most 8 pages.

**OpenAI**
```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=<a model that accepts images>
```

**Azure OpenAI, Google Gemini, Ollama, LM Studio, OpenRouter**

These all use the OpenAI option with a different address:
```bash
LLM_PROVIDER=openai
OPENAI_BASE_URL=<address from the table below>
OPENAI_API_KEY=<key, if the service needs one>
OPENAI_MODEL=<model or deployment name>
```

| Service | `OPENAI_BASE_URL` | Notes |
|---|---|---|
| Azure OpenAI | `https://YOUR-RESOURCE.openai.azure.com/openai/v1` | `OPENAI_MODEL` is your deployment name |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | Key from Google AI Studio |
| Ollama (local) | `http://localhost:11434/v1` | No key needed. Pull a vision model first |
| LM Studio (local) | `http://localhost:1234/v1` | No key needed. Load a vision model and start the server |
| OpenRouter | `https://openrouter.ai/api/v1` | Pick a model that accepts images |

The model must be able to read images, because PDF pages are sent to these services as pictures.

## 4. Start the demo

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The sidebar shows which provider and model will read the invoices. Check it before you start.

The first page load puts the 8 sample invoices in the inbox. Click **Process 8 new invoices** to read and check them.

## 5. Before every demo

1. Click **Reset demo** in the sidebar, then click it again to confirm. This empties the inbox back to the 8 unread samples and restores the mock ERP.
2. Make sure `.env.local` does not contain `EXTRACTOR=fixture`. If a yellow "Offline test mode" bar is showing, it does.
3. Process the invoices once and check that they land as listed in the README. Then reset again.

The README has a 2-minute walkthrough you can follow on a call or for a screen recording.

## Testing without an API key

Add this line to `.env.local` and restart:

```bash
EXTRACTOR=fixture
```

The 8 sample invoices are then filled from prepared data instead of an AI model, so you can click through the whole flow. A yellow bar reminds you it's on. Uploads don't work in this mode.

## Trying your own invoices

Click **Upload PDF** and pick a file. `test-uploads/` has 5 ready-made ones with known results (see the README). A real invoice from elsewhere will usually end up in **Manual** as an unknown supplier, because its supplier isn't in the mock ERP.

## Switching provider or model

Change `LLM_PROVIDER` (or the model setting) in `.env.local`, stop the app with Ctrl+C and run `npm run dev` again. Invoices that were already read keep their data. Reset the demo to have everything read again by the new model.

## Troubleshooting

| What you see | What to do |
|---|---|
| "ANTHROPIC_API_KEY is not set" (or the Mistral or OpenAI version) | The key for the provider in `LLM_PROVIDER` is missing from `.env.local`. Add it and restart. |
| "OPENAI_MODEL is not set" | Add the model name your service uses. |
| An error with status 401 or 403 | The API key is wrong or has no access to that model. |
| An error with status 404 from an OpenAI-compatible service | Check `OPENAI_BASE_URL`. It should end in `/v1` (or `/openai` for Gemini) without `/chat/completions`. |
| "rejected every JSON output mode" | The service or model can't return structured data. Try another model. |
| Invoices land in **Needs review** with "amounts don't add up" | The model misread a number. Smaller or local models do this more often. Compare with `samples/expected/` or `test-uploads/expected/`. |
| A change in `.env.local` has no effect | Restart `npm run dev`; settings are read at start-up. |
| `npm install` fails on `@napi-rs/canvas` | Make sure Node is 20 or newer, delete `node_modules` and run `npm install` again. |
| The PDF panel is empty | Open the invoice with **Open in new tab**. Some browsers block PDFs inside a page. |

## Other commands

```bash
npm test          # checks the matching logic against all sample invoices (no AI needed)
npm run build     # production build, to check everything compiles
npm run samples   # regenerate the sample PDFs and mock ERP data (needs Python with reportlab, Pillow, numpy and poppler)
```
