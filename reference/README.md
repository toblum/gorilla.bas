# Classic: Herkunft und Validierung

## Primärquelle

`GORILLA.BAS` ist der unveränderte Microsoft-Quelltext von 1990, bezogen am 11.09.2026 aus:
https://raw.githubusercontent.com/pmachapman/basic-samples/master/QBASIC/GORILLA.BAS

Copyright-Vermerk im Original bleibt erhalten. `classic.js` portiert den EGA-Pfad (`SCREEN 9`, 640 × 350) von `SetScreen`, `DrawGorilla`, `DoSun`, `EGABanana`, `MakeCityScape`, `PlaceGorillas`, `GetNum`, `PlotShot`, `DoExplosion`, `ExplodeGorilla`, `VictoryDance` und `PlayGame`. `classic-ui.js` verbindet die ursprüngliche Texteingabe und PLAY-Melodien mit Canvas, HTML und Web Audio.

`EGA8.F14`: IBM-EGA-Zeichensatz, 256 CP437-Zeichen à 14 Bytes aus der historischen Font-Sammlung von VileR:
https://github.com/viler-int10h/vga-text-mode-fonts/blob/master/FONTS/PC-IBM/EGA8.F14

`classic-font.js` enthält dieselben Bytes als Base64, damit der Dateistart ohne fetch, Fonts oder Netzwerkanfragen funktioniert.

## Unabhängige Screenshot-Referenz

`qbasic-gameplay.png` (640 × 350, unverändert): Screenshot des originalen Spiels, LaunchBox Games Database, abgerufen am 11.09.2026:
https://gamesdb.launchbox-app.com/games/images/30034-qbasic-gorillas
https://images.launchbox-app.com/14b32e09-2222-4482-9d6b-833bcf961650.png

`gameplay-random.json` rekonstruiert die sichtbare Szene über 582 Zufallswerte: ansteigende Skyline (Slope 1), Gebäudegrößen, Farben, Fenster, Wind −4 und beide zweiten Dächer vom Rand. Das ist eine Testeingabe für den portierten Skyline-Generator, **keine Behauptung über den damaligen RND-Seed**. Nicht sichtbare Fensterwerte unter dem Score-Feld sind beliebig. Kein Screenshot-Pixel wird als Sprite oder Spielgrafik verwendet; Gorilla, Sonne, Gebäude und Text werden vom Port gezeichnet.

`classic-gameplay.png` ist das daraus erzeugte Vergleichsbild. Ergebnis: **0 abweichende Pixel von 224.000** inklusive Farben, Schrift, Gorillas, Sonne, Fenster und Windpfeil. `tests/classic.test.js` dekodiert die unabhängige Original-PNG direkt mit Node/zlib und vergleicht sämtliche RGBA-Werte. Der Test setzt keinen Browser und keine Bildbibliothek voraus. `tests/classic.html` zeigt zusätzlich beide Bilder und das Differenzbild und prüft die Oberfläche in 320-/390-Pixel-Iframes.

## Genauigkeit und Grenzen

- Feste Gesamtzahl von Runden; auch Unentschieden möglich. Selbsttreffer punkten für den Gegner. Werfer wechseln auch über Rundengrenzen hinweg.
- EGA-Palettenregister und Original-Bananen-DATA; PUT/PSET und XOR entfernen tatsächlich Bildpixel. Dieselben Pixel werden durch POINT auf Kollision geprüft.
- Winkel bleiben Fließkommazahlen; Velocity wird wie die QBasic-INTEGER-Variable mit CINT gerundet. Leere Eingabe bedeutet 0. Eingaben von 0 bis 360, keine negativen Winkel.
- Flugzeit erhöht sich pro Schritt um 0,1. Die beiden originalen POINT-Abfragen bleiben bestehen; schnelle Bananen können dünne Hindernisse überspringen. Das wird ausdrücklich nicht durch die kontinuierliche Kollision der neuen Modi ersetzt.
- Originaler Skyline-Fehler bleibt erhalten: CASE 4 ist schon in CASE 3 TO 5 enthalten; Slope 6 verändert NewHt nicht.
- Sonne verbirgt die Banane während des Durchflugs und reagiert mit offenem Mund. Kein Energiebonus. Gebäudekrater haben immer Radius 7 im EGA-Pixelraster.
- Der Screenshot bestätigt die **statische EGA-Szene** pixelgenau. Bewegte Explosionen, Intro und Tonausgabe sind quelltextbasierte Ports, aber nicht Frame für Frame mit einer laufenden DOS-Maschine verglichen.
- Browser-Zufall ersetzt das zeitabhängige QBasic-RND-Seeding. Browser-Zeitgeber ersetzen `CalcDelay`, CPU-Schleifen und `SPEEDCONST`; die ursprüngliche Geschwindigkeit war rechnerabhängig. Web Audio spielt die Notenfolgen mit Rechteckwellen, emuliert aber keine bestimmte PC-Lautsprecher-Hardware. Classic ist ein JavaScript-Port, kein DOS-Emulator.
- Die umgebende Moduswahl und das zusätzliche zugängliche HTML-Eingabefeld sind Browser-Bedienung. Bildschirmtexte bleiben im Originalenglisch. Kein CGA-Fallback, da Browser den primären EGA-Modus darstellen können. Classic speichert nur die Match-Einstellungen; Neuladen führt zur Moduswahl zurück.
