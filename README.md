# RED Loop

**RED Loop** is an experimental, opt-in Safari userscript for continuing an individual ChatGPT conversation in a bounded loop. The current release is **not** a standalone iOS app.

## Current prototype (v0.1)

- Floating Start / Stop control on chatgpt.com
- Independent per-conversation counters and limits (1–50)
- Waits for an assistant message to remain stable before continuing
- Stops on a draft, detected error, hidden tab, or navigation away
- Does not overwrite an existing message draft
- Does not use an API key or send conversations to a separate server

## Install on iPhone

1. Install the open-source [Userscripts Safari extension](https://github.com/quoid/userscripts) using its official distribution instructions.
2. Enable its Safari extension in iOS Settings → Safari → Extensions and grant permission for chatgpt.com.
3. Add [userscripts/red-loop.user.js](userscripts/red-loop.user.js) to the Userscripts directory using the extension's documented import procedure.
4. Open **chatgpt.com** in Safari, open a conversation, and start RED Loop from the floating control.
5. Choose a maximum continuation count and press **Start**. Use **Stopp** at any time.

The script needs an existing assistant response. It does **not** initiate a new conversation on its own.

## Important limitations

- **Unverified on a physical iPhone:** ChatGPT's DOM and Safari's extension behavior can change; testing is required.
- Safari may suspend background tabs. This script explicitly stops when its tab is hidden. It **cannot** keep several tabs running simultaneously or work with the iPhone locked.
- It sends follow-up messages into an existing chat; it cannot extend ChatGPT's server-side response duration or guarantee useful work.
- Each continuation consumes ChatGPT usage. Choose a small limit initially.
- The automation is intentionally bounded and requires a user-initiated start.
- No integration with the ChatGPT API, GitHub automation, or remote agent processes yet.

## Architecture and upstream research

[quoid/userscripts](https://github.com/quoid/userscripts) is the recommended **separate host Safari extension**, licensed GPL-3.0. RED Loop does not currently vendor or copy its source. [shenruisi/Stay](https://github.com/shenruisi/Stay) is an alternative implementation reference, not a dependency. Before distributing a standalone iOS application, review source licenses, Apple signing requirements, and Safari Web Extension packaging.

## Roadmap

1. Test on iPhone Safari; adapt editor/send selectors to the live site.
2. Add explicit per-chat state inspection, recovery UI, and automated tests.
3. Create a native SwiftUI container and Safari Web Extension with RED Loop branding.
4. Validate permissions, accessibility, privacy, and App Store distribution constraints.

## Safety

RED Loop never stores credentials. Do not paste API keys or sensitive information into the automation settings. Stop the script if ChatGPT produces an error, asks for confirmation, or enters a task requiring human judgment.
