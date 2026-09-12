# Classic: Herkunft und Validierung

## Primärquelle

`GORILLA.BAS` ist der unveränderte Microsoft-Quelltext von 1990, bezogen am 11.09.2026 aus:
https://raw.githubusercontent.com/pmachapman/basic-samples/master/QBASIC/GORILLA.BAS

Copyright-Vermerk im Original bleibt erhalten. `classic.js` portiert den EGA-Pfad (`SCREEN 9`, 640 × 350) von `SetScreen`, `DrawGorilla`, `DoSun`, `EGABanana`, `MakeCityScape`, `PlaceGorillas`, `GetNum`, `PlotShot`, `DoExplosion`, `ExplodeGorilla`, `VictoryDance` und `PlayGame`. `classic-ui.js` verbindet die ursprüngliche Texteingabe mit Canvas und HTML; `classic-sound.js` setzt die PLAY-Melodien in Web Audio um.

`EGA8.F14`: IBM-EGA-Zeichensatz, 256 CP437-Zeichen à 14 Bytes aus der historischen Font-Sammlung von VileR:
https://github.com/viler-int10h/vga-text-mode-fonts/blob/master/FONTS/PC-IBM/EGA8.F14

`classic-font.js` enthält dieselben Bytes als Base64, damit der Dateistart ohne fetch, Fonts oder Netzwerkanfragen funktioniert.

## Unabhängige Screenshot-Referenz

`qbasic-gameplay.png` (640 × 350, unverändert): Screenshot des originalen Spiels, LaunchBox Games Database, abgerufen am 11.09.2026:
https://gamesdb.launchbox-app.com/games/images/30034-qbasic-gorillas
https://images.launchbox-app.com/14b32e09-2222-4482-9d6b-833bcf961650.png

`gameplay-random.json` rekonstruiert die sichtbare Szene über 582 Zufallswerte: ansteigende Skyline (Slope 1), Gebäudegrößen, Farben, Fenster, Wind −4 und beide zweiten Dächer vom Rand. Das ist eine Testeingabe für den portierten Skyline-Generator, **keine Behauptung über den damaligen RND-Seed**. Nicht sichtbare Fensterwerte unter dem Score-Feld sind beliebig. Kein Screenshot-Pixel wird als Sprite oder Spielgrafik verwendet; Gorilla, Sonne, Gebäude und Text werden vom Port gezeichnet.

Der direkte Vergleich wird reproduzierbar in `tests/classic.html` aus der unabhängigen Original-PNG und dem aktuellen Port gerendert. Ergebnis: **0 abweichende Pixel von 224.000** inklusive Farben, Schrift, Gorillas, Sonne, Fenster und Windpfeil. `tests/classic.test.js` dekodiert die unabhängige Original-PNG direkt mit Node/zlib und vergleicht sämtliche RGBA-Werte. Der Test setzt keinen Browser und keine Bildbibliothek voraus. `tests/classic.html` zeigt zusätzlich beide Bilder und das Differenzbild und prüft die Oberfläche in 320-/390-/768-Pixel-Iframes.

## Genauigkeit und Grenzen

- Feste Gesamtzahl von Runden; auch Unentschieden möglich. Selbsttreffer punkten für den Gegner. Werfer wechseln auch über Rundengrenzen hinweg.
- EGA-Palettenregister und Original-Bananen-DATA; PUT/PSET und XOR entfernen tatsächlich Bildpixel. Dieselben Pixel werden durch POINT auf Kollision geprüft.
- EGA-Palettenplatz 4 bleibt durch die ursprüngliche Initialisierung schwarz; Platz 6 ist rot. Unicode-Namen werden auf die CP437-Schrift abgebildet (einschließlich Umlauten), kombinierte Zeichen normalisiert und nicht darstellbare Zeichen durch `?` ersetzt. Die Begrenzung auf zehn Zeichen erfolgt danach.
- Winkel bleiben Fließkommazahlen; Velocity wird wie die QBasic-INTEGER-Variable mit CINT gerundet. Leere Eingabe bedeutet 0. Eingaben von 0 bis 360, keine negativen Winkel.
- Flugzeit erhöht sich pro Schritt um 0,1. Die beiden originalen POINT-Abfragen bleiben bestehen; schnelle Bananen können dünne Hindernisse überspringen. Das wird ausdrücklich nicht durch die kontinuierliche Kollision der neuen Modi ersetzt.
- Originaler Skyline-Fehler bleibt erhalten: CASE 4 ist schon in CASE 3 TO 5 enthalten; Slope 6 verändert NewHt nicht.
- Sonne verbirgt die Banane während des Durchflugs und reagiert mit offenem Mund. Kein Energiebonus. Gebäudekrater haben immer Radius 7 im EGA-Pixelraster.
- Der Screenshot bestätigt die **statische EGA-Szene** pixelgenau. Bewegte Explosionen, Intro und Tonausgabe sind quelltextbasierte Ports, aber nicht Frame für Frame mit einer laufenden DOS-Maschine verglichen.
- Browser-Zufall ersetzt das zeitabhängige QBasic-RND-Seeding. Browser-Zeitgeber ersetzen `CalcDelay`, CPU-Schleifen und `SPEEDCONST`; die ursprüngliche Geschwindigkeit war rechnerabhängig. Web Audio spielt die Notenfolgen mit Rechteckwellen, emuliert aber keine bestimmte PC-Lautsprecher-Hardware. Classic ist ein JavaScript-Port, kein DOS-Emulator.
- Die umgebende Moduswahl und das zusätzliche zugängliche HTML-Eingabefeld sind Browser-Bedienung. Bildschirmtexte bleiben im Originalenglisch. Kein CGA-Fallback, da Browser den primären EGA-Modus darstellen können. Classic speichert nur die Match-Einstellungen; Neuladen führt zur Moduswahl zurück.


