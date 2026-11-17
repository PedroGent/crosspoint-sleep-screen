# CrossPoint sleep screen: calendar + weather (Belgium)

A GitHub Action draws a 480x800 BMP every hour: current weather, the next three
days (Open-Meteo, no API key) and a month calendar with Belgian public holidays.
The CrossPoint reader downloads it each time it goes to sleep (see the
`calendar-weather` SD plugin).

The `output` branch also holds `catalog.json` and `config-*.json`, used by the reader's on-device orientation picker.

Three images are published on the `output` branch (always a single commit, so the
repository does not grow):

| file | use |
| --- | --- |
| `sleep-portrait.bmp` | reader held normally |
| `sleep-left.bmp`     | landscape layout, read with the device turned left (counter-clockwise) |
| `sleep-right.bmp`    | landscape layout, read with the device turned right (clockwise) |

## Set up

1. Create a **public** repository named `crosspoint-sleep-screen` and push these files:
   ```
   git init -b main
   git add -A
   git commit -m "Initial commit"
   git remote add origin https://github.com/PedroGent/crosspoint-sleep-screen.git
   git push -u origin main
   ```
   (Or use "Add file > Upload files" on github.com. Include the hidden `.github` folder.)
2. Open the **Actions** tab, enable workflows if asked, pick **Render sleep screen**
   and press **Run workflow**. After about a minute the `output` branch exists.
3. Check it in a browser:
   https://raw.githubusercontent.com/PedroGent/crosspoint-sleep-screen/output/sleep-portrait.bmp
4. Copy the `calendar-weather` plugin folder to `/plugins/calendar-weather/` on the SD card.

## Change location, language, format

Edit `config.json` on GitHub; the push triggers a new render.

| key | meaning |
| --- | --- |
| `place`, `lat`, `lon` | label and coordinates for the weather |
| `lang` | `en` or `nl` |
| `bpp` | `1` (black/white, smallest) or `4` (16 grays), try 4 if the reader shows the wrong image |
| `flemishDay` | `true` also marks 11 July |

## Reliable hourly runs (recommended)

GitHub's own scheduler is best effort: runs are often late and sometimes dropped,
especially on new or quiet repositories. Trigger the workflow from a free external
scheduler instead (for example https://cron-job.org):

1. GitHub > Settings > Developer settings > Fine-grained personal access tokens >
   Generate new token. Repository access: only `crosspoint-sleep-screen`.
   Permissions: Repository permissions > **Actions: Read and write**. Copy the token.
2. On cron-job.org create a job that runs every hour:
   - URL: `https://api.github.com/repos/PedroGent/crosspoint-sleep-screen/actions/workflows/render.yml/dispatches`
   - Request method: POST, request body: `{"ref":"main"}`
   - Headers: `Authorization: Bearer <your token>`, `Accept: application/vnd.github+json`,
     `Content-Type: application/json`
   - A successful call returns HTTP 204.
3. Keep the built-in schedule as a backup. The "Updated hh:mm" line on the image shows
   when it was last rendered.

## Good to know

- Scheduled runs are best effort. GitHub may delay them, and it pauses scheduled
  workflows in a public repo after 60 days without repository activity (you get an
  email; re-enable under Actions, or press "Run workflow").
- If Open-Meteo fails (it sometimes rate-limits shared GitHub IPs) the script retries five times, then redraws with the
  last good forecast (up to 24 hours old; the "Updated" time then shows when that forecast was fetched) and the run shows a
  yellow "Using cached weather" warning. Only if there is no usable forecast does the run fail, and the old images stay.
- Fonts (DejaVu, free licence) are included in `fonts/`, so nothing is installed at render time.
- Run locally: `npm ci && npm run render` (needs Node 20 or newer; images appear in `out/`).
- Weather data: Open-Meteo (CC BY 4.0), free for non-commercial use.
