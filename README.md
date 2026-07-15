# Route Editor

Route Editor jest webową aplikacją do tworzenia strukturalnych rysunków matematycznych. Umożliwia budowanie grafów, konstrukcji geometrycznych oraz wykresów, ich późniejszą edycję, zapis w bazie danych i eksport do formatów przeznaczonych do dalszego wykorzystania — w szczególności JSON oraz TikZ/PGFPlots.

Projekt został zbudowany w Django, natomiast właściwy interaktywny edytor działa w przeglądarce i wykorzystuje SVG oraz JavaScript. Dane rysunku nie są zapisywane jako pojedynczy obraz. Każdy punkt, krawędź, okrąg, wielokąt, etykieta lub wykres jest osobnym obiektem o ustalonym typie, danych, stylu i zależnościach.

## Najważniejsze możliwości

- osobne tryby pracy: graf, geometria i wykresy;
- interaktywne tworzenie i przesuwanie obiektów na płótnie SVG;
- zaznaczanie pojedyncze, wielokrotne i prostokątne;
- kopiowanie, usuwanie i edycja treści oraz stylu;
- konstrukcje zależne, które aktualizują się po przesunięciu obiektów bazowych;
- szczególne punkty trójkąta, przecięcia, rzuty i przekształcenia geometryczne;
- serie danych, funkcje, osie, legenda i niepewności na wykresach;
- import i eksport dokumentów JSON;
- eksport do TikZ/PGFPlots oraz podgląd kodu;
- eksperymentalne rozpoznawanie prostych rysunków z obrazu;
- architektura rejestrów i dodatków umożliwiająca rozszerzanie aplikacji;
- konta użytkowników i separacja prywatnych rysunków;
- rozbudowany zestaw testów automatycznych.

## Dokumentacja

Pełna dokumentacja projektu znajduje się w katalogu [`docs`](docs/README.md).

## Szybkie uruchomienie

```bash
python -m venv .venv
source .venv/bin/activate       # Linux/macOS
# .venv\Scripts\activate        # Windows PowerShell
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Aplikacja będzie dostępna pod adresem `http://127.0.0.1:8000/`.

## Testy

```bash
python manage.py test
```

W zweryfikowanej wersji projektu uruchamiane są 364 testy. Wszystkie testy przechodzą poprawnie.
