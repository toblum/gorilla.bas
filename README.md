# GORILLAS .BAS

Eine spielbare, deutsche Web-Hommage an QBasic Gorillas: zwei lokale Spieler, eine zufällige Hochhaus-Skyline und explosive Bananen. HTML, CSS und JavaScript, ohne Framework, Installation, externe Schriftarten oder Build-Schritt.

## Starten

**Am einfachsten:** `index.html` im Browser öffnen. Das Spiel funktioniert auch direkt per `file://` und offline.

Alternativ mit Python 3 im Projektordner:

```sh
cd /Users/tblum/tbdev/gorilla.bas
python3 -m http.server 8080 --bind 127.0.0.1
```

Dann [http://127.0.0.1:8080](http://127.0.0.1:8080) öffnen. Der lokale Server endet mit `Ctrl+C`.

## Selbst hosten

Diese sechs Dateien gemeinsam in einen Ordner auf einem beliebigen statischen Webserver hochladen:

```text
index.html
style.css
engine.js
sound.js
game.js
favicon.svg
```

Die Startdatei ist `index.html`. Auch ein Unterordner funktioniert, da alle Assets relativ verlinkt sind. Kein Backend, keine Datenbank und keine Umgebungsvariablen nötig. JavaScript-Dateien müssen als JavaScript ausgeliefert werden; normale Webserver tun das automatisch. `tests/` und diese Anleitung müssen nicht veröffentlicht werden. Es wurde keine externe Veröffentlichung vorgenommen.

## Spielen

- Ihr spielt abwechselnd am selben Gerät. Orange ist Spieler 1, Mint ist Spieler 2; Namen lassen sich unter **Neues Match** ändern.
- **Winkel** und **Stärke** eingeben, dann **Banane werfen** oder in einem Eingabefeld `Enter` drücken. `Tab` wechselt zwischen den Feldern.
- Alternativ: **↑ / ↓** erhöhen/verringern den Winkel, **→ / ←** erhöhen/verringern die Stärke. Mit **Shift** geht es in Fünferschritten. **Leertaste** wirft; Gedrückthalten löst keinen weiteren Wurf aus. Die Kürzel funktionieren im Spielfeld und in den Wurffeldern; im Einstellungsdialog bleibt die normale Tastatureingabe erhalten.
- Für beide Spieler zeigt **0° zum Gegner**, **90° senkrecht nach oben**. Winkel und Stärke erlauben jeweils ganze Zahlen von 0 bis 360. Zum Einstieg eignen sich etwa 45–65° und Stärke 60–85; Skyline und Wind entscheiden über den Treffer.
- Der Windpfeil wächst vom Mittelstrich nach links oder rechts. Seine Länge ist proportional zur Windstärke; die Zahl zeigt den genauen Wert. Bei Windstille verschwindet der Pfeil. Wind bleibt innerhalb einer Runde gleich. Die Gravitation zieht die Banane nach unten.
- Retro-Soundeffekte begleiten Würfe, Gebäudetreffer, Gorillatreffer, Fehlwürfe und Siege. **Ton an / Ton aus** schaltet sie um. Der Browser gibt Audio erst nach einer Spielaktion frei; die Töne entstehen lokal per Web Audio, ohne Audiodateien oder Downloads.
- Gebäude bekommen bleibende Löcher. Ein direkter Gorillatreffer bringt dem Gegner des getroffenen Gorillas einen Punkt – auch bei einem Selbsttreffer. Sehr geringe Stärke (0 oder 1) trifft den Werfer selbst.
- Nach einem Treffer startet **Nächste Runde** eine neue Skyline mit neuem Wind. Die Wurfreihenfolge wechselt weiter.
- Wer das eingestellte Punkteziel zuerst erreicht, gewinnt. **Revanche spielen** startet mit denselben Namen und Einstellungen bei 0 : 0. **Neues Match** erlaubt andere Einstellungen und setzt das Spiel zurück.
- Einstellungen pausieren eine laufende Flugbahn. Beim Wechsel in einen anderen Browser-Tab pausiert das Spiel ebenfalls. Neuladen setzt das Match zurück; es gibt absichtlich keinen Spielstandspeicher.

Gravitation: Standard **9,8 m/s²**, einstellbar von **0,5 bis 30**. Punkteziel: **1 bis 99**, Standard **3**. Ein Wurf oberhalb des Bildschirms wird mit einem Pfeil angezeigt; weit außerhalb des sichtbaren Bereichs läuft die Flugzeit schneller ab.

## Originalmechanik und bewusste Anpassungen

Als Primärquelle dient der [Microsoft-Originalquelltext GORILLA.BAS (1990), archiviert in basic-samples](https://github.com/pmachapman/basic-samples/blob/master/QBASIC/GORILLA.BAS), insbesondere `MakeCityScape`, `PlaceGorillas`, `PlotShot`, `DoShot` und `PlayGame`.

Übernommen sind zufällige Gebäude, Gorillas auf dem zweiten oder dritten Haus vom Rand, Wind pro Skyline, Gravitation mit Erdstandard 9,8, gespiegelte Winkel des rechten Spielers, rotierende Banane, Gebäudekrater, Selbsttreffer und die durchfliegbare Sonne mit überrascht reagierendem Gesicht. Die Fluggleichungen entsprechen dem Originalprinzip: horizontale Beschleunigung durch `Wind / 5`, vertikale Beschleunigung durch Gravitation.

Diese Fassung ist neu implementiert und keine pixelgenaue Emulation. Sie nutzt eine eigene Palette und eigene Pixelgrafik, eine bildratenunabhängige Flugberechnung sowie durchgehende Kollisionsprüfung gegen eine Terrainmaske. Gebäude und Gorillas fallen nach Zerstörungen nicht herunter. Das gewünschte Matchziel bedeutet **„zuerst N Punkte“**; das Original spielte eine feste Anzahl von Runden. Netzwerkspiel, KI und zusätzliche Waffen sind nicht Bestandteil dieser ersten Version.

Pfeiltasten und Leertaste sind eine Komfortbedienung dieser Web-Version. Im recherchierten QBasic-Quelltext werden Winkel und Stärke als Zahlen eingegeben und mit Enter bestätigt. Die neuen Soundeffekte orientieren sich am PC-Lautsprecher-Klang, ohne die Originalmelodien exakt nachzuspielen.

## Entwicklung und Tests

`engine.js` enthält die unabhängig vom Browser testbaren Spielregeln. `game.js` zeichnet das Canvas und verbindet die HTML-Bedienung mit dem Spiel. `sound.js` erzeugt die Soundeffekte. Zum Spielen wird Node.js nicht benötigt.

Automatische Tests mit Node.js 18 oder neuer:

```sh
node --test tests/*.test.js
```

Die Tests prüfen Fluggleichungen, Wind und Gravitation, 100 erzeugte Skylines, beidseitige Würfe, Fehlwürfe und Spielerwechsel, schnelle Projektile gegen dünne Hindernisse, Krater, direkte Treffer, Selbsttreffer, Punkte, Rundenwechsel, Matchende, Revanche und Eingabegrenzen. Die Kollisionsprüfung wird bei 20, 60 und 144 Bildern pro Sekunde verglichen.

Zusätzlich im Browser geprüft: Namens- und Zieländerung, Eingabesperre während des Wurfs, Fehlwurf, Selbsttreffer per Enter, Siegdialog und Revanche. Die Layoutprüfung unter `tests/responsive.html` enthält 320 und 390 Pixel breite Mobilansichten sowie ein Desktopfenster mit 1000 × 720 Pixeln. Der Browserdurchlauf erfolgte über den lokalen HTTP-Server; der direkte Dateistart wurde nicht automatisiert geprüft.

Die Erweiterung ist mit 16 automatischen Tests abgesichert. Im Browser wurden Pfeiltasten, Shift-Schritte, Eingabegrenzen, Leertastenwurf, ungestörte Texteingabe im Dialog sowie Ton an/aus geprüft. `tests/audio.html` rendert alle sechs Effekte über Web Audio und prüft deren Signalpegel sowie die Stummschaltung.

Aktuelle Desktop- und Mobilbrowser mit Canvas und HTML-Dialogen werden vorausgesetzt. Die Seite benötigt während des Spielens keine Netzwerkanfragen; lediglich der freiwillige Link zum Original öffnet GitHub.
