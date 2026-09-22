# Adobe prototype: close-out and recording run sheet

**Date:** 21 September 2026. This replaces the storyboard in the prototype plan with the steps that match the build as it works today. Run every command from `/Users/seanmeehan/Projects/csc-forms-demo/forms-prototype`.

## Part 1: close out the build (once, about 15 minutes)

1. Open InDesign, open **Plugins > Prototype Queue Worker**, confirm the `.prototype` folder is selected and click **Start worker**. Check it answers:

   ```bash
   npm run panel:ping
   ```

2. Build the content library and the three templates, then run the local request. Expect `completed` with six outputs rebuilt.

   ```bash
   npm run demo:build
   ```

   ```bash
   npm run demo:run -- req-001-demo-build
   ```

3. Move the document set into Frame.io. This replaces the earlier test files, moves old releases and requests into `99 Archive` (nothing is deleted) and queues a baseline request.

   ```bash
   npm run seed:frameio -- --from .prototype/local-demo --replace --prune --request req-010-baseline
   ```

   ```bash
   npm run prototype -- --composition uxp run req-010-baseline
   ```

4. Acrobat check. From `03 Generated variants/<release>/example-super/` open the three `-interactive.pdf` files. For each: tab through the fields, fill a few, tick a box, pick a radio option and a title, sign, save, close and reopen. Run **All tools > Prepare for accessibility > Check for accessibility**. Record the result as "tagged and accessibility-checked", not PDF/UA.
5. Commit and push.

   ```bash
   git add -A && git commit -m "Demo document set, template builder and recording run sheet" && git push
   ```

If a run fails, the request folder moves to `Failed` and holds a `failure.json` that names the problem. Send me the `ERROR` lines.

## Part 2: set the stage before recording

- **Hidden terminal:** start the poller and leave it running. It checks Frame.io every five seconds.

  ```bash
  npm run prototype -- --composition uxp watch
  ```

- **InDesign:** panel open, worker started. Keep it off screen until scene 2.
- **Frame.io:** open the project in list view sorted by name, so `00 Requests` to `04 Review and approved` read in order. No custom fields or collections are needed: the four folders inside `00 Requests` are the status view.
- **Files to hand:** download `content-library.indd` and `product-data.csv` from `01 Source content`, and `fund-nomination.indt` from `02 Templates and assets/templates`.
- **Never on screen:** the terminal, GitHub, code, UXP Developer Tool.
- **Timing:** a full six-output run takes four to five minutes, mostly Frame.io transfer. Pause the recording while a request sits in `Generating`.

## Part 3: scenes (target six to eight minutes)

| # | Scene | What to do | What to say | Problem statements addressed |
| --- | --- | --- | --- | --- |
| 1 | The workspace (30 s) | Walk the five folders. Open the baseline release: two brand folders, `evidence`, `release-report.md`. | Everything a business user touches starts and ends here. | One workspace holds sources, templates, requests and outputs, and a request name plus release id traces each job end to end (problems 1, 2, 8). |
| 2 | Change shared content (75 s) | Open `content-library.indd`. Go to the page captioned `privacy.statement`, change a sentence, save. Drag the file into `01 Source content`. | One approved story feeds every document. Nobody edits JSON or XML. | The subject-matter owner edits one approved story, which carries an owner and status, instead of a specialist re-keying it into every document (problems 4, 13, 16). |
| 3 | Change presentation (45 s) | Open `fund-nomination.indt` with **Open Original**. Change the heading "Your details" or the `panel.tint` swatch, save, drag into `02 Templates and assets/templates`. | Templates control layout. Output files are never touched by hand. | Layout and form controls live in a controlled, labelled template rather than copied template pages, and no output file is ever edited by hand (problems 7, 9). |
| 4 | Ask for generation (15 s) | In `00 Requests/Ready to generate`, create a folder named `req-020-privacy-update`. | In production this event comes from Workfront. | A named request replaces manual job set-up; in production the Workfront request would carry the naming and metadata (problems 3, 14). |
| 5 | The hidden layer (20 s) | Show the architecture diagram from the plan. | The service works out what is affected, resolves brand and data, and asks InDesign to compose. | The service assembles the source snapshot and resolves data values itself, so nothing is copied or re-typed by hand (problems 3, 6). |
| 6 | Results (90 s) | Refresh: the request moves to `Generating`, then `Ready for review`. Open its `release-report.md`: changed inputs, six outputs rebuilt. Open one form per brand and point to the new sentence and the template change. | One edit, every affected document, both brands, no copying. | Every affected variant is rebuilt, exported and returned in one step, with field names, tab order and preflight checked on each build (problems 4, 10, 11). |
| 7 | Selective rebuild (45 s) | Edit `contact.hours` in `product-data.csv`, upload it, create `req-021-hours`. The report shows four rebuilt and the nomination form skipped. | The system knows where each value is used and leaves the rest alone. | A value in the product data file flows into every document that binds it, and untouched documents are left alone (problems 4, 6). |
| 8 | Verify (60 s) | In Acrobat open a `-interactive.pdf`: tab through, fill, save, reopen, show the accessibility check. | Fillable output with consistent field names across all forms. | Fields survive regeneration because they are configured from the manifest, and Acrobat is used to check rather than change, so nothing diverges from the InDesign source (problems 7, 10). |
| 9 | Close (30 s) | Show `release-manifest.json`: source versions, hashes, result. Map Frame.io to Workfront and AEM, and the desktop panel to a production InDesign service. | Every release carries its own evidence. | The release manifest ties request, source versions, outputs and checks together, and its records could seed a live document inventory (problems 2, 8, 12). |

**Optional failure scene.** Before recording, stage an invalid request from the hidden terminal with `npm run request:frameio -- req-030-invalid --json .prototype/requests/bad-request.json --raw`. On camera, show it land in `Failed` with a readable `failure.json`. It addresses problem 16 in part: a bad or incomplete input stops the line with a stated reason instead of a specialist guessing.

**If Frame.io asks about a same-named upload,** either choice works: the service follows the newest file, and the newest version inside a version stack.

Problem numbers refer to [uc3-document-production-problem-statements.md](uc3-document-production-problem-statements.md).

## What each scene proves

| Capability | Scene |
| --- | --- |
| Structured, reusable content | 2 |
| Cascading change with where-used | 6, 7 |
| Templates, branding and variants | 3, 6 |
| Fillable output | 8 |
| Closed storage loop and evidence | 1, 6, 9 |
| Hard failure on bad input | optional |
