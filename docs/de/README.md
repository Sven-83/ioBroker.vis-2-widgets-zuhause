# vis-2-widgets-zuhause – Anleitung

Widget-Satz für ein Wand-Tablet im dunklen Design: Kacheln, PIN-Dialog, Wetter, Werte-Karte, Schul-Liste,
Karten-Hintergrund und Grundriss-Seiten (Licht, Steckdose, Rollo, Sicherheit) mit Seitenleiste und Fußbodenheizung.

## Installation

Von GitHub, ohne npm-Release:

```
iob url https://github.com/Sven-83/ioBroker.vis-2-widgets-zuhause
iob add vis-2-widgets-zuhause
iob restart vis-2.0
```

Danach im VIS-2-Editor den Browser mit Strg+F5 neu laden. Die Widgets stehen in der Palette unter **Zuhause**.

## Farben (Projekt-CSS)

Alle Widgets lesen CSS-Variablen und haben dunkle Standardwerte. Zum Anpassen im Projekt-CSS überschreiben:

```css
:root {
  --bg: #232325;  --card: #2b2b2f;  --border: #36363b;
  --text: #ece9e1;  --text-2: #a3a19a;
  --sw-off-bg: #333338;  --sw-off-bd: #44444a;  --sw-off-fg: #cfccc3;
  --sw-on: #f2c14e;  --sw-on-fg: #2a2108;
  --st-on-bg: #183323;  --st-on-bd: #3f8f57;  --st-on-fg: #9fe0b2;  --st-led: #6fe08a;
  --st-off-bd: #4f4f56;
  --warn-bg: #3a1d1f;  --warn-bd: #e5484d;  --warn-fg: #ffb3b3;
  --co2: #4aa3ff;  --light: #f2c14e;  --lock-open: #e5484d;  --lock-closed: #1f7a3a;
  --radius-card: 18px;  --radius-tile: 14px;
}
```

Die Schrift Barlow ist im Widget enthalten (keine Anfrage an Google).

## Kachel

Eine Kachel ist 88 × 88 px groß. Wird das Widget größer oder kleiner gezogen, skaliert die Kachel mit; auf dem Handy sind z. B. 72 × 72 px sinnvoll.

| Typ | Aus / normal | An | Tippen |
|---|---|---|---|
| Schalter | grau, Kippschalter links | gelb | schaltet um |
| Schalter, Aus mit PIN | wie Schalter + „PIN“ | gelb | Ein direkt, Aus öffnet den PIN-Dialog |
| Status + Ausschalten | gestrichelt | grün + Power-Symbol | nur Aus; bei „aus“ passiert nichts |
| Status | gestrichelt | grün, LED | keine Aktion |
| Status mit Warnung | grün oder grau | rot + Text der Warnung | keine Aktion |

- **Warnung bei true:** Post = an (true = Post da), Fenster = aus (false = Fenster offen).
- **Befehle:** Die Kachel schreibt den Wert und zeigt einen kleinen Kreisel, bis der Datenpunkt mit `ack = true` zurückkommt. Kommt nach 5 s keine Bestätigung, bekommt die Kachel einen roten Rahmen.
- **Gedrückt halten (500 ms):** öffnet die unter „Popup“ gewählte View, z. B. Details zum Kühlschrank. Das Popup schließt nach der eingestellten Zeit ohne Eingabe (Standard 5 s, 0 = nie).
- **Badges:**
  - Schloss: grün = abgeschlossen, rot = offen.
  - CO₂-Punkt (blau) und Licht-Punkt (gelb).
  - Diagnose unten rechts, blinkt rot:
    - WLAN-Symbol bei Empfang 0 bzw. `false`.
    - Batterie-Symbol unter 20 %.
  - Welche Diagnose möglich ist, legt die **Geräteklasse** fest.
- **Empfang-Grenze:** 0 = nur bei 0 oder `false`. Für dBm-Werte z. B. -90 eintragen.
- **Veraltet nach:** Ist der Wert älter als die eingestellten Minuten, wird die Kachel gedimmt und zeigt ein „?“.
- **Alarm ausgelöst:** Ist der Datenpunkt `true`, blinkt die Kachel rot und zeigt den Alarmtext. Für den Alarm aus Skript B: `0_userdata.0.vis.sicherheit.alarmAusgeloest`.
- **Animation:**
  - Läuft nur, solange die Kachel aktiv ist oder warnt.
  - Stufen: voll, dezent, aus. Optional nachts aus (22–6 Uhr).
  - `prefers-reduced-motion` des Geräts wird immer beachtet.

## PIN-Dialog

Das Widget **PIN-Dialog** einmal auf jede View legen, auf der eine PIN-Kachel liegt. Es ist zur Laufzeit unsichtbar.

