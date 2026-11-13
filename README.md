# CrossPoint sleep screen: calendar + weather (Belgium)

A GitHub Action draws a 480x800 BMP every hour: current weather, the next three
days (Open-Meteo, no API key) and a month calendar with Belgian public holidays.
The CrossPoint reader downloads it each time it goes to sleep (see the
`calendar-weather` SD plugin).

Three files are published on the `output` branch (always a single commit, so the
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

## Good to know

- Scheduled runs are best effort. GitHub may delay them, and it pauses scheduled
  workflows in a public repo after 60 days without repository activity (you get an
  email; re-enable under Actions, or press "Run workflow").
- If the weather service is down the run fails and the old images stay.
- Run locally: `npm ci && npm run render` (needs Node 20; images appear in `out/`).
- Weather data: Open-Meteo (CC BY 4.0), free for non-commercial use.
