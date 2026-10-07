# Pantry Pilot

Paste a grocery list, and Pantry Pilot uses Claude to choose products and add them to your Amazon cart. You review the cart and check out yourself. The app never purchases anything.

## 1. Install the prerequisites

- Install **[Node.js LTS](https://nodejs.org/)** (includes npm).
- Install the **Claude Code command-line app** using the command below. The Claude website or desktop app alone is not enough.

**Windows:** open PowerShell and run:

```powershell
irm https://claude.ai/install.ps1 | iex
```

**Mac:** open Terminal and run:

```sh
curl -fsSL https://claude.ai/install.sh | bash
```

Close and reopen your terminal, then sign in:

```sh
claude auth login
```

Follow the browser prompts using an account with Claude Code access. A free Claude account is not enough; a supported subscription or paid Console account is required. See [Claude’s official installation and account guide](https://code.claude.com/docs/en/setup).

## 2. Download and start Pantry Pilot

Download this repository as a ZIP and extract it (or clone it with Git). Open a terminal in the extracted folder containing `package.json`. On Windows, right-click inside the folder and choose **Open in Terminal**.

Run these commands one at a time:

```sh
npm ci
npm run setup
npm start
```

`setup` downloads the shopping browser and checks Node, Claude login, and browser startup. It does not log you in or make a paid AI request.

Open **http://127.0.0.1:4320** on that computer. Keep the terminal open and the computer awake while shopping. Press **Ctrl+C** in the terminal to stop the app. Next time, just run `npm start` in the same folder.

No Harness, Tailscale, or separate server account is needed. This address works on the computer running the app, not on your phone.

## 3. Connect Amazon and shop

1. Click **Open shopping browser**. Sign in to Amazon in that window and select your delivery address.
2. Enter your US delivery ZIP, number of people, days, quality preference, and grocery list.
3. Review the list. Leave counts blank for AI estimates, or enter a number to fix the package count.
4. Start the run. The app collects search results, then asks Claude to compare them. The AI progress panel shows batches and elapsed time.
5. Review the results and your Amazon cart. Complete checkout in your regular browser, signed into the same Amazon account.

Failed items may need manual shopping. If an addition is marked **unconfirmed**, check the cart before retrying to avoid duplicates.

## How Claude connects

There is no API key to paste into Pantry Pilot when using a Claude subscription. The app runs the installed `claude` command and uses the login you completed above, under the same computer user. You can close Claude after signing in; Pantry Pilot starts it when needed.

It sends your grocery list, ZIP, preferences, and collected product details to Claude to rank choices and estimate quantities. Amazon passwords and cookies are not sent. Claude only returns recommendations; the app controls the shopping browser. Requests count toward your Claude account’s limits or Console billing.

## If setup fails

Run `npm run doctor` to repeat the checks without reinstalling the browser.

- **Claude not found:** reopen the terminal after installing. Run `claude --version`. For a custom native executable location, set `PANTRY_CLAUDE_BIN` to its full path before starting the app.
- **Claude login or usage error:** run `claude auth login` and check your account’s access and usage limits.
- **Browser missing:** run `npm run setup` again.
- **PowerShell blocks npm.ps1:** use `npm.cmd` in place of `npm` for the commands above.
- **Wrong delivery ZIP:** select the matching address in the shopping browser, then retry.

Your Amazon session and reports stay in `.local/`. Do not include that folder when sharing the project.