1. Kachel „Alarm“ antippen, während sie an ist: Der Dialog schreibt das Ziel (`alarm` / `kameras`) nach `…sicherheit.pinZiel` und öffnet den Ziffernblock.
2. Nach der 4. Ziffer schreibt er die Eingabe nach `…sicherheit.pinEingabe` und schließt sich.
3. Skript B (`sicherheit-pin.js`) prüft die PIN und meldet über `…sicherheit.meldung`. Der Dialog zeigt die Meldung als Toast.

Die PIN steht nie im Browser. Fehlt das PIN-Widget auf der Seite, öffnet die Kachel einen eigenen Ziffernblock mit den Standard-Datenpunkten von Skript B.

## Wetter, Werte-Karte, Schul-Liste, Karte

- **Wetter:**
  - Pro Tag eine Temperatur und einen WMO-Wettercode, z. B. vom Adapter open-meteo-weather.
  - Die Tage heißen automatisch HEUTE, MORGEN und dann nach dem Wochentag.
  - Nur das Icon von heute bewegt sich.
- **Werte-Karte:**
  - Bis zu 8 Werte, jeweils mit Einheit und Nachkommastellen.
  - Darstellung „groß“ für Temperaturen, „kompakt“ für Energie.
  - Die Fußzeile darf VIS-Bindings wie `{0_userdata.0.x}` enthalten.
  - „Tippen öffnet View“ macht die ganze Karte zur Schaltfläche.
  - „Platzhalter“ zeigt die Karte gestrichelt, z. B. für Victron.
- **Schul-Liste:**
  - Liest die Datenpunkte von Skript C.
  - Die Klassen-Chips schreiben die Auswahl als JSON nach `…schule.klassen`.
  - Ist Tag 2 eingetragen, erscheint ein Umschalter.
  - „Ganzen Plan öffnen“ zeigt eine View als Popup.
- **Karte:**
  - Hintergrund mit bis zu drei Gruppentiteln.
  - Die Position der Gruppen 2 und 3 wird in px von oben angegeben; dort liegt die Trennlinie.
  - Die Kacheln legt man im Editor oben drauf.
- **Kopfzeile:**
  - Links eine kleine Oberzeile (z. B. Familienname) und der Seitentitel, rechts Datum und Uhr.
  - Die Uhr springt zur vollen Minute um.
  - „Reiter“ zeigt Knöpfe zum Wechseln der View, z. B. `Wohnung:Licht-Wohnung, Keller:Licht-Keller`. Der Reiter der eigenen View ist hell.
- **Legende:**
  - Eine Zeile mit den Zeichen der Kacheln: Schalter, tippen = aus, Status, Warnung, CO₂, PIN.
  - Jeder Eintrag lässt sich abschalten.

## Grundriss

Das Widget **Grundriss** zeigt einen Plan mit Geräte-Pins und dem Lichtschein je Zone.

**SVG-Datei:**
- Räume als `<polygon id="bad" data-name="Bad" points="…">`, am besten in `<g id="raeume">`.
- Die Datei in den VIS-Dateibereich hochladen, z. B. nach `img/grundriss-wohnung.svg`, und im Feld „Grundriss-SVG“ wählen.
- Der Plan wird als Bild gezeigt; Skripte in der Datei laufen nicht.
- Bringt die Datei eigene `<text>`-Beschriftungen mit, zeichnet das Widget keine Raumnamen darüber.

**Geräte (JSON):** eine Liste von Objekten. `x`/`y` sind Koordinaten in den Einheiten der viewBox des SVG.

```json
[
  { "typ": "lampe", "raum": "bad", "x": 168, "y": 37, "oid": "shelly.0.bad.Relay0.Switch" },
  { "typ": "dimmer", "name": "Eingang 2", "raum": "eingang", "x": 369, "y": 99,
    "oid": "hue.0.eingang2.on", "oidHelligkeit": "hue.0.eingang2.level" },
  { "typ": "rollo", "name": "Wohnen Couch", "raum": "wohnen", "x": 705, "y": 241,
    "oid": "", "oidPosition": "shelly.0.rollo6.Shutter.Position" },
  { "typ": "fenster", "name": "Fenster Bad", "raum": "bad", "x": 0, "y": 45,
    "oid": "zigbee.0.fenster1.opened", "oidBatterie": "zigbee.0.fenster1.battery" }
]
```

