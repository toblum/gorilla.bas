# GORILLAS .BAS

Eine spielbare, deutsche Web-Hommage an QBasic Gorillas mit wählbarem Classic-, 2D- und 3D-Modus: zwei lokale Spieler, eine zufällige Hochhaus-Skyline und explosive Bananen. HTML, CSS und JavaScript, ohne Framework, Installation, externe Schriftarten oder Build-Schritt.

## Starten

**Am einfachsten:** `index.html` im Browser öffnen. Das Spiel funktioniert auch direkt per `file://` und offline.

Alternativ mit Python 3 im Projektordner:

```sh
cd /Users/tblum/tbdev/gorilla.bas
python3 -m http.server 8080 --bind 127.0.0.1
```

Dann [http://127.0.0.1:8080](http://127.0.0.1:8080) öffnen. Der lokale Server endet mit `Ctrl+C`.

## Selbst hosten

Diese sechzehn Dateien gemeinsam in einen Ordner auf einem beliebigen statischen Webserver hochladen:

```text
index.html
style.css
engine.js
engine3d.js
view3d.js
city3d.js
sound.js
visuals.js
scenery.js
finale.js
game.js
classic-font.js
classic.js
classic-ui.js
classic-sound.js
favicon.svg
```

Die Startdatei ist `index.html`. Auch ein Unterordner funktioniert, da alle Assets relativ verlinkt sind. Kein Backend und keine Datenbank nötig. JavaScript-Dateien müssen als JavaScript ausgeliefert werden; normale Webserver tun das automatisch. `tests/` und diese Anleitung müssen nicht veröffentlicht werden.

### Veröffentlichung mit Coolify

Die öffentliche Adresse ist [gorillas.sparebytes.dev](https://gorillas.sparebytes.dev). Das Coolify-Projekt und die Anwendung heißen `gorillas.bas`; das GitHub-Repository heißt `toblum/gorilla.bas`.

Jeder Push auf `main` löst über die vorhandene GitHub-App einen Build in Coolify aus. Nixpacks führt `npm test && npm run build` aus; anschließend liefert Nginx ausschließlich das Verzeichnis `/dist` über HTTPS aus. Pull-Request-Deployments sind deaktiviert.

Der Build benötigt Node.js 22 oder neuer und kopiert nur die sechzehn Spieldateien. Die Version aus `package.json` und die kurze Commit-ID erscheinen im Footer; `/version.json` enthält beide Werte maschinenlesbar. Dafür muss in Coolify unter **Advanced → Source commit availability** die Option **Available during build** gesetzt sein. Lokal lässt sich die Ausgabe mit `npm run build` erzeugen. Ohne Build bleibt der direkte Dateistart möglich.

## Neu in Version 1.4: Classic

**Classic** steht im Startdialog neben 2D und 3D zur Auswahl. Dieser eigenständige Port folgt dem EGA-Pfad des Microsoft-Originals von 1990: 640 × 350 Pixel, originale Palette, 8×14-Bitmap-Schrift, gezeichnete Gorilla-Posen, Bananen-DATA und PC-Lautsprecher-Notenfolgen. Die bisherigen Modi behalten ihre erweiterten Regeln und Darstellung.

Classic spielt eine **feste Gesamtzahl von Runden** (Standard 3), nicht „zuerst 3 Siege“. Namen haben höchstens 10 Zeichen. Nach Titelbildschirm und P/V-Auswahl wird erst **Angle**, dann **Velocity** eingegeben, jeweils mit Enter bestätigt. Beide Werte erlauben 0–360 einschließlich Dezimalpunkt; Velocity wird intern wie in QBasic ganzzahlig gerundet. Leere Eingabe zählt als 0. Nach Treffer und Jubel beginnt die nächste Runde automatisch; abschließend erscheint der originale GAME-OVER-Punktestand. Es kann ein Unentschieden geben.

Die Flugrechnung verwendet die ursprünglichen Zeitschritte und POINT-Kollisionsabfragen; Darstellung und Kollision teilen denselben Bildspeicher. Die Sonne reagiert nur optisch. Gebäudekrater bleiben konstant. Classic enthält keine Zielhilfe, Sonnenverstärkung, Flugspur, Kameras, Replay, Dekorationen oder Mondfinale. „Neues Match“ öffnet die gemeinsame Moduswahl; Classic-Einstellungen bleiben beim Neuladen erhalten, eine laufende Partie wird nicht fortgesetzt.

**Validierung:** Die reproduzierte Originalszene stimmt in **allen 224.000 Pixeln** mit dem unabhängigen QBasic-Screenshot überein. `npm test` umfasst zusätzlich 18 Classic-Engine-Prüfungen für Grafik, Rundenzahl, Eingaben, Selbst-/Gegnertreffer, Sonnenkontakt, Bananen, Originalkollision und Krater. `tests/classic.html` zeigt den direkten Screenshotvergleich und mobile Ansichten. `tests/classic-audio.html` misst die Browser-Tonausgabe und bietet Hörproben. Weitere Tests sichern Originalnoten, QBasic-Oktaven, Intro-Puffer, Stummschaltung und den GAME-OVER-Button ab. Quellen, Testmethode und die Grenzen bei Animationszeiten/Audio stehen in [reference/README.md](reference/README.md). Der Pixelvergleich bestätigt diese statische Szene; eine vollständige DOS-Emulation ist Classic nicht.

## Neu in Version 1.3.3

- Das Einschlag-Replay läuft eine Sekunde länger; die Explosion wird entsprechend langsamer abgespielt. Auch vor dem Match-Finale darf es vollständig auslaufen.
- **Neues Match** behält Punkteziel und Gravitation bei. Die Wurfwerte im Spiel werden zurückgesetzt: Winkel **45°**, Stärke **65**, Richtung **0°**. Beide Kameraansichten starten neu. Namen, Zielhilfe und Replay-Auswahl bleiben ebenfalls erhalten.

## Neu in Version 1.3.2

- Das Einschlag-Replay läuft eine Sekunde länger; die Explosion wird entsprechend langsamer abgespielt. Auch vor dem Match-Finale darf es vollständig auslaufen.

## Neu in Version 1.3: Persönliche Kamera und Einschlag-Replay

- Auf den beiden höchsten intakten Dächern stehen **eine Fahne und eine Windhose**, um 10 % verkleinert. **Eine weitere Fahne und eine weitere Windhose** stehen am Strand. Alle vier reagieren auf denselben tatsächlichen Wind; bei Windstille hängen sie herunter.
- Die Kamera startet leicht erhöht hinter dem aktiven Gorilla und blickt über ihn zum Gegner. Beim Zugwechsel führt eine 1,4 Sekunden lange Kamerafahrt zur Ansicht des anderen Spielers. Eigene Drehungen und Zoomstufen sowie die gewählte Übersicht bleiben pro Spieler gespeichert, auch nach Neuladen. Neue Runden passen den Blickpunkt an die neuen Dachhöhen an. **Am Wurf** stellt die Ansicht hinter dem aktuellen Gorilla wieder her; **Übersicht** zeigt das Stadtpanorama. Beide Wechsel sind weich, direkte Mausbewegungen können eine Kamerafahrt übernehmen.
- **Einschlag-Replay** ist im 3D-Startdialog standardmäßig eingeschaltet. Nach einem Treffer erscheint oben rechts der echte letzte Flugabschnitt mit Explosion und Krater als vergrößerte Zeitlupe. Die Aufnahme verwendet die tatsächliche Flugbahn und den ursprünglichen Gebäudezustand bis zum Einschlag; sie verändert weder Physik noch Punkte. Das Fenster schließt automatisch, per × oder beim nächsten Wurf. Der nächste Spieler kann sofort weiterzielen. Bei reduzierter Bewegung zeigt es eine ruhige Nahaufnahme ohne Kamerafahrt und Flackern.
- Die Replay-Einstellung wird mit dem Match gespeichert. Bestehende Spielstände erhalten die eingeschaltete Voreinstellung. Bei geöffneten Einstellungen oder verborgenem Tab pausieren auch die Präsentationsübergänge.
- Das Replay nutzt denselben WebGL-Kontext. Ohne Replay bleiben es zwei Zeichenaufrufe je Bild; währenddessen kommen zwei für die Nahaufnahme hinzu. Ein zusätzlicher temporärer Stadtpuffer wird beim Schließen wieder freigegeben.

## Neu in Version 1.2.2: Mehr Stadt und grünes Umland

- Neue Städte umfassen **10 × 8 Blöcke**. Zwei äußere Ringe mit niedrigeren Gebäuden und Parks umgeben das zentrale Spielfeld.
- Dichtere Mischwälder mit Nadel- und Laubbäumen, Wiesen, Waldwegen, einem kleinen See mit Steg und Picknickplätzen sowie ein Strandpavillon mit Sonnendächern beleben das Umland. Die Landschaft bleibt gebündelte statische Geometrie.
- Jetzt stehen **zwei Windhosen auf den höchsten intakten Dächern** und **zwei verteilt am Strand**. Die Dach-Windhosen sind in allen Abmessungen um genau 10 % kleiner; die Strand-Windhosen behalten ihre Größe.
- Spielstände mit 24 oder 48 Blöcken bleiben erhalten. Die Stadt wächst beim nächsten Rundenstart oder neuen Match; das neue Umland und die neue Windhosenverteilung erscheinen auch bei bestehenden Städten.

## Neu in Version 1.2.1: Blickrichtung und Wind im Stadtbild

- Gorillas drehen ihren ganzen Körper passend zum gewählten Wurf, auch ohne Zielhilfe. Der wartende Gorilla schaut zum Gegner; der neutrale Startwert für die Richtung ist 0°. Die gedrehten Trefferflächen entsprechen der Körperausrichtung. Während des Flugs bleibt die Wurfrichtung erhalten.
- Die Sonne bekommt zwölf räumliche Strahlen, lächelnde Augen und einen gebogenen Mund. Das Gesicht bleibt aus allen Kamerarichtungen lesbar; Sonnenkontakt wechselt kurz zum erstaunten Ausdruck.
- Neue Runden haben **8 × 6 statt 6 × 4 Blöcke**. Ein zusätzlicher äußerer Ring mit niedrigeren Häusern und Parks umgibt die Startdächer. Strand, Promenade und Anleger wachsen mit; ein weiter Küstenboden mit Bäumen und atmosphärischem Dunst ersetzt die kleine Plattform.
- Auf den **drei höchsten noch vorhandenen Dächern** und **am Strand** stehen rot-weiße Windhosen. Die schmalen Enden zeigen dorthin, wohin der Wind weht. Stärkerer Wind streckt die Stoffröhren, schwacher Wind lässt sie absinken, Windstille lässt sie senkrecht hängen. Bei reduzierter Bewegung bleiben sie ohne Flattern korrekt ausgerichtet.
- Vorhandene Spielstände behalten ihre bisherige Stadt und Punkte. Der größere Blockring erscheint mit der nächsten Runde oder einem neuen Match.

## Neu in Version 1.2: Die dritte Dimension

Im Startdialog lässt sich zwischen **2D / Der Klassiker** und **3D / Die ganze Stadt** wählen. Über **Neues Match** kann jederzeit ein Match im anderen Modus begonnen werden. Namen, Punkteziel, Gravitation und Zielhilfe werden dabei übernommen; ein gestartetes neues Match setzt die Punkte zurück. Die vorhandene 2D-Spielphysik bleibt unverändert.

Die 3D-Version zeigt ein dreidimensionales Stadtviertel im Diorama-Stil: unterschiedlich große und hohe Häuser, Straßen mit Fahrbahnmarkierungen und Autos, verbundene Grünflächen mit Bäumen, einen Brunnenplatz sowie eine Uferpromenade mit Bänken, Anleger und Boot. Gebäude und Gorillas sind echte räumliche Geometrie; die Kamera lässt sich frei um die Stadt drehen.

- **Winkel** bestimmt die Höhe des Wurfs, **Stärke** die Geschwindigkeit. Beide behalten ihren bisherigen Bereich von 0 bis 360.
- **Richtung** ist der zusätzliche horizontale Winkel von −180° bis +180°. Bei 0° wirft Spieler 1 nach Osten, Spieler 2 nach Westen. Positive Werte drehen aus der Ausgangsrichtung des jeweiligen Gorillas nach rechts, negative nach links. Die Kamera ändert diese Bezugspunkte nicht. Beispiel: Spieler 1 wirft mit +90° nach Süden, Spieler 2 mit +90° nach Norden.
- **Q / E** verändern die Richtung; **Shift** vergrößert den Schritt auf 5°. Mausrad und direkte Zahleneingabe funktionieren für alle drei Wurffelder. Die bestehenden Pfeiltasten sowie Enter und Leertaste bleiben erhalten.
- **Ziehen** mit Maus oder Finger dreht die Kamera, das Mausrad zoomt. **Übersicht** setzt die Kamera zurück, **Am Wurf** zeigt die Stadt aus Richtung des aktiven Gorillas. Die Schaltflächen **+ / −** zoomen auch auf Touchscreens. Bei fokussiertem Spielfeld funktionieren **A / D**, **+ / −** und **Pos1**.
- Der **Stadtplan** hat Norden oben. Er zeigt beide Gorillas, die Banane und die gewählte horizontale Richtung. Er bleibt von der Kamera unabhängig. Bei eingeschalteter Zielhilfe zeigt zusätzlich ein räumlicher Pfeil am Gorilla Winkel, Richtung und Stärke.
- **Wind** wirkt in beiden horizontalen Achsen. `O` steht für Osten, `S` für Süden; negative Werte stehen für Westen beziehungsweise Norden. Gravitation wirkt nach unten.
- Einschläge entfernen dauerhaft kleine Bausteine aus der Gebäudegeometrie. Darstellung und Kollision verwenden dieselben belegten Zellen; die Löcher lassen weitere Bananen passieren. Der Explosionsradius berücksichtigt Geschwindigkeit und Wind in allen drei Achsen. Die Sonne ist ein durchfliegbares räumliches Ziel und gibt wie bisher 20 % mehr Explosionsradius.
- Direkte Treffer, Selbsttreffer, Spielerwechsel, Jubel, Punkte und das gemeinsame Bananenmond-Finale folgen denselben Regeln wie in 2D. Gorillas bleiben auf ihrer Ausgangshöhe, auch wenn das Dach beschädigt wird. Bäume, Autos, Bänke, Dachaufbauten und Boote sind Kulisse; Gebäude und Boden sind Hindernisse.
- Der Modus, die komplette beschädigte Stadt, Wind, Richtungswerte und laufende Würfe werden in der Browser-Session gespeichert. Einstellungen und inaktive Browser-Tabs pausieren die Physik. Kamerabewegung und Zoom beeinflussen die Physik nicht.

`engine3d.js` ergänzt die unabhängige Spielphysik; `city3d.js` zeichnet mit WebGL ohne Bibliotheken, externe Assets oder Netzwerkanfragen. Statische Stadtgeometrie wird nur nach Rundenwechsel oder Schäden neu hochgeladen; Stadt und bewegliche Objekte benötigen zusammen zwei Zeichenaufrufe pro Bild. Die Renderauflösung ist auf den Faktor 1,75 begrenzt. Bei fehlendem WebGL zeigt die Moduswahl einen Hinweis; 2D bleibt verfügbar. Die Seite funktioniert weiterhin ohne Build direkt per `file://`.

### Prüfung der 3D-Erweiterung

`npm test` umfasst 78 Tests. Die zusätzlichen 3D-Tests prüfen unter anderem 100 Städte, räumliche Flugbahnen, beidseitige Treffer, Tiefenversatz, Wind in zwei Achsen, Kollisionen bei 20/60/144 FPS, durchfliegbare Schäden, Sonnenladung, Selbsttreffer, Matchende, Session-Wiederherstellung, gedrehte Trefferflächen, den äußeren Blockring und die Windanzeigerplatzierung, gespeicherte Kameraansichten, weiche Zugwechsel und unverfälschte Replay-Flugbahnen.

`tests/spatial.html` prüft den Renderer mit einer reproduzierbaren Stadt, einem Krater und einem laufenden Wurf. Es zeigt WebGL-Fehlerstatus, Dreieckszahl und gemessene Frame-Zeiten. Die Messwerte gelten jeweils für den verwendeten Rechner und sind keine Garantie für andere Geräte. `tests/presentation3d.html` prüft Kameraperspektiven, reale Einschläge, Replay-Abbruch, reduzierte Bewegung und den Zeichenaufwand bei laufender Nahaufnahme. `tests/responsive3d.html` zeigt echte 320- und 390-Pixel-Iframes und prüft ihre Layoutbreite.

## Neu in Version 1.1

- Optionale Zielhilfe im Startbildschirm (standardmäßig aus): Der Pfeil am aktiven Gorilla zeigt den gewählten Winkel und die Wurfstärke, gespiegelt für Spieler 2. Die Einstellung bleibt beim Reload erhalten.
- Die Einschlagsgeschwindigkeit bestimmt den Kraterradius: etwa 8 bis 15 Pixel statt eines festen Radius. Fallbewegung und Wind zählen mit; direkte Gorillatreffer bleiben tödlich.
- Sonnenkontakt lädt die Banane einmalig auf: goldener Schein, Tonsignal und 20 % mehr Explosionsradius, ohne die Flugbahn zu verändern.
- Dekorativer Luftverkehr mit Pausen: Zeppelin 32 %, Ballon 26 %, Flugzeug 34 %, UFO 6 %, Papierflieger 2 % je Passage. UFOs sind schneller; ein kleiner Vogelschwarm ergänzt den Himmel. Die Objekte sind nicht kollidierbar und halten bei reduzierter Bewegung still.
- Die Zielhilfe beginnt im Körperzentrum, liegt hinter dem Gorilla und bleibt durch die reduzierte Transparenz unaufdringlich lesbar.

## Spielen

- Der animierte Willkommensbildschirm fragt Namen, gewonnene Runden zum Sieg und Gravitation ab. **Auf die Dächer!** startet das Match. Ihr spielt abwechselnd am selben Gerät: Orange ist Spieler 1, Mint ist Spieler 2. **Neues Match** öffnet die Einstellungen erneut.
- Das Mausrad über Winkel oder Stärke verändert den Wert und fokussiert das entsprechende Feld. **Shift** verändert den Wert in Fünferschritten.
- **Winkel** und **Stärke** eingeben, dann **Banane werfen** oder in einem Eingabefeld `Enter` drücken. `Tab` wechselt zwischen den Feldern.
- Alternativ: **↑ / ↓** erhöhen/verringern den Winkel, **→ / ←** erhöhen/verringern die Stärke. Mit **Shift** geht es in Fünferschritten. **Leertaste** wirft; Gedrückthalten löst keinen weiteren Wurf aus. Die Kürzel funktionieren im Spielfeld und in den Wurffeldern; im Einstellungsdialog bleibt die normale Tastatureingabe erhalten.
- Für beide Spieler zeigt **0° zum Gegner**, **90° senkrecht nach oben**. Winkel und Stärke erlauben jeweils ganze Zahlen von 0 bis 360. Zum Einstieg eignen sich etwa 45–65° und Stärke 60–85; Skyline und Wind entscheiden über den Treffer.
- Der Windpfeil wächst vom Mittelstrich nach links oder rechts. Seine Länge ist proportional zur Windstärke; die Zahl zeigt den genauen Wert. Bei Windstille verschwindet der Pfeil. Wind bleibt innerhalb einer Runde gleich. Die Gravitation zieht die Banane nach unten.
- Retro-Soundeffekte begleiten Würfe, Gebäudetreffer, Gorillatreffer, Fehlwürfe und Siege. **Ton an / Ton aus** schaltet sie um. Der Browser gibt Audio erst nach einer Spielaktion frei; die Töne entstehen lokal per Web Audio, ohne Audiodateien oder Downloads.
- Gebäude bekommen bleibende Löcher. Ein direkter Gorillatreffer bringt dem Gegner des getroffenen Gorillas einen Punkt – auch bei einem Selbsttreffer. Sehr geringe Stärke (0 oder 1) trifft den Werfer selbst.
- Nach einem Treffer startet **Nächste Runde** eine neue Skyline mit neuem Wind. Die Wurfreihenfolge wechselt weiter.
- Zuerst feiert der Sieger 2,4 Sekunden auf seinem Dach mit abwechselnd erhobenen Armen. Im anschließenden Ergebnisdialog jubelt er weiter. Explosionen zeigen einen kurzen Feuerball, aufsteigenden Rauch, Funken und fallende Trümmer. Bei aktivierter Systemoption „Bewegung reduzieren“ sind die Effekte zurückgenommen und die Siegerpose statisch.
- Wer das eingestellte Punkteziel zuerst erreicht, gewinnt. Danach hebt der Sieger in einer 20 Sekunden langen Bananen-Raumfahrt zum Mond ab. **Zum Startbildschirm** oder **Escape** überspringt das Finale jederzeit. Anschließend erscheint automatisch der Startbildschirm mit den bisherigen Namen und Regeln; das nächste Match beginnt bei 0 : 0. Auch ein Reload während des Finales setzt dessen Fortschritt fort.
- Im Startbildschirm verändert das Mausrad das Rundenziel in Einerschritten und die Gravitation in 0,1-Schritten. **Shift** verfünffacht die Schritte. Das veränderte Feld erhält den Fokus.
- Einstellungen pausieren eine laufende Flugbahn. Beim Wechsel in einen anderen Browser-Tab pausiert das Spiel ebenfalls. Der aktuelle Zustand wird in `sessionStorage` gespeichert: Namen, Regeln, Punkte, Skyline mit Schäden und Fensterlichtern, Wind, Eingabewerte und eine laufende Flugbahn werden nach einem Reload wiederhergestellt. Eine neue Browser-Session beginnt mit dem Willkommensbildschirm. Wenn der Browser Speicherung blockiert, bleibt das Spiel ohne Speichern spielbar.
- Der Himmel zeigt einen warmen Sonnenuntergang mit langsam ziehenden Pixelwolken. Einzelne Fenster wechseln gelegentlich ihre Beleuchtung. Die Systemoption „Bewegung reduzieren“ hält diese Umgebungseffekte an.

Gravitation: Standard **9,8 m/s²**, einstellbar von **0,5 bis 30**. Punkteziel: **1 bis 99**, Standard **3**. Ein Wurf oberhalb des Bildschirms wird mit einem Pfeil angezeigt; weit außerhalb des sichtbaren Bereichs läuft die Flugzeit schneller ab.

## Originalmechanik und bewusste Anpassungen

Als Primärquelle dient der [Microsoft-Originalquelltext GORILLA.BAS (1990), archiviert in basic-samples](https://github.com/pmachapman/basic-samples/blob/master/QBASIC/GORILLA.BAS), insbesondere `MakeCityScape`, `PlaceGorillas`, `PlotShot`, `DoShot` und `PlayGame`.

Übernommen sind zufällige Gebäude, Gorillas auf dem zweiten oder dritten Haus vom Rand, Wind pro Skyline, Gravitation mit Erdstandard 9,8, gespiegelte Winkel des rechten Spielers, rotierende Banane, Gebäudekrater, Selbsttreffer und die durchfliegbare Sonne mit überrascht reagierendem Gesicht. Die Fluggleichungen entsprechen dem Originalprinzip: horizontale Beschleunigung durch `Wind / 5`, vertikale Beschleunigung durch Gravitation.

Die erweiterten Modi 2D und 3D sind neu implementiert und keine pixelgenaue Emulation; für die originalgetreue EGA-Variante steht Classic zur Verfügung. Sie nutzt eine eigene Palette und eigene Pixelgrafik, eine bildratenunabhängige Flugberechnung sowie durchgehende Kollisionsprüfung gegen eine Terrainmaske. Gebäude und Gorillas fallen nach Zerstörungen nicht herunter. Das gewünschte Matchziel bedeutet **„zuerst N Punkte“**; das Original spielte eine feste Anzahl von Runden. Netzwerkspiel, KI und zusätzliche Waffen sind nicht Bestandteil dieser ersten Version.

Pfeiltasten und Leertaste sind eine Komfortbedienung dieser Web-Version. Im recherchierten QBasic-Quelltext werden Winkel und Stärke als Zahlen eingegeben und mit Enter bestätigt. Die neuen Soundeffekte orientieren sich am PC-Lautsprecher-Klang, ohne die Originalmelodien exakt nachzuspielen.

## Entwicklung und Tests

`engine.js` enthält die unabhängig vom Browser testbaren Spielregeln. `game.js` zeichnet das Canvas und verbindet die HTML-Bedienung mit dem Spiel. `sound.js` erzeugt die Soundeffekte, `visuals.js` zeichnet die detaillierten Pixel-Gorillas und Explosionen. Zum Spielen wird Node.js nicht benötigt.

Automatische Tests mit Node.js 18 oder neuer:

```sh
node --test tests/*.test.js
```

Die Tests prüfen Fluggleichungen, Wind und Gravitation, 100 erzeugte Skylines, beidseitige Würfe, Fehlwürfe und Spielerwechsel, schnelle Projektile gegen dünne Hindernisse, Krater, direkte Treffer, Selbsttreffer, Punkte, Rundenwechsel, Matchende, Revanche und Eingabegrenzen. Die Kollisionsprüfung wird bei 20, 60 und 144 Bildern pro Sekunde verglichen.

Zusätzlich im Browser geprüft: Namens- und Zieländerung, Eingabesperre während des Wurfs, Fehlwurf, Selbsttreffer per Enter, Siegdialog und Revanche. Die Layoutprüfung unter `tests/responsive.html` enthält 320 und 390 Pixel breite Mobilansichten sowie ein Desktopfenster mit 1000 × 720 Pixeln. Der Browserdurchlauf erfolgte über den lokalen HTTP-Server; der direkte Dateistart wurde nicht automatisiert geprüft.

Die Erweiterung ist mit 29 automatischen Tests abgesichert, einschließlich der gesperrten Eingabe während der Jubelphase, der Länge der Siegesmelodien und der Session-Wiederherstellung bei Gebäudeschäden, während eines Flugs und während des Jubels. Frühere Browserprüfungen deckten Pfeiltasten, Shift-Schritte, Eingabegrenzen, Leertastenwurf, Texteingabe im Dialog sowie Ton an/aus ab. Die aktuelle Gestaltung des Startbildschirms und der Fokuswechsel per Mausrad sind noch nicht im Browser nachgeprüft. `tests/audio.html` rendert acht Effekte über Web Audio und prüft deren Signalpegel sowie die Stummschaltung. `tests/visuals.html` zeigt die Gorilla-Posen vergrößert und die Explosionen zu verschiedenen Zeitpunkten.

Aktuelle Desktop- und Mobilbrowser mit Canvas und HTML-Dialogen werden vorausgesetzt. Die Seite benötigt während des Spielens keine Netzwerkanfragen; lediglich der freiwillige Link zum Original öffnet GitHub.
