# BrosTwos – Video-Countdown

Countdown zum nächsten Video von [BrosTwos](https://www.youtube.com/@mcBrosTwos) – jeden **Sonntag um 14:00 Uhr** (Europe/Berlin). Sobald ein Video online ist, zeigt die Seite automatisch das neueste Video des Kanals.

## Starten

Doppelklick auf **`start-server.bat`**.

Der Server läuft auf <http://localhost:8123/> und öffnet die Seite automatisch. Voraussetzung ist Python 3 (bei der Installation „Add Python to PATH" aktivieren).

Der Server holt das neueste Video direkt aus dem YouTube-RSS-Feed und liefert es unter `/api/latest-video` an die Seite. Das ist schneller und zuverlässiger als öffentliche CORS-Proxys.

Ohne Server (einfach `index.html` doppelklicken) funktioniert der Countdown sofort. Das Video wird dann über einen öffentlichen Proxy geladen – das kann etwas dauern oder ausfallen.

## Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | Aufbau der Seite |
| `style.css` | Design, ~3 KB |
| `script.js` | Countdown und Laden des Videos, ~9 KB |
| `server.py` | Lokaler Server inkl. `/api/latest-video` |
| `start-server.bat` | Startet den Server unter Windows |
| `logo.png` | Minecraft-Skin-Kopf von BrosTwos (Header + Favicon) |
| `partner.jpg` | Kanal-Logo von [txddi](https://www.youtube.com/@Txddi123) |

## Anpassen

Oben in `script.js`:

```js
const RELEASE_HOUR = 14;   // Uhrzeit des Releases
const TIME_ZONE = "Europe/Berlin";
```

Der Wochentag steckt in `nextRelease()` – aktuell fest auf Sonntag. Die Kanal-ID steht in `script.js` (`CHANNEL_ID`) und in `server.py` (`CHANNEL_ID`). Beide müssen übereinstimmen.

## Hinweis

Inoffizielle Fan-Seite, kein offizielles Angebot von YouTube oder BrosTwos.