| Feld | Bedeutung |
|---|---|
| `typ` | `lampe`, `dimmer`, `steckdose`, `rollo`, `fenster`, `tuer`, `tor`, `glasbruch`, `rauchmelder`, `sirene`, `bewegung`, `wasser`, `thermometer`, `geraet` |
| `name` | für Listen und Popups; leer = Raumname |
| `raum` | id des Raum-Polygons im SVG |
| `x`, `y` | Position in viewBox-Einheiten |
| `oid` | Hauptdatenpunkt: an/aus, offen (true = offen), ausgelöst, Wert |
| `oidSchreiben` | wenn Befehle auf einen anderen Datenpunkt gehen |
| `oidHelligkeit` | Dimmer 0–100; macht „gedrückt halten = Helligkeit“ möglich |
| `oidPosition` | Rollo 0 (zu) bis 100 (offen) |
| `oidFaehrt` | Rollo fährt (Lamellen bewegen sich) |
| `oidRauch`, `oidSirene` | Rauchmelder: eigene Detektion und Ansteuerung durch den Alarm-Adapter; Rauch hat Vorrang |
| `oidEmpfang`, `empfangGrenze` | WLAN-Badge |
| `oidBatterie`, `batterieGrenze` | Batterie-Badge, nur bei batteriebetriebenen Typen; Standard 20 % |
| `invertieren` | Kontakte: true = zu; Rollos: 0 = offen |
| `icon` | bei `geraet`: Icon aus dem Satz, z. B. `waschmaschine` |
| `einheit`, `nachkomma` | bei `thermometer`, Standard `°` und 1 |

**Bedienung:**
- **Tippen:**
  - Lampe, Steckdose: an/aus.
  - Rollo: auf/zu.
  - Garagentor: öffnet bzw. schließt.
  - Sensoren: keine Aktion, nur Anzeige.
- **Gedrückt halten (500 ms):**
  - Dimmer: Helligkeit.
  - Rollo: Höhe.
  - Schließzeiten: 0,6 s nach einer Schnellwahl, 1,2 s nach dem Regler, ohne Eingabe nach 5 s.

**Lichtzonen (JSON):** Offene Bereiche ohne Wand bilden eine gemeinsame Zone, damit der Lichtschein nicht an unsichtbaren Kanten endet:

```json
[{ "id": "offen", "raeume": ["eingang", "flur", "kueche", "wohnen"] }]
```

**Lichtschein und Tönung:**
- Eingeschaltete Lampen färben ihre Zone gelb, Dimmer je nach Helligkeit.
- Offene Rollos lassen Tageslicht herein.
- Offene Fenster und Türen, Glasbruch und Rauch tönen den Raum rot, Wasser blau.

**Pin-Größe:** 1 entspricht dem Entwurf, bei dem der Plan 884 px breit ist. Die Pins wachsen und schrumpfen mit dem Plan.

Ein vollständiges Beispiel mit erfundenem Plan liegt in [`docs/beispiel`](../beispiel).

## Etagen-Panel

Die Seitenleiste neben dem Grundriss. Im Feld „Grundriss-Widget“ den Plan wählen; das Panel nutzt dessen Geräteliste. Bleibt das Feld leer (oder passt die ID nach einem View-Import nicht mehr), nimmt das Panel den einzigen Grundriss der eigenen View.

| Funktion | Inhalt |
|---|---|
| Licht | „x an“, „Alle aus“, Wartungshinweis, Raumliste (Tippen schaltet alle Lampen des Raums) |
| Steckdose | was an ist, Wartung; ohne Sammelaktion |
| Rollo | „a offen · b teilweise · c zu“, Alle hoch / Alle runter, Schnellwahl je Rollo |
| Sicherheit | Alarm scharf/unscharf (Aus mit PIN, Hinweis bei offenen Fenstern), Übersicht, offene Fenster/Türen, Wartungsliste |

## Fußbodenheizung (Klima)

Kachel mit Ist-Temperatur groß, Soll klein und Status. Solange der Stellantrieb offen ist, wird sie orange und Wärme steigt auf.

Gedrückt halten öffnet die Solltemperatur: −/+ in 0,5°-Schritten und Schnellwahl. Die Schnellwahl wird als `Name:Wert` eingetragen, z. B. `Eco:19, Komfort:21.5, Bad:24`.

## Abweichungen von der Übergabe (bewusst)

- **Pins:** Sie liegen im Grundriss-Widget und werden als JSON-Liste mit Plan-Koordinaten gepflegt, nicht als einzelne Widgets zum Ziehen. Gründe:
  - Lichtschein und Tönung brauchen die Positionen aller Geräte.
  - Die Koordinaten der Entwürfe lassen sich direkt übernehmen.
  - Bei 36 Sensoren bleibt die Pflege überschaubar.
- **Rollo-Auswahl:** Sie ist das Popup des Grundriss-Widgets und kein eigenes Widget.
- **Kachelgröße:** Sie folgt der Widget-Größe. Ein Feld „Größe 88/72“ gibt es nicht.
- **Feld „Animation“:**
  - Es kennt nur „automatisch“ und „keine“, weil jedes Icon genau eine Animation hat.
  - Die Stufe (voll, dezent, aus, nachts aus) wird je Widget eingestellt.
