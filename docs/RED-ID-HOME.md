# RED ID web pilot

Separate /red-id.html, not the ChatGPT userscript, extensions or cloud job
authentication. Pinned browser module from Redion commit 350f0434fca8c8e0915c7d6ba0a9cf2a3afa9cfc.
Build uses Node 22.18+ type stripping. Configure REDION_HOME_ORIGIN in the
private Worker environment to the exact HTTPS home origin, and allow the
controlled RED Loop web origin on RED ION. Without this the existing
strict CSP remains in place. The dedicated page alone receives the extra
connect-src. No automatic token persistence or sharing. No live deployment.
