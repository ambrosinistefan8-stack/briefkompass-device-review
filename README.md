# BriefKompass device-only contest build

BriefKompass shows source quotations, candidate dates and open questions for fictional official letters. The included English and German interfaces run a rule-based review and can add suggestions from a local Chrome model. The user reviews the source before saving a task. This version does not assign a due date automatically.

## Run on your computer

```sh
npm ci
npm test
npm run build
npm start
```

Load `http://127.0.0.1:8090/index-en.html` in desktop Chrome and select **On-device AI**. Start with the missing-document example. Successful AI output shows `inferenceSource: on_device`. The model may need to download in Chrome the first time. The rule-based demo works on browsers or devices without an available local model.

The [Chrome hardware and language requirements](https://developer.chrome.com/docs/ai/get-started) apply. Use Chrome 149 or newer for German text and check the [current Firebase Chrome setup](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started) if the model is unavailable. First download needs an unmetered connection. Device inference works offline after downloading the model and loading the app.

The default build is the local development version with synthetic Firebase identifiers and a browser policy of `connect-src 'none'`. It makes no App Check attestation and demonstrates device inference independently. The SDK is pinned by the lockfile and is bundled locally.

The **Demo** mode reviews the fictional examples with built-in rules. It works without the device model, an account or any external connection once the build is loaded. The six `npm test` checks simulate model and App Check responses. A successful run of those tests does not establish live App Check or Nano availability on your device.

## Prepare the jury mode when a registered App Check app is available

1. Use a dedicated Firebase Spark project without a linked billing account. Register a Web app and leave billing-dependent products off. Register a production score-based reCAPTCHA Enterprise key for the exact approved HTTPS domain. Register the Web app with App Check. See the [official App Check setup](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider).
2. Store a private local JSON file outside the source checkout with just the browser registration fields shown below. Set `BRIEFKOMPASS_WEB_CONFIG` to its path and run `npm run build`. Use a separately restricted browser key scoped to the site and the App Check API. Keep registered configuration, debug tokens and generated `release/` outside the public source repository. Never include service credentials or real letters in source, examples or judging instructions.
3. Serve `release/` in an approved HTTPS test environment and retain the generated `_headers` policy. If the server does not support `_headers`, port those headers to its own configuration. The built HTML already embeds a CSP as a second layer. The only external network destinations permitted by the top-level app are the attestation endpoints and reCAPTCHA assets. The app requests an App Check token without passing any letter text. The app uses only `ONLY_ON_DEVICE` and rejects results with any other inference source. When an attestation is configured, it also rejects AI results if attestation fails.
4. Test from a fresh supported Chrome session at that exact origin. Verify successful App Check and the device response without any Gemini inference requests. Run the trial with synthetic data and check access through the end of judging.

```json
{
  "firebase": {
    "projectId": "your-firebase-project-id",
    "appId": "the-registered-web-app-id",
    "apiKey": "the-restricted-firebase-web-key"
  },
  "appCheckSiteKey": "the-domain-restricted-recaptcha-enterprise-site-key"
}
```

## Contest scope

The app uses Firebase AI Logic with Chrome's local model. The fictional letters remain in German in both interfaces. The source offers device-only inference. Firebase App Check and reCAPTCHA may exchange attestation data in an approved hosted configuration. The app sends no letter text to those services. See the [Gemini API terms](https://aistudio.google.com/docs/terms#use-restrictions) before adding any cloud feature.

The [contest rules](https://firebasehybridaihackathon.devpost.com/rules) call for App Check, an open-source repository, working test access and a public English demo video or English subtitles. Scoring includes hybrid inference. The organizer determines whether the device-only build qualifies. This project is a learning prototype. Always compare all findings against the letter. It provides no legal advice or official decision.

## Deutsch

BriefKompass zeigt bei erfundenen Briefen Textbelege, mögliche Datumsangaben und offene Fragen. Prüfe jeden Vorschlag am Original. Die App setzt keine verbindlichen Fristen und trifft keine rechtliche oder behördliche Entscheidung.

Starte mit `npm ci`, `npm test`, `npm run build` und `npm start`. Öffne `http://127.0.0.1:8090/` in Desktop-Chrome. Die **Demo** wertet synthetische Briefe mit Regeln aus und benötigt weder ein Modell noch ein Konto. Mit einem unterstützten Chrome-Modell liefert **Lokale KI** Vorschläge direkt auf deinem Gerät. Als Bestätigung erscheint `inferenceSource: on_device`. Die sechs Tests verwenden simulierte Modell- und App-Check-Antworten. Für den echten App-Check-Test braucht es die registrierte HTTPS-Domain.

Die App enthält nur lokale Inferenz. Im registrierten Hosting-Modus dürfen App Check und reCAPTCHA die App prüfen. Die App übermittelt dabei keinen Brieftext. Verwende für Demos und Tests ausschliesslich die erfundenen Beispiele. Hinweise zu Lizenzen stehen in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
