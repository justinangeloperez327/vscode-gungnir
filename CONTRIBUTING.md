# Contributing

Use Node.js **24** and a current Visual Studio Code installation.

```sh
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:integration
npm run package
```

Until `package-lock.json` is committed, use `npm install` instead of `npm ci`.
Linux integration tests need a display server; CI uses `xvfb-run -a npm run test:integration`.
Open the repository in VS Code and press F5 to launch an Extension Development Host.
Run **Gungnir: Show Extension Status** in the Command Palette.

Keep project commands behind explicit user action and VS Code Workspace Trust checks.
No automatic publishing, installer download or remote deployment is permitted.
