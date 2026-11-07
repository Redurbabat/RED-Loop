# Windows background task continuation

1. Give ChatGPT the original assignment in an existing conversation and let its first answer load.
2. In RED Loop select **Text für offene Aufgaben laden**. This prepares a follow-up asking for concrete work on remaining tasks, verification and a short progress report.
3. Enable **Auch im Hintergrund weiterarbeiten**, choose a limit (1–50) and press **Start**. Other programs and tabs may now be used while this chat/browser remains open.
4. Leave Windows awake. In Edge go to **Settings → System and performance → Performance → Always keep these sites active** and add `https://chatgpt.com`. [Microsoft explains sleeping tabs and the site exception](https://support.microsoft.com/en-us/edge/learn-about-performance-features-in-microsoft-edge).
5. The loop waits during generation and after each new stable answer before sending again. Stop remains available in the page panel. Navigation, errors, drafts or the configured limit stop execution. Reload requires another explicit Start.

The work preset requests `[RED_LOOP_FERTIG]` as the final nonempty line when the assignment is complete, or `[RED_LOOP_RUECKFRAGE]` when user input/access/approval is needed. A requested final marker stops the loop after the answer finishes. This relies on ChatGPT's reported status; RED Loop does not independently verify that the original assignment is complete. Custom follow-up text can still be used instead.

The foreground-only behavior remains the default. Background selection is saved per chat in tab session storage, with the prompt/counter/limit. No background service worker, new host permission, API key or server-side conversation storage is added. The page must remain executable: browser closure, a sleeping/discarded tab or PC sleep cannot perform work. iOS/Safari suspension and locked iPhones remain unsupported.

The tests and observed results are recorded in [test-report.md](test-report.md) and [windows-live-test.md](windows-live-test.md). A short background test is separate from an overnight endurance run.
