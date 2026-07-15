# 4. Frontend i interaktywny edytor

## 4.1. Technologia renderowania

Edytor wykorzystuje SVG. Każdy obiekt jest renderowany jako element wektorowy: koło, linia, ścieżka, wielokąt, tekst lub grupa elementów. SVG zapewnia:

- skalowalne kształty;
- precyzyjne współrzędne;
- możliwość przypisywania danych i zdarzeń do obiektów;
- łatwe stylowanie;
- zgodność koncepcyjną z eksportem wektorowym.

## 4.2. Klasa `DrawingEditor`

Instancja klasy zarządza pełnym cyklem życia edytora. Jej odpowiedzialności obejmują:

- pobranie elementów DOM;
- odczyt początkowych obiektów i ustawień;
- rejestrację zdarzeń;
- wybór aktywnego narzędzia;
- zarządzanie zaznaczeniem;
- renderowanie obiektów;
- komunikację z API;
- obsługę paneli;
- historię cofania i ponawiania;
- obliczenia geometrii;
- obsługę wykresów;
- integrację pluginów.

## 4.3. Narzędzia i grupy

Pasek narzędzi jest budowany z rejestru. Główne grupy to:

- zaznaczanie;
- tekst;
- etykiety zależne;
- grafy;
- podstawowe obiekty geometryczne;
- punkty i przecięcia;
- szczególne punkty trójkąta;
- przekształcenia;
- wykresy.

Widoczność narzędzia zależy od trybu dokumentu.

## 4.4. Zaznaczanie

Edytor obsługuje:

- wybór pojedynczego obiektu;
- dołączanie kolejnych obiektów do zaznaczenia;
- zaznaczanie prostokątem;
- zaznaczanie z listy obiektów;
- wizualne wyróżnienie aktywnego elementu;
- operacje grupowe.

Zaznaczenie jest podstawą kopiowania, usuwania, przesuwania i edycji stylu.

## 4.5. Przeciąganie

Przeciąganie odbywa się przy użyciu zdarzeń wskaźnika. Dla punktów swobodnych zmieniane są współrzędne. Dla obiektów zależnych przeciąganie może być wyłączone lub prowadzić do zmiany parametrów właściwych danemu typowi.

Przy włączonym `snapToGrid` współrzędne są zaokrąglane do najbliższego przecięcia siatki.

## 4.6. Tworzenie obiektów wieloetapowych

Niektóre narzędzia wymagają kilku kliknięć:

- krawędź — wskazanie dwóch wierzchołków;
- odcinek — wskazanie lub utworzenie dwóch punktów;
- okrąg — środek i punkt określający promień;
- wielokąt — kolejne wierzchołki i zamknięcie przez kliknięcie pierwszego;
- konstrukcje — wskazanie argumentów w ustalonej kolejności.

Frontend przechowuje tymczasowy stan komendy i wyświetla podpowiedź kolejnego argumentu.

## 4.7. Panel właściwości

Panel boczny jest podzielony na zakładki.

### Obiekt

Pozwala edytować treść, etykietę i pola dostarczone przez plugin.

### Styl

Obsługuje zależnie od typu:

- kolor konturu;
- kolor wypełnienia;
- grubość linii;
- rodzaj kreskowania;
- przezroczystość konturu i wypełnienia;
- rozmiar czcionki;
- położenie etykiety;
- promień punktu;
- widoczność;
- widoczność etykiety;
- skierowanie krawędzi.

Pola niedotyczące wybranego typu są blokowane.

### Ustawienia

Pozwala zmieniać rozmiar płótna, rozmiar siatki, widoczność siatki, przyciąganie i skalę TikZ.

### Styl nowych obiektów

Przechowuje domyślny styl używany podczas tworzenia kolejnych elementów. Ustawienie jest zapisywane lokalnie w przeglądarce, a brak dostępu do `localStorage` nie blokuje działania aplikacji.

## 4.8. Historia operacji

Edytor utrzymuje migawki stanu umożliwiające cofanie i ponawianie. Historia jest funkcją interfejsu, natomiast zapis trwały nadal odbywa się w backendzie.

## 4.9. Kolejność renderowania

Obiekty liniowe i powierzchniowe są rysowane przed punktami, aby punkty sterujące pozostawały widoczne i klikalne. Pole `order` zachowuje logiczną kolejność dokumentu, a renderer uwzględnia także semantyczne warstwy typów.

## 4.10. Obsługa błędów

Frontend wyświetla komunikaty walidacyjne, ale nie zakłada, że lokalna walidacja wystarcza. Błędy HTTP i błędy struktury odpowiedzi są przechwytywane, a przy operacjach złożonych wykonywane jest odtworzenie stanu lub ponowne pobranie danych z serwera.