## Audiovalidierung (12.09.2026)

Die ursprüngliche Portierung verwendete eine falsche Oktavzuordnung: `O0 C` wurde mit 16,35 statt 32,703 Hz gespielt. QBasic legt das mittlere C in `O3` (261,626 Hz), `N1` entspricht `O0 C`. Quellen: [QBasic PLAY-Dokumentation](https://qbasic.com/documentation/PLAY.html) und [QB64 PLAY-Dokumentation](https://qb64.com/wiki/PLAY.html) für Notendauern, Artikulation und Zustandsfortschreibung. Die unveränderten PLAY-Strings werden zusätzlich direkt gegen die lokale Microsoft-Quelldatei geprüft.

- Rechtecksignal mit konstantem Pegel und originaler MN-Artikulation (7/8 Ton, 1/8 Pause), keine synthetischen Bass-Sweeps. Gain 0,28 statt 0,035, also +18,06 dB vor der Audioausgabe. Die tatsächliche Lautheit hängt weiter von Browser, Lautsprecher und Systemlautstärke ab.
- Titel setzt T160, das Intro wechselt zunächst zu T120 und endet wieder bei T160. Wurf: 4 Noten in 0,1875 s; Gebäudetreffer/Tanzmotiv: 7 Noten in 0,328125 s; Gorillatreffer: 0,65625 s. Tonhöhe, Pausen, Längen und geerbtes Tempo sind separat getestet.
- Intro: alle 144 Noten/Pausen aus vier Phrasen und acht Schlussmotiven. Die Animation berücksichtigt das Blockieren der BASIC-Ausführung durch den 32-Noten-Puffer von MB. Gesamtdauer einschließlich anfänglicher Sekunde: ca. 15,403 s. Bewusste Browser-Anpassung: die letzten gepufferten Noten enden vor Freigabe der Wurfeingabe. Überspringen verwirft sie; nach Stummschaltung oder Pause wird beim aktuellen Intro-Zeitpunkt fortgesetzt.
- `tests/classic-audio.html` rendert mit einem echten `OfflineAudioContext`: Frequenzmessung aus Nulldurchgängen, RMS-Pegel, stille MN-Pause, alle Effekte, vollständiges Intro sowie Stummschaltung und Fortsetzen innerhalb einer Pause. Buttons erlauben das direkte Anhören aller Originalfolgen.
- Keine Behauptung einer hardwareidentischen Aufnahme: PC-Lautsprecher-Resonanzen, PIT-Frequenzrundung und die DOS-Timerauflösung werden nicht emuliert. Gegen eine echte DOS-Audioaufnahme wurde nicht verglichen. Der Nachweis betrifft Originalpartitur, QBasic-Tonhöhen/-Längen und das im Browser gerenderte Signal.

Validierungsergebnis im Codex-Browser und in Google Chrome: 261,640 Hz für O3 C, RMS 0,2367, Pausen-RMS 0,00000000; alle Audiofälle bestanden. `npm test`: 78/78 bestanden, `npm run build` erfolgreich. Browser: Pixelvergleich 0/224.000 Abweichungen; 320/390/768 px ohne Überlauf; Classic-Intro, Punkt-Eingabe, Ein-Runden-Endstand 0:1, GAME-OVER-Button und Gravitationswechsel 100 → 9,8 erfolgreich; keine Konsolenfehler beim Spieltest.
