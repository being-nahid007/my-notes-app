# My Notes (Android)

Offline-first notes app. Notes are stored on the phone and optionally synced
with a small Node.js backend.

## 1. Get the APK (no Android Studio needed)

1. Create a new GitHub repository and push this whole folder to it.
2. Open the repo's **Actions** tab. The "Build Android APK" workflow runs on every push
   (or press **Run workflow**). It takes about 5-8 minutes.
3. Open the finished run, scroll to **Artifacts**, download `my-notes-apk`, unzip it.
4. Copy `app-debug.apk` to your phone and open it. Android will ask you to allow
   "Install unknown apps" for your file manager or browser. Allow it once.

## 2. Run the backend (only needed for sync)

```
cd server
npm install
NOTES_KEY=choose-a-secret node server.js
```

- Same Wi-Fi: use `http://<your-computer-ip>:3000` as the server address in the app's Settings.
- Anywhere: deploy the `server` folder to a host such as Render or Railway, set the
  `NOTES_KEY` environment variable, and use its https address in Settings.
- `DATA_FILE` (env) changes where notes are stored. Free hosts often wipe the disk on
  restart, so use a persistent disk or keep a backup.

The same server also serves the web version at `/`, which can be installed from
Chrome with "Add to Home screen".

## How sync works

Each note has an `updatedAt` time. When the app syncs, the newer version of each note
wins on both sides. Deleted notes are kept as small markers so deletes sync too.
Phone clocks on your devices should be roughly correct.

## Notes

- The APK is a **debug build**. It installs and runs normally. For the Play Store you
  would need a signed release build.
- Edit the app by changing files in `www/`, push again, and a new APK is built.
